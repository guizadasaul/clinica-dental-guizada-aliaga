# Recuperación de contraseña por correo

Issue: [CLI-8](https://linear.app/clinica-dental-guizada-aliaga/issue/CLI-8/recuperacion-de-contrasena-por-correo)

Depende de: [CLI-7 — inicio de sesión y registro con correo y contraseña](./auth-email-password.md)

## Resumen

Los usuarios que inician sesión con correo y contraseña pueden recuperar el acceso mediante un **enlace mágico** enviado por correo, manejado 100% por Supabase Auth. El backend no participa en ningún paso — igual que con el resto de la autenticación.

Flujo elegido: enlace mágico (no código OTP). El usuario recibe un correo con un link; al hacer clic, cae en la app con una **sesión de recuperación temporal** ya establecida, y ahí define la nueva contraseña.

## Flujo completo, paso a paso

```
1. Usuario en /auth/login → clic en "¿Olvidaste tu contraseña?"
2. /auth/forgot-password → ingresa su correo → submit
3. AuthService.requestPasswordReset(email)
     → supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/auth/reset-password' })
4. Pantalla muestra SIEMPRE el mismo mensaje genérico de éxito
     ("Si el correo existe en nuestro sistema...") — no revela si la cuenta existe
5. Supabase envía el correo (vía SMTP configurado — Resend, ver más abajo)
6. Usuario abre el correo, hace clic en el enlace
     → cae en /auth/reset-password?... con un código de recuperación en la URL
7. detectSessionInUrl (config del cliente Supabase) canjea el código
     → dispara onAuthStateChange('PASSWORD_RECOVERY', session)
8. AuthService reconoce este evento específico y NO lo trata como login:
     no setea currentUser, no llama a syncWithBackend(), no redirige a dashboard
9. ResetPasswordComponent verifica por su cuenta que hay una sesión activa
     (hasRecoverySession()) y muestra el formulario de nueva contraseña
10. Usuario define nueva contraseña + confirmación → submit
11. AuthService.updatePassword(newPassword) → supabase.auth.updateUser({ password })
12. Se cierra la sesión de recuperación (logout()) y se redirige a
     /auth/login?reset=success → banner verde de confirmación
13. Usuario inicia sesión con la nueva contraseña (la vieja ya no sirve)
```

## La parte crítica: distinguir una sesión de recuperación de un login real

Antes de este cambio, `AuthService.onAuthStateChange` trataba **cualquier** sesión no nula como un login exitoso (seteaba `currentUser`, llamaba a `/auth/sync`). El problema: Supabase emite el mismo tipo de evento (con una sesión válida) cuando alguien llega desde un link de recuperación — y esa sesión, aunque técnicamente válida, **no debería considerarse un login**. Si no se distinguiera, alguien que solo hizo clic en el link de recuperación (sin todavía definir contraseña nueva) quedaría con `currentUser` seteado, y `authGuard` lo dejaría entrar a `/dashboard` sin haber completado el paso de seguridad.

Solución implementada en `auth.service.ts`:

```ts
this.supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    // Sesión de recuperación: válida a nivel Supabase, pero NO es un login.
    // No se setea currentUser ni se sincroniza con el backend.
    this.settleReady();
    return;
  }
  // ... resto de la lógica sin cambios (login normal, logout, etc.)
});
```

`ResetPasswordComponent` valida la sesión **por su cuenta**, de forma independiente al estado global `currentUser`:

```ts
async ngOnInit(): Promise<void> {
  await this.authService.authReady;
  this.sessionValid.set(await this.authService.hasRecoverySession());
  this.checkingSession.set(false);
}
```

Esto significa que `hasRecoverySession()` solo verifica que *exista* una sesión (no distingue si es de tipo recovery específicamente, ya que Supabase no expone esa marca en la sesión persistida, solo en el evento transitorio). Es una simplificación consciente: alguien ya logueado normalmente que navegue directo a `/auth/reset-password` también podría cambiar su propia contraseña ahí — comportamiento legítimo, no una falla de seguridad.

## Métodos nuevos en `AuthService`

| Método | Qué hace |
|---|---|
| `requestPasswordReset(email)` | Dispara el correo de recuperación. **Nunca lanza error** — atrapa cualquier excepción para no revelar si el correo existe en el sistema (protección anti-enumeración). |
| `hasRecoverySession()` | Chequea si hay una sesión activa (`supabase.auth.getSession()`), usado por la pantalla de reset para decidir qué mostrar. |
| `updatePassword(newPassword)` | Llama a `supabase.auth.updateUser({ password })`. Lanza error mapeado a español si falla. |

## Pantallas nuevas

### `/auth/forgot-password`
- Un solo campo (correo).
- Al enviar, siempre muestra el mismo mensaje de éxito genérico, sin importar si el correo existe o no.

### `/auth/reset-password`
Tres estados posibles:
1. **Verificando** (spinner) — mientras se resuelve `authReady` y se chequea la sesión.
2. **Enlace inválido** — si no hay sesión de recuperación activa (link expirado, ya usado, o acceso directo a la URL sin pasar por el correo). Muestra un banner de error + link para pedir uno nuevo.
3. **Formulario de nueva contraseña** — campos de nueva contraseña + confirmación, con validación de mínimo 6 caracteres y coincidencia entre ambos campos.

## Configuración de correo: por qué Resend

El mailer por defecto de Supabase (igual que el de Firebase) está pensado solo para desarrollo: límite de envíos muy bajo (pocos correos por hora) y remitente genérico compartido entre miles de proyectos, con alto riesgo de caer en spam y sin posibilidad de personalizar la marca.

Se configuró **Resend** como proveedor SMTP propio en Supabase (Project Settings → Authentication → SMTP Settings):

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Puerto | `587` |
| Usuario | `resend` (literal) |
| Contraseña | API key de Resend |
| Sender email | dirección de un dominio verificado en Resend |

### Limitación importante mientras el dominio no esté verificado

Sin un dominio verificado en Resend, la cuenta queda en modo sandbox/prueba: **solo se puede enviar a la dirección exacta con la que te registraste en Resend**, no a destinatarios arbitrarios (ni siquiera variantes con `+alias` del mismo correo). Esto se detectó durante las pruebas: un intento de registro a `correo+test1@gmail.com` devolvía `500 { error_code: "unexpected_failure", msg: "Error sending confirmation email" }`, mientras que el mismo flujo con el correo exacto registrado en Resend funcionaba (`200 OK`).

**Antes de que pacientes reales puedan usar registro o recuperación de contraseña, es obligatorio verificar un dominio propio en Resend** (Resend Dashboard → Domains → Add Domain → agregar los registros DNS TXT/MX en el proveedor del dominio). Sin esto, el sistema solo funciona para la cuenta del desarrollador.

## Prerrequisitos externos (dashboard de Supabase)

1. **Authentication → URL Configuration → Redirect URLs**: debe incluir `http://localhost:4200/auth/reset-password` (y el equivalente de producción).
2. **Authentication → Providers → Email**: habilitado (compartido con CLI-7).
3. **SMTP personalizado con Resend** configurado como se describe arriba (recomendado antes de producción; el mailer por defecto de Supabase funciona para pruebas iniciales pero con las limitaciones ya mencionadas).

## Cómo probar manualmente

1. Desde `/auth/login`, clic en "¿Olvidaste tu contraseña?" → `/auth/forgot-password`.
2. Ingresar un correo registrado → debe mostrar el mensaje genérico de éxito.
3. Abrir el correo recibido (verificar que llegue con el remitente/branding de Resend, no el genérico de Supabase) y hacer clic en el enlace.
4. Debe caer en `/auth/reset-password` mostrando el formulario de nueva contraseña (no el estado de "enlace inválido").
5. Definir una nueva contraseña + confirmación → submit → debe redirigir a `/auth/login?reset=success` con el banner verde.
6. Intentar iniciar sesión con la contraseña **vieja** → debe fallar con "Correo o contraseña incorrectos."
7. Iniciar sesión con la contraseña **nueva** → debe funcionar y entrar a `/dashboard`.
8. Navegar directo a `/auth/reset-password` sin haber pasado por el correo → debe mostrar "enlace inválido o expiró", sin crashear ni colgarse.
9. Confirmar que `authGuard` sigue protegiendo `/dashboard` normalmente y que solo llegar al link de recuperación no otorga acceso por sí solo.

**Verificado end-to-end en navegador real con correo real** (correo de prueba propio) — ver detalle de la sesión de pruebas en el PR de CLI-8.
