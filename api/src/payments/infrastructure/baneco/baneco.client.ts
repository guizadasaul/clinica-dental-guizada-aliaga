import { Injectable, Logger } from '@nestjs/common';
import { encryptAes } from './baneco-crypto.js';

export class BanecoApiError extends Error {
  constructor(
    message: string,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = 'BanecoApiError';
  }
}

interface BanecoEnvelope {
  responseCode: number;
  message: string;
}

interface AuthenticateResponse extends BanecoEnvelope {
  token: string;
}

interface BanecoConfig {
  baseUrl: string;
  username: string;
  password: string;
  aesKey: string;
  accountCredit: string;
  branchCode: string | undefined;
}

/** exp del JWT en segundos epoch, sin verificar la firma — es un token que nosotros mismos pedimos. */
function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64').toString('utf8'),
    ) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const FALLBACK_TOKEN_TTL_MS = 25 * 60 * 1000;
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;
const REQUIRED_ENV_VARS = [
  'BANECO_API_URL',
  'BANECO_USERNAME',
  'BANECO_PASSWORD',
  'BANECO_AES_KEY',
  'BANECO_ACCOUNT',
] as const;

/**
 * La configuración se lee de forma perezosa (recién al usarse el cliente,
 * no en el constructor) para que la app arranque igual cuando todavía no
 * hay credenciales de BANECO cargadas — solo fallan los endpoints de pago,
 * no todo el proceso (Nest instancia providers al bootstrap, no on-demand).
 */
@Injectable()
export class BanecoClient {
  private readonly logger = new Logger(BanecoClient.name);

  private token: string | null = null;
  private tokenExpiresAtMs = 0;

  private getConfig(): BanecoConfig {
    const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new BanecoApiError(
        `Faltan variables de entorno de BANECO: ${missing.join(', ')}`,
      );
    }
    return {
      baseUrl: process.env['BANECO_API_URL']!.replace(/\/$/, ''),
      username: process.env['BANECO_USERNAME']!,
      password: process.env['BANECO_PASSWORD']!,
      aesKey: process.env['BANECO_AES_KEY']!,
      accountCredit: process.env['BANECO_ACCOUNT']!,
      branchCode: process.env['BANECO_BRANCH_CODE'],
    };
  }

  get accountCredit(): string {
    return this.getConfig().accountCredit;
  }

  get branchCode(): string | undefined {
    return this.getConfig().branchCode;
  }

  /** Cifra un campo sensible del request (ej. accountCredit) con la misma llave AES que la contraseña. */
  encryptField(plainText: string): string {
    return encryptAes(plainText, this.getConfig().aesKey);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    isRetry = false,
  ): Promise<T> {
    const config = this.getConfig();
    const token = await this.getToken(config);
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new BanecoApiError(
        `No se pudo conectar con BANECO: ${(error as Error).message}`,
      );
    }

    if (response.status === 401 && !isRetry) {
      this.token = null;
      return this.request<T>(method, path, body, true);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new BanecoApiError(
        `Respuesta inválida de BANECO (HTTP ${response.status})`,
      );
    }

    const envelope = parsed as Partial<BanecoEnvelope>;
    if (
      !response.ok ||
      (typeof envelope.responseCode === 'number' && envelope.responseCode !== 0)
    ) {
      throw new BanecoApiError(
        envelope.message || `Error de BANECO (HTTP ${response.status})`,
        envelope.responseCode,
      );
    }
    return parsed as T;
  }

  private async getToken(config: BanecoConfig): Promise<string> {
    if (
      this.token &&
      Date.now() < this.tokenExpiresAtMs - EXPIRY_SAFETY_MARGIN_MS
    ) {
      return this.token;
    }

    const encryptedPassword = encryptAes(config.password, config.aesKey);
    let response: Response;
    try {
      response = await fetch(
        `${config.baseUrl}/api/authentication/authenticate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: config.username,
            password: encryptedPassword,
          }),
        },
      );
    } catch (error) {
      throw new BanecoApiError(
        `No se pudo autenticar con BANECO: ${(error as Error).message}`,
      );
    }

    const parsed = (await response
      .json()
      .catch(() => null)) as Partial<AuthenticateResponse> | null;
    if (!response.ok || !parsed?.token || parsed.responseCode !== 0) {
      throw new BanecoApiError(
        parsed?.message || 'No se pudo autenticar con BANECO',
        parsed?.responseCode,
      );
    }

    this.token = parsed.token;
    this.tokenExpiresAtMs =
      decodeJwtExpiryMs(parsed.token) ?? Date.now() + FALLBACK_TOKEN_TTL_MS;
    this.logger.debug('Token de BANECO renovado');
    return this.token;
  }
}
