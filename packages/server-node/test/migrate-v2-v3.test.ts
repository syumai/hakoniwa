// tmp/16-season.md「データ」節: migrate はステップ式で、v2 → v3 は
// `ALTER TABLE game ADD COLUMN final_turn INTEGER` (+ start_at の追加) を行い、db reset を要求しない。
// tmp/18-games.md「データ (スキーマ v5)」節: v4 → v5 は `game` (単一行) を `games` (id=1,
// name='第 1 回') に複製して廃止し、`islands` の主キーを (game_id, id) に作り直す。
// 各バージョンの DB を素朴な DDL で作ってから migrate() を適用し、実 SQLite で確認する。
import { defaultConfig, migrate, SCHEMA_VERSION, SqliteGameRepository } from "@hakoniwa/game";
import { describe, expect, it } from "vitest";
import { NodeSqliteDriver } from "../src/driver.ts";

/**
 * v2〜v4 のあいだ変化しない `islands`/`lbbs_posts`/`logs`/`history`/`backups` の DDL
 * (game_id 列が無い旧世代の形)。v4 → v5 のステップはこれらのテーブルの存在を前提にするため、
 * `game`/`schema_version` だけのスナップショットでは "no such table: islands" になる。
 * 実際の DB は v1 の時点からこれらの表を持つため、ここでも常に含める。
 */
const PRE_V5_TABLES_SCHEMA_SQL = `
CREATE TABLE islands (
  id              INTEGER PRIMARY KEY,
  rank            INTEGER NOT NULL UNIQUE,
  name            TEXT    NOT NULL UNIQUE,
  owner_user_id   TEXT    NOT NULL UNIQUE,
  comment         TEXT    NOT NULL DEFAULT '',
  score           INTEGER NOT NULL DEFAULT 0,
  absent          INTEGER NOT NULL DEFAULT 0,
  money           INTEGER NOT NULL,
  food            INTEGER NOT NULL,
  pop             INTEGER NOT NULL DEFAULT 0,
  area            INTEGER NOT NULL DEFAULT 0,
  farm            INTEGER NOT NULL DEFAULT 0,
  factory         INTEGER NOT NULL DEFAULT 0,
  mountain        INTEGER NOT NULL DEFAULT 0,
  prize_flags     INTEGER NOT NULL DEFAULT 0,
  prize_monsters  INTEGER NOT NULL DEFAULT 0,
  prize_turns     TEXT    NOT NULL DEFAULT '[]',
  terrain         TEXT    NOT NULL,
  commands        TEXT    NOT NULL,
  created_turn    INTEGER NOT NULL
) STRICT;

CREATE TABLE lbbs_posts (
  island_id   INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  author      TEXT    NOT NULL CHECK (author IN ('visitor', 'owner')),
  user_id     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  PRIMARY KEY (island_id, position)
) STRICT;

CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  turn        INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  secret      INTEGER NOT NULL DEFAULT 0,
  island_id   INTEGER NOT NULL DEFAULT 0,
  target_id   INTEGER NOT NULL DEFAULT 0,
  html        TEXT    NOT NULL
) STRICT;

CREATE TABLE history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  turn    INTEGER NOT NULL,
  html    TEXT    NOT NULL
) STRICT;

CREATE TABLE backups (
  label       TEXT    PRIMARY KEY,
  bookmark    TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
) STRICT;
`;

/** v2 時点の `game`/`schema_version` の DDL (tmp/16-season.md 以前のスナップショット)。 */
const V2_GAME_SCHEMA_SQL =
  `
CREATE TABLE schema_version (
  version INTEGER NOT NULL
) STRICT;

CREATE TABLE game (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  turn            INTEGER NOT NULL,
  last_time       INTEGER NOT NULL,
  next_island_id  INTEGER NOT NULL
) STRICT;
` + PRE_V5_TABLES_SCHEMA_SQL;

function createV2Driver(): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(":memory:");
  driver.exec(V2_GAME_SCHEMA_SQL);
  driver.run("INSERT INTO schema_version (version) VALUES (2)");
  driver.run("INSERT INTO game (id, turn, last_time, next_island_id) VALUES (1, 3, 123456, 4)");
  return driver;
}

