// tmp/16-season.md 「定義」「状態判定」節 + tmp/18-games.md 「定義」節の移植。
// 開始時刻・最終ターン・状態列からゲームの状態を判定する。
import type { GameMeta, GameStatus } from "./ports.ts";

/**
 * 終了状態。tmp/18-games.md: 最終ターン到達か手動終了で `status` が 'finished' になる
 * (従来の `turn > finalTurn` 判定を状態列に昇格させた)。
 */
export function isFinished(meta: GameMeta): boolean {
  return meta.status === "finished";
}

/**
 * 開始前: まだ開始時刻に達していない (終了していないゲームに限る)。
 * 設計書との差異: tmp/16-season.md「開始前の状態 (追加要件)」節により、`turn === 1` かどうかは
 * 問わず `now < startAt` だけで判定する (以前は `turn === 1 &&` も条件にしていたが、
 * `startAt` はターン1の間しか動かせないため実質的な挙動は変わらない。判定の意図を
 * `now < startAt` 単独で表せるよう明示的に外した)。
 */
export function isBeforeStart(meta: GameMeta, now: number): boolean {
  return !isFinished(meta) && now < meta.startAt;
}

export type SeasonState = "before" | "running" | "finished";

/** トップ/開発/管理画面が共通で使うシーズンの状態。tmp/18-games.md でゲーム識別情報を追加。 */
export interface SeasonVM {
  /** tmp/18-games.md。 */
  gameId: number;
  gameName: string;
  status: GameStatus;
  turn: number;
  finalTurn: number | null;
  state: SeasonState;
  /** ターン1が始まる (始まった) unix 秒。 */
  startAt: number;
  /**
   * 終了時のみ、終了時点のターン番号。最終ターン到達で終了した場合は finalTurn、
   * 管理者による手動終了の場合は終了時点の turn。
   */
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
 * tmp/18-games.md: `gameId`/`gameName`/`status` を追加。
 */
export function buildSeasonVM(meta: GameMeta, now: number): SeasonVM {
  const finished = isFinished(meta);
  const state: SeasonState = finished
    ? "finished"
    : isBeforeStart(meta, now)
      ? "before"
      : "running";
  const finishedAtTurn = finished
    ? meta.finalTurn !== null && meta.turn > meta.finalTurn
      ? meta.finalTurn
      : meta.turn
    : null;
  return {
    gameId: meta.id,
    gameName: meta.name,
    status: meta.status,
    turn: meta.turn,
    finalTurn: meta.finalTurn,
    state,
    startAt: meta.startAt,
    finishedAtTurn,
    nextTurnAt: state === "running" ? meta.lastTime + meta.unitTimeSec : null,
    unitTimeSec: meta.unitTimeSec,
  };
}
