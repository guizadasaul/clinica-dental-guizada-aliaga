import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from './prisma.service';

jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
  Prisma: {},
}));

// Getters de la clase (las tablas). Los métodos (transaction, onModuleInit...)
// tienen `value`; los getters no.
const tables = Object.entries(
  Object.getOwnPropertyDescriptors(PrismaService.prototype),
)
  .filter(([, descriptor]) => descriptor.value === undefined)
  .map(([name]) => name);

// Cada delegate del cliente es un objeto distinto, así se detecta un getter
// que apunte a la tabla equivocada.
const client = {
  ...Object.fromEntries(tables.map((table) => [table, { delegate: table }])),
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn('tx')),
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

describe('PrismaService', () => {
  const savedUrl = process.env['DATABASE_URL'];
  let service: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://u:p@localhost:5432/db';
    (PrismaClient as unknown as jest.Mock).mockImplementation(() => client);
    service = new PrismaService();
  });

  afterAll(() => {
    process.env['DATABASE_URL'] = savedUrl;
  });

  it('arma el cliente con el adapter de pg sobre DATABASE_URL', () => {
    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: 'postgresql://u:p@localhost:5432/db',
    });
    expect(PrismaClient).toHaveBeenCalledWith({
      adapter: (PrismaPg as unknown as jest.Mock).mock.instances[0] as unknown,
    });
  });

  it('expone todas las tablas del schema', () => {
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'patients', 'appointments', 'quotes']),
    );
  });

  it.each(tables)('%s devuelve el delegate de la misma tabla', (table) => {
    expect((service as unknown as Record<string, unknown>)[table]).toEqual({
      delegate: table,
    });
  });

  it('transaction delega en $transaction', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(service.transaction(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledWith('tx');
  });

  it('ping hace un SELECT 1 contra la base', async () => {
    await service.ping();

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings] = client.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('')).toBe('SELECT 1');
  });

  it('conecta al iniciar el módulo y desconecta al cerrarlo', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(client.$connect).toHaveBeenCalledTimes(1);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });
});
