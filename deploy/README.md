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

**Un proyecto de Vercel por ambiente**, los dos con root en `frontend/` y el mismo
[`frontend/vercel.json`](../frontend/vercel.json):

| Proyecto | Production Branch (Environments → Production → Branch Tracking) | Dominio (entorno Production) |
|---|---|---|
| `clinica-staging` | `develop` | `staging.guizadaaliaga.com` |
| producción (se crea en CLI-138) | `main` | `guizadaaliaga.com` |

Por qué dos proyectos y no uno con Preview para staging: la protección estándar de Vercel (Vercel
Authentication) tapa los deploys **Preview** con un login de Vercel y solo deja públicos los dominios propios
de **Production**. Con un proyecto por ambiente, cada uno sirve su dominio como Production (público) y
staging y producción no comparten configuración.

- `buildCommand`: `main` → `ng build --configuration production`; cualquier otra rama → `--configuration staging`.
- `ignoreCommand`: **por ahora solo construye `develop`**. `environment.production.ts` todavía no tiene el
  proyecto Supabase de producción; habilitar `main` es parte de CLI-138.
- `staging.guizadaaliaga.com` responde con `X-Robots-Tag: noindex, nofollow`: que Google no lo indexe (tiene
  BANECO real — un QR de staging es un cobro real).
- Cada deploy tiene además una URL única `*.vercel.app`: queda detrás del login de Vercel y no está en el
  CORS de ninguna API. La URL a usar es siempre el dominio.

## Servidor (Hetzner)

El VPS no tiene estado propio: todo lo que corre está en esta carpeta, y lo único que no está en git son los
`.env` y el certificado de origen (los dos con copia en el gestor de contraseñas). No hay Postgres, Redis ni
nada más instalado: solo Docker.

```
/opt/clinic/                    ← copia de deploy/ del repo
  deploy.sh                     despliega una imagen en un ambiente, con rollback automático
  ssh-deploy.sh                 único comando que puede correr la clave SSH del pipeline
  proxy/                        clinic-proxy (Caddy): único container que publica 80/443
    Caddyfile
    certs/origin.pem, origin.key   certificado de origen de Cloudflare (no en git)
  staging/                      clinic-api-staging
    docker-compose.yml
    .env                        secretos de staging (chmod 600, no en git)
    current.env, previous.env   tag desplegado y el anterior (los escribe deploy.sh)
  production/                   clinic-api-production (misma estructura)
```

Los tres stacks comparten la red Docker externa `clinic-edge`. Las APIs **no publican puertos**: Caddy les
habla por esa red (`clinic-api-<ambiente>:3000`). Lo que no es secreto y define al ambiente (`APP_ENV`,
`FRONTEND_URL`, `CORS_ORIGINS`, `TRUST_PROXY_HOPS`, `DATABASE_SSL_CA`) está fijo en cada `docker-compose.yml`,
así no se puede olvidar ni cruzar entre ambientes; el `.env` solo lleva secretos.

Hardening de los containers de la API: usuario `node`, filesystem de solo lectura (`read_only`, `/tmp` en
tmpfs), `cap_drop: ALL`, `no-new-privileges`, límite de memoria, logs `json-file` rotados (5 × 10 MB).

### IP real del cliente

