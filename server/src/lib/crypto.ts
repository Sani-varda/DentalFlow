import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives a 32-byte key from the CREDENTIALS_ENCRYPTION_KEY env var.
 * The env var should be a 64-char hex string (32 bytes).
 */
function getKey(): Buffer {
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must be set as a 64-character hex string. '
      + 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a plain-text string (e.g. JSON-serialised credentials).
 * Returns a compact string: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a string previously produced by `encrypt()`.
 * Returns the original plain-text string.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted credential format — expected iv:authTag:ciphertext');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
