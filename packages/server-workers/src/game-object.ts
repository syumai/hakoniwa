// tmp/12-workers-adapter.md 「Worker エントリ (worker.ts, game-object.ts) の骨子」節の実装。
// 1 インスタンス = ゲーム世界 1 つ。DO の SQLite ストレージに Node 版と同じスキーマを構築し、
// @hakoniwa/game の buildDeps で組み立てた Hono app にそのまま委譲する。
import { DurableObject } from "cloudflare:workers";
import {
  AppError,
  buildDeps,
  buildSeasonVM,
  loadConfigFromEnv,
  migrate,
  toAuthUser,
} from "@hakoniwa/game";
import type { AuthUserRef, BuiltDeps } from "@hakoniwa/game";
import { BookmarkBackupStore } from "./backup.ts";
import { DurableObjectSqlDriver } from "./driver.ts";
import type { Env } from "./env.ts";
import { computeSnapshotTtl, loadSnapshotTtlConfig, toIslandPageSnapshotVM } from "./snapshot.ts";
import type {
  PageSnapshotRequest,
  PageSnapshotResult,
  ViewerSnapshotEnvelope,
} from "./snapshot.ts";

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
      this.#deps = buildDeps({ driver, backupStore, clock, config });
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

  /**
   * tmp/21-kv-snapshot-cache.md: トップ/観光ページ用の RPC。worker.ts が KV キャッシュを
   * 外した (ミスした) ときに呼ぶ。対象のゲーム/島が無ければ `undefined` を返し、
   * 呼び出し側は従来どおり `fetch` (DO への HTTP 転送) にフォールバックする。
   * TTL はここ (DO 側) で決める (Worker 側に「不変かどうか」の判定を持たせないため)。
   *
   * 「ログイン中も KV から返す」節: `cookieHeader` (Cookie ヘッダの値) を渡すと、ページの vm と
   * 同じこの 1 回の呼び出しでセッションもあわせて解決し、結果の `viewer` を返す
   * (ページ用と viewer 用で RPC を 2 回呼ばないため。DO への往復は従来と同じ 1 回のまま)。
   * `cookieHeader` を渡さなければ `viewer` は返さない (undefined のまま)。
   */
  async pageSnapshot(
    input: PageSnapshotRequest,
    cookieHeader?: string,
  ): Promise<PageSnapshotResult | undefined> {
    const deps = this.#requireDeps();
    const { ttlSec, ttlImmutableSec } = loadSnapshotTtlConfig(this.env);
    const now = Math.floor(Date.now() / 1000);
    try {
      if (input.kind === "top") {
        const vm = deps.gameService.getTopPage(undefined, input.gameId);
        const nextTurnAt = vm.season.nextTurnAt;
        const ttl = computeSnapshotTtl({
          kind: "top",
          isCurrent: vm.game.isCurrent,
          seasonState: vm.season.state,
          nextTurnAt,
          now,
          ttlSec,
          ttlImmutableSec,
        });
        const viewer = await this.#resolveViewer(deps, input.gameId, cookieHeader);
        return { kind: "top", vm, nextTurnAt, ttl, ...(viewer !== undefined ? { viewer } : {}) };
      }
      const vm = deps.gameService.getIslandPage(input.gameId, input.islandId);
      // IslandPageVM には season が無いため、TTL 判定用に別途取得する
      // (getIslandPage が成功した時点でゲームの存在は確認済み)。
      const season = buildSeasonVM(deps.repo.getMeta(input.gameId));
      const ttl = computeSnapshotTtl({
        kind: "island",
        isCurrent: vm.game.isCurrent,
        seasonState: season.state,
        nextTurnAt: season.nextTurnAt,
        now,
        ttlSec,
        ttlImmutableSec,
      });
      const viewer = await this.#resolveViewer(deps, input.gameId, cookieHeader);
      return {
        kind: "island",
        vm: toIslandPageSnapshotVM(vm),
        nextTurnAt: season.nextTurnAt,
        ttl,
        ...(viewer !== undefined ? { viewer } : {}),
      };
    } catch (err) {
      if (err instanceof AppError) {
        // ゲーム/島が無い、未初期化等。呼び出し側 (worker.ts) が DO への通常の fetch に
        // フォールバックし、いつもどおりのエラー画面 (app.onError) を出す。
        return undefined;
      }
      throw err;
    }
  }

  /**
   * `cookieHeader` からセッションを解決する。`cookieHeader` が無ければ「viewer を要求していない」
   * ことを表す `undefined` を返す (呼び出し側はこれを KV に書かない)。Cookie があっても
   * セッションが不正・期限切れなら `{ authenticated: false }` を返す (匿名として同じキーに
   * キャッシュしてよい値)。email はキャッシュしないため `AuthUserRef` (id/name/isAdmin) だけ
   * 取り出す。
   */
  async #resolveViewer(
    deps: BuiltDeps,
    gameId: number,
    cookieHeader: string | undefined,
  ): Promise<ViewerSnapshotEnvelope | undefined> {
    if (cookieHeader === undefined) {
      return undefined;
    }
    const session = await deps.auth.api.getSession({
      headers: new Headers({ cookie: cookieHeader }),
    });
    if (session === null) {
      return { authenticated: false };
    }
    const authUser = toAuthUser(session.user, deps.config.auth.adminEmails);
    const user: AuthUserRef = { id: authUser.id, name: authUser.name, isAdmin: authUser.isAdmin };
    const hasIsland = deps.repo.findIslandByOwner(gameId, authUser.id) !== undefined;
    return { authenticated: true, sessionId: session.session.id, user, hasIsland };
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
 * `GAME` (DurableObjectNamespace)・`SNAPSHOT` (KVNamespace) 等のバインディングは文字列では
 * ないため除外される。worker.ts も同じ `AppConfig` を組み立てるために export する
 * (tmp/21-kv-snapshot-cache.md: Worker 側レンダリングに `GameConfig`/timezone が要る)。
 */
export function pickStringEnv(env: Env): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
