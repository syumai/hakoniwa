// tmp/14-users-auth.md 「サーバーサイドでの呼び出し」節: 毎リクエスト auth.api.getSession を呼び、
// c.set('user', ...) / c.set('sessionId', ...) する。未ログインはどちらも未設定のまま。
import type { MiddlewareHandler } from "hono";
import { toAuthUser } from "../../app/auth.ts";
import type { AppEnv } from "../env.ts";
import type { WebDeps } from "../deps.ts";

export interface SessionMiddlewareDeps {
  auth: WebDeps["auth"];
  /** HAKONIWA_ADMIN_EMAILS。 */
  adminEmails: readonly string[];
}

export function sessionMiddleware(deps: SessionMiddlewareDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (session !== null) {
      c.set("user", toAuthUser(session.user, deps.adminEmails));
      c.set("sessionId", session.session.id);
    }
    await next();
  };
}
