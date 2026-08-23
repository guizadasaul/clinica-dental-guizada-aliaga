import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly _client: PrismaClient;

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env['DATABASE_URL'],
    });
    this._client = new PrismaClient({ adapter });
  }

  get users() {
    return this._client.users;
  }
  get patients() {
    return this._client.patients;
  }
  get appointments() {
    return this._client.appointments;
  }
  get clinical_exams() {
    return this._client.clinical_exams;
  }
  get medical_history() {
    return this._client.medical_history;
  }
  get hygiene_habits() {
    return this._client.hygiene_habits;
  }
  get odontogram_entries() {
    return this._client.odontogram_entries;
  }
  get treatments() {
    return this._client.treatments;
  }
  get tooth_procedures() {
    return this._client.tooth_procedures;
  }
  get quotes() {
    return this._client.quotes;
  }
  get quote_items() {
    return this._client.quote_items;
  }
  get payments() {
    return this._client.payments;
  }
  get xray_documents() {
    return this._client.xray_documents;
  }
  get patient_invites() {
    return this._client.patient_invites;
  }
  get testimonials() {
    return this._client.testimonials;
  }
  get diagnosis_categories() {
    return this._client.diagnosis_categories;
  }
  get diagnoses() {
    return this._client.diagnoses;
  }
  get dental_exams() {
    return this._client.dental_exams;
  }
  get dental_exam_findings() {
    return this._client.dental_exam_findings;
  }

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this._client.$transaction(fn);
  }

  async onModuleInit(): Promise<void> {
    await this._client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this._client.$disconnect();
  }
}
