import { PrismaDatabaseHealth } from './prisma-database-health';
import type { PrismaService } from '../../../shared/prisma/prisma.service';

describe('PrismaDatabaseHealth', () => {
  it('delega el ping en PrismaService', async () => {
    const prisma = { ping: jest.fn().mockResolvedValue(undefined) };
    const health = new PrismaDatabaseHealth(prisma as unknown as PrismaService);

    await health.ping();

    expect(prisma.ping).toHaveBeenCalledTimes(1);
  });
});
