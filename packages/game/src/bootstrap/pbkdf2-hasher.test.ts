import { describe, expect, it } from "vitest";
import { Pbkdf2PasswordHasher } from "./pbkdf2-hasher.ts";

describe("Pbkdf2PasswordHasher", () => {
  it("hash してから verify すると true になる (往復)", async () => {
    const hasher = new Pbkdf2PasswordHasher(1000);
    const hash = await hasher.hash("himitsu");
    expect(await hasher.verify("himitsu", hash)).toBe(true);
  });

  it("誤ったパスワードでは verify が false になる", async () => {
    const hasher = new Pbkdf2PasswordHasher(1000);
    const hash = await hasher.hash("himitsu");
    expect(await hasher.verify("chigau", hash)).toBe(false);
  });

  it("保存形式が pbkdf2-sha256$<iter>$<salt>$<hash> になっている", async () => {
    const hasher = new Pbkdf2PasswordHasher(1234);
    const hash = await hasher.hash("himitsu");
    const parts = hash.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2-sha256");
    expect(parts[1]).toBe("1234");
    expect(parts[2]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[3]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("同じパスワードでもハッシュ毎に salt が変わる", async () => {
    const hasher = new Pbkdf2PasswordHasher(1000);
    const a = await hasher.hash("himitsu");
    const b = await hasher.hash("himitsu");
    expect(a).not.toBe(b);
  });

  it("形式不正な保存値は verify が false を返す (throw しない)", async () => {
    const hasher = new Pbkdf2PasswordHasher(1000);
    expect(await hasher.verify("himitsu", "not-a-valid-hash")).toBe(false);
    expect(await hasher.verify("himitsu", "pbkdf2-sha256$abc$salt$hash")).toBe(false);
    expect(await hasher.verify("himitsu", "plain:himitsu")).toBe(false);
    expect(await hasher.verify("himitsu", "")).toBe(false);
  });

  it("iterations の異なるハッシュも正しく検証できる (コンストラクタ引数と独立)", async () => {
    const slow = new Pbkdf2PasswordHasher(2000);
    const fast = new Pbkdf2PasswordHasher(500);
    const hash = await slow.hash("himitsu");
    // 保存文字列に iterations が埋め込まれているため、別インスタンス (fast) でも検証できる。
    expect(await fast.verify("himitsu", hash)).toBe(true);
  });
});
