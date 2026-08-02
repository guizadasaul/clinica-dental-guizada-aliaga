-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS "public"."receipt_number_seq" START WITH 1000 INCREMENT BY 1;

-- CreateTable
CREATE TABLE "public"."appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "patient_id" UUID,
    "treatment_id" UUID,
    "appointment_datetime" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "source" VARCHAR(20) NOT NULL,
    "whatsapp_name" VARCHAR(200),
    "whatsapp_phone" VARCHAR(20),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."clinical_exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "tartar" BOOLEAN NOT NULL DEFAULT false,
    "saburra" BOOLEAN NOT NULL DEFAULT false,
    "bacterial_plaque" BOOLEAN NOT NULL DEFAULT false,
    "halitosis" BOOLEAN NOT NULL DEFAULT false,
    "occlusion" VARCHAR(200),
    "exam_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."hygiene_habits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "uses_toothbrush" BOOLEAN NOT NULL DEFAULT false,
    "brushing_frequency" VARCHAR(100),
    "uses_dental_floss" BOOLEAN NOT NULL DEFAULT false,
    "uses_toothpick" BOOLEAN NOT NULL DEFAULT false,
    "brushes_tongue" BOOLEAN NOT NULL DEFAULT false,
    "uses_mouthwash" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hygiene_habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."medical_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "has_allergies" BOOLEAN NOT NULL DEFAULT false,
    "kidney_problems" BOOLEAN NOT NULL DEFAULT false,
    "ulcers" BOOLEAN NOT NULL DEFAULT false,
    "rheumatism" BOOLEAN NOT NULL DEFAULT false,
    "heart_problems" BOOLEAN NOT NULL DEFAULT false,
    "diabetes" BOOLEAN NOT NULL DEFAULT false,
    "hypertension" BOOLEAN NOT NULL DEFAULT false,
    "hemorrhages" BOOLEAN NOT NULL DEFAULT false,
    "anemia" BOOLEAN NOT NULL DEFAULT false,
    "sti" BOOLEAN NOT NULL DEFAULT false,
    "other_diseases" TEXT,
    "gestation_period" TEXT,
    "anesthesia_reactions" BOOLEAN,
    "current_medications" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."odontogram_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "tooth_number" INTEGER NOT NULL,
    "tooth_type" VARCHAR(20) NOT NULL DEFAULT 'permanent',
    "diagnosis_type" VARCHAR(20) NOT NULL,
    "diagnosis_description" TEXT NOT NULL,
    "xray_requested" BOOLEAN NOT NULL DEFAULT false,
    "treatment_id" UUID,
    "custom_price" DECIMAL(10,2),
    "entry_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odontogram_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name_paternal" VARCHAR(100) NOT NULL,
    "last_name_maternal" VARCHAR(100),
    "birth_date" DATE NOT NULL,
    "birth_place" VARCHAR(150),
    "sex" VARCHAR(20),
    "occupation" VARCHAR(150),
    "address" TEXT,
    "phone" VARCHAR(20),
    "emergency_contact_name" VARCHAR(200),
    "emergency_contact_phone" VARCHAR(20),
    "emergency_contact_relationship" VARCHAR(100),
    "consultation_reason" TEXT,
    "last_dentist_visit" DATE,
    "last_visit_treatment" TEXT,
    "family_history" TEXT,
    "dni" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" VARCHAR(50),
    "receipt_number" VARCHAR(20) NOT NULL DEFAULT ('REC-'::text || lpad((nextval('receipt_number_seq'::regclass))::text, 6, '0'::text)),
    "payment_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quote_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "treatment_id" UUID NOT NULL,
    "tooth_number" INTEGER,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(10,2),

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tooth_procedures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "tooth_number" INTEGER NOT NULL,
    "treatment_id" UUID NOT NULL,
    "price_charged" DECIMAL(10,2) NOT NULL,
    "procedure_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "surface_vestibular" BOOLEAN NOT NULL DEFAULT false,
    "surface_palatal" BOOLEAN NOT NULL DEFAULT false,
    "surface_mesial" BOOLEAN NOT NULL DEFAULT false,
    "surface_distal" BOOLEAN NOT NULL DEFAULT false,
    "surface_occlusal" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "performed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tooth_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."treatments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "base_price" DECIMAL(10,2) NOT NULL,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firebase_uid" VARCHAR(128) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "photo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" VARCHAR(20) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."xray_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "tooth_procedure_id" UUID,
    "google_drive_file_id" VARCHAR(200) NOT NULL,
    "google_drive_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "file_name" VARCHAR(255),
    "taken_date" DATE,
    "notes" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xray_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_appointments_datetime" ON "public"."appointments"("appointment_datetime" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "idx_one_active_appointment_wa" ON "public"."appointments"("whatsapp_phone" ASC) WHERE (((status)::text = 'scheduled'::text) AND (whatsapp_phone IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "idx_one_active_appointment_web" ON "public"."appointments"("user_id" ASC) WHERE (((status)::text = 'scheduled'::text) AND (user_id IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "hygiene_habits_patient_id_key" ON "public"."hygiene_habits"("patient_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "medical_history_patient_id_key" ON "public"."medical_history"("patient_id" ASC);

-- CreateIndex
CREATE INDEX "idx_odontogram_patient_tooth" ON "public"."odontogram_entries"("patient_id" ASC, "tooth_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "patients_dni_key" ON "public"."patients"("dni" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "public"."patients"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "public"."payments"("receipt_number" ASC);

-- CreateIndex
CREATE INDEX "idx_tooth_procedures_date" ON "public"."tooth_procedures"("procedure_date" ASC);

-- CreateIndex
CREATE INDEX "idx_tooth_procedures_patient_tooth" ON "public"."tooth_procedures"("patient_id" ASC, "tooth_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "public"."users"("firebase_uid" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "xray_documents_google_drive_file_id_key" ON "public"."xray_documents"("google_drive_file_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."clinical_exams" ADD CONSTRAINT "clinical_exams_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."hygiene_habits" ADD CONSTRAINT "hygiene_habits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."medical_history" ADD CONSTRAINT "medical_history_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."odontogram_entries" ADD CONSTRAINT "odontogram_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."odontogram_entries" ADD CONSTRAINT "odontogram_entries_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quote_items" ADD CONSTRAINT "quote_items_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quotes" ADD CONSTRAINT "quotes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tooth_procedures" ADD CONSTRAINT "tooth_procedures_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tooth_procedures" ADD CONSTRAINT "tooth_procedures_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tooth_procedures" ADD CONSTRAINT "tooth_procedures_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."xray_documents" ADD CONSTRAINT "xray_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."xray_documents" ADD CONSTRAINT "xray_documents_tooth_procedure_id_fkey" FOREIGN KEY ("tooth_procedure_id") REFERENCES "public"."tooth_procedures"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

