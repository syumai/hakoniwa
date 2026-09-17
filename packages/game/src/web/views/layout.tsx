// Perl 版 Main.pm tempHeader/tempFooter の移植。
// ライセンス上必須の配布元リンク (tmp/01-overview.md) を本文先頭に固定で埋め込む。
import type { PropsWithChildren } from "hono/jsx";
import type { GameConfig } from "../../core/config.ts";

export interface LayoutProps {
  config: GameConfig;
}

const SCRIPT_SOURCE_URL = "http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html";

export function Layout({ config, children }: PropsWithChildren<LayoutProps>) {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{config.site.title}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <a href={SCRIPT_SOURCE_URL}>箱庭諸島スクリプト配布元</a>
        <hr />
        <main>{children}</main>
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
