# Inicio de sesión y registro con correo y contraseña

Issue: [CLI-7](https://linear.app/clinica-dental-guizada-aliaga/issue/CLI-7/inicio-de-sesion-y-registro-con-correo-y-contrasena)

## Resumen

Además de Google OAuth (único método existente hasta ahora), la app permite crear una cuenta e iniciar sesión con correo y contraseña. **Supabase Auth es el único responsable de almacenar y verificar credenciales** — el backend (NestJS) no tiene ni necesita ningún cambio, porque ya verificaba JWTs de forma genérica sin importar el proveedor de login.

No existe columna `password_hash` en la base de datos propia (`users`); esa responsabilidad es 100% de Supabase (tabla interna `auth.users`, fuera de nuestro esquema).

## Por qué el backend no necesitó cambios

El backend nunca supo, ni le importó, cómo se autenticó alguien. Su contrato es:

1. **Verificar el JWT** (`api/src/auth/infrastructure/SupabaseJwtVerifier.ts`): lee claims estándar — `sub` (uid), `email`, `user_metadata.name/picture` — validando la firma contra el JWKS de Supabase. No hay ningún chequeo de proveedor.
2. **Sincronizar el perfil** (`POST /auth/sync` → `AuthService.syncUser` → `prisma-user.repository.ts`): hace un `upsert` en la tabla `users` propia, usando `auth_user_id` (el `sub` del JWT) como clave.

Un usuario que se loguea con Google y uno que se loguea con contraseña producen el mismo tipo de JWT — el backend no puede (ni necesita) distinguirlos.

## Arquitectura del lado del frontend

```
frontend/src/app/auth/
├── application/
│   ├── auth.service.ts       # toda la lógica de autenticación
│   └── auth-error.util.ts    # mapeo de errores de Supabase → español
├── auth.routes.ts
└── ui/
    ├── _auth-shell.scss      # shell visual compartido (card centrada)
    ├── _auth-form.scss       # inputs, botones, spinner, divisor "o continuar con"
    ├── login/                # login con correo+contraseña O Google
    ├── register/             # registro con correo+contraseña
    └── callback/             # landing del redirect de OAuth / confirmación de email
```

`_auth-shell.scss` y `_auth-form.scss` son partials de Sass (mismo mecanismo que ya usaba `_step-form.scss` en el wizard de pacientes): cada componente los importa con `@use '../auth-shell'; @use '../auth-form';` en su propio `.scss`. Evitan duplicar el HTML/CSS del card centrado y los inputs entre las pantallas de auth.

## Flujo de registro (paso a paso)

1. Usuario completa el formulario en `/auth/register` (correo, contraseña, confirmar contraseña).
2. `RegisterComponent.onSubmit()` valida en el cliente: campos no vacíos, contraseña ≥ 6 caracteres, `password === confirmPassword`.
3. Llama a `AuthService.registerWithPassword(email, password)`:
   ```ts
   const { data, error } = await this.supabase.auth.signUp({
     email,
     password,
     options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
   });
   ```
4. Supabase crea el usuario en `auth.users` (su tabla interna) y envía un correo de confirmación (vía el mailer configurado — ver [password-recovery.md](./password-recovery.md) para el detalle de la configuración SMTP con Resend).
5. Como el proyecto tiene `mailer_autoconfirm: false`, `data.session` viene `null` — **no hay sesión inmediata**. `registerWithPassword` devuelve `{ confirmationRequired: true }`.
6. `RegisterComponent` muestra el estado "Revisá tu correo" (ícono `mark_email_read`, con el correo ingresado) en vez de redirigir.
7. El usuario hace clic en el enlace del correo → cae en `/auth/callback?...` con el código de confirmación en la URL.
8. Como `AuthService` se instancia en `provideAppInitializer()` (antes de la primera navegación del router — ver `app.config.ts`), el cliente de Supabase con `detectSessionInUrl: true` intercepta y canjea el código **antes** de que el router pueda "limpiar" la URL.
9. Esto dispara `onAuthStateChange('SIGNED_IN', session)` → mismo flujo que un login normal (ver abajo) → `syncWithBackend()` → `POST /auth/sync` → el backend crea la fila en `users` con `role: patient` (default hardcodeado, igual que con Google).
10. `CallbackComponent` espera `authReady` y redirige a `/dashboard`.

### Manejo de "correo ya registrado"

Si alguien intenta registrarse con un correo que ya existe y está confirmado, Supabase puede:
- Devolver el error `user_already_exists` / `email_exists` (mapeado a *"Ya existe una cuenta con este correo."*), o
- Devolver una respuesta "ofuscada" (éxito sin sesión, sin enviar nada realmente) — comportamiento propio de Supabase para no revelar si un correo existe (protección anti-enumeración).

Ambos casos están cubiertos: el primero muestra el error mapeado, el segundo muestra el mismo panel de "revisá tu correo" que un registro legítimo (indistinguible a propósito).

## Flujo de login con contraseña (paso a paso)

1. Usuario completa correo + contraseña en `/auth/login` (mismo formulario que ahora también tiene el botón "Continuar con Google").
2. `LoginComponent.onSubmit()` valida campos no vacíos.
3. Llama a `AuthService.loginWithPassword(email, password)`:
   ```ts
   const { error } = await this.supabase.auth.signInWithPassword({ email, password });
   ```
4. Si Supabase acepta las credenciales, dispara `onAuthStateChange('SIGNED_IN', session)` de forma **síncrona antes de que `signInWithPassword` resuelva** (confirmado leyendo el código fuente de `@supabase/auth-js`) — por lo que `currentUser()` ya está seteado cuando `loginWithPassword()` retorna.
5. El listener de `onAuthStateChange` (compartido con el flujo de Google) llama a `syncWithBackend()`, que hace `POST /auth/sync` y completa el perfil (`role`, `displayName`, `photoUrl`) en `currentUser`.
6. `LoginComponent` navega a `/dashboard` inmediatamente después de `loginWithPassword()`.
7. Si las credenciales son inválidas, Supabase devuelve `invalid_credentials`, mapeado a *"Correo o contraseña incorrectos."*

### El listener `onAuthStateChange` es compartido entre todos los métodos de login

No hubo que duplicar la lógica de sincronización: `signInWithPassword`, `signUp` (una vez confirmado) y `signInWithOAuth` (Google) todos terminan emitiendo el mismo evento `SIGNED_IN` a través del mismo listener único en el constructor de `AuthService`. La única rama especial que existe hoy es para el evento `PASSWORD_RECOVERY` (ver [password-recovery.md](./password-recovery.md)), que **no** se trata como login.

## Mapeo de errores (`auth-error.util.ts`)

Supabase devuelve errores en inglés con un código tipado (`AuthError.code`). Se mapean a mensajes en español mínimos y extensibles:

| Código de Supabase | Mensaje mostrado |
|---|---|
| `invalid_credentials` | Correo o contraseña incorrectos. |
| `user_already_exists` / `email_exists` | Ya existe una cuenta con este correo. |
| `weak_password` | La contraseña debe tener al menos 6 caracteres. |
| `email_not_confirmed` | Confirmá tu correo antes de iniciar sesión. Revisá tu bandeja de entrada. |
| `over_email_send_rate_limit` | Demasiados intentos. Esperá unos minutos antes de volver a intentar. |
| *(cualquier otro)* | Mensaje genérico pasado por el llamador (ej. "No se pudo iniciar sesión.") |

Se prioriza `.code` (más robusto, tipado) con un fallback por substring de `.message` para los casos donde el código no esté disponible.

## Archivos clave

| Archivo | Rol |
|---|---|
| `frontend/src/app/auth/application/auth.service.ts` | Métodos `registerWithPassword()`, `loginWithPassword()`, listener `onAuthStateChange` |
| `frontend/src/app/auth/application/auth-error.util.ts` | Traducción de errores de Supabase |
| `frontend/src/app/auth/ui/login/` | Pantalla de login (correo+contraseña y Google) |
| `frontend/src/app/auth/ui/register/` | Pantalla de registro |
| `frontend/src/app/auth/ui/_auth-shell.scss` / `_auth-form.scss` | Estilos compartidos entre todas las pantallas de auth |
| `api/src/auth/**` | Sin cambios — ya era agnóstico al proveedor |

## Prerrequisitos externos (dashboard de Supabase)

1. **Authentication → Providers → Email**: debe estar habilitado (estaba deshabilitado por defecto, solo Google estaba activo).
2. **Authentication → URL Configuration → Redirect URLs**: debe incluir `http://localhost:4200/auth/callback` (y el equivalente de producción cuando se despliegue) — usado tanto por el redirect de Google como por el link de confirmación de registro.

## Cómo probar manualmente

1. `POST /auth/v1/signup` vía la pantalla `/auth/register` con un correo nuevo → debe mostrar "revisá tu correo", **no** redirigir directo.
2. Abrir el correo de confirmación, hacer clic en el enlace → debe caer en `/auth/callback`, mostrar el spinner brevemente, y redirigir a `/dashboard`.
3. Cerrar sesión, ir a `/auth/login`, iniciar sesión con ese correo y contraseña → debe entrar directo a `/dashboard` (sin pasar por `/auth/callback`).
4. Probar con contraseña incorrecta → debe mostrar "Correo o contraseña incorrectos." sin crashear.
5. Regresión: cerrar sesión, probar "Continuar con Google" → debe seguir funcionando exactamente igual que antes de este cambio.
6. `cd frontend && npm run build` debe compilar sin errores (no hay lint separado; `build` corre el type-check completo de Angular).
