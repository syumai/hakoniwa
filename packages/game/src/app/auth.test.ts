import { describe, expect, it } from "vitest";
import { FakePasswordHasher } from "./fake-repository.ts";
import { safeEqual, verifyIslandPassword } from "./auth.ts";

describe("safeEqual", () => {
  it("同じ文字列なら true", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("異なる文字列なら false", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("長さが異なっても false を返す", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });

  it("両方空文字なら true", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("verifyIslandPassword", () => {
  const hasher = new FakePasswordHasher();

  it("空文字は常に false (マスターパスワードが空でも一致しない)", async () => {
    const island = { passwordHash: await hasher.hash("") };
    expect(await verifyIslandPassword(island, "", { hasher, masterPassword: "" })).toBe(false);
  });

  it("島のパスワードと一致すれば true", async () => {
    const island = { passwordHash: await hasher.hash("himitsu") };
    expect(await verifyIslandPassword(island, "himitsu", { hasher })).toBe(true);
  });

  it("島のパスワードと不一致なら false", async () => {
    const island = { passwordHash: await hasher.hash("himitsu") };
    expect(await verifyIslandPassword(island, "chigau", { hasher })).toBe(false);
  });

  it("masterPassword と一致すれば true", async () => {
    const island = { passwordHash: await hasher.hash("himitsu") };
    expect(
      await verifyIslandPassword(island, "master1", { hasher, masterPassword: "master1" }),
    ).toBe(true);
  });

  it("masterPassword が未設定なら通常のパスワードのみで判定する", async () => {
    const island = { passwordHash: await hasher.hash("himitsu") };
    expect(await verifyIslandPassword(island, "himitsu", { hasher })).toBe(true);
    expect(await verifyIslandPassword(island, "master1", { hasher })).toBe(false);
  });
});
