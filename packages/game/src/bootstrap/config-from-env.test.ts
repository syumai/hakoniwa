import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.ts";
import { loadConfigFromEnv } from "./config-from-env.ts";

describe("loadConfigFromEnv", () => {
  it("環境変数が無ければ defaultConfig 相当になる", () => {
    const config = loadConfigFromEnv({});
    expect(config.game.debug).toBe(defaultConfig.debug);
    expect(config.game.useLbbs).toBe(defaultConfig.useLbbs);
    expect(config.game.unitTimeSec).toBe(defaultConfig.unitTimeSec);
    expect(config.game.maxCatchUpTurns).toBe(defaultConfig.maxCatchUpTurns);
    expect(config.game.site).toEqual(defaultConfig.site);
    expect(config.adminEnabled).toBe(true);
    expect(config.debug).toBe(false);
    expect(config.masterPassword).toBeUndefined();
    expect(config.specialPassword).toBeUndefined();
  });

  it("真偽値・数値・文字列の環境変数を反映する", () => {
    const config = loadConfigFromEnv({
      HAKONIWA_DEBUG: "true",
      HAKONIWA_ADMIN_ENABLED: "false",
      HAKONIWA_USE_LBBS: "true",
      HAKONIWA_UNIT_TIME_SEC: "3600",
      HAKONIWA_MAX_CATCH_UP_TURNS: "5",
      HAKONIWA_SITE_TITLE: "テストサイト",
      HAKONIWA_ADMIN_NAME: "管理者太郎",
      HAKONIWA_EMAIL: "a@example.com",
      HAKONIWA_BBS_URL: "http://example.com/bbs",
      HAKONIWA_TOPPAGE_URL: "http://example.com/",
      HAKONIWA_MASTER_PASSWORD: "master",
      HAKONIWA_SPECIAL_PASSWORD: "special",
    });
    expect(config.game.debug).toBe(true);
    expect(config.debug).toBe(true);
    expect(config.adminEnabled).toBe(false);
    expect(config.game.useLbbs).toBe(true);
    expect(config.game.unitTimeSec).toBe(3600);
    expect(config.game.maxCatchUpTurns).toBe(5);
    expect(config.game.site).toEqual({
      title: "テストサイト",
      adminName: "管理者太郎",
      email: "a@example.com",
      bbsUrl: "http://example.com/bbs",
      topPageUrl: "http://example.com/",
    });
    expect(config.masterPassword).toBe("master");
    expect(config.specialPassword).toBe("special");
  });

  it("空文字のパスワード環境変数は未設定 (無効) として扱う", () => {
    const config = loadConfigFromEnv({
      HAKONIWA_MASTER_PASSWORD: "",
      HAKONIWA_SPECIAL_PASSWORD: "",
    });
    expect(config.masterPassword).toBeUndefined();
    expect(config.specialPassword).toBeUndefined();
  });

  it("不正な真偽値は Error を投げる", () => {
    expect(() => loadConfigFromEnv({ HAKONIWA_DEBUG: "yes" })).toThrow(/HAKONIWA_DEBUG/);
  });

  it("不正な数値は Error を投げる", () => {
    expect(() => loadConfigFromEnv({ HAKONIWA_UNIT_TIME_SEC: "abc" })).toThrow(
      /HAKONIWA_UNIT_TIME_SEC/,
    );
    expect(() => loadConfigFromEnv({ HAKONIWA_UNIT_TIME_SEC: "1.5" })).toThrow(
      /HAKONIWA_UNIT_TIME_SEC/,
    );
  });

  it("0 以下の unitTimeSec / maxCatchUpTurns は Error を投げる", () => {
    expect(() => loadConfigFromEnv({ HAKONIWA_UNIT_TIME_SEC: "0" })).toThrow();
    expect(() => loadConfigFromEnv({ HAKONIWA_MAX_CATCH_UP_TURNS: "-1" })).toThrow();
  });
});
