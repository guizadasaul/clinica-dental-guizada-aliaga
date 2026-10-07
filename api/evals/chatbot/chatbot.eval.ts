import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { LlmProvider } from '../../src/chatbot/domain/LlmProvider';
import { GroqLlmProvider } from '../../src/chatbot/infrastructure/llm/groq-llm.provider';
import {
  ChatService,
  hashAnonToken,
} from '../../src/chatbot/application/chat.service';
import { AgentRunner } from '../../src/chatbot/application/agent-runner';
import type {
  AgentRunInput,
  AgentRunResult,
} from '../../src/chatbot/application/agent-runner';
import type { ToolExecutionResult } from '../../src/chatbot/domain/ToolExecution';
import { ToolExecutor } from '../../src/chatbot/application/tool-executor';
import { PaymentGateway } from '../../src/payments/domain/PaymentGateway';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { EVAL_CASES } from './cases';
import type { EvalCase } from './cases';
import { checkReply, checkTools } from './checks';
import { cleanupEvalFixtures, createEvalFixtures } from './fixtures';
import type { EvalFixtures } from './fixtures';
import { judge } from './judge';
import { casePassed, renderMarkdown } from './report';
import type { CaseResult, TurnResult } from './report';
import { FakePaymentGateway, PacedLlmProvider } from './support';

/**
 * Evals del chatbot con el modelo real (CLI-232). Se corren a mano, nunca en
 * el CI: gastan cupo de Groq. Ver evals/README.md.
 *
 *   EVAL_ROLE=doctor EVAL_CASE=doctor-agenda EVAL_JUDGE=1 npm run eval:chatbot
 */

const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/cga_e2e?schema=public';
const TURN_TIMEOUT_MS = 10 * 60_000;

function csv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function selectedCases(): EvalCase[] {
  const roles = csv('EVAL_ROLE');
  const ids = csv('EVAL_CASE');
  return EVAL_CASES.filter(
    (c) =>
      (roles.length === 0 || roles.includes(c.role)) &&
      (ids.length === 0 || ids.includes(c.id)),
  );
}

// Antes de importar la app: Prisma lee DATABASE_URL al construirse, y el
// ConfigModule no pisa variables ya definidas (GROQ_API_KEY sale de .env).
process.env['DATABASE_URL'] =
  process.env['EVAL_DATABASE_URL'] ?? DEFAULT_DATABASE_URL;
process.env['CHATBOT_ENABLED'] = 'true';
process.env['QR_RECONCILE_INTERVAL_MS'] = '0';
process.env['CHAT_DAILY_MESSAGES_USER'] = '10000';
process.env['CHAT_DAILY_MESSAGES_ANON'] = '10000';
process.env['SUPABASE_URL'] ??= 'https://placeholder.supabase.co';

const cases = selectedCases();

