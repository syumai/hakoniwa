// tmp/04-database.md 「リポジトリインターフェース」+ tmp/18-games.md (複数ゲーム) の実 SQLite 実装。
// 意味論は packages/game/src/app/fake-repository.ts (テスト用インメモリ実装) と揃える。
import type {
  CreateGameInput,
  GameMeta,
  GameRepository,
  GameStatus,
  GameSummary,
  IslandSummary,
  ListLogsQuery,
  UserPrefs,
} from "../app/ports.ts";
import type { HistoryEntry, Island, LbbsPost, LogEntry } from "../core/types.ts";
import type { SqlDriver, SqlParam } from "./driver.ts";
import { IslandMapper } from "./mapper.ts";
import type { IslandRow, LbbsRow } from "./mapper.ts";

interface GameRow {
  id: number;
  name: string;
  status: GameStatus;
  turn: number;
  first_turn: number;
  last_time: number;
  start_at: number;
  final_turn: number | null;
  unit_time_sec: number;
  next_island_id: number;
  created_at: number;
  finished_at: number | null;
}

interface LogRow {
  turn: number;
  seq: number;
  secret: number;
  island_id: number;
  target_id: number;
  html: string;
}

interface HistoryRow {
  turn: number;
  html: string;
}

const ISLAND_UPDATE_COLUMNS_SQL = `
  name = ?, owner_user_id = ?, comment = ?, score = ?, absent = ?, money = ?, food = ?,
  pop = ?, area = ?, farm = ?, factory = ?, mountain = ?,
  prize_flags = ?, prize_monsters = ?, prize_turns = ?, terrain = ?, commands = ?, abandoned_at = ?
`;

/** `SqliteGameRepository.islandToColumnValues` の結果を UPDATE のバインド順に並べたもの。 */
function columnValuesToParams(v: ReturnType<IslandMapper["islandToColumnValues"]>): SqlParam[] {
  return [
    v.name,
    v.ownerUserId,
    v.comment,
    v.score,
    v.absent,
    v.money,
    v.food,
    v.pop,
    v.area,
    v.farm,
    v.factory,
    v.mountain,
    v.prizeFlags,
    v.prizeMonsters,
    v.prizeTurns,
    v.terrain,
    v.commands,
    v.abandonedAt,
  ];
}

