import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pgConnectionConfig } from './pg-connection';

describe('pgConnectionConfig', () => {
  const savedEnv = { ...process.env };
  const dir = mkdtempSync(join(tmpdir(), 'pg-connection-'));
  const caPath = join(dir, 'ca.crt');
  writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nfake\n');

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('sin DATABASE_SSL_CA usa solo la URL (desarrollo local)', () => {
    process.env['DATABASE_URL'] = 'postgresql://u:p@localhost:5432/db';
    delete process.env['DATABASE_SSL_CA'];

    expect(pgConnectionConfig()).toEqual({
      connectionString: 'postgresql://u:p@localhost:5432/db',
    });
  });

  it('con DATABASE_SSL_CA exige TLS verificado contra esa CA', () => {
    process.env['DATABASE_URL'] = 'postgresql://u:p@pooler.example.com:5432/db';
    process.env['DATABASE_SSL_CA'] = caPath;

    expect(pgConnectionConfig()).toEqual({
      connectionString: 'postgresql://u:p@pooler.example.com:5432/db',
      ssl: {
        ca: '-----BEGIN CERTIFICATE-----\nfake\n',
        rejectUnauthorized: true,
      },
    });
  });

  it.each([
    'postgresql://u:p@pooler.example.com:5432/db?sslmode=require',
    'postgresql://u:p@pooler.example.com:5432/db?schema=public&sslmode=verify-full',
    'no es una url ?sslmode=require',
  ])(
    'rechaza una DATABASE_URL con sslmode cuando hay CA (%s)',
    (connectionString) => {
      process.env['DATABASE_URL'] = connectionString;
      process.env['DATABASE_SSL_CA'] = caPath;

      expect(() => pgConnectionConfig()).toThrow(/sslmode/);
    },
  );
});
