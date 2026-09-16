-- CLI-67: agrega el valor 'admin' al enum UserRole.
-- Tiene que ir en su propia transacción/migración: Postgres no permite usar
-- un valor de enum recién agregado (ALTER TYPE ... ADD VALUE) dentro de la
-- misma transacción en la que se agrega. El índice único parcial que
-- referencia 'admin' va en la migración siguiente.
ALTER TYPE "UserRole" ADD VALUE 'admin';
