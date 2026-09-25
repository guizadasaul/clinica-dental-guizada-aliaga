import { NestFactory } from '@nestjs/core';
import type { LogLevel } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.config';

// En producción/staging (NODE_ENV=production, lo fija el Dockerfile) se
// omiten debug y verbose: SupabaseJwtVerifier, por ejemplo, loguea en debug
// el motivo de cada token rechazado, que es ruido fuera de desarrollo.
const PRODUCTION_LOG_LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log'];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env['NODE_ENV'] === 'production'
        ? PRODUCTION_LOG_LEVELS
        : undefined,
  });
  // `docker stop` manda SIGTERM: con esto Nest deja de aceptar conexiones,
  // corre los onModuleDestroy (PrismaService cierra el pool) y frena los
  // @Cron antes de que el proceso termine, en vez de cortarlos a la mitad.
  app.enableShutdownHooks();
  configureApp(app);
  await app.listen(process.env['PORT'] ?? 2999);
}
void bootstrap();
