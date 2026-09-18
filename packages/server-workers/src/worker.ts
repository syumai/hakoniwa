// tmp/12-workers-adapter.md 「Worker エントリ」節の実装。
// Worker はすべてのリクエストを単一の DO (`GAME.getByName('main')`) へ転送するだけ。
// 静的アセット (images/style.css/owner.js) は wrangler.jsonc の assets 設定により
// この fetch より先に Workers Static Assets が応答する。
//
// tmp/17-ogp.md 「キャッシュ」節 (方針変更): Cache API (`caches.default`) を自前で呼ぶ実装は
// 使わない。代わりに Workers Cache (`wrangler.jsonc` の `cache.enabled`) を使う。これは
// 応答の `Cache-Control` に従って Cloudflare 側が自動でキャッシュする機能で、workers.dev でも
// 有効。応答ごとの `Cache-Control` (OGP 画像は `public, max-age=3600`、それ以外は
// `private, no-store`) は `packages/game/src/web/app.tsx` の
// `defaultCacheControlMiddleware` が付ける。
import type { Env } from "./env.ts";
import { HakoniwaGame } from "./game-object.ts";

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return env.GAME.getByName("main").fetch(request);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // 進めるべきかどうか (unitTimeSec と game.last_time から判定) は DO 側 (checkTurn) に任せる。
    ctx.waitUntil(env.GAME.getByName("main").checkTurn());
  },
} satisfies ExportedHandler<Env>;

export { HakoniwaGame };
