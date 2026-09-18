# Clínica Dental Guizada-Aliaga

Sistema web de gestión para una clínica odontológica: reserva pública de consultas con pago por QR,
fichas clínicas con odontograma, presupuestos, agenda multi-doctor y panel de administración.

Monorepo con una API **NestJS 11** (`api/`), un frontend **Angular 21** (`frontend/`), base de datos
**PostgreSQL 16** (Prisma 7) y autenticación con **Supabase Auth**.

## Índice

1. [Qué es el proyecto](#1-qué-es-el-proyecto)
2. [Requisitos previos](#2-requisitos-previos)
3. [Inicio rápido con Docker](#3-inicio-rápido-con-docker)
4. [Variables de entorno](#4-variables-de-entorno-apienv)
5. [Ejecución sin Docker](#5-ejecución-sin-docker)
6. [Usuarios de prueba](#6-usuarios-de-prueba)
7. [Recorrido sugerido para evaluar](#7-recorrido-sugerido-para-evaluar)
8. [Stack y arquitectura](#8-stack-y-arquitectura)
9. [Estructura del monorepo](#9-estructura-del-monorepo)
10. [Modelo de datos](#10-modelo-de-datos)
11. [API](#11-api)
12. [Testing, lint y build](#12-testing-lint-y-build)
13. [Troubleshooting](#13-troubleshooting)
14. [Decisiones de diseño y limitaciones conocidas](#14-decisiones-de-diseño-y-limitaciones-conocidas)

---

## 1. Qué es el proyecto

Aplicación para una clínica dental de Bolivia (zona horaria `America/La_Paz`, turnos de 30 minutos).
Tiene una web pública y un panel interno con tres roles: `odontologist`, `patient` y `admin`.

### Funcionalidades por rol

**Odontólogo**

- **Agenda propia**: turnos confirmados y resumen del día en el inicio.
- **Pacientes**: lista con búsqueda y filtro "Todos / Los míos". Ficha clínica en 4 pasos: datos
  personales, antecedentes personales (condiciones médicas de catálogo, medicación, reacciones a la
  anestesia), higiene bucal y examen dental.
- **Odontograma diagnóstico**: numeración FDI (dientes permanentes y temporales). Catálogo de
  diagnósticos por categorías, aplicables a un diente, a varios o de forma general. Cada guardado crea
  una **versión nueva e inmutable** del examen.
- **Odontograma de tratamientos**: catálogo de 64 tratamientos en 8 categorías, con distintos alcances
  de aplicación (un diente, varios, arcada superior o inferior, boca completa, etc.) y superficies
  dentales. Historial de tratamientos realizados.
- **Presupuestos**: armado por tratamiento (precio y cantidad), conversión USD→BOB para los
  tratamientos en dólares (Implante) y registro de pagos parciales o totales.
- **Invitaciones** a pacientes por **correo (Resend)** o **WhatsApp** (enlace `wa.me`), con un token de
  un solo uso que vence en 5 minutos.
- **Moderación de comentarios** de la landing.

**Paciente**

- **Reserva pública sin cuenta** (`/reservar` o el modal de la landing): doctor → horario → datos de
  contacto → **pago con QR BANECO** → confirmación. El horario queda retenido 10 minutos.
- **Registro por invitación** (`/invitacion/:token`) y **login** con correo + contraseña,
  teléfono + contraseña o Google. Recuperación de contraseña por correo.
- Portal de paciente básico (ver [limitaciones](#limitaciones-conocidas)).

**Administrador** (uno por base de datos)

- **Alta, edición y baja lógica de doctores**: perfil, especialidad, biografía, horario semanal por
  bloques e invitación.
- **Ver la agenda y los pacientes de cualquier doctor** (solo lectura).
- **Reportes** operativos y financieros por rango de fechas y doctor.

### Multi-doctor

Disponibilidad, reservas y agenda están aisladas por doctor. El selector público solo lista doctores
activos y reservables. El "doctor asignado" de un paciente es informativo: cualquier odontólogo puede
ver y editar cualquier paciente.

### Internacionalización

La landing, el login/registro y los componentes compartidos están en **español, inglés y portugués**
(`npm run check:i18n` valida que los tres idiomas tengan las mismas claves). Los paneles internos están
solo en español.

---

## 2. Requisitos previos

**Opción recomendada (Docker)**

- Docker Desktop con **Docker Compose v2** (comando `docker compose`, sin guion).
- Puertos libres: **4200** (frontend), **2999** (API) y **5433** (PostgreSQL).
- Acceso a internet (Supabase Auth y, para tratamientos en dólares, el tipo de cambio).
- Las credenciales de prueba, entregadas por separado (ver [sección 6](#6-usuarios-de-prueba)).

**Sin Docker**

- Node.js `^20.19`, `^22.12` o `>=24` (requisito de Angular CLI 21; la imagen Docker usa Node 22) y npm.
- Un PostgreSQL accesible. Se recomienda la versión 16, la misma de `docker-compose.yml`.

---

## 3. Inicio rápido con Docker

```bash
git clone https://github.com/guizadasaul/clinica-dental-guizada-aliaga.git
cd clinica-dental-guizada-aliaga

# 1) Crear el archivo de entorno de la API
cp api/.env.example api/.env

# 2) Editar api/.env (ver sección 4):
#    - SUPABASE_URL: copiar el valor de `supabase.url` en frontend/src/environments/environment.ts
#    - descomentar SEED_DEMO="true"  (crea los usuarios de prueba)

# 3) Levantar la aplicación (indicando los 3 servicios)
docker compose up --build db api frontend
```

> **No ejecutar `docker compose up` sin indicar servicios.** El `docker-compose.yml` también define
> `sonarqube` y `sonarqube-db`, una instancia de SonarQube para el análisis de calidad del código
> (desarrollo y CI). Es pesada, publica el puerto 9000 y no hace falta para evaluar la aplicación.

La primera vez tarda varios minutos (instala dependencias y compila). Cuando el frontend termine de
compilar, abrir **http://localhost:4200** e ingresar con las credenciales entregadas.

Comprobación rápida de la API: `curl http://localhost:2999/` responde `Hello World!`.

### Servicios y puertos

| Servicio                       | Contenedor     | URL en el host        | Notas                                  |
| ------------------------------ | -------------- | --------------------- | -------------------------------------- |
| Frontend (Angular, `ng serve`) | `cga-frontend` | http://localhost:4200 | hot-reload por bind-mount              |
| API (NestJS, `start:dev`)      | `cga-api`      | http://localhost:2999 | hot-reload por bind-mount              |
| PostgreSQL 16                  | `cga-db`       | `localhost:5433`      | base `GuizadaAliaga`, ver `docker-compose.yml` |

PostgreSQL usa el 5433 en el host para no chocar con un Postgres local en el 5432. Entre contenedores
sigue siendo `db:5432`. Los servicios de SonarQube (`cga-sonarqube`, en `127.0.0.1:9000`) quedan fuera
de este flujo.

### Qué pasa en cada arranque de la API

`api/docker/entrypoint.sh` ejecuta, en orden y en **cada** `docker compose up`:

1. `npm install` (el volumen de `node_modules` empieza vacío).
2. `npx prisma generate`.
3. `npx prisma migrate deploy`: aplica las migraciones pendientes.
4. `npx prisma db seed`: catálogos **idempotentes** (categorías y tratamientos, diagnósticos,
   superficies dentales, condiciones médicas y testimonios). No sobrescribe precios que se hayan
   editado y desactiva, en vez de borrar, lo que ya no esté en el catálogo.
5. Si `SEED_DEMO=true`: `ts-node prisma/seed-demo.ts` crea los usuarios de prueba (también idempotente).
6. Inicia `npm run start:dev`.

El frontend solo ejecuta `npm install` y `ng serve`.

### Detener

```bash
docker compose down        # conserva los datos
docker compose down -v     # además borra la base y los node_modules (parte de cero); si se usó SonarQube, también sus datos
```

Los contenedores tienen `restart: unless-stopped`: vuelven a levantarse solos al reiniciar Docker hasta
que se ejecute `docker compose down`.

Si se levantó SonarQube sin querer: `docker compose stop sonarqube sonarqube-db`.

---

## 4. Variables de entorno (`api/.env`)

Se crea con `cp api/.env.example api/.env`. El frontend no usa `.env`: su configuración (URL de la API y
proyecto de Supabase) está en `frontend/src/environments/environment.ts`.

### Obligatorias para arrancar y evaluar

| Variable           | Descripción                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_URL`     | URL del proyecto de Supabase. **Debe coincidir** con `supabase.url` de `frontend/src/environments/environment.ts` (la API valida que el `issuer` del token sea `<SUPABASE_URL>/auth/v1`; sin barra final). **Sin ella la API no arranca.** |
| `SEED_DEMO="true"` | Necesaria en una base nueva. Sin usuarios cargados, el login responde 404 "No hay una cuenta asociada a este login todavía".                                                                                                                                              |
| `DATABASE_URL`     | En Docker se ignora (Compose la reemplaza). Sin Docker es obligatoria ([sección 5](#5-ejecución-sin-docker)).                                                                                                                                                             |

### Opcionales: qué deja de funcionar si faltan

La API arranca igual sin estas variables; se degrada solo la funcionalidad indicada.

| Variable(s)                                                                       | Qué deja de funcionar                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                                                       | El registro por teléfono (`POST /auth/register/phone` responde 503) y la confirmación automática del teléfono en Supabase. El login por correo y por Google no depende de ella.                                        |
| `BANECO_API_URL`, `BANECO_USERNAME`, `BANECO_PASSWORD`, `BANECO_AES_KEY`, `BANECO_ACCOUNT` | El **pago con QR**: `POST /public/appointments/:id/checkout` responde 503. La reserva llega hasta el paso de datos de contacto pero no se puede confirmar. Todo lo demás funciona.                       |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                             | El **envío de invitaciones por correo** (503). El canal WhatsApp no necesita configuración.                                                                                                                            |
| `SUPABASE_JWT_SECRET`                                                             | Solo hace falta si el proyecto firma con HS256 legado. El proyecto actual publica claves ES256 en su JWKS, así que no se necesita.                                                                                     |
| `FRONTEND_URL` (default `http://localhost:4200`), `CORS_ORIGINS`                  | Origen del enlace de invitación y lista blanca de CORS. En Docker `CORS_ORIGINS` ya viene fijado.                                                                                                                      |
| `THROTTLE_*_PER_HOUR`                                                             | Límites por IP y hora de los formularios públicos. Subirlos si se prueba mucho.                                                                                                                                        |
| `FACTURA_BO_URL`                                                                  | Origen del tipo de cambio USD→BOB (API pública, sin clave). Si falla y no hay un valor previo, agregar un tratamiento en dólares responde 503.                                                                         |
| `RESEND_REPLY_TO`, `BANECO_BRANCH_CODE`                                           | Opcionales.                                                                                                                                                                                                            |

> `api/.env` está en `api/.gitignore`: nunca se commitea.

---

## 5. Ejecución sin Docker

Opción híbrida, solo la base en Docker:

```bash
docker compose up -d db        # PostgreSQL en localhost:5433
```

O usar un Postgres propio y crear la base a mano. Después, en dos terminales:

```bash
# Terminal 1 — API
cd api
cp .env.example .env
#   DATABASE_URL="postgresql://USUARIO:CLAVE@localhost:5433/GuizadaAliaga?schema=public"
#   (usuario y clave: los del servicio `db` en docker-compose.yml, o los de tu Postgres)
#   SUPABASE_URL="<supabase.url de frontend/src/environments/environment.ts>"
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run seed:demo              # usuarios de prueba
npm run start:dev              # http://localhost:2999

# Terminal 2 — Frontend
cd frontend
npm install
npm start                      # http://localhost:4200
```

El frontend siempre apunta a `http://localhost:2999` (`environment.backendUrl`). Abrir la app
exactamente en `http://localhost:4200`: es el único origen que permite CORS.

---

## 6. Usuarios de prueba

Las **credenciales se entregan por separado**; no están en el repositorio. Hay una cuenta por rol. Sus
identidades existen en Supabase Auth y las filas correspondientes en PostgreSQL las carga el seed de
demo (`SEED_DEMO="true"` con Docker, o `npm run seed:demo` en `api/` sin Docker).

| Rol                         | Ingreso       | Qué se ve                                                                                          |
| --------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Odontólogo (`odontologist`) | `/auth/login` | Panel del doctor: inicio, agenda, pacientes y comentarios. Con horario de lunes a viernes cargado. |
| Paciente (`patient`)        | `/auth/login` | Portal del paciente, con ficha ya creada y asignada al doctor de prueba.                           |
| Administrador (`admin`)     | `/auth/login` | Panel de administración: doctores y reportes.                                                      |

En el login se ingresa el correo (o teléfono) y la contraseña. El botón de Google depende de cómo esté
configurado el proveedor en el proyecto de Supabase; para evaluar se recomienda correo + contraseña.

---

## 7. Recorrido sugerido para evaluar

### Sin sesión (web pública)

- [ ] Landing (`/`): secciones y cambio de idioma ES / EN / PT.
- [ ] Reserva (botón "Reservar Cita" o `/reservar`): elegir doctor, ver horarios por semana y retener un
      horario (cuenta regresiva de 10 minutos). El pago con QR requiere credenciales BANECO
      ([sección 4](#4-variables-de-entorno-apienv)).
- [ ] Formulario de comentarios: queda pendiente hasta que un doctor lo apruebe.

### Odontólogo

- [ ] Inicio y **agenda**.
- [ ] **Pacientes**: buscar y alternar "Todos / Los míos".
- [ ] Editar la ficha (4 pasos). En el examen dental: usar el odontograma diagnóstico y guardar para crear
      una versión nueva.
- [ ] **Registrar un tratamiento** en el odontograma de tratamientos y revisar el historial de tratamientos.
- [ ] **Presupuesto**: crear uno, agregar ítems (incluido uno en USD, como Implante) y registrar pagos
      parciales hasta saldarlo.
- [ ] **Invitación** por WhatsApp (genera un enlace `wa.me`; no necesita configuración).
- [ ] **Comentarios**: aprobar o rechazar uno y ver el efecto en la landing.

### Administrador

- [ ] **Doctores**: listado, alta de un doctor con bloques de horario, edición y baja.
- [ ] **Ver la agenda y los pacientes** de un doctor (solo lectura).
- [ ] **Reportes**: pestañas operativa y financiera, con rango de fechas y filtro por doctor.

### Paciente

- [ ] Login y portal. Varias secciones son maquetas ([limitaciones](#limitaciones-conocidas)).

---

## 8. Stack y arquitectura

| Capa          | Tecnología                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Frontend      | Angular 21 (standalone, signals, `OnPush`), `@ngx-translate`, Tailwind, `@supabase/supabase-js`      |
| Backend       | NestJS 11, TypeScript, class-validator, Helmet, `@nestjs/throttler`, `@nestjs/schedule`, `jose`      |
| Datos         | PostgreSQL 16, Prisma 7 (adaptador `pg`)                                                              |
| Autenticación | Supabase Auth (JWT verificado localmente contra el JWKS)                                              |
| Integraciones | BANECO API Market (QR de cobro), Resend (correo), factura.bo (tipo de cambio)                         |
| Tests         | Jest (API), Vitest vía `@angular/build:unit-test` (frontend)                                          |
| Calidad y CI  | SonarQube (self-hosted, Docker), GitHub Actions con runner propio                                     |

### Backend: arquitectura hexagonal por módulo

Cada módulo (`admin`, `appointments`, `auth`, `diagnoses`, `doctors`, `exchange-rate`,
`medical-conditions`, `patient-invites`, `patients`, `payments`, `quotes`, `reports`, `testimonials`,
`treatments`) se organiza en:

```
<modulo>/domain/          entidades y puertos (interfaces); sin Nest, Prisma ni jose
<modulo>/application/     servicios que orquestan el caso de uso contra los puertos
<modulo>/infrastructure/  http (controllers + DTOs), persistence (adaptador Prisma + mapper), integraciones
<modulo>.module.ts        cablea puerto -> implementación
```

Cada request pasa por `SupabaseAuthGuard` → `RolesGuard` → `ValidationPipe` (estricto: rechaza propiedades
desconocidas) → controller → servicio → puerto → adaptador Prisma → PostgreSQL.

### Frontend

`core/` (guards, interceptors, cliente Supabase), `features/<feature>/` (modelos, servicios y
componentes) y `shared/` (UI reutilizable). Sin NgModules; el estado usa `signal` / `computed`.

### Diagrama de componentes

```
                      +-----------------------------+
                      |  Supabase Auth              |
                      |  (correo / teléfono / Google)|
                      +--------------+--------------+
                       login (PKCE)   |  ^ JWKS (clave pública)
                                      v  |
+-----------------------+    +--------+--+---------------------------+
| Navegador             |    | API NestJS :2999                       |
| Angular 21 :4200      |    |  SupabaseAuthGuard (jose)              |
|  AuthService (signals)|    |  RolesGuard (users.role en Postgres)   |
|  authInterceptor  ----+--->|  Controllers -> Services -> Puertos    |
|  Authorization:       |    |        |                               |
|    Bearer <JWT>       |    +--------+--------+-----------+----------+
+-----------------------+             |         |           |
                                      v         v           v
                             +--------------+ +--------+ +---------------+
                             | PostgreSQL 16| | BANECO | | Resend        |
                             | (Prisma 7)   | | (QR)   | | factura.bo    |
                             | host :5433   | +--------+ +---------------+
                             +--------------+
```

### Flujo de login y sincronización

```
Usuario    Angular (AuthService)        Supabase Auth          API NestJS               PostgreSQL
   | credenciales |                           |                      |                       |
   |------------->| signInWithPassword /      |                      |                       |
   |              |  signInWithOAuth (PKCE)   |                      |                       |
   |              |-------------------------->|                      |                       |
   |              |<-- sesión + access JWT ---|                      |                       |
   |              | POST /auth/sync   Authorization: Bearer <JWT> -->|                       |
   |              |                           |  jose: verifica firma contra el JWKS,        |
   |              |                           |  issuer y audience (sin llamar a Supabase)   |
   |              |                           |                      | findByAuthUserId ---->|
   |              |                           |                      |<-- users (con role) --|
   |              |<-- 200 {id, role, ...} --------------------------|                       |
   |              |    o 404 "No hay una cuenta asociada a este login todavía"               |
   |              | role = odontologist | patient | admin -> /dashboard                      |
```

### Contrato frontend-backend

- Cabecera exacta `Authorization: Bearer <access_token>`; sin cookies.
- URL base en `environment.backendUrl`; el interceptor solo adjunta el token a esa URL.
- El **rol de la aplicación vive solo en `public.users.role`**. El claim `role` del JWT es
  `"authenticated"` (el rol de PostgREST) y se ignora.
- Un login **no crea cuentas**: solo sincroniza el perfil de una fila existente o canjea una invitación.
- Un rol insuficiente devuelve 403 (no 401): el frontend trata el 401 como sesión vencida y redirige al login.

---

## 9. Estructura del monorepo

```
clinica-dental-guizada-aliaga/
├── docker-compose.yml           # db + api + frontend (desarrollo) y sonarqube + sonarqube-db (calidad)
├── .github/workflows/ci.yml     # CI: tests con cobertura, SonarQube y e2e
├── api/                         # NestJS, puerto 2999
│   ├── .env.example
│   ├── sonar-project.properties
│   ├── docker/entrypoint.sh     # instala, genera Prisma, migra, siembra y arranca
│   ├── prisma/
│   │   ├── schema.prisma        # modelo de datos
│   │   ├── migrations/          # migraciones SQL
│   │   ├── seed.ts              # catálogos (idempotente)
│   │   └── seed-demo.ts         # usuarios de prueba (SEED_DEMO=true)
│   ├── scripts/                 # create-demo-auth-users.mjs, check-no-raw-sql.mjs
│   ├── src/
│   │   ├── shared/              # PrismaService, validadores (FDI, documento, teléfono, texto)
│   │   └── <modulo>/            # domain / application / infrastructure
│   └── test/                    # e2e (requieren base y .env)
├── frontend/                    # Angular 21, puerto 4200
│   ├── public/assets/           # i18n (es, en, pt), imágenes, odontograma SVG
│   ├── scripts/check-i18n.mjs
│   ├── sonar-project.properties
│   └── src/
│       ├── environments/        # URL de la API y proyecto de Supabase
│       └── app/
│           ├── core/            # guards, interceptors, cliente Supabase
│           ├── auth/            # login, recuperación, callback
│           ├── landing/         # web pública
│           ├── features/        # admin, appointments, booking, dashboard, diagnoses, invitation,
│           │                    # medical-conditions, patient-invites, patients, quotes, reports,
│           │                    # testimonials, treatments
│           └── shared/          # UI, directivas, validaciones, constantes
└── scripts/                     # utilidades de desarrollo (worktrees); no hacen falta para evaluar
```

---

## 10. Modelo de datos

PostgreSQL gestionado con Prisma. Tablas y campos en `snake_case`; los IDs son UUID generados por la base.

| Dominio                   | Tablas                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuentas y doctores        | `users` (rol `odontologist / patient / admin`; `auth_user_id` = uid de Supabase), `doctor_profiles`, `doctor_schedule_blocks`, `patient_invites` |
| Pacientes                 | `patients` (1:1 con `users`, con `assigned_doctor_id`), `medical_history`, `patient_medical_conditions`, `patient_medications`, `hygiene_habits`, `clinical_exams` |
| Diagnóstico (odontograma) | `dental_exams` (versionado, inmutable), `dental_exam_findings`, `diagnoses`, `diagnosis_categories`, `odontogram_entries`                          |
| Tratamientos              | `treatment_categories`, `treatments`, `tooth_procedures`, `tooth_surfaces`, `tooth_procedure_surfaces`                                             |
| Economía                  | `quotes`, `quote_items`, `application_groups`, `payments`                                                                                          |
| Agenda                    | `appointments` (citas, retenciones y datos del pago BANECO)                                                                                        |
| Otros                     | `medical_conditions` (catálogo), `testimonials`, `xray_documents` (tabla creada, sin lógica todavía)                                               |

Reglas de integridad destacadas:

- Un índice único parcial sobre `(doctor_id, appointment_datetime)` para citas `held` o `confirmed`: un
  doctor no puede tener dos citas activas en el mismo instante.
- Un solo administrador por base (índice único parcial sobre `users.role`).
- Borrar un usuario con ficha, o un doctor con agenda, está restringido (`ON DELETE RESTRICT`); la baja se
  hace con `users.is_active`.

```mermaid
erDiagram
  users ||--o| patients : "cuenta (user_id)"
  users ||--o| doctor_profiles : "perfil"
  users ||--o{ doctor_schedule_blocks : "horario"
  users ||--o{ appointments : "doctor_id"
  users ||--o{ patients : "assigned_doctor_id"
  users ||--o{ patient_invites : ""
  patients ||--o{ appointments : ""
  treatments ||--o{ appointments : "opcional"
  patients ||--o{ dental_exams : "versiones"
  dental_exams ||--o{ dental_exam_findings : ""
  diagnoses ||--o{ dental_exam_findings : ""
  diagnosis_categories ||--o{ diagnoses : ""
  patients ||--o{ tooth_procedures : ""
  treatments ||--o{ tooth_procedures : ""
  treatment_categories ||--o{ treatments : ""
  tooth_procedures ||--o{ tooth_procedure_surfaces : ""
  tooth_surfaces ||--o{ tooth_procedure_surfaces : ""
  patients ||--o{ quotes : ""
  quotes ||--o{ quote_items : ""
  quotes ||--o{ application_groups : ""
  quotes ||--o{ payments : ""
  treatments ||--o{ quote_items : ""
  patients ||--o| medical_history : ""
  patients ||--o| hygiene_habits : ""
  patients ||--o{ clinical_exams : ""
  patients ||--o{ patient_medical_conditions : ""
  medical_conditions ||--o{ patient_medical_conditions : ""
  patients ||--o{ patient_medications : ""
```

---

## 11. API

Base: `http://localhost:2999`. Autenticación: `Authorization: Bearer <access_token>` de Supabase. Los
endpoints públicos no llevan token. Un rol insuficiente devuelve 403. Los errores siguen el formato
estándar de Nest (`statusCode`, `message`, `error`).

**Públicos**

| Método y ruta                                        | Uso                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `GET /`                                              | Comprobación de vida                                         |
| `GET /public/doctors`                                | Doctores reservables                                         |
| `GET /public/availability?doctorId&date`             | Horarios de un día                                           |
| `GET /public/availability-range?doctorId&from&days`  | Horarios de un rango                                         |
| `POST /public/appointments/hold`                     | Retener un horario                                           |
| `PATCH /public/appointments/:id/contact`             | Datos de contacto del invitado                               |
| `POST /public/appointments/:id/checkout`             | Generar el QR de BANECO                                      |
| `GET /public/appointments/:id/status`                | Estado del pago                                              |
| `POST /payments/baneco/webhook`                      | Notificación de BANECO (solo dispara la verificación)        |
| `GET / POST /public/testimonials`                    | Comentarios aprobados / enviar uno                           |
| `GET /invites/:token/status`                         | Validez de una invitación                                    |
| `POST /auth/register/phone`                          | Registro por teléfono (requiere `SUPABASE_SERVICE_ROLE_KEY`) |

Los formularios públicos de escritura tienen límite de peticiones por IP y hora (ver `THROTTLE_*` en la
[sección 4](#4-variables-de-entorno-apienv)).

**Autenticados**

| Módulo                         | Rutas                                                                                                                                       | Rol                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| auth                           | `POST /auth/sync`, `GET /auth/me`                                                                                                           | cualquier usuario autenticado    |
| patients                       | `GET /patients/me`, `GET /patients/me/status`                                                                                               | cualquier usuario autenticado    |
| patients                       | `GET /patients` (filtro `doctorId`)                                                                                                         | odontólogo, admin                |
| patients                       | `POST /patients`, `PATCH /patients/:id` y, bajo `/patients/:id/`: `medical-history`, `hygiene-habits`, `clinical-exams`, `odontogram-entries`, `tooth-procedures`, `dental-exams` | odontólogo |
| patient-invites                | `POST /patients/:id/invites` (canal `email` o `whatsapp`)                                                                                   | odontólogo                       |
| treatments                     | `GET /treatments`                                                                                                                           | cualquier usuario autenticado    |
| treatments                     | `POST /treatments`, `PATCH /treatments/:id`                                                                                                 | odontólogo                       |
| diagnoses, medical-conditions  | `GET /diagnoses`, `GET /medical-conditions`                                                                                                 | odontólogo                       |
| quotes                         | `POST / GET /patients/:patientId/quotes`, `GET /quotes/:id`, `POST /quotes/:id/items`, `DELETE /quotes/:id/items/:itemId`, `POST /quotes/:id/payments` | odontólogo               |
| appointments                   | `GET /appointments` (`status`, `from`, `to`; `doctorId` solo se respeta para admin)                                                         | odontólogo, admin                |
| testimonials                   | `GET /testimonials/pending`, `PATCH /testimonials/:id/status`                                                                               | odontólogo                       |
| admin                          | `GET / POST /admin/doctors`, `GET / PATCH /admin/doctors/:id`, `PATCH /admin/doctors/:id/deactivate`                                        | admin                            |
| reports                        | `GET /admin/reports/operational`, `GET /admin/reports/financial` (`from`, `to`, `doctorId?`)                                                | admin                            |

---

## 12. Testing, lint y build

| Acción              | Backend (`cd api`)                                        | Frontend (`cd frontend`)                     |
| ------------------- | --------------------------------------------------------- | -------------------------------------------- |
| Tests unitarios     | `npm test` (Jest; antes ejecuta `check:no-raw-sql`)       | `npm test` (Vitest; antes ejecuta `check:i18n`) |
| Cobertura           | `npm run test:cov`                                        | `npm run test:cov`                           |
| E2E                 | `npm run test:e2e` (requiere base levantada y `api/.env`) | no hay                                       |
| Lint / formato      | `npm run lint` (**aplica `--fix`**), `npm run format`     | no hay script de lint                        |
| Build               | `npm run build`; `npm run start:prod`                     | `npm run build`                              |
| Validación de i18n  | n/a                                                       | `npm run check:i18n`                         |
| Análisis de calidad | `npm run sonar` (requiere SonarQube y `SONAR_TOKEN`)      | `npm run sonar` (ídem)                       |

Con el stack en Docker: `docker compose exec api npm test` y `docker compose exec frontend npm test`.

### Integración continua

`.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`, sobre un runner
self-hosted, con tres jobs:

- **api**: `npm ci`, `prisma generate`, `npm run test:cov` y análisis de SonarQube con quality gate.
- **frontend**: `npm ci`, `npm run test:cov` y análisis de SonarQube con quality gate.
- **e2e**: levanta una base PostgreSQL efímera (puerto 5434), aplica las migraciones y ejecuta
  `npm run test:e2e`. Usa una `SUPABASE_URL` de relleno: los e2e actuales no validan JWTs reales.

El análisis de SonarQube necesita la instancia local y sus tokens (`SONAR_HOST_URL`, `SONAR_TOKEN`), por
lo que no se puede reproducir en un clon sin esa configuración.

---

## 13. Troubleshooting

| Síntoma                                                                                                  | Causa y solución                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env file .../api/.env not found`                                                                        | Falta `cp api/.env.example api/.env`.                                                                                                                                                                                                               |
| El contenedor `cga-api` se reinicia y el log dice `SUPABASE_URL environment variable is required`       | Completar `SUPABASE_URL` en `api/.env`. Ver el log con `docker compose logs -f api`.                                                                                                                                                                |
| Puerto ocupado (4200, 2999 o 5433)                                                                       | Cerrar el proceso que lo usa. Solo el de PostgreSQL se puede cambiar (lado izquierdo del mapeo en `docker-compose.yml`); 4200 y 2999 están fijados en CORS y en `environment.ts`.                                                                    |
| Login correcto, pero se vuelve a la landing con el aviso de que no hay cuenta de paciente (`POST /auth/sync` responde 404) | La identidad existe en Supabase pero no la fila en `users`. Causas: `SEED_DEMO` no activado, base borrada con `down -v`, o `SUPABASE_URL` de otro proyecto. Activar `SEED_DEMO="true"` y ejecutar `docker compose restart api`.        |
| Todas las llamadas dan 401 tras iniciar sesión                                                           | `SUPABASE_URL` distinto del de `environment.ts`, o con barra final.                                                                                                                                                                                 |
| Error de CORS en la consola                                                                              | Abrir la app en `http://localhost:4200` (no `127.0.0.1` ni otro puerto).                                                                                                                                                                            |
| `429 Too Many Requests` en reservas, comentarios o registro                                              | Límite por IP y hora, en memoria. Subir `THROTTLE_*_PER_HOUR` en `api/.env` y reiniciar la API.                                                                                                                                                     |
| `Cannot find module '@prisma/client'` o "did not initialize yet"                                         | `docker compose exec api npx prisma generate` (sin Docker: `npx prisma generate` en `api/`).                                                                                                                                                        |
| Quiero una base limpia                                                                                   | `docker compose down -v && docker compose up`. Se pierden todos los datos.                                                                                                                                                                          |
| Aparecen datos de otra corrida                                                                           | El volumen de la base se llama `cga_db_data` (nombre fijo) y se comparte entre clones en la misma máquina. Ejecutar `docker compose down -v` o `docker volume rm cga_db_data`.                                                                       |
| `/reservar` muestra un doctor sin horarios                                                               | El doctor no tiene bloques en `doctor_schedule_blocks`, no es reservable o está inactivo.                                                                                                                                                           |
| El paso de pago da error 503                                                                             | Faltan las variables `BANECO_*`.                                                                                                                                                                                                                    |
| La invitación por correo da error 503                                                                    | Faltan las variables `RESEND_*`. Usar el canal WhatsApp.                                                                                                                                                                                            |
| Se levantó SonarQube (contenedores `cga-sonarqube*`, puerto 9000) sin querer                              | Se ejecutó `docker compose up` sin indicar servicios. Ejecutar `docker compose stop sonarqube sonarqube-db` y, la próxima vez, `docker compose up --build db api frontend`. |
| Arranque lento o pantalla en blanco al inicio                                                            | Cada arranque ejecuta `npm install`; esperar a que el frontend termine de compilar (`docker compose logs -f frontend`).                                                                                                                             |
| En Windows aparece `\r: command not found` al arrancar la API                                            | Los `.sh` deben tener finales de línea LF: `git config core.autocrlf false` y volver a clonar.                                                                                                                                                      |

---

## 14. Decisiones de diseño y limitaciones conocidas

### Decisiones

- **Autenticación sin llamadas a Supabase por request**: la API verifica la firma del JWT contra el JWKS
  con `jose` y nunca consulta la API de Supabase para autenticar (solo su Admin API, opcional, para
  teléfonos). El rol de negocio se lee de la base, no del token.
- **Un login no crea cuentas**: solo se entra con una cuenta que ya existe (reserva pagada, alta hecha por
  el doctor o el administrador, o invitación canjeada).
- **Invitaciones seguras**: token aleatorio de 32 bytes, se guarda solo su hash SHA-256, vence en 5
  minutos, es de un solo uso, y una invitación nueva invalida las pendientes anteriores.
- **Reserva con retención**: el horario se retiene 10 minutos. La confirmación del pago siempre
  re-consulta a BANECO; el webhook es solo un disparador.
- **Historial clínico inmutable**: cada guardado del diagnóstico crea una versión nueva.
- **Precios congelados**: los ítems de un presupuesto guardan el precio ya convertido a BOB y el tipo de
  cambio usado, para que no cambien si después cambia el catálogo.
- **Validación en capas**: `ValidationPipe` global estricto, validadores de dominio (numeración FDI,
  documento, teléfono), Helmet, límite de tamaño de body, rate limiting y campo anti-bot en comentarios.
- **Frontend**: componentes standalone con `OnPush`, estado con señales, sin NgModules y cliente de
  Supabase con PKCE.

### Limitaciones conocidas

- El **pago con QR requiere credenciales reales de BANECO**; no hay un entorno de pruebas ni una
  confirmación manual. Sin ellas no se puede completar una reserva pública.
- **Portal del paciente mínimo**: "Solicitar cita", "Mis documentos" y "Mi perfil" son maquetas y los
  contadores son fijos. El historial de tratamientos del paciente llama a un endpoint que solo permite el
  rol odontólogo, así que con la cuenta de paciente muestra un estado de error.
- En el panel del doctor, los ítems **Reportes, Finanzas y Configuración** del menú todavía no tienen
  contenido; los reportes existen solo para el administrador.
- Los **paneles internos están solo en español**; la i18n cubre landing, login y componentes compartidos.
- Dar de baja a un usuario (`is_active`) **no revoca** su acceso: los guards de autenticación no consultan
  ese campo.
- El límite de peticiones se guarda **en memoria**, por proceso: se reinicia con la API.
- Zona horaria fija (`America/La_Paz`) y turnos de 30 minutos.
- Stack de **desarrollo** (`Dockerfile.dev`, `ng serve`, `nest --watch`): no hay imágenes de producción ni
  despliegue automatizado, y el frontend tiene un único `environment.ts`.
- El **CI corre en un runner self-hosted** con SonarQube local (ver la sección 12): los checks de calidad
  dependen de esa máquina y no se pueden ejecutar tal cual en un clon nuevo.
- `xray_documents` (radiografías) existe solo como tabla, sin lógica.
- Solo puede haber un administrador por base de datos.
