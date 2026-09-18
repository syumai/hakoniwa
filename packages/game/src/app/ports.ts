// Perl 版 hakojima.dat / island.N / hakojima.logN / hakojima.his へのアクセスを抽象化する。
// tmp/04-database.md の「リポジトリインターフェース」節、tmp/14-users-auth.md の移植。
// 実装 (SqliteGameRepository 等) は storage 層が持つ。
import type { HistoryEntry, Island, LbbsPost, LogEntry, Prize } from "../core/types.ts";

/** Perl 版 hakojima.dat 先頭 4 行 (島の数は listIslandSummaries().length で代替)。 */
export interface GameMeta {
  turn: number;
  lastTime: number;
  nextIslandId: number;
  /** 最終ターン (tmp/16-season.md)。NULL なら無期限。 */
  finalTurn: number | null;
  /**
   * ターン1が始まる (始まった) unix 秒。tmp/16-season.md は `last_time` の初期値から逆算する
   * 設計だったが、`unitTimeSec` の変更に弱く分かりにくいため、DB に直接持つ列にした
   * (設計書との差異)。`initialize` 時に `lastTime` と同じ値で設定され、ターン1の間は
   * `setLastTime` (管理画面「最終更新時刻の変更」) が同期して更新する。ターン2以降は不変。
   */
  startAt: number;
}

/** 一覧用の軽量な島情報。地形・コマンド・掲示板を含まない (トップ画面/セレクト用)。 */
export interface IslandSummary {
  id: number;
  name: string;
  /** 島主の better-auth user.id。 */
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
}

export interface ListLogsQuery {
  /** この値以上の turn のログのみ返す。 */
  sinceTurn: number;
  /** 指定時: island_id = islandId OR target_id = islandId のログのみ返す。 */
  islandId?: number;
  /** 指定時: secret = 1 かつ island_id = includeSecretFor のログも含める (開発画面用)。 */
  includeSecretFor?: number;
}

/**
 * 計画登録フォームの初期値。tmp/14-users-auth.md「データモデル」の `user_prefs` 節。
 * v1 の `hako_defaults` Cookie の置き換え。ログイン中ユーザーごとに 1 件保持する。
 */
export interface UserPrefs {
  targetIslandId?: number;
  pointX?: number;
  pointY?: number;
  kind?: number;
}

/**
 * ゲームデータへの読み書きを抽象化するリポジトリ。
 * `transaction` 内では await しない (02-architecture.md 「同時実行とロック」参照)。
 */
export interface GameRepository {
  /** 同期トランザクション。fn 内では await しない。 */
  transaction<T>(fn: () => T): T;

  isInitialized(): boolean;
  getMeta(): GameMeta;
  saveMeta(meta: GameMeta): void;
  /** 楽観ロック: 現在の turn が expectedTurn のときだけ更新し、成功可否を返す。 */
  tryBumpTurn(expectedTurn: number, next: GameMeta): boolean;

  /** 一覧用: rank 昇順 (0 が 1 位)。 */
  listIslandSummaries(): IslandSummary[];
  /** 全島をフル (地形・コマンド・掲示板) で読み込む。ターン処理用。rank 昇順。 */
  loadAllIslands(): Island[];
  findIsland(id: number): Island | undefined;
  findIslandByName(name: string): IslandSummary | undefined;
  /** 1 ユーザー 1 島の制約の確認・自分の島の特定に使う。 */
  findIslandByOwner(userId: string): IslandSummary | undefined;

  insertIsland(island: Island, rank: number): void;
  /** rank 以外の全フィールドを更新する。 */
  updateIsland(island: Island): void;
  /** ターン処理後: 渡された順に rank を振り直し、含まれない ID (死滅島) を掲示板ごと削除する。 */
  replaceAllIslands(islands: Island[]): void;
  deleteIsland(id: number): void;

  replaceLbbs(islandId: number, posts: LbbsPost[]): void;

  appendLogs(entries: LogEntry[]): void;
  listLogs(q: ListLogsQuery): LogEntry[];
  /** turn 未満のログをすべて削除する。 */
  deleteLogsBefore(turn: number): void;

  appendHistory(entries: HistoryEntry[]): void;
  /** 新しい順に最大 limit 件。 */
  listHistory(limit: number): HistoryEntry[];
  trimHistory(keep: number): void;

  /** 空 DB に game 行を作る (既存データがあれば上書き)。 */
  initialize(meta: GameMeta): void;
  /** 全テーブルの行を削除する (管理用)。better-auth の 4 表・user_prefs は対象外。 */
  reset(): void;

  /** 計画登録フォームの初期値。未保存なら undefined。 */
  getUserPrefs(userId: string): UserPrefs | undefined;
  setUserPrefs(userId: string, prefs: UserPrefs): void;
}

export interface BackupInfo {
  label: string;
  createdAt: number;
  turn: number;
}

/** バックアップは同期セクションの外で行うため非同期でよい。 */
export interface BackupStore {
  list(): Promise<BackupInfo[]>;
  create(label: string, turn: number): Promise<void>;
  restore(label: string): Promise<void>;
  delete(label: string): Promise<void>;
  rotate(keep: number): Promise<void>;
}

/** unix 秒を返す時計。Date.now を直接使わずこれを注入する。 */
export interface Clock {
  now(): number;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

/**
 * メール送信の抽象化。tmp/14-users-auth.md 「メール送信」節。
 * better-auth の magicLink / emailVerification (changeEmail の確認リンク) から呼ばれる。
 */
export interface Mailer {
  send(mail: { to: string; subject: string; text: string }): Promise<void>;
}

/**
 * 単純な key-value 設定の保存。tmp/14-users-auth.md 「ログイン方法の設定 (settings 表)」節。
 * ゲームデータ (GameRepository) とは寿命・意味論が異なるため別ポートにする。
 */
export interface SettingsRepository {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}
