// Perl 版 Main.pm tempHeader/tempFooter の移植。
// ライセンス上必須の配布元リンク (tmp/01-overview.md) を本文先頭に固定で埋め込む。
// tmp/14-users-auth.md によりログイン状態のナビゲーションを追加する (Phase 6b)。
import type { PropsWithChildren } from "hono/jsx";
import type { AuthUser } from "../../app/auth.ts";
import type { GameConfig } from "../../core/config.ts";

export interface LayoutProps {
  config: GameConfig;
  /** ログイン中のユーザー。未ログインなら undefined。 */
  user?: AuthUser | undefined;
  /** ログアウトフォーム用。未ログインなら undefined。 */
  csrfToken?: string | undefined;
}

const SCRIPT_SOURCE_URL = "http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html";

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

export function Layout({ config, user, csrfToken, children }: PropsWithChildren<LayoutProps>) {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{config.site.title}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <p class="distribution-link">
          <a href={SCRIPT_SOURCE_URL}>箱庭諸島スクリプト配布元</a>
        </p>
        <Nav config={config} user={user} csrfToken={csrfToken} />
        <main class="container">{children}</main>
        <hr />
        <p class="footer">
          管理者:{config.site.adminName}(
          <a href={`mailto:${config.site.email}`}>{config.site.email}</a>)<br />
          掲示板(<a href={config.site.bbsUrl}>{config.site.bbsUrl}</a>)<br />
          トップページ(<a href={config.site.topPageUrl}>{config.site.topPageUrl}</a>)<br />
          箱庭諸島のページ(<a href={SCRIPT_SOURCE_URL}>{SCRIPT_SOURCE_URL}</a>)<br />
        </p>
      </body>
    </html>
  );
}
