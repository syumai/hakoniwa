// tmp/07-auth-and-security.md 「パスワードハッシュ」節の移植。
// globalThis.crypto (Web Crypto) のみを使う。node:crypto は import しない
// (packages/game はランタイム非依存。09-tooling.md/13-monorepo.md の制約)。
import { safeEqual } from "../app/auth.ts";
import type { PasswordHasher } from "../app/ports.ts";

const ALGORITHM = "pbkdf2-sha256";
const DEFAULT_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Uint8Array → base64url (パディング無し)。Buffer を使わず btoa で自前実装する。 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url → Uint8Array。不正な入力なら throw する。 */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/**
 * PBKDF2-SHA256 によるパスワードハッシュ。保存形式:
 * `pbkdf2-sha256$<iterations>$<salt base64url>$<hash base64url>`。
 * iterations はコンストラクタで上書き可能 (テストの高速化用。既定 100,000)。
 */
export class Pbkdf2PasswordHasher implements PasswordHasher {
  readonly #iterations: number;

  constructor(iterations: number = DEFAULT_ITERATIONS) {
    this.#iterations = iterations;
  }

  async hash(password: string): Promise<string> {
    const salt = new Uint8Array(SALT_BYTES);
    globalThis.crypto.getRandomValues(salt);
    const derived = await deriveBits(password, salt, this.#iterations);
    return `${ALGORITHM}$${this.#iterations}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== ALGORITHM) {
      return false;
    }
    const [, iterationsRaw, saltB64, hashB64] = parts;
    const iterations = Number(iterationsRaw);
    if (!Number.isInteger(iterations) || iterations <= 0) {
      return false;
    }
    let salt: Uint8Array<ArrayBuffer>;
    try {
      salt = fromBase64Url(saltB64 ?? "");
    } catch {
      return false;
    }
    let derived: Uint8Array<ArrayBuffer>;
    try {
      derived = await deriveBits(password, salt, iterations);
    } catch {
      return false;
    }
    // base64url へエンコードした文字列同士を定数時間比較する (auth.ts の safeEqual を再利用)。
    return safeEqual(toBase64Url(derived), hashB64 ?? "");
  }
}
