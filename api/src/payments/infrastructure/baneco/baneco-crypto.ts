import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-CBC, IV(16 bytes) prepended al ciphertext, key = bytes UTF-8
 * crudos de la key de 32 caracteres provista por BANECO. Esquema confirmado
 * empíricamente desencriptando el vector de ejemplo de su documentación
 * (API Market v1.3.0 §5.1): "1234" + su aesKey de ejemplo -> el mismo
 * base64 que muestra el doc. La doc no especifica el modo/IV explícitamente.
 *
 * CBC no es elección nuestra: es lo que acepta BANECO, y cambiarlo rompe los
 * pagos. Por eso la regla S5542 de Sonar ("modo de cifrado inseguro") está
 * aceptada en el servidor de Sonar con esta justificación (CLI-120). Lo que sí
 * depende de nosotros está bien: IV aleatorio nuevo por cada mensaje.
 */
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export function encryptAes(plainText: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'utf8');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

export function decryptAes(cipherTextB64: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'utf8');
  const raw = Buffer.from(cipherTextB64, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
