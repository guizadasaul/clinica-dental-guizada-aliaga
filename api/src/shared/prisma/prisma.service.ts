import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly _client: PrismaClient;

  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
    this._client = new PrismaClient({ adapter });
  }

  get users() { return this._client.users; }
  get patients() { return this._client.patients; }
  get appointments() { return this._client.appointments; }
  get clinical_exams() { return this._client.clinical_exams; }
  get medical_history() { return this._client.medical_history; }
  get hygiene_habits() { return this._client.hygiene_habits; }
  get odontogram_entries() { return this._client.odontogram_entries; }
  get treatments() { return this._client.treatments; }
  get tooth_procedures() { return this._client.tooth_procedures; }
  get quotes() { return this._client.quotes; }
  get quote_items() { return this._client.quote_items; }
  get payments() { return this._client.payments; }
  get xray_documents() { return this._client.xray_documents; }

  async onModuleInit(): Promise<void> {
    await this._client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this._client.$disconnect();
  }
}
