// tmp/06-web-routes-and-views.md 「Cookie (フォーム初期値のみ)」節の移植。
// Perl 版 ${HthisFile}OWNISLANDID=(…) 形式の複数 Cookie を、1 つの JSON Cookie にまとめる。
import { getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";

/** フォーム初期値。パスワードは含めない (07 の方針)。 */
export interface FormDefaults {
  /** 開発画面を開いた島。 */
  ownIslandId?: number;
  /** 最後に指定した目標の島。 */
  targetIslandId?: number;
  lbbsName?: string;
  pointX?: number;
  pointY?: number;
  /** 最後に選んだ計画。 */
  kind?: number;
}

export const DEFAULTS_COOKIE_NAME = "hako_defaults";

/** 30日 (秒)。 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type Variables = {
  defaults: FormDefaults;
  defaultsUpdate?: Partial<FormDefaults>;
};

export type DefaultsCookieEnv = { Variables: Variables };

function isOptionalNumber(v: unknown): v is number | undefined {
  return v === undefined || typeof v === "number";
}

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

/** Cookie から読んだ JSON の形状検証。壊れていれば false を返し、呼び出し側は空扱いにする。 */
function isFormDefaults(value: unknown): value is FormDefaults {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    isOptionalNumber(v.ownIslandId) &&
    isOptionalNumber(v.targetIslandId) &&
    isOptionalString(v.lbbsName) &&
    isOptionalNumber(v.pointX) &&
    isOptionalNumber(v.pointY) &&
    isOptionalNumber(v.kind)
  );
}

/** Cookie を読み `c.set('defaults', …)` し、レスポンス後に `defaultsUpdate` があれば merge して書き戻す。 */
export function defaultsCookieMiddleware(): MiddlewareHandler<DefaultsCookieEnv> {
  return async (c, next) => {
    let defaults: FormDefaults = {};
    const raw = getCookie(c, DEFAULTS_COOKIE_NAME);
    if (raw !== undefined) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isFormDefaults(parsed)) {
          defaults = parsed;
        }
      } catch {
        // 壊れた Cookie は空扱い。
      }
    }
    c.set("defaults", defaults);

    await next();

    const patch = c.get("defaultsUpdate");
    if (patch !== undefined) {
      const merged: FormDefaults = { ...defaults, ...patch };
      setCookie(c, DEFAULTS_COOKIE_NAME, JSON.stringify(merged), {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: MAX_AGE_SECONDS,
      });
    }
  };
}

/** ルートハンドラから呼ぶヘルパ。複数回呼んでも merge される。 */
export function updateDefaults(c: Context<DefaultsCookieEnv>, patch: Partial<FormDefaults>): void {
  const existing = c.get("defaultsUpdate");
  c.set("defaultsUpdate", { ...existing, ...patch });
}
