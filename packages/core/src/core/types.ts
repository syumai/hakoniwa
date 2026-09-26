// Perl 版の Variable.pm (グローバル変数) に相当する型定義。
import { CommandKind, type LandKind } from "./constants.ts";

/** 1 マスの地形。Perl の land[x][y] / landValue[x][y] を統合。 */
export interface Hex {
  kind: LandKind;
  value: number;
}

/** 12x12 の地形。 */
export interface Terrain {
  readonly size: number;
  /** 範囲外は throw する。呼び出し側が inBounds で確認すること。 */
  get(x: number, y: number): Hex;
  set(x: number, y: number, hex: Hex): void;
  setKind(x: number, y: number, kind: LandKind, value?: number): void;
  clone(): Terrain;
  /** [[kind,value], ...] 行優先 (y, x)。 */
  toJSON(): number[][];
}

/** 開発計画 1 件。 */
export interface Command {
  kind: CommandKind;
  target: number;
  x: number;
  y: number;
  arg: number;
}

/** 資金繰り (Perl の $HcomDoNothing 相当) の空コマンド。 */
export const doNothingCommand: Command = {
  kind: CommandKind.DoNothing,
  target: 0,
  x: 0,
  y: 0,
  arg: 0,
};

/** 島の受賞状況。Perl の "flags,monsters,turn1,turn2,..." 文字列を構造化したもの。 */
export interface Prize {
  flags: number;
  monsters: number;
  turns: number[];
}

export type LbbsAuthor = "visitor" | "owner";

/** ローカル掲示板の投稿 1 件。 */
export interface LbbsPost {
  author: LbbsAuthor;
  /** 投稿者の better-auth user.id。 */
  userId: string;
  name: string;
  message: string;
  turn: number;
}

/** 島 1 つのデータ。 */
export interface Island {
  id: number;
  name: string;
  /** 島主の better-auth user.id (1 ユーザー 1 島。UNIQUE)。 */
  ownerUserId: string;
  comment: string;
  score: number;
  absent: number;
  money: number;
  food: number;
  pop: number;
  area: number;
  farm: number;
  factory: number;
  mountain: number;
  prize: Prize;
  terrain: Terrain;
  /** 長さは常に config.commandMax。 */
  commands: Command[];
  /** 長さ ≤ lbbsMax。先頭が最新。 */
  lbbs: LbbsPost[];
  /**
   * 放棄した unix 秒。NULL = 有効。tmp/19-abandon.md「データ (スキーマ v6)」節。
   * 放棄後も owner_user_id は履歴のため残すが、所有判定 (findIslandByOwner) からは除外される。
   */
  abandonedAt: number | null;
}

/** ターン処理中だけ使う作業用フィールド。永続化しない。 */
export interface TurnIslandState {
  oldPop: number;
  dead: boolean;
  /** 地ならし回数 → 地震確率。 */
  prepare2: number;
  /** 記念碑発射の着弾予定数。 */
  bigMissile: number;
  /** 人造怪獣の派遣予定数。 */
  monsterSend: number;
  propaganda: boolean;
}

/** 世界全体の状態。 */
export interface World {
  turn: number;
  /** unix 秒。ターン境界 (unitTimeSec で切り下げ済み)。 */
  lastTime: number;
  nextIslandId: number;
  /** 順位順 (index 0 が 1 位)。 */
  islands: Island[];
}

export interface LogEntry {
  turn: number;
  secret: boolean;
  /** 当事者 (0 = なし)。 */
  islandId: number;
  /** 相手 (0 = なし)。 */
  targetId: number;
  /** エスケープ済み HTML 断片。 */
  html: string;
  /** logFlush 後の表示順 (0 から)。 */
  seq: number;
}

export interface HistoryEntry {
  turn: number;
  html: string;
}
