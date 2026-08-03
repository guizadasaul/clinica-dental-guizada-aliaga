-- DropIndex
DROP INDEX "public"."users_firebase_uid_key";

-- AlterTable
ALTER TABLE "public"."users"
  DROP COLUMN "firebase_uid",
  DROP COLUMN "password_hash",
  ADD COLUMN     "auth_user_id" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "public"."users"("auth_user_id");
