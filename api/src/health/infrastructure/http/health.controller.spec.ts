import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { HealthService } from '../../application/health.service';

describe('HealthController', () => {
  const service = { liveness: jest.fn(), readiness: jest.fn() };
  const controller = new HealthController(service as unknown as HealthService);

  beforeEach(() => jest.clearAllMocks());

  it('GET /health devuelve el estado de liveness', () => {
    service.liveness.mockReturnValue({ status: 'ok' });

    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready devuelve ok cuando la base responde', async () => {
    service.readiness.mockResolvedValue({ status: 'ok' });

    await expect(controller.readiness()).resolves.toEqual({ status: 'ok' });
  });

  it('GET /health/ready responde 503 cuando la base no responde', async () => {
    service.readiness.mockResolvedValue({ status: 'unavailable' });

    await expect(controller.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
