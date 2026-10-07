-- CLI-244: links de un solo uso para elegir una contraseña nueva, que el
-- doctor manda por WhatsApp desde la ficha (las cuentas creadas solo con
-- teléfono no tienen correo para recuperarla). Del token solo se guarda el
-- sha256; cada link nuevo invalida los anteriores del mismo usuario.
CREATE TABLE "password_reset_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_links_token_hash_key" ON "password_reset_links"("token_hash");

CREATE INDEX "password_reset_links_user_id_idx" ON "password_reset_links"("user_id");

ALTER TABLE "password_reset_links" ADD CONSTRAINT "password_reset_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS como toda tabla de `public` (ver 20260925000000_enable_rls_all_public_tables):
-- sin policies, solo el backend (dueño de la tabla) la lee y escribe.
ALTER TABLE "password_reset_links" ENABLE ROW LEVEL SECURITY;
