import { Test } from '@nestjs/testing';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ChatbotModule } from './chatbot.module';
import { ChatService } from './application/chat.service';
import { ToolExecutor } from './application/tool-executor';
import { ToolExecutionPort } from './domain/ToolExecution';

/**
 * Compila el módulo real (sin conectar a la base: onModuleInit no corre en
 * compile()) para detectar errores de inyección de dependencias sin tener
 * que levantar toda la app.
 */
describe('ChatbotModule', () => {
  it('resuelve todas sus dependencias', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ChatbotModule],
    }).compile();

    expect(moduleRef.get(ChatService)).toBeInstanceOf(ChatService);
    expect(moduleRef.get(ToolExecutionPort)).toBe(moduleRef.get(ToolExecutor));
  });
});