Cloudflare manda la IP real en `CF-Connecting-IP`. Caddy **solo** la acepta si el request viene de un rango de
Cloudflare (`trusted_proxies` en el Caddyfile) y se la pasa a la API como único valor de `X-Forwarded-For`; la
API la toma con `TRUST_PROXY_HOPS=1`. Un request que no venga de Cloudflare no puede falsificarla (probado: con
`CF-Connecting-IP` y `X-Forwarded-For` inventados, la API ve la IP real de la conexión). Si Cloudflare cambia
sus rangos (https://www.cloudflare.com/ips/), actualizarlos en el Caddyfile.

### Primera puesta en marcha (una vez)

1. **Hetzner Cloud Firewall** (consola de Hetzner, no ufw: Docker se saltea ufw al publicar puertos): 22/tcp como
   está hoy; 80/tcp y 443/tcp solo desde los rangos de Cloudflare (IPv4 e IPv6); todo lo demás cerrado.
2. Copiar la carpeta: `sudo mkdir -p /opt/clinic && sudo chown saul: /opt/clinic`, y desde tu máquina
   `scp -r deploy/. saul@<vps>:/opt/clinic/` (desde la raíz del repo).
3. Certificado de origen de Cloudflare en `/opt/clinic/proxy/certs/origin.pem` y `origin.key`
   (`chmod 600 origin.key`).
4. `cp staging/.env.example staging/.env && chmod 600 staging/.env` y completarlo.
5. `docker network create clinic-edge`
6. `cd /opt/clinic/proxy && docker compose up -d`
7. Si la imagen de GHCR es privada: `docker login ghcr.io` con un token de solo lectura (`read:packages`).
8. `/opt/clinic/deploy.sh staging <tag>`

### Desplegar y volver atrás

```
/opt/clinic/deploy.sh staging <tag>      # tag = SHA del commit (lo publica el pipeline)
```

`deploy.sh` levanta la imagen, espera el healthcheck (`/health`) y después `/health/ready` (la base responde).
Si no queda sana, muestra los últimos logs y **vuelve sola a la versión anterior** (probado con una imagen que no
arranca). Rollback manual: correrlo con el tag anterior (`cat staging/previous.env`). No toca la base: las
migraciones van antes, con el workflow `DB migrate`, y tienen que ser aditivas para que volver a la imagen
anterior no rompa.

Mientras se reemplaza el container, el ambiente queda unos segundos sin responder (una sola instancia por
ambiente: alcanza para una clínica chica).

### Operación

| Qué | Cómo |
|---|---|
| Logs de la API | `docker logs -f clinic-api-staging` |
| Access log del proxy | `docker logs -f clinic-proxy` (JSON, con `client_ip`) |
| Estado | `docker ps` (las APIs tienen que figurar `healthy`) |
| Recargar el Caddyfile sin cortar | `cd /opt/clinic/proxy && docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile` |
| Reinicio del VPS | todo vuelve solo (`restart: unless-stopped`) |

## CI/CD

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `ci.yml` | cada PR y push a `develop`/`main` | tests + coverage + Sonar (runner propio), e2e, guard `db-safety` |
| `deploy-staging.yml` | push a `develop` (PR mergeado), o a mano | imagen → GHCR (`clinic-api:<sha>`), `DB migrate` en staging, `deploy.sh staging <sha>` por SSH, smoke test |
| `db-migrate.yml` | a mano, o llamado por el deploy | `migrate deploy` + seed de catálogos + verificación de la base |

Los deploys corren en runners de GitHub (nunca en el runner propio). Rollback: *Run workflow* de
`Deploy staging` con el SHA anterior en `ref`, o `/opt/clinic/deploy.sh staging <sha anterior>` en el VPS.

### Secrets del GitHub Environment `staging`

Settings → Environments → `staging`. Mismos nombres en `production` (con valores de producción).

| Secret | Para qué | De dónde sale |
|---|---|---|
| `DATABASE_URL` | migraciones y seed desde el runner | Supabase → Connect → Session pooler (sin `?...`) |
| `SSH_HOST` | a qué VPS conectarse | IP del VPS (`2.28.22.171`) |
| `SSH_USER` | usuario del VPS | `saul` |
| `SSH_PRIVATE_KEY` | clave del pipeline para desplegar | clave **nueva y dedicada** (ver abajo); nunca tu clave personal |
| `SSH_KNOWN_HOSTS` | que el runner verifique que habla con tu VPS | `ssh-keyscan -t ed25519 2.28.22.171` (huella `SHA256:aMCEnYZu9Mwdcd6/EA0aiQjoCyii/ZzT9xHBY7NMPYs`) |

GHCR no necesita secret (usa el `GITHUB_TOKEN` del workflow). Los secretos de la app (Groq, Resend, BANECO,
`service_role`) no están en GitHub: solo en el `.env` del servidor.

### Clave SSH de deploy (una por ambiente)

La clave del pipeline no da shell: en el VPS queda atada a `ssh-deploy.sh <ambiente>`, que solo acepta un tag
y llama a `deploy.sh`. Si se filtrara, lo máximo que permite es desplegar una imagen ya publicada, y solo en su
ambiente.

1. En tu máquina: `ssh-keygen -t ed25519 -N "" -C deploy-staging -f /tmp/deploy-staging` (sin passphrase: la usa
   un robot).
2. En el VPS, agregar **una línea** a `~/.ssh/authorized_keys` con la clave pública precedida de la restricción:
   ```
   command="/opt/clinic/ssh-deploy.sh staging",restrict ssh-ed25519 AAAA... deploy-staging
   ```
3. Cargar el contenido de `/tmp/deploy-staging` (la privada) en el secret `SSH_PRIVATE_KEY` del Environment
   `staging`, y después borrar los dos archivos de `/tmp`.
4. Probar: `ssh -i /tmp/deploy-staging saul@2.28.22.171 cualquier-cosa` tiene que contestar `Tag inválido`
   (y nunca abrir una shell).

### Imagen en GHCR

`ghcr.io/guizadasaul/clinic-api` no lleva secretos (el `.env` no entra a la imagen; `certs/` es la CA pública
de Supabase) y el código ya es público, así que el paquete puede ser **público**: el VPS la baja sin login.
La primera vez que el pipeline la publica, GitHub la crea privada: Profile → Packages → `clinic-api` →
Package settings → Change visibility → Public. (Alternativa: dejarla privada y hacer `docker login ghcr.io`
en el VPS con un token de solo lectura.)

## Cloudflare

Pendiente de documentar al cerrar CLI-128: DNS, SSL Full (strict) y certificado de origen.
