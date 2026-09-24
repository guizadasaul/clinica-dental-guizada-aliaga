import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PipeTransform } from '@nestjs/common';
import { configureApp } from './app.config';
import {
  BanecoPaymentDto,
  BanecoWebhookDto,
} from './payments/infrastructure/http/dto/baneco-webhook.dto';

function fakeApp() {
  return {
    use: jest.fn(),
    enableCors: jest.fn(),
    useBodyParser: jest.fn(),
    useGlobalPipes: jest.fn(),
  };
}

function configure() {
  const app = fakeApp();
  configureApp(app as unknown as NestExpressApplication);
  return app;
}

describe('configureApp', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['CORS_ORIGINS'];
    delete process.env['FRONTEND_URL'];
  });

  afterAll(() => {
    process.env = { ...savedEnv };
  });

  it('aplica helmet, limita el body JSON a 100kb y registra un pipe global', () => {
    const app = configure();

    expect(app.use).toHaveBeenCalledTimes(1);
    expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: '100kb' });
    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);
  });

  describe('CORS', () => {
    function origins(): string[] {
      const [[options]] = configure().enableCors.mock.calls as [
        [{ origin: string[]; credentials: boolean }],
      ];
      expect(options.credentials).toBe(false);
      return options.origin;
    }

    it('usa CORS_ORIGINS (CSV) si está definido, sin espacios ni vacíos', () => {
      process.env['CORS_ORIGINS'] = ' https://a.com , https://b.com ,';
      process.env['FRONTEND_URL'] = 'https://ignorado.com';

      expect(origins()).toEqual(['https://a.com', 'https://b.com']);
    });

    it('si CORS_ORIGINS no trae ningún origen, cae a FRONTEND_URL', () => {
      process.env['CORS_ORIGINS'] = ' , ';
      process.env['FRONTEND_URL'] = 'https://clinica.com';

      expect(origins()).toEqual(['https://clinica.com']);
    });

    it('sin nada configurado, usa el frontend local de desarrollo', () => {
      expect(origins()).toEqual(['http://localhost:4200']);
    });
  });

  describe('validación global', () => {
    function pipe(): PipeTransform {
      const [[globalPipe]] = configure().useGlobalPipes.mock.calls as [
        [PipeTransform],
      ];
      return globalPipe;
    }

    const bodyOf = (metatype: unknown) => ({
      type: 'body' as const,
      metatype: metatype as new () => unknown,
    });

    it('rechaza propiedades no declaradas en un DTO normal', async () => {
      await expect(
        pipe().transform({ qrId: 'qr-1', extra: 1 }, bodyOf(BanecoPaymentDto)),
      ).rejects.toMatchObject({ status: 400 });
    });

    // BANECO manda más campos de los que declaramos y puede sumar otros sin
    // avisar: el webhook no puede devolver 400 por eso.
    it('tolera propiedades extra en un DTO marcado con @AllowUnknownProperties', async () => {
      const result = (await pipe().transform(
        { payment: { qrId: 'qr-1', amount: 150 }, date: '2026-09-24' },
        bodyOf(BanecoWebhookDto),
      )) as BanecoWebhookDto;

      expect(result).toBeInstanceOf(BanecoWebhookDto);
      expect(result.payment.qrId).toBe('qr-1');
      expect(result).not.toHaveProperty('date');
    });

    it('el DTO tolerante igual valida lo que declara', async () => {
      await expect(
        pipe().transform({ payment: { qrId: 42 } }, bodyOf(BanecoWebhookDto)),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
