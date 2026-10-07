import {
  FakeLlmProvider,
  textResponse,
} from '../../src/chatbot/application/testing/fake-llm.provider';
import { judge, parseVerdict } from './judge';

const VALID =
  '{"warmth": 4, "clarity": 5, "singleReply": 3, "faithfulness": 5, "comment": "Bien, pero repite el saludo."}';

describe('juez LLM de los evals (CLI-232)', () => {
  describe('parseVerdict', () => {
    it('lee el JSON del juez', () => {
      expect(parseVerdict(VALID)).toEqual({
        scores: { warmth: 4, clarity: 5, singleReply: 3, faithfulness: 5 },
        comment: 'Bien, pero repite el saludo.',
      });
    });

    it('tolera texto alrededor del JSON', () => {
      expect(parseVerdict(`Aquí va:\n${VALID}\nSaludos`)?.scores.clarity).toBe(
        5,
      );
    });

    it('lleva los puntajes al rango 1-5', () => {
      expect(
        parseVerdict(
          '{"warmth": 9, "clarity": 0.4, "singleReply": 3, "faithfulness": 2.6}',
        )?.scores,
      ).toEqual({ warmth: 5, clarity: 1, singleReply: 3, faithfulness: 3 });
    });

    it.each([null, '', 'sin json', '{"warmth": 4}', '{roto'])(
      'devuelve null si no hay un veredicto completo: %s',
      (content) => {
        expect(parseVerdict(content)).toBeNull();
      },
    );
  });

  describe('judge', () => {
    const saved = process.env['GROQ_MODEL'];
    afterEach(() => {
      if (saved === undefined) delete process.env['GROQ_MODEL'];
      else process.env['GROQ_MODEL'] = saved;
      delete process.env['EVAL_JUDGE_MODEL'];
    });

    it('manda la conversación con lo que devolvieron las tools y el criterio del caso', async () => {
      const llm = new FakeLlmProvider([textResponse(VALID)]);
      const verdict = await judge(
        llm,
        'patient',
        [
          {
            user: '¿cuánto debo?',
            reply: 'Tu saldo es Bs. 1050.',
            toolResults: [
              { name: 'get_my_balance', content: '{"totalBalanceBob":1050}' },
            ],
          },
        ],
        'Debe dar el saldo exacto.',
      );
      expect(verdict?.scores.warmth).toBe(4);
      const [request] = llm.requests;
      expect(request.tools).toEqual([]);
      const content = request.messages[0].content as string;
      expect(content).toContain('Tipo de usuario: patient.');
      expect(content).toContain('Debe dar el saldo exacto.');
      expect(content).toContain(
        '[Herramienta get_my_balance] {"totalBalanceBob":1050}',
      );
      expect(content).toContain('Asistente: Tu saldo es Bs. 1050.');
    });

    it('usa EVAL_JUDGE_MODEL solo durante la llamada del juez', async () => {
      process.env['GROQ_MODEL'] = 'chat-model';
      process.env['EVAL_JUDGE_MODEL'] = 'judge-model';
      let modelDuringCall: string | undefined;
      const llm = {
        chat: () => {
          modelDuringCall = process.env['GROQ_MODEL'];
          return Promise.resolve(textResponse(VALID));
        },
      };
      await judge(llm, 'doctor', []);
      expect(modelDuringCall).toBe('judge-model');
      expect(process.env['GROQ_MODEL']).toBe('chat-model');
    });
  });
});
