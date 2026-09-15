-- CLI-43: el nombre de la reserva pública vivía entero en guest_full_name y
-- se partía a ciegas (splitGuestName, que este PR elimina) al confirmarse el
-- pago. Se agregan tres campos atómicos, espejo de
-- patients.first_name/last_name_paternal/last_name_maternal.

-- 1. Columnas nuevas. guest_full_name NO se borra — queda deprecada como
--    respaldo auditable de las filas anteriores a este PR (su eliminación
--    va en una issue posterior, una vez validado el backfill).
ALTER TABLE public.appointments
  ADD COLUMN guest_first_name VARCHAR(100),
  ADD COLUMN guest_last_name_paternal VARCHAR(100),
  ADD COLUMN guest_last_name_maternal VARCHAR(100);

-- 2. Backfill de las filas existentes con guest_full_name cargado: primera
--    palabra -> guest_first_name, resto -> guest_last_name_paternal. Misma
--    heurística imperfecta que splitGuestName(), pero acá es aceptable
--    porque es un dato histórico de una sola vez, no código que sigue
--    corriendo. A diferencia de patients.last_name_paternal (NOT NULL),
--    estas columnas son nullable: un nombre de una sola palabra ("Diego",
--    "Juan") queda con guest_last_name_paternal en NULL en vez de inventar
--    un '-' — no hay forma de saber el apellido real de esas filas.
UPDATE public.appointments
   SET guest_first_name = (regexp_split_to_array(trim(guest_full_name), '\s+'))[1],
       guest_last_name_paternal = NULLIF(
         array_to_string(
           (regexp_split_to_array(trim(guest_full_name), '\s+'))[2:],
           ' '
         ),
         ''
       )
 WHERE guest_full_name IS NOT NULL;
