// tmp/12-workers-adapter.md 「Worker エントリ」節の実装。
// Worker はすべてのリクエストを単一の DO (`GAME.getByName('main')`) へ転送するだけ。
// 静的アセット (images/style.css/owner.js) は wrangler.jsonc の assets 設定により
// この fetch より先に Workers Static Assets が応答する。
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
