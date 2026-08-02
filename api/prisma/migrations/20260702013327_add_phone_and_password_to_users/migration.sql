-- CreateEnum (may already exist if created outside migrations)
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('odontologist', 'patient');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" VARCHAR(255),
ADD COLUMN     "phone" VARCHAR(20),
ALTER COLUMN "email" DROP NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'patient';
