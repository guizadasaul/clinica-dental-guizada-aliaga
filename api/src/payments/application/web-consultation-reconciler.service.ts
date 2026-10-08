import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WebConsultationRepository } from '../domain/WebConsultationRepository.js';
import type { IWebConsultationRepository } from '../domain/WebConsultationRepository.js';

const INTERVAL_NAME = 'web-consultation-sync';
const DEFAULT_INTERVAL_MS = 10 * 60_000;

/**
 * Marca como realizada la consulta reservada y pagada por la web cuando pasa
 * la hora de la cita, y la desmarca si el doctor anotó "No asistió" (CLI-257).
 * Corre al arrancar y cada 10 minutos: el doctor no tiene que hacer nada.
 * WEB_CONSULTATION_SYNC_INTERVAL_MS=0 lo desactiva.
 */
@Injectable()
export class WebConsultationReconciler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WebConsultationReconciler.name);
  private running = false;

  constructor(
    @Inject(WebConsultationRepository)
    private readonly repo: IWebConsultationRepository,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = Number(
      process.env.WEB_CONSULTATION_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
    );
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }
    void this.sweep();
    const interval = setInterval(() => {
      void this.sweep();
    }, intervalMs);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);
  }

  onApplicationShutdown(): void {
    if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(INTERVAL_NAME);
    }
  }

  /** Un barrido. Nunca dos a la vez; un error se loguea y se reintenta en el próximo. */
  async sweep(now: Date = new Date()): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const { performed, undone } = await this.repo.sync(now);
      if (performed > 0 || undone > 0) {
        this.logger.log(
          `Consultas web: ${performed} realizada(s), ${undone} desmarcada(s) por "No asistió"`,
        );
      }
    } catch (error: unknown) {
      this.logger.error('No se pudieron sincronizar las consultas web', error);
    } finally {
      this.running = false;
    }
  }
}
