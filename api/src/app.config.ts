import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { allowsUnknownProperties } from './shared/validators/allow-unknown-properties';
import { readEnvInt } from './shared/env.util';

/**
 * Lista blanca de orígenes para CORS (CLI-36). Orden de resolución:
 * `CORS_ORIGINS` (CSV, para producción/staging con uno o más dominios) →
 * `FRONTEND_URL` (ya existe en api/.env.example, un solo origen) →
 * `http://localhost:4200` (default de desarrollo sin tocar env).
 */
function corsOrigins(): string[] {
  const csv = process.env['CORS_ORIGINS'];
  if (csv) {
    const origins = csv
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.length > 0) return origins;
  }

  const frontendUrl = process.env['FRONTEND_URL'];
  if (frontendUrl) return [frontendUrl];

  return ['http://localhost:4200'];
}

const STRICT = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
} as const;

// Igual que STRICT pero sin forbidNonWhitelisted, para los DTOs marcados con
// @AllowUnknownProperties() (payloads de terceros que pueden sumar campos).
const TOLERANT = { ...STRICT, forbidNonWhitelisted: false } as const;

/**
 * ValidationPipe global que sabe exceptuar ciertos DTOs de
 * `forbidNonWhitelisted`. Hace falta subclasear porque un `@UsePipes()` de
 * ruta no puede aflojar lo que el pipe global ya aplicó — ver el comentario
 * de shared/validators/allow-unknown-properties.ts.
 */
class RouteAwareValidationPipe extends ValidationPipe {
  private readonly tolerant = new ValidationPipe(TOLERANT);

  override async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    return allowsUnknownProperties(metadata.metatype)
      ? this.tolerant.transform(value, metadata)
      : super.transform(value, metadata);
  }
}

/**
 * Configuración de la app compartida entre `main.ts` (producción) y los
 * tests e2e (`configureApp()` sobre la app de test) — así los dos corren
 * exactamente la misma config, en vez de que main.ts la duplique inline.
 */
export function configureApp(app: NestExpressApplication): void {
  // Detrás de Cloudflare → Caddy, la conexión TCP llega siempre desde Caddy:
  // sin esto `req.ip` sería la IP de Caddy para todos, y el rate limit
  // (ThrottlerGuard, que agrupa por `req.ip`) trataría a todos los clientes
  // como uno solo. TRUST_PROXY_HOPS = cuántos proxies de confianza hay
  // delante (1 = Caddy, que pone en X-Forwarded-For la IP real que manda
  // Cloudflare). Sin setear (desarrollo local, sin proxy) no se confía en
  // ningún X-Forwarded-For, que cualquier cliente podría falsificar.
  const trustProxyHops = readEnvInt('TRUST_PROXY_HOPS', 0);
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.use(helmet());
  app.enableCors({ origin: corsOrigins(), credentials: false });
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalPipes(new RouteAwareValidationPipe(STRICT));
}
