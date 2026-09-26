-- CLI-100: vinculación de un número de WhatsApp con una cuenta, con posesión
-- probada por un código de un solo uso. Aditiva: tres tablas nuevas, sin
-- tocar nada existente. La identidad nunca se deriva de users.phone.

-- CreateTable
CREATE TABLE "chat_channel_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(20) NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_channel_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_link_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_link_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(20) NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_link_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_chat_channel_identities_user" ON "chat_channel_identities"("user_id");

-- CreateIndex
CREATE INDEX "idx_chat_link_codes_hash" ON "chat_link_codes"("code_hash");

-- CreateIndex
CREATE INDEX "idx_chat_link_codes_user" ON "chat_link_codes"("user_id");

-- CreateIndex
CREATE INDEX "idx_chat_link_attempts_number" ON "chat_link_attempts"("channel", "external_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_channel_identities" ADD CONSTRAINT "chat_channel_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_link_codes" ADD CONSTRAINT "chat_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Un número activo (no revocado) pertenece a una sola cuenta.
CREATE UNIQUE INDEX "idx_one_active_channel_identity" ON "chat_channel_identities"("channel", "external_id") WHERE "revoked_at" IS NULL;

ALTER TABLE "chat_channel_identities" ADD CONSTRAINT "chat_channel_identities_channel_check" CHECK ("channel" IN ('whatsapp'));
ALTER TABLE "chat_link_codes" ADD CONSTRAINT "chat_link_codes_channel_check" CHECK ("channel" IN ('whatsapp'));
ALTER TABLE "chat_link_attempts" ADD CONSTRAINT "chat_link_attempts_channel_check" CHECK ("channel" IN ('whatsapp'));

-- Mismo criterio que 20260925000000_enable_rls_all_public_tables: toda tabla
-- de public con RLS activo (la Data API de Supabase publica el schema).
ALTER TABLE "chat_channel_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_link_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_link_attempts" ENABLE ROW LEVEL SECURITY;
