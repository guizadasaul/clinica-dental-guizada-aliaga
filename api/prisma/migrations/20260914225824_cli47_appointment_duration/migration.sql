-- CLI-47: la disponibilidad se calculaba por igualdad exacta de instante de
-- inicio, así que una cita de 90 minutos bloqueaba solo el primer slot de
-- 30, dejando los 2 siguientes libres para reservar. Se congela la duración
-- en la cita (igual que ya se hace con el precio) para poder calcular
-- disponibilidad por solape de intervalos.
--
-- Todas las citas existentes tienen treatment_id NULL (la reserva pública no
-- pedía tratamiento) así que 30 (un slot) describe correctamente su
-- duración real hasta hoy — el default alcanza, no hace falta backfill.
ALTER TABLE "appointments" ADD COLUMN "duration_minutes" INTEGER NOT NULL DEFAULT 30;
