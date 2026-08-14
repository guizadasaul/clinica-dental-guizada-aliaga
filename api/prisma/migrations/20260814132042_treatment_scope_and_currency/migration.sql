-- CreateEnum
CREATE TYPE "TreatmentScope" AS ENUM ('tooth', 'multi_tooth', 'upper_arch', 'lower_arch', 'full_mouth', 'none');

-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'BOB',
ADD COLUMN     "scope" "TreatmentScope" NOT NULL DEFAULT 'tooth';

-- CreateIndex
CREATE UNIQUE INDEX "treatments_name_key" ON "treatments"("name");
