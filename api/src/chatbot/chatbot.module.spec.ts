import { Test } from '@nestjs/testing';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ChatbotModule } from './chatbot.module';
import { UserRole } from '../auth/domain/value-objects/UserRole';
import { ChatService } from './application/chat.service';
import { ToolExecutor } from './application/tool-executor';
import { ToolExecutionPort } from './domain/ToolExecution';

/**
 * Compila el módulo real (sin conectar a la base: onModuleInit no corre en
 * compile()) para detectar errores de inyección de dependencias sin tener
 * que levantar toda la app.
 */
describe('ChatbotModule', () => {
  const originalEnv = process.env;

  // SupabaseJwtVerifier (vía AuthModule) exige SUPABASE_URL al construirse;
  // alcanza con un placeholder, igual que en el job e2e del CI.
  beforeAll(() => {
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://placeholder.supabase.co',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resuelve todas sus dependencias', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ChatbotModule],
    }).compile();

    expect(moduleRef.get(ChatService)).toBeInstanceOf(ChatService);
    expect(moduleRef.get(ToolExecutionPort)).toBe(moduleRef.get(ToolExecutor));
  });

  it('registra las tools públicas para un visitante anónimo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ChatbotModule],
    }).compile();
    const port = moduleRef.get<ToolExecutor>(ToolExecutionPort);

    expect(
      port
        .definitionsFor({ kind: 'anonymous' })
        .map((tool) => tool.name)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual([
      'get_available_slots',
      'get_booking_link',
      'get_clinic_info',
      'get_faq',
      'list_doctors',
      'list_services',
    ]);
  });

  it('registra las tools del paciente, visibles solo para un paciente', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ChatbotModule],
    }).compile();
    const port = moduleRef.get<ToolExecutor>(ToolExecutionPort);
    const patientTools = port
      .definitionsFor({
        kind: 'user',
        userId: 'u1',
        role: UserRole.PATIENT,
        patientId: 'p1',
      })
      .map((tool) => tool.name);

    expect(patientTools).toEqual(
      expect.arrayContaining([
        'get_my_next_appointment',
        'get_my_appointments',
        'get_my_quotes',
        'get_my_balance',
        'get_my_treatments',
        'get_my_pending_treatments',
      ]),
    );
    expect(
      port.definitionsFor({ kind: 'anonymous' }).map((tool) => tool.name),
    ).not.toContain('get_my_balance');
  });

  it('registra las tools del doctor, visibles solo para un odontólogo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ChatbotModule],
    }).compile();
    const port = moduleRef.get<ToolExecutor>(ToolExecutionPort);
    const doctorTools = port
      .definitionsFor({
        kind: 'user',
        userId: 'd1',
        role: UserRole.ODONTOLOGIST,
        patientId: null,
      })
      .map((tool) => tool.name);

    expect(doctorTools).toEqual(
      expect.arrayContaining([
        'get_my_agenda',
        'get_my_next_patient',
        'get_my_patients',
        'get_my_monthly_stats',
      ]),
    );
    expect(doctorTools).not.toContain('get_my_balance');
  });
});
