-- CLI-51: el contacto de la misma persona vivía duplicado en varios lugares
-- sin fuente única de verdad. Ya divergió en producción: 2 de 6 pacientes
-- tenían patients.phone != users.phone (uno solo de formato, el otro un
-- número genuinamente distinto).

-- 1. Reconciliar: patients.phone gana sobre users.phone donde exista — ya
--    pasó por la normalización a E.164 de CLI-39, y es el valor que el
--    paciente cargó a propósito en el wizard de ficha. Esto además resuelve
--    los dos casos divergentes de una sola vez, sin necesidad de decidir
--    fila por fila.
UPDATE public.users u
   SET phone = p.phone
  FROM public.patients p
 WHERE p.user_id = u.id AND p.phone IS NOT NULL AND p.phone <> u.phone;

-- 2. Normalizar a E.164 cualquier users.phone que haya quedado sin tocar
--    (cuentas sin ficha de paciente, ej. odontólogos) — CLI-39 solo tocó
--    patients.phone, users.phone quedó afuera. Mismo patrón que esa
--    migración.
UPDATE public.users
   SET phone = '+591' || regexp_replace(phone, '\D', '', 'g')
 WHERE phone IS NOT NULL AND phone <> '' AND phone NOT LIKE '+%';

-- 3. patients.phone se elimina — users.phone (la cuenta) pasa a ser la única
--    fuente de verdad del teléfono. patients.user_id es 1:1, así que
--    guardarlo también acá era una dependencia transitiva (violación de
--    3FN) que ya había divergido.
ALTER TABLE public.patients DROP COLUMN phone;

-- 4. appointments.user_id se elimina — ningún código lo escribió jamás
--    (confirmado en CLI-46) y era redundante con patient_id (patients.user_id
--    ya es 1:1). Se lleva consigo el índice único parcial muerto
--    idx_one_active_appointment_web (CLI-46) y su FK.
ALTER TABLE public.appointments DROP COLUMN user_id;
