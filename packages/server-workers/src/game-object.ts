// tmp/12-workers-adapter.md 「Worker エントリ (worker.ts, game-object.ts) の骨子」節の実装。
// 1 インスタンス = ゲーム世界 1 つ。DO の SQLite ストレージに Node 版と同じスキーマを構築し、
// @hakoniwa/game の buildDeps で組み立てた Hono app にそのまま委譲する。
//
// ターン進行は Cron Trigger に限定する: `buildDeps` に `turnCheckOnRequest: false` を渡し、
// リクエスト時の turn-check ミドルウェアを登録しない。ターン進行のトリガーは `checkTurn()`
// (worker.ts の `scheduled` ハンドラ、`wrangler.jsonc` の Cron 設定) だけになる。
import { DurableObject } from "cloudflare:workers";
import { buildDeps, loadConfigFromEnv, migrate } from "@hakoniwa/game";
import type { BuiltDeps } from "@hakoniwa/game";
import { BookmarkBackupStore } from "./backup.ts";
import { DurableObjectSqlDriver } from "./driver.ts";
import type { Env } from "./env.ts";

/**
 * ゲーム世界を 1 つ保持する Durable Object。
 *
 * - `fetch`: 組み立てた Hono app (`@hakoniwa/game` の `createApp`) にそのまま委譲する。
 * - `checkTurn`: Cron Trigger から呼ばれる RPC。`turnService.advanceTurnIfDue` を呼ぶだけで、
 *   ターン境界を跨いだかどうかの判定は turnService 側 (`unitTimeSec` と `game.last_time`) に任せる。
 */
export class HakoniwaGame extends DurableObject<Env> {
  #deps: BuiltDeps | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // constructor 内では await しない (blockConcurrencyWhile が完了するまで fetch/checkTurn は
    // 呼ばれないので、このまま Promise を返さなくてよい)。
    void ctx.blockConcurrencyWhile(async () => {
      const driver = new DurableObjectSqlDriver(ctx.storage);
      const config = loadConfigFromEnv(pickStringEnv(env));
      migrate(driver, { defaultUnitTimeSec: config.game.unitTimeSec });
      const backupStore = new BookmarkBackupStore(ctx);
      const clock = { now: () => Math.floor(Date.now() / 1000) };
      this.#deps = buildDeps({ driver, backupStore, clock, config, turnCheckOnRequest: false });
    });
  }

  override fetch(request: Request): Response | Promise<Response> {
    return this.#requireDeps().app.fetch(request);
  }

  /** Cron Trigger から呼ばれる。進めたターン数を返す。 */
  checkTurn(): number {
    const now = Math.floor(Date.now() / 1000);
    return this.#requireDeps().turnService.advanceTurnIfDue(now);
  }

  #requireDeps(): BuiltDeps {
    if (this.#deps === undefined) {
      // blockConcurrencyWhile が完了する前に fetch/checkTurn が呼ばれることは無いはずだが、
      // 型上 undefined を許すため防御的にエラーにする。
      throw new Error("HakoniwaGame: not initialized yet");
    }
    return this.#deps;
  }
}

/**
 * `env` (バインディングを含む) から、`loadConfigFromEnv` が読む文字列の環境変数だけを取り出す。
 * `GAME` (DurableObjectNamespace) 等のバインディングは文字列ではないため除外される。
 */
function pickStringEnv(env: Env): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
