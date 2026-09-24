import { Module } from '@nestjs/common';
import { LlmProvider } from './domain/LlmProvider';
import { GroqLlmProvider } from './infrastructure/llm/groq-llm.provider';

/**
 * Chatbot con LLM + tool calling (épica CLI-81). Por ahora: contrato de
 * dominio (CLI-82) y el adaptador de Groq detrás del puerto LlmProvider
 * (CLI-83). El agente, las tools y los endpoints se cablean acá en las
 * issues siguientes.
 */
@Module({
  providers: [{ provide: LlmProvider, useClass: GroqLlmProvider }],
})
export class ChatbotModule {}
