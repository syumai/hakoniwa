// tmp/08-turn-trigger-admin-cli.md 「設定の読み込み (Node)」節の移植。
// Node 固有 (PORT、DB パス等) はここに含めない。それらは packages/server-node/src/config.ts が持つ。
import { defaultConfig } from "../core/config.ts";
import type { GameConfig } from "../core/config.ts";

export interface AppConfig {
  game: GameConfig;
  /** 全島のパスワード代用。未設定なら無効。 */
  masterPassword?: string;
  /** changeSettings の旧パスワード欄専用。未設定なら無効。 */
  specialPassword?: string;
  adminEnabled: boolean;
  debug: boolean;
}

function parseBool(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(
    `loadConfigFromEnv: ${name} must be "true" or "false" (got: ${JSON.stringify(raw)})`,
  );
}

function parseInteger(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`loadConfigFromEnv: ${name} must be an integer (got: ${JSON.stringify(raw)})`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `loadConfigFromEnv: ${name} is out of safe integer range (got: ${JSON.stringify(raw)})`,
    );
  }
  return value;
}

function nonEmpty(raw: string | undefined): string | undefined {
  return raw === undefined || raw === "" ? undefined : raw;
}

/** 環境変数から `AppConfig` を組み立てる。不正な値 (真偽値/数値としてパースできない) は Error を throw する。 */
export function loadConfigFromEnv(env: Record<string, string | undefined>): AppConfig {
  const debug = parseBool("HAKONIWA_DEBUG", env.HAKONIWA_DEBUG, defaultConfig.debug);
  const adminEnabled = parseBool("HAKONIWA_ADMIN_ENABLED", env.HAKONIWA_ADMIN_ENABLED, true);
  const useLbbs = parseBool("HAKONIWA_USE_LBBS", env.HAKONIWA_USE_LBBS, defaultConfig.useLbbs);
  const unitTimeSec = parseInteger(
    "HAKONIWA_UNIT_TIME_SEC",
    env.HAKONIWA_UNIT_TIME_SEC,
    defaultConfig.unitTimeSec,
  );
  const maxCatchUpTurns = parseInteger(
    "HAKONIWA_MAX_CATCH_UP_TURNS",
    env.HAKONIWA_MAX_CATCH_UP_TURNS,
    defaultConfig.maxCatchUpTurns,
  );
  if (unitTimeSec <= 0) {
    throw new Error("loadConfigFromEnv: HAKONIWA_UNIT_TIME_SEC must be positive");
  }
  if (maxCatchUpTurns <= 0) {
    throw new Error("loadConfigFromEnv: HAKONIWA_MAX_CATCH_UP_TURNS must be positive");
  }

  const game: GameConfig = {
    ...defaultConfig,
    debug,
    useLbbs,
    unitTimeSec,
    maxCatchUpTurns,
    site: {
      title: env.HAKONIWA_SITE_TITLE ?? defaultConfig.site.title,
      adminName: env.HAKONIWA_ADMIN_NAME ?? defaultConfig.site.adminName,
      email: env.HAKONIWA_EMAIL ?? defaultConfig.site.email,
      bbsUrl: env.HAKONIWA_BBS_URL ?? defaultConfig.site.bbsUrl,
      topPageUrl: env.HAKONIWA_TOPPAGE_URL ?? defaultConfig.site.topPageUrl,
    },
  };

  const masterPassword = nonEmpty(env.HAKONIWA_MASTER_PASSWORD);
  const specialPassword = nonEmpty(env.HAKONIWA_SPECIAL_PASSWORD);

  return {
    game,
    adminEnabled,
    debug,
    ...(masterPassword !== undefined ? { masterPassword } : {}),
    ...(specialPassword !== undefined ? { specialPassword } : {}),
  };
}
