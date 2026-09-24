import { UnauthorizedException } from '@nestjs/common';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type KeyLike,
} from 'jose';
import { SupabaseJwtVerifier } from './SupabaseJwtVerifier';

// El JWKS remoto se reemplaza por uno local con nuestra propia clave: la
// verificación (firma, issuer, audience, algoritmo) es la real de jose.
let localJwks: ReturnType<typeof createLocalJWKSet>;
jest.mock('jose', () => {
  const actual = jest.requireActual<typeof import('jose')>('jose');
  return {
    ...actual,
    createRemoteJWKSet: jest.fn(
      () =>
        (...args: Parameters<ReturnType<typeof actual.createLocalJWKSet>>) =>
          localJwks(...args),
    ),
  };
});

const SUPABASE_URL = 'https://proyecto.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const HMAC_SECRET = 'secreto-legacy-de-al-menos-32-caracteres!!';

describe('SupabaseJwtVerifier', () => {
  const savedEnv = { ...process.env };
  let privateKey: KeyLike;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    localJwks = createLocalJWKSet({
      keys: [{ ...jwk, kid: 'clave-1', alg: 'ES256' }],
    });
  });

  beforeEach(() => {
    process.env['SUPABASE_URL'] = SUPABASE_URL;
    delete process.env['SUPABASE_JWT_SECRET'];
  });

  afterAll(() => {
    process.env = { ...savedEnv };
  });

  function es256(payload: JWTPayload, claims: Partial<Claims> = {}) {
    return sign(
      new SignJWT(payload).setProtectedHeader({ alg: 'ES256', kid: 'clave-1' }),
      claims,
    ).sign(privateKey);
  }

  function hs256(payload: JWTPayload, secret = HMAC_SECRET) {
    return sign(new SignJWT(payload).setProtectedHeader({ alg: 'HS256' })).sign(
      new TextEncoder().encode(secret),
    );
  }

  interface Claims {
    issuer: string;
    audience: string;
    expiresIn: string;
  }

  function sign(jwt: SignJWT, claims: Partial<Claims> = {}): SignJWT {
    return jwt
      .setSubject('auth-user-1')
      .setIssuer(claims.issuer ?? ISSUER)
      .setAudience(claims.audience ?? 'authenticated')
      .setIssuedAt()
      .setExpirationTime(claims.expiresIn ?? '1h');
  }

  it('exige SUPABASE_URL', () => {
    delete process.env['SUPABASE_URL'];

    expect(() => new SupabaseJwtVerifier()).toThrow(
      'SUPABASE_URL environment variable is required',
    );
  });

  describe('token firmado con la clave asimétrica del proyecto (ES256)', () => {
    it('devuelve el usuario con los datos de Google', async () => {
      const token = await es256({
        email: 'ana@example.com',
        user_metadata: {
          name: 'Ana Pérez',
          picture: 'https://foto/ana.png',
        },
      });

      await expect(new SupabaseJwtVerifier().verify(token)).resolves.toEqual({
        uid: 'auth-user-1',
        email: 'ana@example.com',
        phone: null,
        displayName: 'Ana Pérez',
        photoUrl: 'https://foto/ana.png',
      });
    });

    it('usa full_name / avatar_url si no vienen name / picture', async () => {
      const token = await es256({
        phone: '59170000000',
        user_metadata: {
          full_name: 'Ana P.',
          avatar_url: 'https://foto/avatar.png',
        },
      });

      await expect(
        new SupabaseJwtVerifier().verify(token),
      ).resolves.toMatchObject({
        email: null,
        phone: '59170000000',
        displayName: 'Ana P.',
        photoUrl: 'https://foto/avatar.png',
      });
    });

    it('sin metadata: nombre y foto en null; email vacío cuenta como null', async () => {
      const token = await es256({ email: '' });

      await expect(
        new SupabaseJwtVerifier().verify(token),
      ).resolves.toMatchObject({
        email: null,
        displayName: null,
        photoUrl: null,
      });
    });

    it.each([
      ['de otro proyecto', { issuer: 'https://otro.supabase.co/auth/v1' }],
      ['para otra audiencia', { audience: 'anon' }],
      ['vencido', { expiresIn: '-1m' }],
    ])('rechaza un token %s con 401', async (_, claims) => {
      const token = await es256({}, claims);

      await expect(new SupabaseJwtVerifier().verify(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza algo que no es un JWT con 401', async () => {
      await expect(
        new SupabaseJwtVerifier().verify('no-es-un-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('token legacy HS256', () => {
    it('se verifica con SUPABASE_JWT_SECRET', async () => {
      process.env['SUPABASE_JWT_SECRET'] = HMAC_SECRET;
      const token = await hs256({ email: 'ana@example.com' });

      await expect(
        new SupabaseJwtVerifier().verify(token),
      ).resolves.toMatchObject({
        uid: 'auth-user-1',
        email: 'ana@example.com',
      });
    });

    it('sin secreto configurado, se rechaza', async () => {
      const token = await hs256({});

      await expect(new SupabaseJwtVerifier().verify(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('firmado con otro secreto, se rechaza', async () => {
      process.env['SUPABASE_JWT_SECRET'] = HMAC_SECRET;
      const token = await hs256({}, 'otro-secreto-de-al-menos-32-caracteres!!');

      await expect(new SupabaseJwtVerifier().verify(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
