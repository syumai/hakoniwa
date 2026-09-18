// tmp/04-database.md 「リポジトリインターフェース」の実 SQLite 実装。
// 意味論は packages/game/src/app/fake-repository.ts (テスト用インメモリ実装) と揃える。
import type {
  GameMeta,
  GameRepository,
  IslandSummary,
  ListLogsQuery,
  UserPrefs,
} from "../app/ports.ts";
import type { HistoryEntry, Island, LbbsPost, LogEntry } from "../core/types.ts";
import type { SqlDriver, SqlParam } from "./driver.ts";
import { IslandMapper } from "./mapper.ts";
import type { IslandRow, LbbsRow } from "./mapper.ts";

interface GameRow {
  turn: number;
  last_time: number;
  next_island_id: number;
  final_turn: number | null;
  start_at: number;
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
  prize_flags = ?, prize_monsters = ?, prize_turns = ?, terrain = ?, commands = ?
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
  ];
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
    return this.#driver.get("SELECT id FROM game WHERE id = 1") !== undefined;
  }

  getMeta(): GameMeta {
    const row = this.#driver.get<GameRow>(
      "SELECT turn, last_time, next_island_id, final_turn, start_at FROM game WHERE id = 1",
    );
    if (row === undefined) {
      throw new Error("SqliteGameRepository: not initialized");
    }
    return {
      turn: row.turn,
      lastTime: row.last_time,
      nextIslandId: row.next_island_id,
      finalTurn: row.final_turn,
      startAt: row.start_at,
    };
  }

  saveMeta(meta: GameMeta): void {
    this.#driver.run(
      "UPDATE game SET turn = ?, last_time = ?, next_island_id = ?, final_turn = ?, start_at = ? WHERE id = 1",
      meta.turn,
      meta.lastTime,
      meta.nextIslandId,
      meta.finalTurn,
      meta.startAt,
    );
  }

  tryBumpTurn(expectedTurn: number, next: GameMeta): boolean {
    this.#driver.run(
      `UPDATE game SET turn = ?, last_time = ?, next_island_id = ?, final_turn = ?, start_at = ?
       WHERE id = 1 AND turn = ?`,
      next.turn,
      next.lastTime,
      next.nextIslandId,
      next.finalTurn,
      next.startAt,
      expectedTurn,
    );
    const row = this.#driver.get<{ n: number }>("SELECT changes() AS n");
    return (row?.n ?? 0) > 0;
  }

  listIslandSummaries(): IslandSummary[] {
    const rows = this.#driver.all<IslandRow>("SELECT * FROM islands ORDER BY rank ASC");
    return rows.map((row) => this.#mapper.rowToSummary(row));
  }

  loadAllIslands(): Island[] {
    const rows = this.#driver.all<IslandRow>("SELECT * FROM islands ORDER BY rank ASC");
    return rows.map((row) => this.#toIsland(row));
  }

  findIsland(id: number): Island | undefined {
    const row = this.#driver.get<IslandRow>("SELECT * FROM islands WHERE id = ?", id);
    return row === undefined ? undefined : this.#toIsland(row);
  }

  findIslandByName(name: string): IslandSummary | undefined {
    const row = this.#driver.get<IslandRow>("SELECT * FROM islands WHERE name = ?", name);
    return row === undefined ? undefined : this.#mapper.rowToSummary(row);
  }

  findIslandByOwner(userId: string): IslandSummary | undefined {
    const row = this.#driver.get<IslandRow>(
      "SELECT * FROM islands WHERE owner_user_id = ?",
      userId,
    );
    return row === undefined ? undefined : this.#mapper.rowToSummary(row);
  }

  #toIsland(row: IslandRow): Island {
    const lbbsRows = this.#lbbsRows(row.id);
    return this.#mapper.rowToIsland(row, lbbsRows);
  }

  #lbbsRows(islandId: number): LbbsRow[] {
    return this.#driver.all<LbbsRow>(
      "SELECT * FROM lbbs_posts WHERE island_id = ? ORDER BY position ASC",
      islandId,
    );
  }

  #currentTurn(): number {
    const row = this.#driver.get<{ turn: number }>("SELECT turn FROM game WHERE id = 1");
    return row?.turn ?? 0;
  }

  insertIsland(island: Island, rank: number): void {
    const v = this.#mapper.islandToColumnValues(island);
    const createdTurn = this.#currentTurn();
    this.#driver.run(
      `INSERT INTO islands (
         id, rank, name, owner_user_id, comment, score, absent, money, food,
         pop, area, farm, factory, mountain,
         prize_flags, prize_monsters, prize_turns, terrain, commands, created_turn
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
    this.#syncLbbs(island.id, island.lbbs);
  }

  /** rank 以外の全列 + lbbs (replaceLbbs 相当) を更新する。fake-repository.ts の updateIsland と同じ意味論。 */
  updateIsland(island: Island): void {
    const v = this.#mapper.islandToColumnValues(island);
    this.#driver.run(
      `UPDATE islands SET ${ISLAND_UPDATE_COLUMNS_SQL} WHERE id = ?`,
      ...columnValuesToParams(v),
      v.id,
    );
    this.#syncLbbs(island.id, island.lbbs);
  }

  /**
   * ターン処理後: 渡された順に rank を振り直し、含まれない ID (死滅島) を掲示板ごと削除する。
   * rank は UNIQUE 制約があるため 2 パスで行う: 全行を負値へ退避 → 各島を確定した rank で UPDATE。
   * 最後まで負値のまま残った行 (= 渡された配列に無かった既存島) を削除する。
   */
  replaceAllIslands(islands: Island[]): void {
    this.#driver.exec("UPDATE islands SET rank = -rank - 1");
    islands.forEach((island, index) => {
      const v = this.#mapper.islandToColumnValues(island);
      this.#driver.run(
        `UPDATE islands SET rank = ?, ${ISLAND_UPDATE_COLUMNS_SQL} WHERE id = ?`,
        index,
        ...columnValuesToParams(v),
        v.id,
      );
      this.#syncLbbs(island.id, island.lbbs);
    });
    this.#driver.run(
      "DELETE FROM lbbs_posts WHERE island_id IN (SELECT id FROM islands WHERE rank < 0)",
    );
    this.#driver.run("DELETE FROM islands WHERE rank < 0");
  }

  deleteIsland(id: number): void {
    this.#driver.run("DELETE FROM lbbs_posts WHERE island_id = ?", id);
    this.#driver.run("DELETE FROM islands WHERE id = ?", id);
  }

  replaceLbbs(islandId: number, posts: LbbsPost[]): void {
    this.#syncLbbs(islandId, posts);
  }

  #syncLbbs(islandId: number, posts: LbbsPost[]): void {
    this.#driver.run("DELETE FROM lbbs_posts WHERE island_id = ?", islandId);
    posts.forEach((post, position) => {
      this.#driver.run(
        `INSERT INTO lbbs_posts (island_id, position, author, user_id, name, message, turn)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

  appendLogs(entries: LogEntry[]): void {
    for (const entry of entries) {
      this.#driver.run(
        "INSERT INTO logs (turn, seq, secret, island_id, target_id, html) VALUES (?, ?, ?, ?, ?, ?)",
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
  listLogs(q: ListLogsQuery): LogEntry[] {
    const conditions: string[] = ["turn >= ?"];
    const params: SqlParam[] = [q.sinceTurn];

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

  deleteLogsBefore(turn: number): void {
    this.#driver.run("DELETE FROM logs WHERE turn < ?", turn);
  }

  appendHistory(entries: HistoryEntry[]): void {
    for (const entry of entries) {
      this.#driver.run("INSERT INTO history (turn, html) VALUES (?, ?)", entry.turn, entry.html);
    }
  }

  listHistory(limit: number): HistoryEntry[] {
    const rows = this.#driver.all<HistoryRow>(
      "SELECT turn, html FROM history ORDER BY id DESC LIMIT ?",
      limit,
    );
    return rows.map((row) => ({ turn: row.turn, html: row.html }));
  }

  trimHistory(keep: number): void {
    this.#driver.run(
      "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?)",
      keep,
    );
  }

  initialize(meta: GameMeta): void {
    this.#driver.run(
      `INSERT INTO game (id, turn, last_time, next_island_id, final_turn, start_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         turn = excluded.turn, last_time = excluded.last_time, next_island_id = excluded.next_island_id,
         final_turn = excluded.final_turn, start_at = excluded.start_at`,
      meta.turn,
      meta.lastTime,
      meta.nextIslandId,
      meta.finalTurn,
      meta.startAt,
    );
  }

  reset(): void {
    this.#driver.exec(
      `DELETE FROM lbbs_posts;
       DELETE FROM islands;
       DELETE FROM logs;
       DELETE FROM history;
       DELETE FROM game;
       DELETE FROM backups;`,
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
