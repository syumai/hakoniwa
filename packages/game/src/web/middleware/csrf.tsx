// tmp/14-users-auth.md 「Cookie と CSRF」節、tmp/07-auth-and-security.md 「CSRF」節の移植。
// 状態変更 POST (自前ルート全部。/auth/dev, /auth/magic-link は _csrf を除外) で
// `_csrf` を verifyCsrfToken で照合する。/api/auth/* は createApp の中で最初にマウントされ、
// このミドルウェアより前で処理が終わるため、ここでは対象にならない
// (better-auth 自身は trustedOrigins で Origin を検証する)。
// 加えて Origin ヘッダがあれば HAKONIWA_BASE_URL のオリジンと比較する (除外ルートも含む)。
import type { Context, MiddlewareHandler } from "hono";
import { createCsrfToken, verifyCsrfToken } from "../../bootstrap/csrf.ts";
import type { GameConfig } from "../../core/config.ts";
import type { AppEnv } from "../env.ts";
import { Layout } from "../views/layout.tsx";
import { ErrorPage } from "../views/messages.tsx";

export interface CsrfMiddlewareDeps {
  secret: string;
  baseUrl: string;
  gameConfig: GameConfig;
}

/** `_csrf` を要求しない自前ルート (セッション確立前の POST)。 */
const NO_CSRF_PATHS = new Set(["/auth/dev", "/auth/magic-link"]);

function originMismatch(originHeader: string | undefined, baseUrl: string): boolean {
  if (originHeader === undefined || originHeader === "") {
    return false;
  }
  try {
    const originHost = new URL(originHeader).host;
    const expectedHost = new URL(baseUrl).host;
    return originHost !== expectedHost;
  } catch {
    return true;
  }
}

function forbidden(c: Context<AppEnv>, deps: CsrfMiddlewareDeps) {
  return c.html(
    <Layout config={deps.gameConfig} user={c.get("user")} csrfToken={c.get("csrfToken")}>
      <ErrorPage message="不正なリクエストです。" />
    </Layout>,
    403,
  );
}

export function csrfMiddleware(deps: CsrfMiddlewareDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sessionId = c.get("sessionId");
    // ログイン中のみ csrfToken を用意する (views の hidden _csrf 用)。
    if (sessionId !== undefined) {
      c.set("csrfToken", await createCsrfToken(deps.secret, sessionId));
    }

    if (c.req.method === "POST") {
      if (originMismatch(c.req.header("origin"), deps.baseUrl)) {
        return forbidden(c, deps);
      }
      // 未ログインの POST は _csrf を検査しない (ログインが必要な操作は各ユースケースが
      // login_required で拒否する。ログイン前提の /auth/dev, /auth/magic-link も対象外)。
      if (sessionId !== undefined && !NO_CSRF_PATHS.has(c.req.path)) {
        const body = await c.req.parseBody();
        const raw = body["_csrf"];
        const token = typeof raw === "string" ? raw : "";
        const valid = await verifyCsrfToken(deps.secret, sessionId, token);
        if (!valid) {
          return forbidden(c, deps);
        }
      }
    }

    await next();
  };
}
