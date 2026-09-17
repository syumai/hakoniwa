// Perl 版 hakojima.dat / island.N / hakojima.logN / hakojima.his へのアクセスを抽象化する。
// tmp/04-database.md の「リポジトリインターフェース」節の移植。
// 実装 (SqliteGameRepository 等) は Phase 3b (storage 層) で行う。
import type { HistoryEntry, Island, LbbsPost, LogEntry, Prize } from "../core/types.ts";

/** Perl 版 hakojima.dat 先頭 4 行 (島の数は listIslandSummaries().length で代替)。 */
export interface GameMeta {
  turn: number;
  lastTime: number;
  nextIslandId: number;
}

/** 一覧用の軽量な島情報。地形・コマンド・掲示板を含まない (トップ画面/セレクト用)。 */
export interface IslandSummary {
  id: number;
  name: string;
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
 * ゲームデータへの読み書きを抽象化するリポジトリ。
 * `transaction` 内では await しない (同期セクション。02-architecture.md 「同時実行とロック」参照)。
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
  /** 全テーブルの行を削除する (管理用)。 */
  reset(): void;
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

export interface PasswordHasher {
  hash(p: string): Promise<string>;
  verify(p: string, h: string): Promise<boolean>;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}
