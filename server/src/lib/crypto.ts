import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const KEY_LENGTH = 32; // 256-bit key

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  // env.ts has already validated the format (64-char hex). Defence-in-depth check here.
  const buf = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'hex');
  if (buf.length !== KEY_LENGTH) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  cachedKey = buf;
  return cachedKey;
}

/**
 * Encrypts a plain-text string (e.g. JSON-serialised credentials).
 * Returns a compact string: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encrypt() requires a string');
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypts a string previously produced by `encrypt()`.
 */
export function decrypt(ciphertext: string): string {
  if (typeof ciphertext !== 'string') {
    throw new TypeError('decrypt() requires a string');
  }
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format — expected iv:authTag:ciphertext');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted credential format — empty segment');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Verifies that the configured encryption key works end-to-end.
 * Call once on startup so misconfiguration fails fast instead of mid-request.
 */
export function verifyEncryptionKey(): void {
  const probe = `dentaflow-cipher-probe-${Date.now()}`;
  const round = decrypt(encrypt(probe));
  if (round !== probe) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY self-test failed: roundtrip mismatch');
  }
}
