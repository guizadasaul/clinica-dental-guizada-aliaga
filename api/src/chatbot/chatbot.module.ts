import { Module } from '@nestjs/common';
import { LlmProvider } from './domain/LlmProvider';
import { ChatRepository } from './domain/ChatRepository';
import { ToolExecutionPort } from './domain/ToolExecution';
import { ToolArgsValidator } from './domain/ToolArgsValidator';
import { GroqLlmProvider } from './infrastructure/llm/groq-llm.provider';
import { PrismaChatRepository } from './infrastructure/persistence/prisma-chat.repository';
import { ClassValidatorToolArgsValidator } from './infrastructure/tools/class-validator-tool-args.validator';
import { ChatRetentionScheduler } from './application/chat-retention.scheduler';
import { AgentRunner } from './application/agent-runner';
import { ChatService } from './application/chat.service';
import { SystemPromptBuilder } from './application/system-prompt.builder';
import { CHAT_TOOLS, ToolRegistry } from './application/tool-registry';
import { ToolExecutor } from './application/tool-executor';

/**
 * Chatbot con LLM + tool calling (épica CLI-81): contrato de dominio
 * (CLI-82), adaptador de Groq (CLI-83), persistencia con retención (CLI-84),
 * agente (CLI-85/86) y la capa que se interpone entre el LLM y los services
 * (ToolRegistry + ToolExecutor, CLI-87). Las tools concretas se suman a
 * CHAT_TOOLS en las issues siguientes; los endpoints, en CLI-89.
 */
@Module({
  providers: [
    { provide: LlmProvider, useClass: GroqLlmProvider },
    { provide: ChatRepository, useClass: PrismaChatRepository },
    { provide: ToolArgsValidator, useClass: ClassValidatorToolArgsValidator },
    { provide: CHAT_TOOLS, useValue: [] },
    ToolRegistry,
    ToolExecutor,
    { provide: ToolExecutionPort, useExisting: ToolExecutor },
    AgentRunner,
    SystemPromptBuilder,
    ChatService,
    ChatRetentionScheduler,
  ],
})
export class ChatbotModule {}
