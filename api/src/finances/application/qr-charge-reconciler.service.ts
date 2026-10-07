import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { FinancesService } from './finances.service';

const INTERVAL_NAME = 'quote-qr-charge-reconcile';
const DEFAULT_INTERVAL_MS = 60_000;
/** Un QR que nadie pagó en este tiempo se anula (de forma segura). */
export const QR_CHARGE_MAX_AGE_MS = 30 * 60_000;

/**
 * Conciliación de los cobros QR de presupuestos con BANECO (CLI-220): un
 * pago se registra aunque nadie presione "Verificar pago".
 * - El webhook de BANECO llama a reconcileByQrId (disparador, nunca fuente
 *   de verdad: siempre se re-consulta el estado a BANECO).
 * - Un barrido periódico recorre los pendientes: los pagados se registran,
 *   los anulados allá se marcan acá, y los que llevan más de 30 min sin
 *   pagarse se anulan con la anulación segura (que antes vuelve a preguntar).
 * QR_RECONCILE_INTERVAL_MS=0 desactiva el barrido (el webhook sigue).
 */
@Injectable()
export class QrChargeReconciler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(QrChargeReconciler.name);
  private running = false;

  constructor(
    private readonly financesService: FinancesService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = Number(
      process.env.QR_RECONCILE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
    );
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }
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

  /** Webhook de BANECO: true si el qrId era de un cobro de presupuesto. */
  async reconcileByQrId(qrId: string): Promise<boolean> {
    const charge = await this.financesService.findQrChargeByQrId(qrId);
    if (!charge) {
      return false;
    }
    await this.financesService.verifyQrCharge(charge.id);
    return true;
  }

  /**
   * Un barrido sobre los pendientes. Nunca dos a la vez: si el anterior sigue
   * corriendo (BANECO lento), este no hace nada. Un error con un cobro no
   * corta el resto; ese cobro se reintenta en el próximo barrido.
   */
  async sweep(now: Date = new Date()): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const pending = await this.financesService.findPendingQrCharges();
      for (const charge of pending) {
        try {
          const result = await this.financesService.verifyQrCharge(charge.id);
          const age = now.getTime() - charge.createdAt.getTime();
          if (result.status === 'pending' && age > QR_CHARGE_MAX_AGE_MS) {
            await this.financesService.cancelQrCharge(charge.id);
          }
        } catch (error) {
          this.logger.warn(
            `No se pudo conciliar el cobro QR ${charge.id} (qrId=${charge.qrId}); se reintenta en el próximo barrido`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
