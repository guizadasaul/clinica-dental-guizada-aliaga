import { Module } from '@nestjs/common';
import { LlmProvider } from './domain/LlmProvider';
import { ChatRepository } from './domain/ChatRepository';
import { GroqLlmProvider } from './infrastructure/llm/groq-llm.provider';
import { PrismaChatRepository } from './infrastructure/persistence/prisma-chat.repository';
import { ChatRetentionScheduler } from './application/chat-retention.scheduler';

/**
 * Chatbot con LLM + tool calling (épica CLI-81). Por ahora: contrato de
 * dominio (CLI-82), el adaptador de Groq detrás del puerto LlmProvider
 * (CLI-83) y la persistencia de conversaciones con retención (CLI-84). El
 * agente, las tools y los endpoints se cablean acá en las issues siguientes.
 */
@Module({
  providers: [
    { provide: LlmProvider, useClass: GroqLlmProvider },
    { provide: ChatRepository, useClass: PrismaChatRepository },
    ChatRetentionScheduler,
  ],
})
export class ChatbotModule {}
