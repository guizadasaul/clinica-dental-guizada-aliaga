-- CreateTable
CREATE TABLE "patient_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_invites_token_hash_key" ON "patient_invites"("token_hash");

-- AddForeignKey
ALTER TABLE "patient_invites" ADD CONSTRAINT "patient_invites_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
