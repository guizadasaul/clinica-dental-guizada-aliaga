import { Inject, Injectable } from '@nestjs/common';
import { DatabaseHealth } from '../domain/DatabaseHealth';

export type HealthStatus = { status: 'ok' } | { status: 'unavailable' };

@Injectable()
export class HealthService {
  constructor(
    @Inject(DatabaseHealth) private readonly database: DatabaseHealth,
  ) {}

  /** Liveness: el proceso está vivo y atiende requests. No toca la base. */
  liveness(): HealthStatus {
    return { status: 'ok' };
  }

  /** Readiness: además, la base responde. */
  async readiness(): Promise<HealthStatus> {
    try {
      await this.database.ping();
      return { status: 'ok' };
    } catch {
      return { status: 'unavailable' };
    }
  }
}
