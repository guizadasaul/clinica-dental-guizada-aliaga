import { Module } from '@nestjs/common';
import { HealthService } from './application/health.service';
import { DatabaseHealth } from './domain/DatabaseHealth';
import { HealthController } from './infrastructure/http/health.controller';
import { PrismaDatabaseHealth } from './infrastructure/persistence/prisma-database-health';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: DatabaseHealth, useClass: PrismaDatabaseHealth },
  ],
})
export class HealthModule {}
