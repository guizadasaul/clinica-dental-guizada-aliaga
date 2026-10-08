# Cuentas y contraseñas

Cómo se crea cada tipo de cuenta de paciente y cómo recupera su contraseña (épica CLI-240). Google OAuth no
entra acá: no tiene contraseña propia.

## Crear la cuenta

Toda cuenta nace de una **invitación** que el doctor manda desde la ficha (Pacientes → "Enviar registro", por
WhatsApp o correo). El link `/invitacion/:token` vence a las 24 horas y deja elegir correo o teléfono.

### Con teléfono y contraseña

1. `POST /auth/register/phone { phone, password, inviteToken }`: el backend crea el usuario en Supabase con
   el teléfono ya confirmado (Admin API, **sin SMS**). Si la ficha tiene teléfono, solo se acepta ese número
   (la landing muestra los últimos 3 dígitos).
2. El frontend inicia sesión con teléfono y contraseña y llama a `POST /auth/sync` con el token de
   invitación: ahí se vincula la ficha.
3. El teléfono se guarda en E.164 con su código de país (`+591…`, `+549…`). Los números sin código se toman
   como bolivianos.

Si la cuenta se creó pero el login falló, el token queda guardado en el navegador: entrar después desde
"Iniciar sesión" vincula la ficha igual.

### Con correo y contraseña

1. `POST /auth/register/email { email, password, inviteToken }`: el backend crea el usuario sin confirmar
   (`admin.generateLink` tipo `signup`), **vincula la ficha en ese momento** (canjea la invitación) y manda
   por Resend el correo "Confirma tu correo".
2. El link del correo (`/auth/confirmar?token_hash=…&type=signup`) sirve **en cualquier navegador**: no
   depende de que sea el mismo que hizo el registro. Vence a las 24 horas y sirve una vez.
3. Mientras no confirme, puede pedir otro correo desde la misma pantalla ("Reenviar correo",
   `POST /auth/register/email/resend`).
4. Un correo que ya tiene una cuenta confirmada da 409 ("Inicia sesión o recupera tu contraseña") y no gasta
   la invitación.

## Recuperar la contraseña

### Cuenta con correo: lo hace el paciente solo

1. "¿Olvidaste tu contraseña?" → `POST /auth/password/recover { email }`. Responde igual exista o no la
   cuenta (no revela qué correos están registrados).
2. Si hay una cuenta, el backend manda por Resend "Crea una nueva contraseña" con el link
   `/auth/reset-password?token_hash=…&type=recovery`. También sirve en cualquier navegador, vence a las 24 horas y
   sirve una vez.
3. Con esa sesión de recuperación el paciente **no entra al portal** (ni recargando) hasta definir la
   contraseña nueva. Después vuelve al login.

### Cuenta solo con teléfono: lo hace la clínica por WhatsApp

Una cuenta de teléfono no tiene correo, así que "Olvidé mi contraseña" no le sirve (la pantalla lo avisa).

1. El paciente le avisa a la clínica.
2. El doctor, en **Pacientes → menú ⋮ del paciente → "Link para nueva contraseña"**, abre WhatsApp con el
   mensaje ya escrito para el teléfono de la ficha. La opción aparece solo si el paciente tiene cuenta.
3. El paciente abre `/recuperar/:token`, ve "Para tu cuenta con el teléfono terminado en 944", elige la
   contraseña nueva y entra desde el login con su teléfono.

El link vence a las **24 horas**, sirve **una sola vez**, cada link nuevo **anula el anterior** y solo
cambia la contraseña de la cuenta de esa ficha. En la base se guarda solo el hash del token
(`password_reset_links`). Sirve también para una cuenta de correo, si el paciente no tiene acceso a su
buzón.

## Qué tiene que estar configurado

**Backend (`api/.env`)**

- `SUPABASE_SERVICE_ROLE_KEY`: sin ella no se pueden crear cuentas ni armar links (responde 503).
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: los correos de confirmación y recuperación salen por Resend, no por
  Supabase.
- `FRONTEND_URL`: los links de los correos y de WhatsApp se arman con esa URL.
- Límites por IP y por hora (opcionales): `THROTTLE_REGISTER_PHONE_PER_HOUR`,
  `THROTTLE_REGISTER_EMAIL_PER_HOUR`, `THROTTLE_PASSWORD_RECOVER_PER_HOUR`,
  `THROTTLE_PASSWORD_RESET_PER_HOUR`.

**Supabase (cada proyecto)**: ver el checklist en [`deploy/README.md`](../deploy/README.md#checklist-de-supabase-por-proyecto).
Lo que importa para estos flujos:

- Providers **Email** y **Phone** activos. Phone no necesita proveedor de SMS: las cuentas de teléfono las
  crea el backend con el número ya confirmado.
- Email → **Confirm email** activo, y la vigencia del link (*Email OTP Expiration*) en **86400 s**: los correos
  dicen "vence en 24 horas" (todos los links viven 24 horas, CLI-255).
- Largo mínimo de contraseña: **8** (el mismo que valida el backend).
- El SMTP de Supabase ya no interviene en el alta ni en la recuperación con contraseña: si falla (pasó en
  el proyecto de desarrollo/staging: "Error sending confirmation/recovery email"), estos flujos siguen
  funcionando.