describe('Evals del chatbot (Groq real)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let chat: ChatService;
  let llm: PacedLlmProvider;
  let fx: EvalFixtures;
  const results: CaseResult[] = [];
  const anonTokens: string[] = [];
  const startedAt = new Date();
  /** Lo que pasó en el turno en curso (lo llenan los wrappers de abajo). */
  let lastRun: AgentRunResult | null = null;
  let toolResults: { name: string; content: string }[] = [];

  beforeAll(async () => {
    const dbName = new URL(process.env['DATABASE_URL']!).pathname;
    if (!/e2e|eval|test/i.test(dbName) && !process.env['EVAL_ALLOW_ANY_DB']) {
      throw new Error(
        `Los evals crean y borran datos: corre contra una base de test (cga_e2e), no ${dbName}.`,
      );
    }
    llm = new PacedLlmProvider(
      new GroqLlmProvider(),
      Number(process.env['EVAL_TOKENS_PER_MINUTE'] ?? 7000),
    );
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmProvider)
      .useValue(llm)
      .overrideProvider(PaymentGateway)
      .useValue(new FakePaymentGateway())
      .compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    chat = moduleRef.get(ChatService);
    fx = await createEvalFixtures(prisma);

    // Se espía lo que pasó en cada turno (tools llamadas, sus resultados y
    // el errorCode del agente) sin cambiar nada del comportamiento.
    const agent = moduleRef.get(AgentRunner);
    // strictBindCallApply está apagado: bind() devuelve any sin el cast.
    const run = agent.run.bind(agent) as (
      input: AgentRunInput,
    ) => Promise<AgentRunResult>;
    agent.run = async (input) => {
      const result = await run(input);
      lastRun = result;
      return result;
    };
    const executor = moduleRef.get(ToolExecutor);
    const execute = executor.execute.bind(executor) as (
      ...args: Parameters<ToolExecutor['execute']>
    ) => Promise<ToolExecutionResult>;
    executor.execute = async (...args) => {
      const result = await execute(...args);
      toolResults.push({ name: result.toolName, content: result.content });
      return result;
    };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.chat_sessions.deleteMany({
        where: { anon_token_hash: { in: anonTokens.map(hashAnonToken) } },
      });
      await cleanupEvalFixtures(prisma);
    }
    await moduleRef?.close();
    if (results.length > 0) writeReport();
  });

  async function runCase(evalCase: EvalCase): Promise<CaseResult> {
    const actor = fx.actors[evalCase.role];
    let sessionId: string | undefined;
    let anonToken: string | undefined;
    const turns: TurnResult[] = [];
    for (const turn of evalCase.turns) {
      lastRun = null;
      toolResults = [];
      const reply = await chat.handleMessage({
        actor,
        channel: 'web',
        sessionId,
        anonToken,
        text: turn.user,
        locale: 'es',
      });
      sessionId = actor.kind === 'user' ? reply.sessionId : undefined;
      if (reply.anonToken) {
        anonToken = reply.anonToken;
        anonTokens.push(reply.anonToken);
      }
      const run = lastRun as AgentRunResult | null;
      const tools = run?.toolCalls.map((t) => t.name) ?? [];
      turns.push({
        user: turn.user,
        reply: reply.reply,
        tools,
        toolResults,
        errorCode: run?.errorCode ?? null,
        failures: [
          ...checkTools(tools, turn),
          ...checkReply(reply.reply, turn),
        ],
      });
    }
    const verdict =
      process.env['EVAL_JUDGE'] === '1'
        ? await judge(
            llm,
            evalCase.role,
            turns.map(({ user, reply, toolResults: results }) => ({
              user,
              reply,
              toolResults: results,
            })),
            evalCase.rubric,
          )
        : null;
    return {
      id: evalCase.id,
      role: evalCase.role,
      description: evalCase.description,
      turns,
      verdict,
    };
  }

  function writeReport(): void {
    const dir = join(__dirname, '..', 'reports');
    mkdirSync(dir, { recursive: true });
    const stamp = startedAt.toISOString().slice(0, 16).replace(':', '-');
    const summary = {
      startedAt: startedAt.toISOString(),
      model: process.env['GROQ_MODEL'] || 'openai/gpt-oss-120b',
      judgeModel:
        process.env['EVAL_JUDGE'] === '1'
          ? process.env['EVAL_JUDGE_MODEL'] ||
            process.env['GROQ_MODEL'] ||
            'openai/gpt-oss-120b'
          : null,
      promptTokens: llm.totalPromptTokens,
      completionTokens: llm.totalCompletionTokens,
      llmCalls: llm.calls,
      durationMs: Date.now() - startedAt.getTime(),
    };
    const base = join(dir, `chatbot-${stamp}`);
    writeFileSync(
      `${base}.json`,
      JSON.stringify({ summary, results }, null, 2),
    );
    writeFileSync(`${base}.md`, renderMarkdown(summary, results));
    process.stdout.write(`\nReporte: ${base}.md\n`);
  }

  if (cases.length === 0) {
    it('sin casos para EVAL_ROLE/EVAL_CASE', () => {
      throw new Error('Ningún caso coincide con el filtro');
    });
  }

  it.each(cases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, evalCase) => {
      const result = await runCase(evalCase);
      results.push(result);
      const failures = result.turns.flatMap((t) => [
        ...(t.errorCode ? [`error del agente: ${t.errorCode}`] : []),
        ...t.failures.map((f) => `${f.check}: ${f.detail}`),
      ]);
      expect({ passed: casePassed(result), failures }).toEqual({
        passed: true,
        failures: [],
      });
    },
    TURN_TIMEOUT_MS,
  );
});
