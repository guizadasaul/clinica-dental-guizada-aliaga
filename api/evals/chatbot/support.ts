import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/chatbot/domain/LlmProvider';
import type {
  GeneratedQr,
  GenerateQrParams,
  PaymentGateway,
  QrStatusResult,
} from '../../src/payments/domain/PaymentGateway';

const MINUTE_MS = 60_000;

/**
 * Envuelve al proveedor real (Groq) para no chocar con el límite por minuto
 * del plan gratuito (8K tokens/min, CLI-99): antes de cada llamada espera a
 * que los tokens de los últimos 60 s bajen de `tokensPerMinute`. También
 * suma el total de la corrida para el reporte.
 */
export class PacedLlmProvider implements LlmProvider {
  private readonly window: { at: number; tokens: number }[] = [];
  totalPromptTokens = 0;
  totalCompletionTokens = 0;
  calls = 0;

  constructor(
    private readonly inner: LlmProvider,
    private readonly tokensPerMinute: number,
    /** Estimación de una llamada, para decidir si entra en la ventana. */
    private readonly estimatedCallTokens = 3500,
  ) {}

  async chat(request: LlmRequest): Promise<LlmResponse> {
    await this.waitForBudget();
    const response = await this.inner.chat(request);
    const tokens =
      (response.usage?.promptTokens ?? 0) +
      (response.usage?.completionTokens ?? 0);
    this.window.push({ at: Date.now(), tokens });
    this.totalPromptTokens += response.usage?.promptTokens ?? 0;
    this.totalCompletionTokens += response.usage?.completionTokens ?? 0;
    this.calls += 1;
    return response;
  }

  private async waitForBudget(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.window.length > 0 && now - this.window[0].at >= MINUTE_MS) {
        this.window.shift();
      }
      const used = this.window.reduce((sum, call) => sum + call.tokens, 0);
      if (used + this.estimatedCallTokens <= this.tokensPerMinute) return;
      const waitMs = MINUTE_MS - (now - this.window[0].at) + 250;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/** PNG de 1×1: los evals nunca muestran la imagen, solo verifican el flujo. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * BANECO falso: los evals nunca llaman al banco. Un QR generado figura
 * pagado por el mismo monto en cuanto se consulta su estado, así el caso
 * "ya pagué" ejercita el camino del pago confirmado.
 */
export class FakePaymentGateway implements PaymentGateway {
  private readonly generated = new Map<string, GenerateQrParams>();

  generateQr(params: GenerateQrParams): Promise<GeneratedQr> {
    const qrId = `EVAL-QR-${this.generated.size + 1}-${Date.now()}`;
    this.generated.set(qrId, params);
    return Promise.resolve({ qrId, qrImageBase64: TINY_PNG });
  }

  getQrStatus(qrId: string): Promise<QrStatusResult> {
    const params = this.generated.get(qrId);
    if (!params) {
      return Promise.resolve({ status: 'cancelled', payment: null });
    }
    return Promise.resolve({
      status: 'paid',
      payment: {
        qrId,
        transactionId: params.transactionId,
        amount: params.amount,
        currency: 'BOB',
        paidAt: new Date(),
        senderName: 'Eval',
      },
    });
  }

  cancelQr(qrId: string): Promise<void> {
    this.generated.delete(qrId);
    return Promise.resolve();
  }
}
