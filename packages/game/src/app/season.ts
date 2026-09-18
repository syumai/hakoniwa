// tmp/16-season.md 「定義」「状態判定」節の移植。開始時刻・最終ターンからゲームの状態を判定する。
import type { GameMeta } from "./ports.ts";

/** 終了状態: 最終ターンが設定されており、かつ turn がそれを超えている。 */
export function isFinished(meta: GameMeta): boolean {
  return meta.finalTurn !== null && meta.turn > meta.finalTurn;
}

/** 開始前: ターン1のまま、まだ開始時刻に達していない。 */
export function isBeforeStart(meta: GameMeta, now: number): boolean {
  return meta.turn === 1 && now < meta.startAt;
}

export type SeasonState = "before" | "running" | "finished";

/** トップ/開発/管理画面が共通で使うシーズンの状態。 */
export interface SeasonVM {
  turn: number;
  finalTurn: number | null;
  state: SeasonState;
  /** ターン1が始まる (始まった) unix 秒。 */
  startAt: number;
  /** 終了時のみ、終了時点のターン番号 (= finalTurn)。 */
  finishedAtTurn: number | null;
  /**
   * 次のターンが進む予定の unix 秒。`state === 'running'` のときだけ `lastTime + unitTimeSec`、
   * それ以外 (開始前・終了後) は null。トップ画面の「次のターン: …」表示に使う。
   */
  nextTurnAt: number | null;
}

/** `GameMeta` から `SeasonVM` を組み立てる。 */
export function buildSeasonVM(meta: GameMeta, now: number, unitTimeSec: number): SeasonVM {
  const finished = isFinished(meta);
  const state: SeasonState = finished
    ? "finished"
    : isBeforeStart(meta, now)
      ? "before"
      : "running";
  return {
    turn: meta.turn,
    finalTurn: meta.finalTurn,
    state,
    startAt: meta.startAt,
    finishedAtTurn: finished ? meta.finalTurn : null,
    nextTurnAt: state === "running" ? meta.lastTime + unitTimeSec : null,
  };
}
