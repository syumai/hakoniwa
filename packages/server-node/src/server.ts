// tmp/02-architecture.md 「Adapter を薄くする方針」、tmp/08-turn-trigger-admin-cli.md
// 「トリガー2: 外部 (Adapter 側)」節の実装。`vp build` 後 `node dist/server.js` で起動する。
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { composeNode } from "./compose.ts";
import { loadNodeConfig } from "./config.ts";

/**
 * `@hakoniwa/game/public` (images/style.css/owner.js) の配信元ディレクトリを決める。
 * 1. `HAKONIWA_PUBLIC_DIR` があればそれを使う。
 * 2. モノレポ構成のまま動かす場合向けに `../../game/public` を試す。
 *    `src/server.ts` (dev) と `dist/server.js` (build) はどちらも `packages/server-node/` の
 *    1 階層下にあるため、同じ相対パスが dev/build のどちらからでも `packages/game/public` を指す。
 * 3. `dist/` だけを配置するデプロイ向けに、`vite.config.ts` の `publicDir` でビルド時に
 *    `dist/server.js` と同じディレクトリへ直接コピーされる (Vite の既定動作: `publicDir` の中身は
 *    `outDir` サブディレクトリではなくルート直下に展開される) ため、スクリプトと同じディレクトリに
 *    フォールバックする。
 *    設計書 (tmp/09-tooling.md) は `dist/public` へコピーされる前提だが、実際に `vp build` した
 *    結果は `dist/images/*` `dist/style.css` `dist/owner.js` (dist 直下) だったため、実挙動に合わせた
 *    (設計書との差異)。
 */
function resolvePublicDir(): string {
  const fromEnv = process.env.HAKONIWA_PUBLIC_DIR;
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  const monorepoPublicDir = fileURLToPath(new URL("../../game/public", import.meta.url));
  if (existsSync(monorepoPublicDir)) {
    return monorepoPublicDir;
  }
  return fileURLToPath(new URL(".", import.meta.url));
}

function main(): void {
  const config = loadNodeConfig();
  const deps = composeNode(config);
  const publicDir = resolvePublicDir();

  // tmp/14-users-auth.md 「開発ログインの保護」節: 本番で誤って有効化されないよう起動時に警告する。
  if (config.auth.devLogin) {
    console.warn(
      "hakoniwa: HAKONIWA_DEV_LOGIN=true です。開発ログイン (任意のメールアドレスでログインできる機能) が有効になっています。本番環境では無効にしてください。",
    );
  }

  // Adapter 側で静的ルートを登録してから、ランタイム非依存の Hono app (`deps.app`) をマウントする。
  const root = new Hono();
  root.use("/images/*", serveStatic({ root: publicDir }));
  root.use("/style.css", serveStatic({ root: publicDir }));
  root.use("/owner.js", serveStatic({ root: publicDir }));
  root.route("/", deps.app);

  const server = serve({ fetch: root.fetch, port: config.port }, (info) => {
    console.log(`hakoniwa: listening on http://localhost:${info.port}/ (public: ${publicDir})`);
  });

  // ターン進行の外部トリガー。0 なら無効化する。
  let timer: ReturnType<typeof setInterval> | undefined;
  if (config.turnCheckIntervalSec > 0) {
    timer = setInterval(() => {
      try {
        deps.turnService.advanceTurnIfDue(Math.floor(Date.now() / 1000));
      } catch (err) {
        console.error("hakoniwa: turn check failed", err);
      }
    }, config.turnCheckIntervalSec * 1000);
    timer.unref();
  }

  function shutdown(signal: string): void {
    console.log(`hakoniwa: received ${signal}, shutting down...`);
    if (timer !== undefined) {
      clearInterval(timer);
    }
    server.close((err) => {
      if (err !== undefined) {
        console.error("hakoniwa: failed to close server", err);
      }
      try {
        deps.driver.close();
      } catch (closeErr) {
        console.error("hakoniwa: failed to close driver", closeErr);
      }
      process.exit(err !== undefined ? 1 : 0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
