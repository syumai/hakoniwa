// tmp/14-users-auth.md 「自前プラグイン: 開発ログイン」節の移植。
// ローカル開発用: 任意のメールアドレスでログインできる。`HAKONIWA_DEV_LOGIN=true` のときだけ
// bootstrap/auth.ts の plugins に加える (無効時はエンドポイント自体が存在しない)。
// 開発ログインで作ったユーザーには account 行を作らない (provider を持たない)。
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

/** `x@y` 程度の緩い形式チェック (email 形式の厳密な検証は行わない。ローカル開発専用のため)。 */
const EMAIL_LIKE_PATTERN = /^[^\s@]+@[^\s@]+$/;

function nameFromEmail(email: string): string {
  return email.split("@")[0] ?? email;
}

/**
 * `POST /api/auth/dev-login`: email だけでログイン (無ければユーザー作成) する開発用プラグイン。
 * 戻り値の型は明示的に `BetterAuthPlugin` にしない (betterAuth 側の plugins 配列からの型推論
 * (`auth.api.devLogin` 等) がリテラル型に依存しているため、ここで広げてしまうと壊れる)。
 */
export function devLoginPlugin() {
  return {
    id: "dev-login",
    endpoints: {
      devLogin: createAuthEndpoint(
        "/dev-login",
        {
          method: "POST",
          body: z.object({ email: z.string().min(1) }),
        },
        async (ctx) => {
          const email = ctx.body.email.trim().toLowerCase();
          if (!EMAIL_LIKE_PATTERN.test(email)) {
            throw new APIError("BAD_REQUEST", { message: "invalid email format" });
          }

          const existing = await ctx.context.internalAdapter.findUserByEmail(email);
          const user =
            existing?.user ??
            (await ctx.context.internalAdapter.createUser(
              { email, name: nameFromEmail(email), emailVerified: true },
              { method: "dev-login" },
            ));

          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });

          return ctx.json({ user });
        },
      ),
    },
  };
}
