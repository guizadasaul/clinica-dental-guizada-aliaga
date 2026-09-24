import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppointmentStatus } from '../../appointments/domain/Appointment.js';
import { AppointmentRepository } from '../../appointments/domain/AppointmentRepository.js';
import type { IAppointmentRepository } from '../../appointments/domain/AppointmentRepository.js';
import { PaymentGateway } from '../domain/PaymentGateway.js';
import type { PaymentGateway as IPaymentGateway } from '../domain/PaymentGateway.js';

function timeoutName(appointmentId: string): string {
  return `qr-expiry-${appointmentId}`;
}

/**
 * Anula el QR de BANECO exactamente cuando vence el hold (CLI-24) — un timer
 * preciso por reserva en vez de un sweep periódico, para no dejar ninguna
 * ventana en la que el QR siga escaneable después de vencer el hold.
 *
 * onApplicationBootstrap reconcilia: si el backend se reinicia con holds
 * pendientes, reprograma el timer restante para cada uno (o dispara la
 * anulación al toque si ya venció mientras el proceso estaba caído). Sin
 * esto, un reinicio perdería los timers en memoria y esos QR quedarían
 * escaneables indefinidamente.
 */
@Injectable()
export class HoldExpiryScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(HoldExpiryScheduler.name);

  constructor(
    @Inject(AppointmentRepository)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(PaymentGateway)
    private readonly gateway: IPaymentGateway,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.appointmentRepo.findHeldWithQr();
    for (const appointment of pending) {
      if (appointment.holdExpiresAt) {
        this.scheduleExpiry(appointment.id, appointment.holdExpiresAt);
      }
    }
    if (pending.length > 0) {
      this.logger.log(
        `Reconciliados ${pending.length} hold(s) con QR pendiente al arrancar`,
      );
    }
  }

  /** Programa (o reprograma) la anulación exacta del QR para cuando venza este hold. */
  scheduleExpiry(appointmentId: string, holdExpiresAt: Date): void {
    const name = timeoutName(appointmentId);
    if (this.schedulerRegistry.doesExist('timeout', name)) {
      this.schedulerRegistry.deleteTimeout(name);
    }

    const delayMs = Math.max(0, holdExpiresAt.getTime() - Date.now());
    const timeout = setTimeout(() => {
      this.schedulerRegistry.deleteTimeout(name);
      void this.expireIfStillHeld(appointmentId);
    }, delayMs);
    this.schedulerRegistry.addTimeout(name, timeout);
  }

  private async expireIfStillHeld(appointmentId: string): Promise<void> {
    // Relectura obligatoria: si ya se confirmó el pago entre que se programó
    // el timer y que disparó, no hay nada que anular.
    const appointment = await this.appointmentRepo.findById(appointmentId);
    if (appointment?.status !== AppointmentStatus.HELD) {
      return;
    }
    if (appointment.banecoQrId) {
      try {
        await this.gateway.cancelQr(appointment.banecoQrId);
      } catch (error) {
        this.logger.warn(
          `No se pudo anular en BANECO el QR ${appointment.banecoQrId} (appointmentId=${appointment.id})`,
          error,
        );
      }
    }
    await this.appointmentRepo.markExpired(appointment.id);
  }
}
