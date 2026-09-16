-- CLI-61: hoy la clínica está modelada como si tuviera un único doctor.
-- appointments no tiene ninguna columna de profesional y el índice único de
-- "un turno activo" (idx_one_active_appointment_slot) era global sobre
-- appointment_datetime sola — dos citas nunca podían coincidir a la misma
-- hora, sin importar quién las atiende. Esta migración agrega el modelo de
-- datos para que un doctor exista como entidad distinguible (perfil,
-- horario propio, FK en appointments/patients). Conectar esto a la lógica
-- de aplicación (disponibilidad por doctor, agenda propia, etc.) es trabajo
-- de issues separadas (CLI-56 a CLI-60) — acá solo el modelo de datos y el
-- backfill del único doctor real de hoy.

-- DropIndex
DROP INDEX "idx_one_active_appointment_slot";

-- Postgres no permite un subquery inline en un DEFAULT de columna ("cannot
-- use subquery in DEFAULT expression") — se envuelve en una función SQL,
-- que sí está permitida como DEFAULT aunque internamente consulte otra
-- tabla. Función transicional (CLI-56 debe eliminarla junto con el DEFAULT
-- que la usa, ver abajo).
CREATE FUNCTION "cli61_default_doctor_id"() RETURNS UUID AS $$
  SELECT id FROM "users" WHERE role = 'odontologist'::"UserRole" ORDER BY created_at ASC LIMIT 1
$$ LANGUAGE sql STABLE;

-- AlterTable
-- doctor_id NOT NULL con un DEFAULT transicional: la función de arriba
-- resuelve al único doctor real de hoy (role='odontologist'). Al no ser una
-- constante, este ADD COLUMN evalúa el DEFAULT por fila y backfillea las
-- citas existentes en el mismo paso. El DEFAULT queda instalado también
-- para inserts futuros — necesario porque el código que crea citas
-- (createHold y afines) todavía no es doctor-aware (eso es CLI-56, que debe
-- quitar este DEFAULT y la función cuando toda escritura pase doctorId
-- explícito). Si en algún ambiente no existe todavía ningún usuario
-- odontologist, la función resuelve a NULL y este ADD COLUMN falla si ya
-- hay filas en appointments — comportamiento correcto: no hay a quién
-- asignarle la cita existente.
ALTER TABLE "appointments" ADD COLUMN     "doctor_id" UUID NOT NULL DEFAULT "cli61_default_doctor_id"();

-- AlterTable
-- assigned_doctor_id es informativo (no restringe acceso, decisión de
-- alcance de la épica) y nullable, así que no lleva DEFAULT — se backfillea
-- explícitamente más abajo para los pacientes existentes.
ALTER TABLE "patients" ADD COLUMN     "assigned_doctor_id" UUID;

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "specialty" VARCHAR(150),
    "bio" TEXT,
    "photo_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_bookable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_schedule_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doctor_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_user_id_key" ON "doctor_profiles"("user_id");

-- CreateIndex
CREATE INDEX "doctor_schedule_blocks_doctor_id_weekday_idx" ON "doctor_schedule_blocks"("doctor_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "idx_one_active_appointment_slot" ON "appointments"("doctor_id", "appointment_datetime") WHERE (((status)::text = 'held'::text) OR ((status)::text = 'confirmed'::text));

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_assigned_doctor_id_fkey" FOREIGN KEY ("assigned_doctor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctor_schedule_blocks" ADD CONSTRAINT "doctor_schedule_blocks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Backfill: doctor_profiles + doctor_schedule_blocks para el único doctor
-- real de hoy, con el horario que hoy vive hardcodeado en
-- ClinicSchedule.ts (WEEKDAY_BLOCKS) — Lun-Vie 09:00-12:00/15:00-19:00,
-- Sáb 09:00-12:00 — para no perder disponibilidad de un día para otro.
-- CLI-56 conecta el dominio a esta tabla. Escrito como INSERT ... SELECT
-- (no VALUES) para que sea un no-op seguro si todavía no existe ningún
-- usuario odontologist (ej. una base de test recién creada).
INSERT INTO "doctor_profiles" ("user_id")
SELECT id FROM "users" WHERE role = 'odontologist'::"UserRole" ORDER BY created_at ASC LIMIT 1;

INSERT INTO "doctor_schedule_blocks" ("doctor_id", "weekday", "start_time", "end_time")
SELECT d.id, block.weekday, block.start_time, block.end_time
FROM (SELECT id FROM "users" WHERE role = 'odontologist'::"UserRole" ORDER BY created_at ASC LIMIT 1) d
CROSS JOIN (VALUES
    (1, '09:00', '12:00'), (1, '15:00', '19:00'),
    (2, '09:00', '12:00'), (2, '15:00', '19:00'),
    (3, '09:00', '12:00'), (3, '15:00', '19:00'),
    (4, '09:00', '12:00'), (4, '15:00', '19:00'),
    (5, '09:00', '12:00'), (5, '15:00', '19:00'),
    (6, '09:00', '12:00')
) AS block(weekday, start_time, end_time);

-- Backfill: todo paciente existente queda con el doctor único de hoy
-- asignado (decisión de alcance: informativo, visibilidad compartida).
-- Guardado con WHERE EXISTS para que sea un no-op si no hay ningún
-- odontologist todavía, en vez de pisar todo con NULL.
UPDATE "patients"
SET "assigned_doctor_id" = (SELECT id FROM "users" WHERE role = 'odontologist'::"UserRole" ORDER BY created_at ASC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM "users" WHERE role = 'odontologist'::"UserRole");
