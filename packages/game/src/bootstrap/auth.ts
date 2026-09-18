// tmp/14-users-auth.md 「インスタンスの組み立て (bootstrap/auth.ts)」節の移植。
// 環境 (Node / Durable Objects) ごとに 1 インスタンスを作る。buildDeps の中で作り、
// BuiltDeps.auth として返す。
//
// 設計書との差異:
// - better-auth 1.7.5 の twitter/discord プロバイダは、プロフィールにメールが無い場合 (X 等)
//   自前で `<id>@<provider>.placeholder.invalid` 形式のプレースホルダメールを生成する
//   (`createPlaceholderEmail`。better-auth 本体の実装、anonymous プラグイン等と同じ仕組み)。
//   そのため 14 のコード例にある `mapProfileToUser` によるプレースホルダ生成は不要
//   (指定しても上書きされるだけで害はないが、二重実装を避けるため指定しない)。isAdminEmail は
//   `.invalid` で終わるメールを常に除外するため、このプレースホルダは従来どおり管理者判定から
//   除外される。
// - 14 のコード例は `magicLink`/`APIError`/`createAuthMiddleware` を `better-auth/plugins`,
//   `better-auth/api` から import する形を示しており、実際にそのパスで export されていることを
//   node_modules で確認済み。
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import type { AuthMethodPolicy } from "../app/auth-methods.ts";
import type { Mailer } from "../app/ports.ts";
import { betterAuthSqliteAdapter } from "../storage/better-auth-adapter.ts";
import type { SqlDriver } from "../storage/driver.ts";
import { authMethodOf } from "./auth-method-of.ts";
import { devLoginPlugin } from "./dev-login-plugin.ts";
import type { AppConfig } from "./config-from-env.ts";

/** マジックリンク・メール確認リンクの有効期限 (秒)。14「インスタンスの組み立て」節のコード例どおり。 */
const MAGIC_LINK_EXPIRES_IN_SECONDS = 600;

export interface CreateAuthInput {
  driver: SqlDriver;
  config: AppConfig;
  mailer: Mailer;
  authMethods: AuthMethodPolicy;
}

/** `AppConfig.auth` から better-auth インスタンスを組み立てる。 */
export function createAuth(input: CreateAuthInput) {
  const { driver, config, mailer, authMethods } = input;
  const { auth } = config;

  return betterAuth({
    baseURL: auth.baseUrl,
    basePath: "/api/auth",
    secret: auth.secret,
    database: betterAuthSqliteAdapter({ driver }),
    trustedOrigins: [auth.baseUrl],
    advanced: {
      // Cookie 名は `hako.session_token` になる (v1 の `hako_defaults` は廃止)。
      cookiePrefix: "hako",
    },
    socialProviders: {
      ...(auth.x !== undefined
        ? { twitter: { clientId: auth.x.clientId, clientSecret: auth.x.clientSecret } }
        : {}),
      ...(auth.discord !== undefined
        ? { discord: { clientId: auth.discord.clientId, clientSecret: auth.discord.clientSecret } }
        : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        // X (プレースホルダ email) のユーザーに Discord/メールを紐付けるため。
        allowDifferentEmails: true,
        // 連携時に name/image を取り込む (email/emailVerified は変わらない)。
        updateUserInfoOnLink: true,
        // 最後の 1 つは解除できない。
        allowUnlinkingAll: false,
      },
    },
    // メールの設定/変更 (新しいメールに確認リンクを送る)。X ユーザーが後からメールを設定する導線。
    user: { changeEmail: { enabled: true } },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: "【箱庭諸島】メールアドレスの確認",
          text: url,
        });
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await mailer.send({ to: email, subject: "【箱庭諸島】ログイン用リンク", text: url });
        },
        expiresIn: MAGIC_LINK_EXPIRES_IN_SECONDS,
      }),
      ...(auth.devLogin ? [devLoginPlugin()] : []),
    ],
    hooks: {
      // 管理画面で無効化されたログイン方法を、better-auth のエンドポイント側でも拒否する。
      before: createAuthMiddleware(async (ctx) => {
        const method = authMethodOf({ path: ctx.path, params: ctx.params, body: ctx.body });
        if (method !== undefined && !authMethods.enabled()[method]) {
          throw new APIError("FORBIDDEN", { message: "このログイン方法は現在無効です。" });
        }
      }),
    },
  });
}
