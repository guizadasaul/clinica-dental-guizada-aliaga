import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  IWebConsultationRepository,
  WebConsultationSync,
} from '../../domain/WebConsultationRepository.js';
import { syncWebConsultations } from './web-consultation-writes.js';

@Injectable()
export class PrismaWebConsultationRepository implements IWebConsultationRepository {
  constructor(private readonly prisma: PrismaService) {}

  sync(now: Date): Promise<WebConsultationSync> {
    return this.prisma.transaction((tx) => syncWebConsultations(tx, now));
  }
}
