import type { ChatLocale } from './fallback-reply';
import {
  guardOutput,
  PROMPT_FINGERPRINTS,
  redactUuids,
  REDACTED_ID,
  REPLY_MAX_CHARS,
} from './output-guard';
import { SystemPromptBuilder } from './system-prompt.builder';

const UUID = 'ac984e91-3391-4729-93e8-a89a495b7053';

describe('output-guard', () => {
  it('cada huella del prompt existe en el prompt real (si se edita el prompt, actualizar la lista)', () => {
    const prompt = new SystemPromptBuilder().build(
      { kind: 'anonymous' },
      new Date(),
    );

    for (const fingerprint of PROMPT_FINGERPRINTS) {
      expect(prompt).toContain(fingerprint);
    }
  });

  describe('redactUuids', () => {
    it('tapa UUIDs sueltos y dentro de un texto', () => {
      expect(
        redactUuids(`doctor ${UUID}, paciente ${UUID.toUpperCase()}.`),
      ).toBe(`doctor ${REDACTED_ID}, paciente ${REDACTED_ID}.`);
    });

    it('no toca cadenas parecidas que no son UUID', () => {
      const text =
        'recibo REC-000123, tel +591 674 02602, ac984e91-3391-4729-93e8';
      expect(redactUuids(text)).toBe(text);
    });

    it('no tapa un tramo UUID pegado a más hex (no es un UUID aislado)', () => {
      const text = `f${UUID}`;
      expect(redactUuids(text)).toBe(text);
      expect(redactUuids(`${UUID}0`)).toBe(`${UUID}0`);
    });
  });

  describe('guardOutput', () => {
    it('deja pasar una respuesta normal', () => {
      expect(guardOutput('Atendemos de lunes a sábado.')).toEqual({
        reply: 'Atendemos de lunes a sábado.',
        action: 'none',
      });
    });

    it('tapa ids internos', () => {
      expect(guardOutput(`Tu doctor es ${UUID}`)).toEqual({
        reply: `Tu doctor es ${REDACTED_ID}`,
        action: 'redacted',
      });
    });

    it('bloquea una respuesta que repite el system prompt', () => {
      const leak = `Mis reglas: # Identidad ... # Prohibido ... ${PROMPT_FINGERPRINTS[6]}`;

      const result = guardOutput(leak);

      expect(result.action).toBe('blocked');
      expect(result.reply).not.toContain('# Identidad');
    });

    it('una sola coincidencia con el prompt no alcanza para bloquear', () => {
      expect(guardOutput('Te cuento: # Herramientas disponibles…').action).toBe(
        'none',
      );
    });

    it.each([
      '{"data":{"collected":1000}}',
      'resultado: {"error":"not_allowed"}',
      '"linkNote": "x"',
    ])('bloquea JSON crudo de una tool: %p', (reply) => {
      expect(guardOutput(reply).action).toBe('blocked');
    });

    it('responde el rechazo en el idioma pedido, y en castellano ante uno desconocido', () => {
      const leak = '{"data":1}';
      expect(guardOutput(leak, 'en').reply).toContain("I can't share that");
      expect(guardOutput(leak, 'fr' as ChatLocale).reply).toBe(
        guardOutput(leak).reply,
      );
    });

    it('corta una respuesta demasiado larga', () => {
      const result = guardOutput('a'.repeat(REPLY_MAX_CHARS + 100));

      expect(result.action).toBe('truncated');
      expect(result.reply).toHaveLength(REPLY_MAX_CHARS);
    });
  });
});
