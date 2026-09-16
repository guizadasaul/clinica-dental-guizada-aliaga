-- CLI-67: garantiza que solo puede existir un usuario con role='admin'.
-- Mismo patrón que idx_one_default_consultation sobre treatments.
CREATE UNIQUE INDEX "idx_one_admin_user" ON "users"("role") WHERE (role = 'admin'::"UserRole");
