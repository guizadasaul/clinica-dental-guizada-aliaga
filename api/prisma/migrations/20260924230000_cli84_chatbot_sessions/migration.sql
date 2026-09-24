-- CLI-84: persistencia de conversaciones del chatbot (épica CLI-81). Aditiva:
-- dos tablas nuevas, sin tocar nada existente. Solo se guarda el texto
-- user/assistant y metadata de uso — nunca argumentos ni resultados de tools.

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "channel" VARCHAR(20) NOT NULL,
    "anon_token_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "tool_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latency_ms" INTEGER,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "error_code" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_anon_token_hash_key" ON "chat_sessions"("anon_token_hash");

-- CreateIndex
CREATE INDEX "idx_chat_sessions_user_activity" ON "chat_sessions"("user_id", "last_activity_at");

-- CreateIndex
CREATE INDEX "idx_chat_sessions_last_activity" ON "chat_sessions"("last_activity_at");

-- CreateIndex
CREATE INDEX "idx_chat_messages_session_created" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_chat_messages_created" ON "chat_messages"("created_at");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Una sesión siempre tiene dueño: un usuario, o el hash del token opaco de
-- un visitante anónimo.
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_owner_check" CHECK ("user_id" IS NOT NULL OR "anon_token_hash" IS NOT NULL);
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_channel_check" CHECK ("channel" IN ('web', 'whatsapp'));
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_role_check" CHECK ("role" IN ('user', 'assistant'));
