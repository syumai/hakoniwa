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
        <>
          <h1>SNS アカウントでログイン</h1>
          {methods.enabled.x ? (
            <p>
              <a href="/auth/x" class="auth-button auth-button-x">
                <img class="auth-logo" src="/images/x-logo.svg" alt="" />X でログイン
              </a>
            </p>
          ) : (
            ""
          )}
          {methods.enabled.discord ? (
            <p>
              <a href="/auth/discord" class="auth-button auth-button-discord">
                <img class="auth-logo" src="/images/discord-logo.svg" alt="" />
                Discord でログイン
              </a>
            </p>
          ) : (
            ""
          )}
          <hr />
        </>
      ) : (
        ""
      )}

      {methods.enabled.email ? (
        <>
          <h1>メールでログイン</h1>
          <form action="/auth/magic-link" method="post">
            <input type="email" name="email" size={32} required placeholder="you@example.com" />
            <input type="submit" value="ログイン用リンクを送る" />
          </form>
          <hr />
        </>
      ) : (
        ""
      )}

      {devLogin ? (
        <>
          <h1>開発ログイン</h1>
          <p>ローカル開発専用: 任意のメールアドレスでログインできます。</p>
          <form action="/auth/dev" method="post">
            <input type="email" name="email" size={32} required placeholder="you@example.com" />
            <input type="submit" value="開発ログイン" />
          </form>
        </>
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