describe("migrate: v2 → v3", () => {
  it("schema_version が最新 (v5) になり、final_turn 列が追加される (NULL = 無期限)", async () => {
    const driver = createV2Driver();

    migrate(driver);

    // migrate は現在の version から SCHEMA_VERSION (v5) まで一気に進めるため、
    // v2 の DB でも最終的には v5 になる (v3/v4 は通過点)。
    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);

    // v4 → v5 で game (単一行) は games (id=1) に複製されている。
    const row = driver.get<{ final_turn: number | null; start_at: number }>(
      "SELECT final_turn, start_at FROM games WHERE id = 1",
    );
    expect(row?.final_turn).toBeNull();
    // start_at は既存の last_time で近似する (v2 以前に season 機能が無かったため)。
    expect(row?.start_at).toBe(123456);
  });

  it("既存の turn/last_time/next_island_id はそのまま保たれる", async () => {
    const driver = createV2Driver();

    migrate(driver);

    const repo = new SqliteGameRepository(driver, {
      islandSize: defaultConfig.islandSize,
      commandMax: defaultConfig.commandMax,
    });
    const gameId = repo.getCurrentGameId();
    expect(gameId).toBe(1);
    const meta = repo.getMeta(gameId as number);
    expect(meta.turn).toBe(3);
    expect(meta.lastTime).toBe(123456);
    expect(meta.nextIslandId).toBe(4);
    expect(meta.finalTurn).toBeNull();
    expect(meta.startAt).toBe(123456);
    expect(meta.name).toBe("第 1 回");
    expect(meta.status).toBe("running");
  });

  it("再度 migrate を呼んでも何も起きない (べき等)", async () => {
    const driver = createV2Driver();

    migrate(driver);
    migrate(driver);

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);
  });

  it("v1 の DB (schema_version が無い旧世代) は Error を投げる", async () => {
    const driver = new NodeSqliteDriver(":memory:");
    driver.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL) STRICT;
      CREATE TABLE game (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        turn INTEGER NOT NULL,
        last_time INTEGER NOT NULL,
        next_island_id INTEGER NOT NULL
      ) STRICT;
    `);
    driver.run("INSERT INTO schema_version (version) VALUES (1)");

    expect(() => migrate(driver)).toThrow(/v1/);
  });

  it("新規 DB (schema_version が無い) は v5 の DDL を直接適用する", async () => {
    const driver = new NodeSqliteDriver(":memory:");

    migrate(driver);

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);
    // final_turn / start_at 列が最初から games に存在すること。game 表は無いこと。
    const cols = driver.all<{ name: string }>("PRAGMA table_info(games)").map((c) => c.name);
    expect(cols).toContain("final_turn");
    expect(cols).toContain("start_at");
    expect(
      driver.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game'"),
    ).toBeUndefined();
  });
});

/**
 * v3 時点 (tmp/16-season.md「開始時刻と最終ターン」節までの) `game`/`schema_version` の DDL。
 * v4 (「ターンの長さも DB に持つ (追加要件)」節) 移行前のスナップショット。
 */
const V3_GAME_SCHEMA_SQL =
  `
CREATE TABLE schema_version (
  version INTEGER NOT NULL
) STRICT;

CREATE TABLE game (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  turn            INTEGER NOT NULL,
  last_time       INTEGER NOT NULL,
  next_island_id  INTEGER NOT NULL,
  final_turn      INTEGER,
  start_at        INTEGER NOT NULL
) STRICT;
` + PRE_V5_TABLES_SCHEMA_SQL;

function createV3Driver(): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(":memory:");
  driver.exec(V3_GAME_SCHEMA_SQL);
  driver.run("INSERT INTO schema_version (version) VALUES (3)");
  driver.run(
    "INSERT INTO game (id, turn, last_time, next_island_id, final_turn, start_at) VALUES (1, 3, 123456, 4, NULL, 100)",
  );
  return driver;
}

describe("migrate: v3 → v4", () => {
  it("schema_version が最終的に v5 になり、unit_time_sec 列が defaultUnitTimeSec でバックフィルされる", async () => {
    const driver = createV3Driver();

    migrate(driver, { defaultUnitTimeSec: 3600 });

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);

    const row = driver.get<{ unit_time_sec: number }>(
      "SELECT unit_time_sec FROM games WHERE id = 1",
    );
    expect(row?.unit_time_sec).toBe(3600);
  });

  it("defaultUnitTimeSec 省略時は 21600 (6時間) でバックフィルされる", async () => {
    const driver = createV3Driver();

    migrate(driver);

    const row = driver.get<{ unit_time_sec: number }>(
      "SELECT unit_time_sec FROM games WHERE id = 1",
    );
    expect(row?.unit_time_sec).toBe(21600);
  });

  it("既存の turn/last_time/final_turn/start_at はそのまま保たれる", async () => {
    const driver = createV3Driver();

    migrate(driver, { defaultUnitTimeSec: 3600 });

    const repo = new SqliteGameRepository(driver, {
      islandSize: defaultConfig.islandSize,
      commandMax: defaultConfig.commandMax,
    });
    const meta = repo.getMeta(1);
    expect(meta.turn).toBe(3);
    expect(meta.lastTime).toBe(123456);
    expect(meta.nextIslandId).toBe(4);
    expect(meta.finalTurn).toBeNull();
    expect(meta.startAt).toBe(100);
    expect(meta.unitTimeSec).toBe(3600);
  });

  it("再度 migrate を呼んでも何も起きない (べき等)", async () => {
    const driver = createV3Driver();

    migrate(driver, { defaultUnitTimeSec: 3600 });
    migrate(driver, { defaultUnitTimeSec: 999 });

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);
    // 2回目の migrate は何もしないため、defaultUnitTimeSec=999 は反映されない。
    const row = driver.get<{ unit_time_sec: number }>(
      "SELECT unit_time_sec FROM games WHERE id = 1",
    );
    expect(row?.unit_time_sec).toBe(3600);
  });

  it("v2 (final_turn/start_at も無い) からでも v5 まで一気に移行できる", async () => {
    const driver = createV2Driver();

    migrate(driver, { defaultUnitTimeSec: 3600 });

    const repo = new SqliteGameRepository(driver, {
      islandSize: defaultConfig.islandSize,
      commandMax: defaultConfig.commandMax,
    });
    const meta = repo.getMeta(1);
    expect(meta.turn).toBe(3);
    expect(meta.startAt).toBe(123456);
    expect(meta.unitTimeSec).toBe(3600);
  });

  it("defaultUnitTimeSec が 0 以下なら Error を投げる", async () => {
    const driver = createV3Driver();
    expect(() => migrate(driver, { defaultUnitTimeSec: 0 })).toThrow();
    expect(() => migrate(driver, { defaultUnitTimeSec: -1 })).toThrow();
  });

  it("新規 DB (schema_version が無い) は v5 の DDL を直接適用する", async () => {
    const driver = new NodeSqliteDriver(":memory:");

    migrate(driver);

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);
    const cols = driver.all<{ name: string }>("PRAGMA table_info(games)").map((c) => c.name);
    expect(cols).toContain("unit_time_sec");
  });
});

/**
 * v4 時点 (tmp/18-games.md 以前、`game` 単一行 + `islands`/`lbbs_posts`/`logs`/`history` に
 * `game_id` が無い) の DDL スナップショット。
 */
const V4_SCHEMA_SQL = `
CREATE TABLE schema_version (
  version INTEGER NOT NULL
) STRICT;

CREATE TABLE game (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  turn            INTEGER NOT NULL,
  last_time       INTEGER NOT NULL,
  next_island_id  INTEGER NOT NULL,
  final_turn      INTEGER,
  start_at        INTEGER NOT NULL,
  unit_time_sec   INTEGER NOT NULL
) STRICT;

CREATE TABLE islands (
  id              INTEGER PRIMARY KEY,
  rank            INTEGER NOT NULL UNIQUE,
  name            TEXT    NOT NULL UNIQUE,
  owner_user_id   TEXT    NOT NULL UNIQUE,
  comment         TEXT    NOT NULL DEFAULT '',
  score           INTEGER NOT NULL DEFAULT 0,
  absent          INTEGER NOT NULL DEFAULT 0,
  money           INTEGER NOT NULL,
  food            INTEGER NOT NULL,
  pop             INTEGER NOT NULL DEFAULT 0,
  area            INTEGER NOT NULL DEFAULT 0,
  farm            INTEGER NOT NULL DEFAULT 0,
  factory         INTEGER NOT NULL DEFAULT 0,
  mountain        INTEGER NOT NULL DEFAULT 0,
  prize_flags     INTEGER NOT NULL DEFAULT 0,
  prize_monsters  INTEGER NOT NULL DEFAULT 0,
  prize_turns     TEXT    NOT NULL DEFAULT '[]',
  terrain         TEXT    NOT NULL,
  commands        TEXT    NOT NULL,
  created_turn    INTEGER NOT NULL
) STRICT;

CREATE TABLE lbbs_posts (
  island_id   INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  author      TEXT    NOT NULL CHECK (author IN ('visitor', 'owner')),
  user_id     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  PRIMARY KEY (island_id, position)
) STRICT;

CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  turn        INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  secret      INTEGER NOT NULL DEFAULT 0,
  island_id   INTEGER NOT NULL DEFAULT 0,
  target_id   INTEGER NOT NULL DEFAULT 0,
  html        TEXT    NOT NULL
) STRICT;

