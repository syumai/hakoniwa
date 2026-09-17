// tmp/07-auth-and-security.md の移植。
import type { Island } from "../core/types.ts";
import type { PasswordHasher } from "./ports.ts";

/**
 * 定数時間文字列比較 (自前の XOR 累積比較)。
 * 長さが異なっても最後まで比較を続け、早期リターンで長さの違いが漏れないようにする。
 */
export function safeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export interface VerifyIslandPasswordDeps {
  hasher: PasswordHasher;
  /** 全島のパスワード代用。未設定または空文字なら無効。 */
  masterPassword?: string;
}

/**
 * 島のパスワードを検証する。空文字は常に false。
 * masterPassword が設定されていれば定数時間比較で先に照合し、一致すれば true。
 */
export async function verifyIslandPassword(
  island: Pick<Island, "passwordHash">,
  input: string,
  deps: VerifyIslandPasswordDeps,
): Promise<boolean> {
  if (input === "") {
    return false;
  }
  if (
    deps.masterPassword !== undefined &&
    deps.masterPassword !== "" &&
    safeEqual(input, deps.masterPassword)
  ) {
    return true;
  }
  return deps.hasher.verify(input, island.passwordHash);
}
