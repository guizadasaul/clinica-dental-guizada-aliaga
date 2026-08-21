import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

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

/**
 * Configuración de la app compartida entre `main.ts` (producción) y los
 * tests e2e (`configureApp()` sobre la app de test) — así los dos corren
 * exactamente la misma config, en vez de que main.ts la duplique inline.
 */
export function configureApp(app: NestExpressApplication): void {
  app.use(helmet());
  app.enableCors({ origin: corsOrigins(), credentials: false });
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
}
