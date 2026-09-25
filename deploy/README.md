# Despliegue — staging y producción

Dos ambientes completamente separados. Ninguna credencial, base de datos ni proyecto de Supabase se
comparte entre ellos: staging no tiene forma de tocar producción.

| | Staging | Producción |
|---|---|---|
| Rama | `develop` | `main` |
| Frontend (Vercel) | `https://staging.guizadaaliaga.com` | `https://guizadaaliaga.com` |
| API (Hetzner, detrás de Cloudflare + Caddy) | `https://api-staging.guizadaaliaga.com` | `https://api.guizadaaliaga.com` |
| Container | `clinic-api-staging` | `clinic-api-production` |
| Supabase (Auth + Postgres) | `lrvzfcwsvedigqsiehnf` (us-east-2) | proyecto nuevo (eu-central-1, Frankfurt) — pendiente |
| Datos | ficticios / de demo | reales |

Tráfico de la API: `Internet → Cloudflare (HTTPS, Full strict) → Hetzner :443 → Caddy → container :3000`.
El puerto de NestJS nunca se publica en el host.

## Variables de entorno

La lista completa, con qué hace cada una, está en [`api/.env.example`](../api/.env.example).

| Dónde vive | Local | Staging | Producción |
|---|---|---|---|
| API | `api/.env` (gitignoreado) | `/opt/clinic/staging/.env` en el servidor | `/opt/clinic/production/.env` en el servidor |
| Frontend | `src/environments/environment.ts` | `environment.staging.ts` | `environment.production.ts` |

Los `.env` de los servidores (`chmod 600`) se guardan también en el gestor de contraseñas: son la única
copia de los secretos fuera del servidor. Nunca van a git.

El frontend no tiene secretos: todo lo que hay en `environment*.ts` termina en el bundle público. La key de
Supabase del frontend es la publicable (anon); la `service_role` vive solo en el backend.

### Clasificación de las variables de la API

| Variable | Tipo | Staging vs producción |
|---|---|---|
| `DATABASE_URL` | secreta | distinta (Postgres del Supabase de cada ambiente, Session pooler, sin parámetros) |
| `DATABASE_SSL_CA` | pública | `/app/certs/supabase-root-2021.crt` en los dos (TLS verificado hacia Supabase) |
| `SUPABASE_URL` | pública | distinta |
| `SUPABASE_SERVICE_ROLE_KEY` | secreta | distinta |
| `SUPABASE_JWT_SECRET` | secreta | no se usa (los dos proyectos firman con ES256 vía JWKS) |
| `RESEND_API_KEY` | secreta | una key por ambiente (mismo dominio verificado) |
| `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO` | privada | pueden coincidir |
| `BANECO_API_URL`, `BANECO_USERNAME`, `BANECO_PASSWORD`, `BANECO_AES_KEY`, `BANECO_ACCOUNT`, `BANECO_BRANCH_CODE` | secretas | ⚠️ staging usa las credenciales reales: un QR de staging es un cobro real |
| `GROQ_API_KEY` | secreta | una key por ambiente |
| `GROQ_*`, `CHATBOT_ENABLED`, `CHAT_*` | privadas | pueden diferir |
| `FRONTEND_URL`, `CORS_ORIGINS` | públicas | distintas (el origen de su propio frontend, nada más) |
| `TRUST_PROXY_HOPS` | privada | `1` en los dos |
| `THROTTLE_*_PER_HOUR` | privadas | defaults |
| `FACTURA_BO_URL` | pública | default |
| `APP_ENV` | pública | `staging` / `production` |
| `PORT` | privada | lo fija la imagen (3000) |
| `SEED_DEMO` | privada | solo local; nunca en los servidores |

## Base de datos y migraciones

### Conexión a Supabase: TLS verificado

El pooler de Supabase presenta un certificado firmado por la **Supabase Root 2021 CA**, que no está entre
las CAs de Node ni del sistema, y **acepta conexiones sin cifrar**. Por eso:

- La CA va versionada en [`api/certs/supabase-root-2021.crt`](../api/certs/supabase-root-2021.crt) (es pública;
  SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`,
  la misma que publica Supabase y la que presenta el pooler; vence en 2031).
- **App y seeds (node-pg):** `DATABASE_SSL_CA` apunta a esa CA y `DATABASE_URL` va **sin** `sslmode` — node-pg
  lee el `sslmode` de la URL y pisa la CA (`pgConnectionConfig()` lo rechaza con un error explícito).
- **`prisma migrate deploy` (motor en Rust):** no lee `DATABASE_SSL_CA`; `db-migrate.yml` le agrega a la URL
  `sslmode=require&sslcert=<ca>&sslaccept=strict`, la única combinación que verifica de verdad
  (`sslrootcert` y `verify-full` se ignoran y aceptan cualquier certificado — probado).

### Migrar un ambiente: workflow `DB migrate`

Actions → **DB migrate** → Run workflow → elegir `staging` o `production` (y, solo en staging, si sembrar los
usuarios de demo). En un runner de GitHub (IPv4 — la conexión directa de Supabase es solo IPv6, por eso el
Session pooler): `prisma migrate deploy` → seed de catálogos → `prisma/verify-db.ts`, que falla si queda alguna
migración sin aplicar, alguna tabla sin RLS o algún catálogo vacío. El log muestra solo conteos.

Necesita, en Settings → Environments → `<ambiente>`, el secret `DATABASE_URL`: el Session pooler tal cual lo
muestra Supabase (Connect → Session pooler), sin parámetros.

`ci.yml` corre `scripts/check-no-destructive-db-commands.sh` en cada PR: falla si un workflow o script de
`deploy/` usa `migrate reset`, `migrate dev`, `db push` o `supabase db reset`.

### Reglas

Prisma es la única fuente de verdad del schema (`api/prisma/migrations/`). No hay `supabase/migrations/`:
dos sistemas de migración sobre las mismas tablas terminan en drift.

- Migración nueva: `npx prisma migrate dev --name <descripcion>` contra la base local de Docker, y va en el
  mismo PR que el código que la usa.
- Staging y producción: `npx prisma migrate deploy` lo corre el workflow `DB migrate` (a mano o desde el
  pipeline de deploy, antes de reemplazar el container). La imagen de la API no migra al arrancar (ni trae el
  CLI de Prisma).
- Nunca contra un ambiente remoto: `prisma migrate dev`, `prisma migrate reset`, `prisma db push`.
- Seed de catálogos (`npx prisma db seed`): idempotente. En staging corre en cada deploy; en producción solo
  a mano. `prisma/seed-demo.ts` se niega a correr con `APP_ENV=production`.
- Toda tabla nueva necesita `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en su migración
  (`test/rls.e2e-spec.ts` falla en CI si falta). Ver el porqué en la migración
  `20260925000000_enable_rls_all_public_tables`.

## Checklist de Supabase (por proyecto)

1. **Auth → URL Configuration**
   - Site URL: el frontend del ambiente (`https://staging.guizadaaliaga.com` / `https://guizadaaliaga.com`).
   - Redirect URLs: `<frontend>/auth/callback` y `<frontend>/auth/reset-password`. Solo en staging, además:
     `http://localhost:4200/**` (desarrollo local usa este proyecto para Auth).
2. **Auth → SMTP**: `smtp.resend.com`, puerto 465, usuario `resend`, contraseña = una API key de Resend
   exclusiva de ese proyecto, remitente en `send.guizadaaliaga.com`. Sin SMTP propio, Supabase no manda los
   correos de recuperación de contraseña a destinatarios reales.
3. **Auth → Providers**: Email, Phone y Google activos. El signup de Supabase queda abierto (Google y el
   registro por email crean la identidad antes de canjear la invitación); quien decide si esa identidad
   tiene cuenta es el backend: `POST /auth/sync` solo crea la fila en `users` con una invitación válida, y
   `POST /auth/register/phone` exige el token de invitación.
4. **Google OAuth** (Google Cloud Console): redirect URI autorizado
   `https://<ref>.supabase.co/auth/v1/callback` del proyecto. En producción, la pantalla de consentimiento
   publicada ("In production").
5. **Settings → Data API**: desactivada (o `public` fuera de los schemas expuestos). El frontend no la usa.
6. **Connect → Session pooler**: la connection string (puerto 5432) va al `.env` del servidor y al secret de
   GitHub del ambiente. No se comparte por chat ni se commitea.
7. **Producción**: plan Pro (backups diarios, sin pausa por inactividad).

## Frontend (Vercel)

Un solo proyecto de Vercel con root en `frontend/`, configurado por [`frontend/vercel.json`](../frontend/vercel.json):

- `develop` se construye con `ng build --configuration staging` y se sirve en `staging.guizadaaliaga.com`.
- `main` se construye con `--configuration production`. **Por ahora `ignoreCommand` solo deja construir
  `develop`**: `environment.production.ts` no tiene todavía el proyecto Supabase de producción. Habilitar `main`
  (y completar ese archivo) es parte de la fase de producción.
- Las demás ramas no se construyen: un preview en `*.vercel.app` no está en el CORS de ninguna API.

## Servidor, Cloudflare y CI/CD

Pendiente (fases 5, 6, 7 y 14 del plan): compose por ambiente, Caddy, firewall, DNS y workflows de deploy.
