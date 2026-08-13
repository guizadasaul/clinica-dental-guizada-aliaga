import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Appointment,
  AppointmentStatus,
} from '../../appointments/domain/Appointment.js';
import { AppointmentRepository } from '../../appointments/domain/AppointmentRepository.js';
import type { IAppointmentRepository } from '../../appointments/domain/AppointmentRepository.js';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository.js';
import type { ITreatmentRepository } from '../../treatments/domain/TreatmentRepository.js';
import { PaymentGateway, QrStatus } from '../domain/PaymentGateway.js';
import type { PaymentGateway as IPaymentGateway } from '../domain/PaymentGateway.js';
import { BookingConfirmationRepository } from '../domain/BookingConfirmationRepository.js';
import type { IBookingConfirmationRepository } from '../domain/BookingConfirmationRepository.js';

export interface CheckoutResult {
  qrId: string;
  qrImageBase64: string;
  amount: number;
  holdExpiresAt: string;
}

export interface PublicStatusResult {
  status: string;
  paid: boolean;
  holdExpiresAt: string | null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PaymentGateway) private readonly gateway: IPaymentGateway,
    @Inject(AppointmentRepository)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(TreatmentRepository)
    private readonly treatmentRepo: ITreatmentRepository,
    @Inject(BookingConfirmationRepository)
    private readonly confirmationRepo: IBookingConfirmationRepository,
  ) {}

  async checkout(appointmentId: string): Promise<CheckoutResult> {
    const appointment = await this.appointmentRepo.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }
    if (appointment.status !== AppointmentStatus.HELD) {
      throw new ConflictException(
        'Esta cita no está en estado de reserva pendiente de pago',
      );
    }
    if (!appointment.isHoldActive()) {
      throw new GoneException('El horario reservado ya venció');
    }

    // Idempotente: si ya se generó un QR para este hold, se devuelve el mismo (no se vuelve a llamar a BANECO).
    if (
      appointment.banecoQrId &&
      appointment.banecoQrImage &&
      appointment.paymentAmount !== null
    ) {
      return {
        qrId: appointment.banecoQrId,
        qrImageBase64: appointment.banecoQrImage,
        amount: appointment.paymentAmount,
        holdExpiresAt: appointment.holdExpiresAt!.toISOString(),
      };
    }

    const consultation = await this.treatmentRepo.findDefaultConsultation();
    if (!consultation) {
      throw new ServiceUnavailableException(
        'No hay un tratamiento de consulta configurado para cobrar la reserva',
      );
    }

    const transactionId = `CGA-${appointmentId.slice(0, 8)}-${Date.now().toString(36)}`;
    const qr = await this.gateway.generateQr({
      transactionId,
      amount: consultation.basePrice,
      description: 'Consulta inicial - Clínica Guizada Aliaga',
      dueDate: new Date(),
    });

    const updated = await this.appointmentRepo.attachQr(appointmentId, {
      qrId: qr.qrId,
      qrImage: qr.qrImageBase64,
      amount: consultation.basePrice,
    });
    if (!updated) {
      throw new GoneException('El horario reservado ya venció');
    }

    return {
      qrId: qr.qrId,
      qrImageBase64: qr.qrImageBase64,
      amount: consultation.basePrice,
      holdExpiresAt: updated.holdExpiresAt!.toISOString(),
    };
  }

  /** POST /payments/baneco/webhook — solo un disparador, nunca la fuente de verdad. */
  async handleBanecoNotification(qrId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findByQrId(qrId);
    if (!appointment) {
      this.logger.debug(`Webhook de BANECO para un qrId desconocido: ${qrId}`);
      return;
    }
    await this.verifyAndConfirm(appointment);
  }

  /** GET /public/appointments/:id/status — reverifica contra BANECO en cada poll mientras siga held con QR generado. */
  async getPublicStatus(appointmentId: string): Promise<PublicStatusResult> {
    let appointment = await this.appointmentRepo.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }

    if (
      appointment.status === AppointmentStatus.HELD &&
      appointment.banecoQrId
    ) {
      await this.verifyAndConfirm(appointment);
      appointment =
        (await this.appointmentRepo.findById(appointmentId)) ?? appointment;
    }

    return {
      status: appointment.status,
      paid: appointment.status === AppointmentStatus.CONFIRMED,
      holdExpiresAt: appointment.holdExpiresAt?.toISOString() ?? null,
    };
  }

  /**
   * Única fuente de verdad de confirmación: siempre re-consulta BANECO con
   * nuestra propia sesión autenticada antes de crear nada. Compartida por el
   * webhook y el polling — la confirmación nunca depende exclusivamente del
   * webhook, que BANECO documenta como opcional.
   */
  private async verifyAndConfirm(appointment: Appointment): Promise<void> {
    if (
      appointment.status !== AppointmentStatus.HELD ||
      !appointment.banecoQrId
    ) {
      return;
    }

    const statusResult = await this.gateway.getQrStatus(appointment.banecoQrId);
    if (statusResult.status !== QrStatus.PAID) {
      return;
    }

    if (!appointment.isHoldActive()) {
      this.logger.error(
        `PAGO CONFIRMADO SOBRE HOLD VENCIDO — revisión manual. appointmentId=${appointment.id} qrId=${appointment.banecoQrId}`,
      );
      await this.appointmentRepo.appendNote(
        appointment.id,
        'PAGO_TARDIO_REVISAR',
      );
      return;
    }

    if (!appointment.guestFullName || !appointment.guestPhone) {
      this.logger.error(
        `Pago confirmado pero faltan datos de contacto del guest. appointmentId=${appointment.id}`,
      );
      return;
    }

    const confirmed = await this.confirmationRepo.confirmPaidBooking({
      appointmentId: appointment.id,
      paidAt: statusResult.payment?.paidAt ?? new Date(),
      amount: appointment.paymentAmount ?? statusResult.payment?.amount ?? 0,
      qrId: appointment.banecoQrId,
      guestFullName: appointment.guestFullName,
      guestPhone: appointment.guestPhone,
    });
    if (!confirmed) {
      this.logger.debug(
        `Confirmación duplicada ignorada para appointmentId=${appointment.id}`,
      );
    }
  }
}
