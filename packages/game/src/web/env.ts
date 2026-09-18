// tmp/14-users-auth.md の web 層向け Hono Env 型。
// v1 の DefaultsCookieEnv (hako_defaults Cookie) を置き換える。
// session-middleware が user/sessionId を、csrf-middleware が csrfToken をそれぞれ c.set する。
import type { AuthUser } from "../app/auth.ts";

export type AppEnv = {
  Variables: {
    /** ログイン中のユーザー。session-middleware が設定する。未ログインなら未設定。 */
    user?: AuthUser;
    /** better-auth の session.id。session-middleware が設定する。未ログインなら未設定。 */
    sessionId?: string;
    /** ログイン中のみ csrf-middleware が設定する。views の hidden `_csrf` に埋め込む。 */
    csrfToken?: string;
  };
};
