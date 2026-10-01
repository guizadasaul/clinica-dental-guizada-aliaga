import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthService,
  type HealthStatus,
} from '../../application/health.service.js';

// Sin guard y sin rate limit: lo consultan el healthcheck de Docker, el
// reverse proxy y el pipeline de deploy cada pocos segundos. No devuelve
// nada más que el estado — ni versión ni detalle del error de la base.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  liveness(): HealthStatus {
    return this.healthService.liveness();
  }

  @Get('ready')
  async readiness(): Promise<HealthStatus> {
    const result = await this.healthService.readiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
