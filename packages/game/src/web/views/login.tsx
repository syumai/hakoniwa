// tmp/14-users-auth.md 「ルート」節 GET /login、POST /auth/magic-link (メール送信結果画面) の移植。
import type { AuthMethodsVM } from "../../app/admin-service.ts";
import { BackLink } from "./messages.tsx";

export interface LoginPageProps {
  methods: AuthMethodsVM;
  devLogin: boolean;
}

/** ログイン画面。設定済み かつ 管理画面で有効なログイン方法のみ表示する。 */
export function LoginPage({ methods, devLogin }: LoginPageProps) {
  return (
    <div class="login-page">
      <p class="big">ログイン</p>

      {methods.enabled.x || methods.enabled.discord ? (
        <section class="card">
          <h2>SNS アカウントでログイン</h2>
          {methods.enabled.x ? (
            <p>
              <a href="/auth/x" class="login-x btn btn-primary">
                X (Twitter) でログイン
              </a>
            </p>
          ) : (
            ""
          )}
          {methods.enabled.discord ? (
            <p>
              <a href="/auth/discord" class="login-discord btn btn-primary">
                Discord でログイン
              </a>
            </p>
          ) : (
            ""
          )}
        </section>
      ) : (
        ""
      )}

      {methods.enabled.email ? (
        <section class="login-email card">
          <h2>メールでログイン</h2>
          <form action="/auth/magic-link" method="post" class="field-row">
            <input type="email" name="email" size={32} required placeholder="you@example.com" />
            <button type="submit" class="btn btn-primary">
              ログイン用リンクを送る
            </button>
          </form>
        </section>
      ) : (
        ""
      )}

      {devLogin ? (
        <section class="login-dev card">
          <h2>開発ログイン</h2>
          <p>ローカル開発専用: 任意のメールアドレスでログインできます。</p>
          <form action="/auth/dev" method="post" class="field-row">
            <input type="email" name="email" size={32} required placeholder="you@example.com" />
            <button type="submit" class="btn">
              開発ログイン
            </button>
          </form>
        </section>
      ) : (
        ""
      )}
    </div>
  );
}

/** メールログインのリンク送信完了画面。POST /auth/magic-link の応答。 */
export function MagicLinkSentPage({ mailerIsConsole }: { mailerIsConsole: boolean }) {
  return (
    <div class="notice">
      <p class="big">メールを送りました。届いたリンクを開いてください。</p>
      {mailerIsConsole ? (
        <p class="notice-dev">開発モードのためサーバーのログにリンクが出ています。</p>
      ) : (
        ""
      )}
      <BackLink />
    </div>
  );
}