CREATE TABLE history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  turn    INTEGER NOT NULL,
  html    TEXT    NOT NULL
) STRICT;

CREATE TABLE backups (
  label       TEXT    PRIMARY KEY,
  bookmark    TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
) STRICT;
`;

interface V4GameRow {
  turn: number;
  last_time: number;
  next_island_id: number;
  final_turn: number | null;
  start_at: number;
  unit_time_sec: number;
}

function createV4Driver(gameOverrides: Partial<V4GameRow> = {}): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(":memory:");
  driver.exec(V4_SCHEMA_SQL);
  driver.run("INSERT INTO schema_version (version) VALUES (4)");
  const game: V4GameRow = {
    turn: 3,
    last_time: 123456,
    next_island_id: 3,
    final_turn: null,
    start_at: 100,
    unit_time_sec: 21600,
    ...gameOverrides,
  };
  driver.run(
    `INSERT INTO game (id, turn, last_time, next_island_id, final_turn, start_at, unit_time_sec)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
    game.turn,
    game.last_time,
    game.next_island_id,
    game.final_turn,
    game.start_at,
    game.unit_time_sec,
  );
  return driver;
}

describe("migrate: v4 → v5 (tmp/18-games.md)", () => {
  it("schema_version が v5 になり、game 行が games (id=1, name='第 1 回', status='running') に複製される", async () => {
    const driver = createV4Driver({ turn: 3, final_turn: null });

    migrate(driver);

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);

    const row = driver.get<{
      name: string;
      status: string;
      turn: number;
      last_time: number;
      start_at: number;
      final_turn: number | null;
      unit_time_sec: number;
      next_island_id: number;
      created_at: number;
      finished_at: number | null;
    }>("SELECT * FROM games WHERE id = 1");
    expect(row?.name).toBe("第 1 回");
    expect(row?.status).toBe("running");
    expect(row?.turn).toBe(3);
    expect(row?.last_time).toBe(123456);
    expect(row?.next_island_id).toBe(3);
    expect(row?.final_turn).toBeNull();
    expect(row?.unit_time_sec).toBe(21600);
    // created_at は start_at と同じ値で複製される。
    expect(row?.created_at).toBe(100);
    expect(row?.finished_at).toBeNull();

    // 旧 game 表は無くなっている。
    expect(
      driver.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game'"),
    ).toBeUndefined();
  });

  it("turn > final_turn の DB は status='finished'、finished_at=last_time で複製される", async () => {
    const driver = createV4Driver({ turn: 11, final_turn: 10, last_time: 999000 });

    migrate(driver);

    const row = driver.get<{ status: string; finished_at: number | null }>(
      "SELECT status, finished_at FROM games WHERE id = 1",
    );
    expect(row?.status).toBe("finished");
    expect(row?.finished_at).toBe(999000);
  });

  it("islands が (game_id, id) 主キーの新しい表に複製され、game_id=1 が振られる", async () => {
    const driver = createV4Driver();
    driver.run(
      `INSERT INTO islands (
         id, rank, name, owner_user_id, money, food, terrain, commands, created_turn
       ) VALUES (1, 0, '島1', 'u1', 100, 100, '[]', '[]', 1)`,
    );
    driver.run(
      `INSERT INTO islands (
         id, rank, name, owner_user_id, money, food, terrain, commands, created_turn
       ) VALUES (2, 1, '島2', 'u2', 200, 200, '[]', '[]', 2)`,
    );
    driver.run(
      `INSERT INTO lbbs_posts (island_id, position, author, user_id, name, message, turn)
       VALUES (1, 0, 'visitor', 'u3', 'たろう', 'こんにちは', 2)`,
    );
    driver.run("INSERT INTO logs (turn, seq, html) VALUES (1, 0, 'ログ')");
    driver.run("INSERT INTO history (turn, html) VALUES (1, '履歴')");

    migrate(driver);

    const islandRows = driver.all<{ game_id: number; id: number; name: string }>(
      "SELECT game_id, id, name FROM islands ORDER BY id",
    );
    expect(islandRows).toEqual([
      { game_id: 1, id: 1, name: "島1" },
      { game_id: 1, id: 2, name: "島2" },
    ]);

    const lbbsRows = driver.all<{ game_id: number; island_id: number }>(
      "SELECT game_id, island_id FROM lbbs_posts",
    );
    expect(lbbsRows).toEqual([{ game_id: 1, island_id: 1 }]);

    const logRows = driver.all<{ game_id: number }>("SELECT game_id FROM logs");
    expect(logRows).toEqual([{ game_id: 1 }]);

    const historyRows = driver.all<{ game_id: number }>("SELECT game_id FROM history");
    expect(historyRows).toEqual([{ game_id: 1 }]);

    // SqliteGameRepository 経由でも読み書きできる (terrain/commands は空文字列相当の JSON の
    // ダミーデータなので listIslandSummaries のみ検証する。findIsland は terrain の形状検証で
    // 例外になるため使わない)。
    const repo = new SqliteGameRepository(driver, {
      islandSize: defaultConfig.islandSize,
      commandMax: defaultConfig.commandMax,
    });
    expect(repo.listIslandSummaries(1).map((s) => s.id)).toEqual([1, 2]);
  });

  it("再度 migrate を呼んでも何も起きない (べき等)", async () => {
    const driver = createV4Driver();
    driver.run(
      `INSERT INTO islands (
         id, rank, name, owner_user_id, money, food, terrain, commands, created_turn
       ) VALUES (1, 0, '島1', 'u1', 100, 100, '[]', '[]', 1)`,
    );

    migrate(driver);
    migrate(driver);

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);
    expect(driver.all("SELECT * FROM islands")).toHaveLength(1);
  });

  it("新規 DB は最初から games/islands (game_id 列付き) を持つ", async () => {
    const driver = new NodeSqliteDriver(":memory:");

    migrate(driver);

    const gameCols = driver.all<{ name: string }>("PRAGMA table_info(games)").map((c) => c.name);
    expect(gameCols).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "status",
        "turn",
        "last_time",
        "start_at",
        "final_turn",
        "unit_time_sec",
        "next_island_id",
        "created_at",
        "finished_at",
      ]),
    );
    const islandCols = driver
      .all<{ name: string }>("PRAGMA table_info(islands)")
      .map((c) => c.name);
    expect(islandCols).toContain("game_id");
    const lbbsCols = driver
      .all<{ name: string }>("PRAGMA table_info(lbbs_posts)")
      .map((c) => c.name);
    expect(lbbsCols).toContain("game_id");
    const logCols = driver.all<{ name: string }>("PRAGMA table_info(logs)").map((c) => c.name);
    expect(logCols).toContain("game_id");
    const historyCols = driver
      .all<{ name: string }>("PRAGMA table_info(history)")
      .map((c) => c.name);
    expect(historyCols).toContain("game_id");
  });
});
