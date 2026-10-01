import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { DatabaseHealth } from '../domain/DatabaseHealth';

describe('HealthService', () => {
  const database = { ping: jest.fn() };
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DatabaseHealth, useValue: database },
      ],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it('liveness responde ok sin tocar la base', () => {
    expect(service.liveness()).toEqual({ status: 'ok' });
    expect(database.ping).not.toHaveBeenCalled();
  });

  it('readiness responde ok cuando la base responde', async () => {
    database.ping.mockResolvedValue(undefined);

    await expect(service.readiness()).resolves.toEqual({ status: 'ok' });
  });

  it('readiness responde unavailable (sin propagar el error) cuando la base no responde', async () => {
    database.ping.mockRejectedValue(new Error('connection refused'));

    await expect(service.readiness()).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
