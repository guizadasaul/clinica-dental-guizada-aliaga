import { checkReply, checkTools, fold, normalizeAmounts } from './checks';

function failedChecks(reply: string, expected = {}): string[] {
  return checkReply(reply, expected).map((f) => f.check);
}

describe('checks de los evals del chatbot (CLI-232)', () => {
  describe('checkReply: estilo', () => {
    it('una respuesta en neutro, texto plano y breve pasa', () => {
      expect(
        failedChecks(
          '¡Hola, Carla! Tu próxima cita es el jueves 9 a las 10:00 con la Dra. Lucía Rojas. ¿Te ayudo con algo más?',
        ),
      ).toEqual([]);
    });

    it.each([
      ['Podés reservar desde la web', 'podés'],
      ['Reservá tu cita hoy', 'Reservá'],
      ['Te espero acá', 'acá'],
      ['Tu turno es mañana', 'turno'],
    ])('detecta voseo y "turno": %s', (reply) => {
      expect(failedChecks(reply)).toContain('neutral_spanish');
    });

    it('no confunde palabras que contienen una forma de voseo', () => {
      // "acabamos" contiene "aca", pero no es voseo.
      expect(failedChecks('Ya acabamos tu limpieza')).toEqual([]);
    });

    it('detecta URLs, Markdown y emojis', () => {
      expect(failedChecks('Entra a https://ejemplo.com/reservar')).toContain(
        'no_urls',
      );
      expect(failedChecks('Tu saldo es **Bs. 1050**')).toContain('plain_text');
      expect(failedChecks('# Tu saldo')).toContain('plain_text');
      expect(failedChecks('¡Listo! 😊')).toContain('no_emoji');
    });

    it('permite guiones para listas (es lo que pide el prompt)', () => {
      expect(
        failedChecks('Te faltan:\n- Endodoncia\n- Resina en la pieza 26'),
      ).toEqual([]);
    });

    it.each([
      'Un momento, déjame revisar tu agenda.',
      'Dame un segundo y te digo.',
      'Voy a consultar tu saldo.',
      'Te aviso en breve.',
    ])('detecta cuando anuncia en vez de responder: %s', (reply) => {
      expect(failedChecks(reply)).toContain('single_reply');
    });

    it('detecta respuestas demasiado largas', () => {
      expect(failedChecks('palabra '.repeat(200))).toContain('length');
    });
  });

  describe('checkReply: datos del caso', () => {
    it('mustMention ignora tildes, mayúsculas y formato de montos', () => {
      expect(
        failedChecks('Tienes un saldo de Bs. 1.050,00 con la Dra. LUCIA', {
          mustMention: ['1050', 'Lucía'],
        }),
      ).toEqual([]);
    });

    it('mustMention falla si falta un dato', () => {
      expect(
        checkReply('Tu saldo es Bs. 900', { mustMention: ['1050'] }),
      ).toEqual([{ check: 'must_mention', detail: '1050' }]);
    });

    it('mustMentionAny acepta cualquiera de las variantes', () => {
      expect(
        failedChecks('No asististe a tu cita del lunes', {
          mustMentionAny: [['faltaste', 'no asististe', 'no viniste']],
        }),
      ).toEqual([]);
      expect(
        failedChecks('Todo en orden', {
          mustMentionAny: [['faltaste', 'no asististe']],
        }),
      ).toEqual(['must_mention']);
    });

    it('mustNotMention detecta datos que no debía dar', () => {
      expect(
        failedChecks('Rodrigo Paz debe Bs. 1.200', {
          mustNotMention: ['Rodrigo', '1200'],
        }),
      ).toEqual(['must_not_mention', 'must_not_mention']);
    });
  });

  describe('normalizeAmounts y fold', () => {
    it.each([
      ['Bs. 1.050', 'Bs. 1050'],
      ['Bs. 1,050.00', 'Bs. 1050'],
      ['Bs. 150,00', 'Bs. 150'],
      ['a las 10:00', 'a las 10:00'],
    ])('%s → %s', (input, output) => {
      expect(normalizeAmounts(input)).toBe(output);
    });

    it('fold quita tildes y mayúsculas', () => {
      expect(fold('Sofía QUISPE')).toBe('sofia quispe');
    });
  });

  describe('checkTools', () => {
    it('cada grupo es un "o" y todos los grupos deben cumplirse', () => {
      expect(
        checkTools(['get_my_quotes', 'get_my_next_appointment'], {
          expectTools: [
            ['get_my_balance', 'get_my_quotes'],
            ['get_my_next_appointment', 'get_my_appointments'],
          ],
        }),
      ).toEqual([]);
      expect(
        checkTools([], { expectTools: [['get_my_balance']] }).map(
          (f) => f.check,
        ),
      ).toEqual(['expected_tool']);
    });

    it('detecta una tool prohibida', () => {
      expect(
        checkTools(['get_my_patients'], { forbidTools: ['get_my_patients'] }),
      ).toEqual([{ check: 'forbidden_tool', detail: 'get_my_patients' }]);
    });
  });
});
