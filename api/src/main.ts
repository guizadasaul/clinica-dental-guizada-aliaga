import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  await app.listen(process.env['PORT'] ?? 2999);
}
bootstrap();
