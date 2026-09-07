/**
 * Symmetric encryption for secrets at rest.
 *
 * Used to encrypt the master wallet mnemonic when stored to disk/env snapshot.
 * AES-256-GCM — authenticated encryption, tamper-evident.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * Encrypts plaintext using the ENCRYPTION_KEY from environment.
 * Returns a hex string: <iv>:<authTag>:<ciphertext>
 */
export function encrypt(plaintext: string): string {
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a string produced by encrypt().
 * Throws if the ciphertext has been tampered with.
 */
export function decrypt(payload: string): string {
  const [ivHex, tagHex, ciphertextHex] = payload.split(':');

  if (!ivHex || !tagHex || !ciphertextHex) {
    throw new Error('Invalid encrypted payload format');
  }

  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
