// tmp/14-users-auth.md 「インスタンスの組み立て」節の `authMethodOf(ctx)` の移植。
// better-auth の hooks.before から呼ばれる。ctx 全体には依存せず、判定に必要な
// path/params/body だけを受け取る (テストしやすくするため)。
import type { AuthMethodKind } from "../app/auth-methods.ts";

/** better-auth のソーシャルプロバイダ id → AuthMethodKind。 */
function methodOfProviderId(providerId: unknown): AuthMethodKind | undefined {
  if (providerId === "twitter") {
    return "x";
  }
  if (providerId === "discord") {
    return "discord";
  }
  return undefined;
}

export interface AuthMethodOfInput {
  /** better-auth の `ctx.path` (basePath 抜き。例: "/sign-in/social", "/callback/:id")。 */
  path: string;
  /** `ctx.params` (`/callback/:id` の `id` 等)。 */
  params?: Record<string, string | undefined> | undefined;
  /** `ctx.body` (POST の場合)。 */
  body?: unknown;
}

/**
 * リクエストがどのログイン方法 (x / discord / email) に対応するかを判定する。
 * 対象外のエンドポイント (`/get-session`, `/sign-out`, `/change-email`, `/unlink-account`,
 * `/dev-login` 等) は常に undefined (制限なし) を返す。
 */
export function authMethodOf(input: AuthMethodOfInput): AuthMethodKind | undefined {
  const { path, params, body } = input;

  if (path === "/sign-in/social" || path === "/link-social") {
    const record = body as { provider?: unknown } | undefined;
    return methodOfProviderId(record?.provider);
  }

  if (path === "/callback/:id") {
    return methodOfProviderId(params?.id);
  }

  if (path === "/sign-in/magic-link" || path === "/magic-link/verify") {
    return "email";
  }

  return undefined;
}
