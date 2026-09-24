import { BanecoApiError, BanecoClient } from './baneco.client';
import { decryptAes } from './baneco-crypto';

const AES_KEY = '0123456789abcdef0123456789abcdef';
const ENV = {
  BANECO_API_URL: 'https://baneco.test/',
  BANECO_USERNAME: 'clinica',
  BANECO_PASSWORD: 'secreta',
  BANECO_AES_KEY: AES_KEY,
  BANECO_ACCOUNT: '1234567890',
  BANECO_BRANCH_CODE: '701',
};

function jwtExpiringIn(ms: number): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor((Date.now() + ms) / 1000) }),
  ).toString('base64');
  return `header.${payload}.firma`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function authOk(token = jwtExpiringIn(30 * 60 * 1000)): Response {
  return json({ responseCode: 0, message: 'OK', token });
}

describe('BanecoClient', () => {
  let fetchMock: jest.SpyInstance;
  let client: BanecoClient;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV);
    fetchMock = jest.spyOn(global, 'fetch');
    client = new BanecoClient();
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...savedEnv };
  });

  function calls(): { url: string; init: RequestInit }[] {
    return (fetchMock.mock.calls as [string, RequestInit][]).map(
      ([url, init]) => ({ url, init }),
    );
  }

  describe('configuración', () => {
    it('falla con la lista de variables que faltan', () => {
      delete process.env['BANECO_PASSWORD'];
      delete process.env['BANECO_ACCOUNT'];

      expect(() => client.accountCredit).toThrow(
        'Faltan variables de entorno de BANECO: BANECO_PASSWORD, BANECO_ACCOUNT',
      );
    });

    it('expone la cuenta y la sucursal', () => {
      expect(client.accountCredit).toBe('1234567890');
      expect(client.branchCode).toBe('701');
    });

    it('la sucursal es opcional', () => {
      delete process.env['BANECO_BRANCH_CODE'];

      expect(client.branchCode).toBeUndefined();
    });

    it('encryptField cifra con la llave AES de BANECO', () => {
      const encrypted = client.encryptField('1234567890');

      expect(encrypted).not.toContain('1234567890');
      expect(decryptAes(encrypted, AES_KEY)).toBe('1234567890');
    });
  });

  describe('autenticación', () => {
    it('se autentica con la contraseña cifrada y usa el token en el request', async () => {
      const token = jwtExpiringIn(30 * 60 * 1000);
      fetchMock
        .mockResolvedValueOnce(authOk(token))
        .mockResolvedValueOnce(json({ responseCode: 0, qrId: 'qr-1' }));

      await expect(client.post('/api/qr', { amount: 100 })).resolves.toEqual({
        responseCode: 0,
        qrId: 'qr-1',
      });

      const [auth, request] = calls();
      expect(auth.url).toBe(
        'https://baneco.test/api/authentication/authenticate',
      );
      const authBody = JSON.parse(auth.init.body as string) as {
        userName: string;
        password: string;
      };
      expect(authBody.userName).toBe('clinica');
      expect(decryptAes(authBody.password, AES_KEY)).toBe('secreta');
      expect(request.url).toBe('https://baneco.test/api/qr');
      expect(request.init).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ amount: 100 }),
        headers: { Authorization: `Bearer ${token}` },
      });
    });

    it('reusa el token mientras no esté por vencer', async () => {
      fetchMock
        .mockResolvedValueOnce(authOk())
        .mockImplementation(() => Promise.resolve(json({ responseCode: 0 })));

      await client.get('/a');
      await client.get('/b');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('renueva el token si le queda menos del margen de seguridad', async () => {
      fetchMock
        .mockResolvedValueOnce(authOk(jwtExpiringIn(30 * 1000)))
        .mockResolvedValueOnce(json({ responseCode: 0 }))
        .mockResolvedValueOnce(authOk())
        .mockResolvedValueOnce(json({ responseCode: 0 }));

      await client.get('/a');
      await client.get('/b');

      expect(calls().map((c) => c.url)).toEqual([
        'https://baneco.test/api/authentication/authenticate',
        'https://baneco.test/a',
        'https://baneco.test/api/authentication/authenticate',
        'https://baneco.test/b',
      ]);
    });

    it.each([
      ['no es un JWT', 'token-opaco'],
      ['el JWT no trae exp', `h.${Buffer.from('{}').toString('base64')}.s`],
      ['el payload no es JSON', 'h.no-es-json.s'],
    ])('si %s, usa un vencimiento por defecto y lo reusa', async (_, token) => {
      fetchMock
        .mockResolvedValueOnce(authOk(token))
        .mockImplementation(() => Promise.resolve(json({ responseCode: 0 })));

      await client.get('/a');
      await client.get('/b');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('error de red al autenticar', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.get('/a')).rejects.toThrow(
        'No se pudo autenticar con BANECO: ECONNREFUSED',
      );
    });

    it('credenciales rechazadas: propaga el mensaje y el código de BANECO', async () => {
      fetchMock.mockResolvedValueOnce(
        json({ responseCode: 5, message: 'Usuario bloqueado' }),
      );

      const error = (await client.get('/a').catch((e: unknown) => e)) as
        | BanecoApiError
        | undefined;
      expect(error).toBeInstanceOf(BanecoApiError);
      expect(error?.message).toBe('Usuario bloqueado');
      expect(error?.responseCode).toBe(5);
    });

    it.each([
      ['respuesta no JSON', new Response('<html>', { status: 502 })],
      ['sin token', json({ responseCode: 0 })],
      ['HTTP de error', json({ responseCode: 0, token: 'x' }, 500)],
    ])('%s al autenticar: mensaje genérico', async (_, response) => {
      fetchMock.mockResolvedValueOnce(response);

      await expect(client.get('/a')).rejects.toThrow(
        'No se pudo autenticar con BANECO',
      );
    });
  });

  describe('requests', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(authOk());
    });

    it('GET va sin cuerpo', async () => {
      fetchMock.mockResolvedValueOnce(json({ responseCode: 0 }));

      await client.get('/api/qr/1');

      expect(calls()[1].init).toMatchObject({ method: 'GET', body: undefined });
    });

    it('DELETE manda el cuerpo', async () => {
      fetchMock.mockResolvedValueOnce(json({ responseCode: 0 }));

      await client.delete('/api/qr', { qrId: 'qr-1' });

      expect(calls()[1].init).toMatchObject({
        method: 'DELETE',
        body: JSON.stringify({ qrId: 'qr-1' }),
      });
    });

    it('un 401 renueva el token y reintenta una sola vez', async () => {
      fetchMock
        .mockResolvedValueOnce(json({}, 401))
        .mockResolvedValueOnce(authOk())
        .mockResolvedValueOnce(json({ responseCode: 0, ok: true }));

      await expect(client.get('/a')).resolves.toEqual({
        responseCode: 0,
        ok: true,
      });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('un segundo 401 ya no reintenta', async () => {
      fetchMock
        .mockResolvedValueOnce(json({}, 401))
        .mockResolvedValueOnce(authOk())
        .mockResolvedValueOnce(json({ message: 'No autorizado' }, 401));

      await expect(client.get('/a')).rejects.toThrow('No autorizado');
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('error de red en el request', async () => {
      fetchMock.mockRejectedValueOnce(new Error('timeout'));

      await expect(client.get('/a')).rejects.toThrow(
        'No se pudo conectar con BANECO: timeout',
      );
    });

    it('respuesta que no es JSON', async () => {
      fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }));

      await expect(client.get('/a')).rejects.toThrow(
        'Respuesta inválida de BANECO (HTTP 502)',
      );
    });

    it('responseCode distinto de 0 con HTTP 200 es un error de negocio', async () => {
      fetchMock.mockResolvedValueOnce(
        json({ responseCode: 12, message: 'QR vencido' }),
      );

      const error = (await client.get('/a').catch((e: unknown) => e)) as
        | BanecoApiError
        | undefined;
      expect(error?.message).toBe('QR vencido');
      expect(error?.responseCode).toBe(12);
    });

    it('HTTP de error sin mensaje: mensaje genérico con el status', async () => {
      fetchMock.mockResolvedValueOnce(json({}, 500));

      await expect(client.get('/a')).rejects.toThrow(
        'Error de BANECO (HTTP 500)',
      );
    });
  });
});
