import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { DatabaseHealth } from '../../domain/DatabaseHealth.js';

@Injectable()
export class PrismaDatabaseHealth implements DatabaseHealth {
  constructor(private readonly prisma: PrismaService) {}

  ping(): Promise<void> {
    return this.prisma.ping();
  }
}
