import { createHmac } from 'node:crypto';
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { WhatsappSignatureGuard } from './whatsapp-signature.guard';

const SECRET = 'app-secret-de-prueba';
const BODY = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');

function sign(body: Buffer, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function context(headers: Record<string, unknown>, rawBody?: Buffer) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, rawBody }) }),
  } as unknown as ExecutionContext;
}

describe('WhatsappSignatureGuard (CLI-101)', () => {
  const originalEnv = process.env;
  const guard = new WhatsappSignatureGuard();

  beforeEach(() => {
    process.env = { ...originalEnv, WHATSAPP_APP_SECRET: SECRET };
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('acepta la firma HMAC-SHA256 correcta del body crudo', () => {
    expect(
      guard.canActivate(context({ 'x-hub-signature-256': sign(BODY) }, BODY)),
    ).toBe(true);
  });

  it.each([
    ['ausente', {}],
    ['sin el prefijo sha256=', { 'x-hub-signature-256': 'abc' }],
    ['firmada con otro secreto', { 'x-hub-signature-256': sign(BODY, 'otro') }],
    ['con largo distinto', { 'x-hub-signature-256': 'sha256=abcd' }],
    ['repetida (header como lista)', { 'x-hub-signature-256': [sign(BODY)] }],
  ])('rechaza una firma %s con 401', (_name, headers) => {
    expect(() => guard.canActivate(context(headers, BODY))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un body alterado aunque la firma sea de otro body válido', () => {
    const tampered = Buffer.from(`${BODY.toString()} `);

    expect(() =>
      guard.canActivate(
        context({ 'x-hub-signature-256': sign(BODY) }, tampered),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('sin body crudo no puede verificar: 401', () => {
    expect(() =>
      guard.canActivate(context({ 'x-hub-signature-256': sign(BODY) })),
    ).toThrow(UnauthorizedException);
  });

  it('sin WHATSAPP_APP_SECRET rechaza cualquier POST', () => {
    delete process.env['WHATSAPP_APP_SECRET'];

    expect(() =>
      guard.canActivate(context({ 'x-hub-signature-256': sign(BODY) }, BODY)),
    ).toThrow(UnauthorizedException);
  });
});
