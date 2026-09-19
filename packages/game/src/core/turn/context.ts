// ターン処理中に共有する作業状態。Perl 版 Variable.pm のグローバル変数のうち
// ターン処理でのみ使うものをまとめる。
import type { GameConfig } from "../config.ts";
import type { Point } from "../geometry.ts";
import type { LogCollector } from "../log/collector.ts";
import type { Rng } from "../rng.ts";
import type { Island, TurnIslandState, World } from "../types.ts";

/**
 * ターン処理のコンテキスト。
 *
 * - `points`: `shuffledPoints` で作った座標配列 (Perl の makeRandomPointArray の結果)。
 * - `state`: 島 ID → ターン内作業状態 (`Island` 本体を汚さない。Perl は島ハッシュに直接
 *   `oldPop`/`dead`/`prepare2`/`bigmissile`/`monstersend`/`propaganda` を生やしていた)。
 * - `defenceCache`: 防衛施設の被弾判定キャッシュ (`@HdefenceHex` 相当)。
 *   B1: Perl は攻撃側 ID をキーにしていたが、内容は標的島の地形なので標的島 ID をキーにする。
 */
export interface TurnContext {
  config: GameConfig;
  rng: Rng;
  log: LogCollector;
  turn: number;
  points: Point[];
  state: Map<number, TurnIslandState>;
  defenceCache: Map<number, Int8Array>;
}

/** islandId のターン内作業状態を取得する。未登録なら初期値で作って登録する。 */
export function getState(ctx: TurnContext, islandId: number): TurnIslandState {
  let state = ctx.state.get(islandId);
  if (state === undefined) {
    state = {
      oldPop: 0,
      dead: false,
      prepare2: 0,
      bigMissile: 0,
      monsterSend: 0,
      propaganda: false,
    };
    ctx.state.set(islandId, state);
  }
  return state;
}

/**
 * World から id で島を探す。Perl の $HidToNumber{$id} 経由の島取得に相当。
 * tmp/19-abandon.md「対象外」節: 放棄島 (`abandonedAt !== null`) はターゲット解決から除外する
 * (見つからない扱いにし、呼び出し側の `logMsNoTarget` 経路で中止させる)。
 */
export function findIsland(world: World, id: number): Island | undefined {
  return world.islands.find((island) => island.id === id && island.abandonedAt === null);
}
