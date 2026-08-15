import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentRepository } from '../../appointments/domain/AppointmentRepository.js';
import type { IAppointmentRepository } from '../../appointments/domain/AppointmentRepository.js';
import { PaymentGateway } from '../domain/PaymentGateway.js';
import type { PaymentGateway as IPaymentGateway } from '../domain/PaymentGateway.js';

/**
 * Corre cada minuto (CLI-24): busca holds vencidos que ya tienen un QR de
 * BANECO generado y lo anula para futuros pagos (doc BANECO §7.3, "Anular
 * QR"). BANECO no soporta expiración a nivel de minuto en el QR mismo — esta
 * es la única forma real de acercarse a "que no se pueda pagar tarde".
 *
 * La anulación es best-effort: si falla (BANECO caído, ya pagado, etc.) el
 * appointment igual pasa a expired de nuestro lado. La protección real contra
 * una reserva fantasma no depende de esto — PaymentsService.verifyAndConfirm
 * ya nunca confirma sobre un hold vencido, pague tarde o no.
 */
@Injectable()
export class ExpiredHoldsSweepService {
  private readonly logger = new Logger(ExpiredHoldsSweepService.name);

  constructor(
    @Inject(AppointmentRepository)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(PaymentGateway)
    private readonly gateway: IPaymentGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const expired = await this.appointmentRepo.findExpiredHeldWithQr(
      new Date(),
    );
    for (const appointment of expired) {
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
}
