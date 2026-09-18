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
  /**
   * 1 ターンの長さ (秒)。tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節: `meta.unitTimeSec`
   * をそのまま転記したもの。トップ/管理画面の「1 ターン = N時間M分」表示に使う。
   */
  unitTimeSec: number;
}

/**
 * `GameMeta` から `SeasonVM` を組み立てる。
 * 設計書との差異: tmp/16-season.md は `buildSeasonVM(meta, now, unitTimeSec)` だったが、
 * 追加要件「ターンの長さも DB に持つ」により `unitTimeSec` は `meta.unitTimeSec` を使うため、
 * 引数からは外した (呼び出し元で `config.unitTimeSec` を渡す必要が無くなった)。
 */
export function buildSeasonVM(meta: GameMeta, now: number): SeasonVM {
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
    nextTurnAt: state === "running" ? meta.lastTime + meta.unitTimeSec : null,
    unitTimeSec: meta.unitTimeSec,
  };
}
