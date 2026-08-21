// Guard de i18n (CLI-36). Falla si:
//   1. los tres idiomas no tienen exactamente el mismo set de claves, o
//   2. una clave referenciada desde el código no existe en es.json.
//
// Existe porque durante CLI-36 se perdieron 36 claves al editar los tres
// JSON en tandas separadas: el código compilaba y los tests pasaban, pero
// los formularios renderizaban la clave cruda en pantalla. Nada más lo
// detecta — Angular no falla ante una clave faltante, la imprime tal cual.
import fs from 'node:fs';
import path from 'node:path';

const I18N_DIR = 'public/assets/i18n';
const SRC_DIR = 'src';
const LANGS = ['es', 'en', 'pt'];

const leafKeys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? leafKeys(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|html)$/.test(e.name) ? [full] : [];
  });

const sets = LANGS.map((lang) => [
  lang,
  new Set(leafKeys(JSON.parse(fs.readFileSync(`${I18N_DIR}/${lang}.json`, 'utf8')))),
]);

const errors = [];
const [, base] = sets[0];

for (const [lang, set] of sets.slice(1)) {
  for (const k of base) if (!set.has(k)) errors.push(`${lang}.json: falta "${k}"`);
  for (const k of set) if (!base.has(k)) errors.push(`${lang}.json: sobra "${k}" (no está en ${LANGS[0]}.json)`);
}

// Claves referenciadas como literal completo. Las que se arman por template
// string (`...errors.${x}`) no se pueden resolver estáticamente y quedan afuera.
const referenced = new Set();
for (const file of walk(SRC_DIR)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/['"`]((?:landing|auth|shared)\.[A-Za-z0-9_.]+)/g)) {
    // Termina en "." ⇒ es el prefijo de un template string
    // (`landing.philosophy.doctors.${id}`), no una clave resoluble.
    if (!m[1].endsWith('.')) referenced.add(m[1]);
  }
}

for (const key of [...referenced].sort()) {
  // Un prefijo de un subárbol existente es un acceso dinámico legítimo
  // (ej. `landing.services.categories.x.items`, que devuelve un array).
  const isPrefix = [...base].some((k) => k.startsWith(`${key}.`));
  if (!base.has(key) && !isPrefix) errors.push(`${LANGS[0]}.json: clave referenciada inexistente "${key}"`);
}

if (errors.length > 0) {
  console.error(`check-i18n: ${errors.length} problema(s)\n` + errors.map((e) => `  ${e}`).join('\n'));
  process.exit(1);
}
console.log(`check-i18n: OK — ${base.size} claves, idénticas en ${LANGS.join('/')}`);
