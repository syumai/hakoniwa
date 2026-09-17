// tmp/12-workers-adapter.md 「Worker エントリ (worker.ts, game-object.ts) の骨子」節。
// 型定義と TODO のみ。実装 (DurableObject 基底クラスへの接続、migrate/buildDeps の呼び出し、
// loadWorkersConfig、BookmarkBackupStore との配線) は次フェーズで行う。
// @cloudflare/workers-types・cloudflare:workers は依存に追加せず、この骨子が必要とする
// 最小限の型をローカルに定義する (driver.ts と同じ方針)。
import type { DurableObjectStorageLike } from "./driver.ts";

/** `ctx` (DurableObjectState) のうち、この骨子が使う部分だけのローカル型。 */
export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  blockConcurrencyWhile(fn: () => Promise<void>): void;
}

/** Worker から DO への呼び出し面 (fetch は HTTP 転送、checkTurn は Cron 用 RPC)。 */
export interface HakoniwaGameStub {
  fetch(request: Request): Response | Promise<Response>;
  checkTurn(): number | Promise<number>;
}

/** `env.GAME` (Durable Object Namespace) のローカル型。 */
export interface DurableObjectNamespaceLike {
  getByName(name: string): HakoniwaGameStub;
}

/** wrangler.jsonc の bindings/vars に対応する。実装時に HAKONIWA_* を足す。 */
export interface Env {
  GAME: DurableObjectNamespaceLike;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** Cron Trigger の scheduled ハンドラに渡される値のうち使う部分だけ。 */
export interface ScheduledControllerLike {
  cron: string;
}

/**
 * 1 インスタンス = ゲーム世界 1 つ。tmp/12-workers-adapter.md 「構成」節。
 *
 * 実装は次フェーズ:
 * - 本来は `cloudflare:workers` の `DurableObject<Env>` を継承する。
 * - コンストラクタで `ctx.blockConcurrencyWhile` の中で `DurableObjectSqlDriver` (driver.ts) を
 *   作り、`migrate()` を適用してから `buildDeps()` (`@hakoniwa/game`) を呼ぶ
 *   (`loadWorkersConfig(env)`、`BookmarkBackupStore` との配線を含む)。
 * - `fetch`/`checkTurn` は組み立てた `app`/`turnService` に委譲する。
 */
export class HakoniwaGame {
  constructor(_ctx: DurableObjectStateLike, _env: Env) {
    // TODO: 次フェーズで実装する (クラスコメント参照)。
  }

  fetch(_request: Request): Response | Promise<Response> {
    throw new Error("not implemented");
  }

  /** Cron Trigger から呼ばれる。進めたターン数を返す。 */
  checkTurn(): number | Promise<number> {
    throw new Error("not implemented");
  }
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return env.GAME.getByName("main").fetch(request);
  },
  scheduled(_controller: ScheduledControllerLike, env: Env, ctx: ExecutionContextLike): void {
    ctx.waitUntil(Promise.resolve(env.GAME.getByName("main").checkTurn()));
  },
};
