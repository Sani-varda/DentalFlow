import { encrypt, decrypt, verifyEncryptionKey } from '../crypto';

describe('crypto', () => {
  it('encrypts then decrypts to the same plaintext', () => {
    const plain = 'super-secret-credentials-{"foo":"bar"}';
    const encrypted = encrypt(plain);
    expect(encrypted).not.toContain('super-secret');
    expect(decrypt(encrypted)).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plain = 'same-input';
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decrypt('not:valid')).toThrow();
    expect(() => decrypt('aa:bb')).toThrow();
  });

  it('verifyEncryptionKey passes a roundtrip self-test', () => {
    expect(() => verifyEncryptionKey()).not.toThrow();
  });
});
