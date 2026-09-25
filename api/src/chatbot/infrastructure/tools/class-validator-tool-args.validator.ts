import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type {
  ToolArgsValidation,
  ToolArgsValidator,
} from '../../domain/ToolArgsValidator.js';

/**
 * Mismo criterio que el ValidationPipe global (app.config.ts, STRICT):
 * whitelist + forbidNonWhitelisted, sin conversión implícita de tipos.
 */
@Injectable()
export class ClassValidatorToolArgsValidator implements ToolArgsValidator {
  async validate<T extends object>(
    dtoClass: new () => T,
    plain: Record<string, unknown>,
  ): Promise<ToolArgsValidation<T>> {
    const instance = plainToInstance(dtoClass, plain, {
      enableImplicitConversion: false,
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      // Las tools sin argumentos tienen un DTO sin decoradores; con el default
      // (true) class-validator lo rechazaría entero. forbidNonWhitelisted
      // sigue rechazando cualquier propiedad que llegue igual.
      forbidUnknownValues: false,
    });
    if (errors.length > 0) {
      return { ok: false, fields: errors.map((error) => error.property) };
    }
    return { ok: true, value: instance };
  }
}
