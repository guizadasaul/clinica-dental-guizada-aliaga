-- CLI-56: cada reserva pública pasa ahora doctor_id explícito (createHold ya
-- no depende de un default) — el default transicional que CLI-61 dejó en
-- appointments.doctor_id (y la función SQL que lo resolvía) ya no hace
-- falta. Se retiran los dos juntos.
ALTER TABLE "appointments" ALTER COLUMN "doctor_id" DROP DEFAULT;
DROP FUNCTION "cli61_default_doctor_id"();
