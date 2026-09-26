import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ActorRole } from '../domain/ChatActor';
import type { ChatChannel } from '../domain/ChatChannel';
import { ChatRepository } from '../domain/ChatRepository';
import type { ChatRepository as IChatRepository } from '../domain/ChatRepository';

/** gpt-oss-120b en Groq, USD por millón de tokens (se pisan por env). */
export const DEFAULT_PRICE_INPUT_PER_M = 0.15;
export const DEFAULT_PRICE_OUTPUT_PER_M = 0.6;
const MAX_USAGE_DAYS = 92;
const DAY_MS = 24 * 60 * 60 * 1000;
// America/La_Paz es UTC-4 fijo (sin horario de verano).
const CLINIC_OFFSET_MS = 4 * 60 * 60 * 1000;

export interface ChatUsageRow {
  date: string;
  channel: ChatChannel;
  role: ActorRole;
  turns: number;
  /** Usuarios distintos (o conversaciones anónimas distintas) ese día. */
  users: number;
  promptTokens: number;
  completionTokens: number;
  errors: number;
  deniedTools: number;
}

export interface ChatUsageReport {
  from: string;
  to: string;
  rows: ChatUsageRow[];
  totals: Omit<ChatUsageRow, 'date' | 'channel' | 'role' | 'users'> & {
    estimatedCostUsd: number;
  };
  notes: string[];
}

interface UsageBucket extends ChatUsageRow {
  actors: Set<string>;
}

function readEnvPrice(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clinicDayStart(date: string): Date {
  return new Date(`${date}T00:00:00-04:00`);
}

function clinicDate(instant: Date): string {
  return new Date(instant.getTime() - CLINIC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Métricas de uso del chatbot para el admin (CLI-98), calculadas desde
 * chat_messages (sin tabla propia): por día (hora de Bolivia), canal y rol.
 * Solo cubre lo que no borró la retención (CHAT_RETENTION_DAYS, 30 por
 * defecto).
 */
@Injectable()
export class ChatUsageService {
  constructor(
    @Inject(ChatRepository) private readonly chatRepo: IChatRepository,
  ) {}

  async getUsage(from: string, to: string): Promise<ChatUsageReport> {
    const start = clinicDayStart(from);
    const end = new Date(clinicDayStart(to).getTime() + DAY_MS);
    const days = (end.getTime() - start.getTime()) / DAY_MS;
    if (Number.isNaN(days) || days < 1 || days > MAX_USAGE_DAYS) {
      throw new BadRequestException(
        `El rango tiene que ser de 1 a ${MAX_USAGE_DAYS} días, con from <= to`,
      );
    }

    const turns = await this.chatRepo.findAssistantTurnsBetween(start, end);
    const buckets = new Map<string, UsageBucket>();
    for (const turn of turns) {
      const date = clinicDate(turn.createdAt);
      const key = `${date}|${turn.channel}|${turn.role}`;
      const bucket = buckets.get(key) ?? {
        date,
        channel: turn.channel,
        role: turn.role,
        turns: 0,
        users: 0,
        promptTokens: 0,
        completionTokens: 0,
        errors: 0,
        deniedTools: 0,
        actors: new Set<string>(),
      };
      bucket.turns++;
      bucket.actors.add(turn.actorKey);
      bucket.promptTokens += turn.promptTokens;
      bucket.completionTokens += turn.completionTokens;
      bucket.errors += turn.errorCode ? 1 : 0;
      bucket.deniedTools += turn.deniedTools;
      buckets.set(key, bucket);
    }

    const rows = [...buckets.values()]
      .map(({ actors, ...row }) => ({ ...row, users: actors.size }))
      .sort((a, b) =>
        `${a.date}|${a.channel}|${a.role}`.localeCompare(
          `${b.date}|${b.channel}|${b.role}`,
        ),
      );
    const sum = (pick: (row: ChatUsageRow) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);
    const promptTokens = sum((row) => row.promptTokens);
    const completionTokens = sum((row) => row.completionTokens);
    const cost =
      (promptTokens / 1e6) *
        readEnvPrice('LLM_PRICE_INPUT_PER_M', DEFAULT_PRICE_INPUT_PER_M) +
      (completionTokens / 1e6) *
        readEnvPrice('LLM_PRICE_OUTPUT_PER_M', DEFAULT_PRICE_OUTPUT_PER_M);

    return {
      from,
      to,
      rows,
      totals: {
        turns: sum((row) => row.turns),
        promptTokens,
        completionTokens,
        errors: sum((row) => row.errors),
        deniedTools: sum((row) => row.deniedTools),
        estimatedCostUsd: Math.round(cost * 1_000_000) / 1_000_000,
      },
      notes: [
        'Solo incluye conversaciones que la retención todavía no borró (30 días por defecto).',
        'El costo es una estimación con los precios de LLM_PRICE_INPUT_PER_M y LLM_PRICE_OUTPUT_PER_M (USD por millón de tokens).',
      ],
    };
  }
}
