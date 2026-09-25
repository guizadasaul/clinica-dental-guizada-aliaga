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
import { PUBLIC_TOOLS } from './infrastructure/tools/public.tools';
import type { ChatTool } from './domain/ChatTool';
import { TreatmentsModule } from '../treatments/treatments.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { ActorResolver } from './application/actor-resolver';
import { ChatController } from './infrastructure/http/chat.controller';
import { PublicChatController } from './infrastructure/http/public-chat.controller';

/** Todas las tools concretas; CHAT_TOOLS las junta para el ToolRegistry. */
const TOOL_CLASSES = [...PUBLIC_TOOLS];

/**
 * Chatbot con LLM + tool calling (épica CLI-81): contrato de dominio
 * (CLI-82), adaptador de Groq (CLI-83), persistencia con retención (CLI-84),
 * agente (CLI-85/86) y la capa que se interpone entre el LLM y los services
 * (ToolRegistry + ToolExecutor, CLI-87), las tools públicas (CLI-88) y los
 * endpoints web con su resolución de identidad, cuotas y rate limit
 * (CLI-89). Las tools de paciente, doctor y admin se suman a TOOL_CLASSES
 * en las issues siguientes.
 */
@Module({
  imports: [
    AuthModule,
    PatientsModule,
    TreatmentsModule,
    DoctorsModule,
    AppointmentsModule,
  ],
  controllers: [ChatController, PublicChatController],
  providers: [
    { provide: LlmProvider, useClass: GroqLlmProvider },
    { provide: ChatRepository, useClass: PrismaChatRepository },
    { provide: ToolArgsValidator, useClass: ClassValidatorToolArgsValidator },
    ...TOOL_CLASSES,
    {
      provide: CHAT_TOOLS,
      useFactory: (...tools: ChatTool[]) => tools,
      inject: TOOL_CLASSES,
    },
    ToolRegistry,
    ToolExecutor,
    { provide: ToolExecutionPort, useExisting: ToolExecutor },
    AgentRunner,
    SystemPromptBuilder,
    ChatService,
    ActorResolver,
    ChatRetentionScheduler,
  ],
})
export class ChatbotModule {}
