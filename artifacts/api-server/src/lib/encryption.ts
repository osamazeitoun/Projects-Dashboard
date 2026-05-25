import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Symmetric encryption helper used to store third-party OAuth refresh
 * tokens at rest (currently: Procore). Uses AES-256-GCM with a per-value
 * random 12-byte IV and a 16-byte authentication tag.
 *
 * Key material is read from `PROCORE_TOKEN_ENCRYPTION_KEY`:
 *   - 64-char hex string -> raw 32 bytes
 *   - 32-byte base64 string -> raw 32 bytes
 *   - any other string -> derived via scrypt with a fixed salt
 *
 * Ciphertext format: "v1:<iv_b64>:<tag_b64>:<ct_b64>"
 *
 * If the key changes, previously stored tokens become unreadable and the
 * affected company will need to reconnect Procore via the OAuth flow.
 */

let cachedKey: Buffer | null = null;
let cachedRaw: string | null = null;

export function hasEncryptionKey(): boolean {
  return !!process.env.PROCORE_TOKEN_ENCRYPTION_KEY;
}

function getKey(): Buffer {
  const raw = process.env.PROCORE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "PROCORE_TOKEN_ENCRYPTION_KEY is not set. Provide a 32-byte secret (hex, base64, or passphrase).",
    );
  }
  if (cachedKey && cachedRaw === raw) return cachedKey;

  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    try {
      const b = Buffer.from(raw, "base64");
      if (b.length === 32) key = b;
    } catch {
      // fall through
    }
  }
  if (!key) {
    key = scryptSync(raw, "procore-oauth-token-salt-v1", 32);
  }
  cachedKey = key;
  cachedRaw = raw;
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString(
    "base64",
  )}`;
}

export function decryptSecret(packed: string): string {
  const parts = packed.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unrecognised ciphertext format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}
