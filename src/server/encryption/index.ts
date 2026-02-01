import "server-only";

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getSecret(): string | null {
  return process.env.ENCRYPTION_SECRET || null;
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

export function isEncryptionEnabled(): boolean {
  const secret = getSecret();
  return !!secret && secret.length >= 32;
}

export function encrypt(plaintext: string): string {
  const secret = getSecret();
  if (!secret || secret.length < 32) {
    // Encryption not configured, return plaintext
    // This allows graceful degradation in development
    return plaintext;
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Format: base64(salt + iv + tag + encrypted)
  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  return `enc:${combined.toString("base64")}`;
}

export function decrypt(ciphertext: string): string {
  // If not encrypted (no prefix), return as-is
  if (!ciphertext.startsWith("enc:")) {
    return ciphertext;
  }

  const secret = getSecret();
  if (!secret || secret.length < 32) {
    // Cannot decrypt without secret, return empty
    // This prevents exposing encrypted data
    return "";
  }

  try {
    const combined = Buffer.from(ciphertext.slice(4), "base64");

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH
    );
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(secret, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    // Decryption failed, return empty
    return "";
  }
}
