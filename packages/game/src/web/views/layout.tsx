// Perl 版 Main.pm tempHeader/tempFooter の移植。
// ライセンス上必須の配布元リンク (tmp/01-overview.md) を本文先頭に固定で埋め込む。
// tmp/14-users-auth.md によりログイン状態のナビゲーションを追加する (Phase 6b)。
import type { Child, PropsWithChildren } from "hono/jsx";
import type { AuthUser } from "../../app/auth.ts";
import type { GameConfig } from "../../core/config.ts";

export interface LayoutProps {
  config: GameConfig;
  /** ログイン中のユーザー。未ログインなら undefined。 */
  user?: AuthUser | undefined;
  /** ログアウトフォーム用。未ログインなら undefined。 */
  csrfToken?: string | undefined;
  /** `<head>` に追加する要素 (OGP メタタグ等)。tmp/17-ogp.md。 */
  extraHead?: Child | undefined;
}

const SCRIPT_SOURCE_URL = "http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html";

/** `http://` `https://` から始まる文字列だけリンクにする (それ以外はそのまま文字列で表示)。 */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function UrlOrText({ value }: { value: string }) {
  return isHttpUrl(value) ? <a href={value}>{value}</a> : <>{value}</>;
}

/**
 * フッタ。管理者名・メール・掲示板・トップページは環境変数が未設定 (空文字列) なら
 * 行ごと出さない。箱庭諸島のページ (配布元 URL) はライセンス上必須のため常に出す。
 */
function Footer({ config }: { config: GameConfig }) {
  const { adminName, email, bbsUrl, topPageUrl } = config.site;
  const hasAdminName = adminName !== "";
  const hasEmail = email !== "";
  return (
    <p class="footer">
      {hasAdminName || hasEmail ? (
        <>
          管理者:{hasAdminName ? adminName : ""}
          {hasEmail ? (
            <>
              (<a href={`mailto:${email}`}>{email}</a>)
            </>
          ) : (
            ""
          )}
          <br />
        </>
      ) : (
        ""
      )}
      {bbsUrl !== "" ? (
        <>
          掲示板(
          <UrlOrText value={bbsUrl} />)<br />
        </>
      ) : (
        ""
      )}
      {topPageUrl !== "" ? (
        <>
          トップページ(
          <UrlOrText value={topPageUrl} />)<br />
        </>
      ) : (
        ""
      )}
      箱庭諸島のページ(<a href={SCRIPT_SOURCE_URL}>{SCRIPT_SOURCE_URL}</a>)<br />
    </p>
  );
}

/**
 * ヘッダナビゲーション。タイトルへのリンクと、ログイン状態のリンク群を横並び・
 * 折り返し可能に (Phase 7 モバイル UI)。class 名 "nav*" は Phase 6b からの引き継ぎ。
 */
function Nav({
  config,
  user,
  csrfToken,
}: {
  config: GameConfig;
  user: AuthUser | undefined;
  csrfToken: string | undefined;
}) {
  return (
    <nav class="nav">
      <a href="/" class="nav-title">
        {config.site.title}
      </a>
      <div class="nav-links">
        {user === undefined ? (
          <a href="/login" class="nav-login">
            ログイン
          </a>
        ) : (
          <>
            <span class="nav-user">{user.name}さん</span>
            <a href="/my-island" class="nav-my-island">
              自分の島
            </a>
            <a href="/account" class="nav-account">
              アカウント設定
            </a>
            {user.isAdmin ? (
              <a href="/admin" class="nav-admin">
                管理
              </a>
            ) : (
              ""
            )}
            <form action="/logout" method="post" class="nav-logout">
              <input type="hidden" name="_csrf" value={csrfToken ?? ""} />
              <input type="submit" value="ログアウト" />
            </form>
          </>
        )}
      </div>
    </nav>
  );
}

export function Layout({
  config,
  user,
  csrfToken,
  extraHead,
  children,
}: PropsWithChildren<LayoutProps>) {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{config.site.title}</title>
        <link rel="stylesheet" href="/style.css" />
        {extraHead ?? ""}
      </head>
      <body>
        <p class="distribution-link">
          <a href={SCRIPT_SOURCE_URL}>箱庭諸島スクリプト配布元</a>
        </p>
        <Nav config={config} user={user} csrfToken={csrfToken} />
        <main>{children}</main>
        <hr />
        <Footer config={config} />
      </body>
    </html>
  );
}
