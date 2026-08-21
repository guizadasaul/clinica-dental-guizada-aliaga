#!/usr/bin/env node
// Guard local anti-SQL-injection (CLI-36). No hay CI en este repo todavía,
// así que este script corre en cada `npm test` local vía el hook `pretest`
// (ver package.json) — no reemplaza a CI, es la red que hay hasta que se
// monte una (candidato a issue de seguimiento, ver plan de CLI-36).
//
// Por qué se permiten $queryRaw / $executeRaw pero no las variantes *Unsafe:
// $queryRaw / $executeRaw son tagged templates de Prisma — el driver
// parametriza cada valor interpolado, así que concatenar strings ahí adentro
// NO produce inyección SQL (es sintácticamente imposible: la interpolación
// se compila a placeholders + bindings, no a texto SQL). $queryRawUnsafe /
// $executeRawUnsafe en cambio reciben un string SQL crudo como primer
// argumento — cualquier input de usuario que llegue a ese string es
// inyección SQL directa. Por eso esas dos son las que este guard prohíbe.
//
// Portable a propósito (sin `grep`, que no está garantizado en todos los
// entornos donde corre `npm test`): recorre api/src/**/*.ts a mano con `fs`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const FORBIDDEN_RE = /\$(?:query|execute)RawUnsafe/;

/** @returns {string[]} rutas absolutas de todos los .ts bajo `dir`. */
function listTsFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  const offenders = [];
  for (const filePath of listTsFiles(SRC_DIR)) {
    const content = readFileSync(filePath, 'utf8');
    if (FORBIDDEN_RE.test(content)) {
      offenders.push(filePath);
    }
  }

  if (offenders.length > 0) {
    console.error(
      'check-no-raw-sql: se encontró $queryRawUnsafe / $executeRawUnsafe en:',
    );
    for (const file of offenders) {
      console.error(`  - ${file}`);
    }
    console.error(
      'Usá $queryRaw / $executeRaw (tagged template, parametrizado) en su lugar.',
    );
    process.exit(1);
  }

  console.log('check-no-raw-sql: OK — sin $queryRawUnsafe / $executeRawUnsafe.');
}

main();