function rowToMeta(row: GameRow): GameMeta {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    turn: row.turn,
    firstTurn: row.first_turn,
    lastTime: row.last_time,
    startAt: row.start_at,
    finalTurn: row.final_turn,
    unitTimeSec: row.unit_time_sec,
    nextIslandId: row.next_island_id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export interface SqliteGameRepositoryConfig {
  islandSize: number;
  commandMax: number;
}

/** `GameRepository` の SQLite (node:sqlite / DO SQLite 共通) 実装。 */
export class SqliteGameRepository implements GameRepository {
  readonly #driver: SqlDriver;
  readonly #mapper: IslandMapper;

  constructor(driver: SqlDriver, config: SqliteGameRepositoryConfig) {
    this.#driver = driver;
    this.#mapper = new IslandMapper(config);
  }

  transaction<T>(fn: () => T): T {
    return this.#driver.transaction(fn);
  }

  isInitialized(): boolean {
    return this.getCurrentGameId() !== undefined;
  }

  listGames(): GameSummary[] {
    const rows = this.#driver.all<GameRow & { island_count: number }>(
      `SELECT g.id, g.name, g.status, g.turn, g.last_time, g.start_at, g.final_turn,
              g.unit_time_sec, g.next_island_id, g.created_at, g.finished_at,
              (SELECT COUNT(*) FROM islands i WHERE i.game_id = g.id) AS island_count
       FROM games g
       ORDER BY g.id DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      startAt: row.start_at,
      finishedAt: row.finished_at,
      turn: row.turn,
      finalTurn: row.final_turn,
      islandCount: row.island_count,
    }));
  }

  getCurrentGameId(): number | undefined {
    const row = this.#driver.get<{ id: number | null }>("SELECT MAX(id) AS id FROM games");
    return row?.id ?? undefined;
  }

  getMeta(gameId: number): GameMeta {
    const row = this.#driver.get<GameRow>(
      `SELECT id, name, status, turn, first_turn, last_time, start_at, final_turn, unit_time_sec,
              next_island_id, created_at, finished_at
       FROM games WHERE id = ?`,
      gameId,
    );
    if (row === undefined) {
      throw new Error(`SqliteGameRepository: game not found: ${gameId}`);
    }
    return rowToMeta(row);
  }

  saveMeta(meta: GameMeta): void {
    this.#driver.run(
      `UPDATE games SET name = ?, status = ?, turn = ?, first_turn = ?, last_time = ?, start_at = ?,
       final_turn = ?, unit_time_sec = ?, next_island_id = ?, finished_at = ? WHERE id = ?`,
      meta.name,
      meta.status,
      meta.turn,
      meta.firstTurn,
      meta.lastTime,
      meta.startAt,
      meta.finalTurn,
      meta.unitTimeSec,
      meta.nextIslandId,
      meta.finishedAt,
      meta.id,
    );
  }

  createGame(input: CreateGameInput, now: number): number {
    // tmp/16-season.md「開始前の状態 = ターン 0 (改訂 2026-09-20)」節: 新規ゲームは
    // turn=0, first_turn=0 で作る (開始前)。startAt に最初のターン処理が行われて turn=1 になる。
    const row = this.#driver.get<{ id: number }>(
      `INSERT INTO games (
         name, status, turn, first_turn, last_time, start_at, final_turn, unit_time_sec,
         next_island_id, created_at, finished_at
       ) VALUES (?, 'running', 0, 0, ?, ?, ?, ?, 1, ?, NULL)
       RETURNING id`,
      input.name,
      input.startAt,
      input.startAt,
      input.finalTurn,
      input.unitTimeSec,
      now,
    );
    if (row === undefined) {
      throw new Error("SqliteGameRepository: createGame failed");
    }
    return row.id;
  }

  finishGame(gameId: number, now: number): void {
    this.#driver.run(
      "UPDATE games SET status = 'finished', finished_at = ? WHERE id = ?",
      now,
      gameId,
    );
  }

  tryBumpTurn(gameId: number, expectedTurn: number, next: GameMeta): boolean {
    this.#driver.run(
      `UPDATE games SET name = ?, status = ?, turn = ?, first_turn = ?, last_time = ?, start_at = ?,
       final_turn = ?, unit_time_sec = ?, next_island_id = ?, finished_at = ?
       WHERE id = ? AND turn = ? AND status = 'running'`,
      next.name,
      next.status,
      next.turn,
      next.firstTurn,
      next.lastTime,
      next.startAt,
      next.finalTurn,
      next.unitTimeSec,
      next.nextIslandId,
      next.finishedAt,
      gameId,
      expectedTurn,
    );
    const row = this.#driver.get<{ n: number }>("SELECT changes() AS n");
    return (row?.n ?? 0) > 0;
  }

  listIslandSummaries(gameId: number): IslandSummary[] {
    const rows = this.#driver.all<IslandRow>(
      "SELECT * FROM islands WHERE game_id = ? ORDER BY rank ASC",
      gameId,
    );
    return rows.map((row) => this.#mapper.rowToSummary(row));
  }

  loadAllIslands(gameId: number): Island[] {
    const rows = this.#driver.all<IslandRow>(
      "SELECT * FROM islands WHERE game_id = ? ORDER BY rank ASC",
      gameId,
    );
    return rows.map((row) => this.#toIsland(gameId, row));
  }

  findIsland(gameId: number, id: number): Island | undefined {
    const row = this.#driver.get<IslandRow>(
      "SELECT * FROM islands WHERE game_id = ? AND id = ?",
      gameId,
      id,
    );
    return row === undefined ? undefined : this.#toIsland(gameId, row);
  }

  findIslandByName(gameId: number, name: string): IslandSummary | undefined {
    const row = this.#driver.get<IslandRow>(
      "SELECT * FROM islands WHERE game_id = ? AND name = ?",
      gameId,
      name,
    );
    return row === undefined ? undefined : this.#mapper.rowToSummary(row);
  }

  findIslandByOwner(gameId: number, userId: string): IslandSummary | undefined {
    const row = this.#driver.get<IslandRow>(
      "SELECT * FROM islands WHERE game_id = ? AND owner_user_id = ? AND abandoned_at IS NULL",
      gameId,
      userId,
    );
    return row === undefined ? undefined : this.#mapper.rowToSummary(row);
  }

  #toIsland(gameId: number, row: IslandRow): Island {
    const lbbsRows = this.#lbbsRows(gameId, row.id);
    return this.#mapper.rowToIsland(row, lbbsRows);
  }

  #lbbsRows(gameId: number, islandId: number): LbbsRow[] {
    return this.#driver.all<LbbsRow>(
      "SELECT * FROM lbbs_posts WHERE game_id = ? AND island_id = ? ORDER BY position ASC",
      gameId,
      islandId,
    );
  }

  #currentTurn(gameId: number): number {
    const row = this.#driver.get<{ turn: number }>("SELECT turn FROM games WHERE id = ?", gameId);
    return row?.turn ?? 0;
  }

  insertIsland(gameId: number, island: Island, rank: number): void {
    const v = this.#mapper.islandToColumnValues(island);
    const createdTurn = this.#currentTurn(gameId);
    this.#driver.run(
      `INSERT INTO islands (
         game_id, id, rank, name, owner_user_id, comment, score, absent, money, food,
         pop, area, farm, factory, mountain,
         prize_flags, prize_monsters, prize_turns, terrain, commands, created_turn, abandoned_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      gameId,
      v.id,
      rank,
      v.name,
      v.ownerUserId,
      v.comment,
      v.score,
      v.absent,
      v.money,
      v.food,
      v.pop,
      v.area,
      v.farm,
      v.factory,
      v.mountain,
      v.prizeFlags,
      v.prizeMonsters,
      v.prizeTurns,
      v.terrain,
      v.commands,
      createdTurn,
      v.abandonedAt,
    );
    this.#syncLbbs(gameId, island.id, island.lbbs);
  }

  /** rank 以外の全列 + lbbs (replaceLbbs 相当) を更新する。fake-repository.ts の updateIsland と同じ意味論。 */
  updateIsland(gameId: number, island: Island): void {
    const v = this.#mapper.islandToColumnValues(island);
    this.#driver.run(
      `UPDATE islands SET ${ISLAND_UPDATE_COLUMNS_SQL} WHERE game_id = ? AND id = ?`,
      ...columnValuesToParams(v),
      gameId,
      v.id,
    );
    this.#syncLbbs(gameId, island.id, island.lbbs);
  }

  /**
   * ターン処理後: 渡された順に rank を振り直し、含まれない ID (死滅島) を掲示板ごと削除する。
   * rank は (game_id, rank) UNIQUE 制約があるため 2 パスで行う: 対象ゲームの全行を負値へ退避 →
   * 各島を確定した rank で UPDATE。最後まで負値のまま残った行 (= 渡された配列に無かった既存島)
   * を削除する。
   */
  replaceAllIslands(gameId: number, islands: Island[]): void {
    this.#driver.run("UPDATE islands SET rank = -rank - 1 WHERE game_id = ?", gameId);
    islands.forEach((island, index) => {
      const v = this.#mapper.islandToColumnValues(island);
      this.#driver.run(
        `UPDATE islands SET rank = ?, ${ISLAND_UPDATE_COLUMNS_SQL} WHERE game_id = ? AND id = ?`,
        index,
        ...columnValuesToParams(v),
        gameId,
        v.id,
      );
      this.#syncLbbs(gameId, island.id, island.lbbs);
    });
    this.#driver.run(
      `DELETE FROM lbbs_posts WHERE game_id = ? AND island_id IN
       (SELECT id FROM islands WHERE game_id = ? AND rank < 0)`,
      gameId,
      gameId,
    );
    this.#driver.run("DELETE FROM islands WHERE game_id = ? AND rank < 0", gameId);
  }

  deleteIsland(gameId: number, id: number): void {
    this.#driver.run("DELETE FROM lbbs_posts WHERE game_id = ? AND island_id = ?", gameId, id);
    this.#driver.run("DELETE FROM islands WHERE game_id = ? AND id = ?", gameId, id);
  }

  replaceLbbs(gameId: number, islandId: number, posts: LbbsPost[]): void {
    this.#syncLbbs(gameId, islandId, posts);
  }

  #syncLbbs(gameId: number, islandId: number, posts: LbbsPost[]): void {
    this.#driver.run(
      "DELETE FROM lbbs_posts WHERE game_id = ? AND island_id = ?",
      gameId,
      islandId,
    );
    posts.forEach((post, position) => {
      this.#driver.run(
        `INSERT INTO lbbs_posts (game_id, island_id, position, author, user_id, name, message, turn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        gameId,
        islandId,
        position,
        post.author,
        post.userId,
        post.name,
        post.message,
        post.turn,
      );
    });
  }

  appendLogs(gameId: number, entries: LogEntry[]): void {
    for (const entry of entries) {
      this.#driver.run(
        "INSERT INTO logs (game_id, turn, seq, secret, island_id, target_id, html) VALUES (?, ?, ?, ?, ?, ?, ?)",
        gameId,
        entry.turn,
        entry.seq,
        entry.secret ? 1 : 0,
        entry.islandId,
        entry.targetId,
        entry.html,
      );
    }
  }

  /** 04-database.md 「ログの取得ルール」節の SQL 化。 */
  listLogs(gameId: number, q: ListLogsQuery): LogEntry[] {
    const conditions: string[] = ["game_id = ?", "turn >= ?"];
    const params: SqlParam[] = [gameId, q.sinceTurn];

    if (q.islandId !== undefined) {
      conditions.push("(island_id = ? OR target_id = ?)");
      params.push(q.islandId, q.islandId);
    }

    if (q.includeSecretFor !== undefined) {
      conditions.push("(secret = 0 OR (secret = 1 AND island_id = ?))");
      params.push(q.includeSecretFor);
    } else {
      conditions.push("secret = 0");
    }

    const sql = `SELECT turn, seq, secret, island_id, target_id, html FROM logs
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY turn DESC, seq ASC`;
    const rows = this.#driver.all<LogRow>(sql, ...params);
    return rows.map((row) => ({
      turn: row.turn,
      secret: row.secret === 1,
      islandId: row.island_id,
      targetId: row.target_id,
      html: row.html,
      seq: row.seq,
    }));
  }

  deleteLogsBefore(gameId: number, turn: number): void {
    this.#driver.run("DELETE FROM logs WHERE game_id = ? AND turn < ?", gameId, turn);
  }

  appendHistory(gameId: number, entries: HistoryEntry[]): void {
    for (const entry of entries) {
      this.#driver.run(
        "INSERT INTO history (game_id, turn, html) VALUES (?, ?, ?)",
        gameId,
        entry.turn,
        entry.html,
      );
    }
  }

  listHistory(gameId: number, limit: number): HistoryEntry[] {
    const rows = this.#driver.all<HistoryRow>(
      "SELECT turn, html FROM history WHERE game_id = ? ORDER BY id DESC LIMIT ?",
      gameId,
      limit,
    );
    return rows.map((row) => ({ turn: row.turn, html: row.html }));
  }

  trimHistory(gameId: number, keep: number): void {
    this.#driver.run(
      `DELETE FROM history WHERE game_id = ? AND id NOT IN
       (SELECT id FROM history WHERE game_id = ? ORDER BY id DESC LIMIT ?)`,
      gameId,
      gameId,
      keep,
    );
  }

  countAbandonments(gameId: number, userId: string): number {
    const row = this.#driver.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM abandonments WHERE game_id = ? AND user_id = ?",
      gameId,
      userId,
    );
    return row?.n ?? 0;
  }

  recordAbandonment(
    gameId: number,
    userId: string,
    islandId: number,
    islandName: string,
    abandonedAt: number,
  ): void {
    this.#driver.run(
      `INSERT INTO abandonments (game_id, user_id, island_id, island_name, abandoned_at)
       VALUES (?, ?, ?, ?, ?)`,
      gameId,
      userId,
      islandId,
      islandName,
      abandonedAt,
    );
  }

  reset(): void {
    this.#driver.exec(
      `DELETE FROM lbbs_posts;
       DELETE FROM islands;
       DELETE FROM logs;
       DELETE FROM history;
       DELETE FROM games;
       DELETE FROM backups;
       DELETE FROM abandonments;`,
    );
  }

  getUserPrefs(userId: string): UserPrefs | undefined {
    const row = this.#driver.get<{ prefs: string }>(
      "SELECT prefs FROM user_prefs WHERE user_id = ?",
      userId,
    );
    if (row === undefined) {
      return undefined;
    }
    return JSON.parse(row.prefs) as UserPrefs;
  }

  setUserPrefs(userId: string, prefs: UserPrefs): void {
    this.#driver.run(
      `INSERT INTO user_prefs (user_id, prefs) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET prefs = excluded.prefs`,
      userId,
      JSON.stringify(prefs),
    );
  }
}
