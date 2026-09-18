// tmp/16-season.md「データ」節: migrate はステップ式で、v2 → v3 は
// `ALTER TABLE game ADD COLUMN final_turn INTEGER` (+ start_at の追加) を行い、db reset を要求しない。
// v2 の DB を素朴な DDL で作ってから migrate() を適用し、実 SQLite で確認する。
import { defaultConfig, migrate, SCHEMA_VERSION, SqliteGameRepository } from "@hakoniwa/game";
import { describe, expect, it } from "vitest";
import { NodeSqliteDriver } from "../src/driver.ts";

/** v2 時点の `game`/`schema_version` の DDL (tmp/16-season.md 以前のスナップショット)。 */
const V2_GAME_SCHEMA_SQL = `
CREATE TABLE schema_version (
  version INTEGER NOT NULL
) STRICT;

CREATE TABLE game (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  turn            INTEGER NOT NULL,
  last_time       INTEGER NOT NULL,
  next_island_id  INTEGER NOT NULL
) STRICT;
`;

function createV2Driver(): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(":memory:");
  driver.exec(V2_GAME_SCHEMA_SQL);
  driver.run("INSERT INTO schema_version (version) VALUES (2)");
  driver.run("INSERT INTO game (id, turn, last_time, next_island_id) VALUES (1, 3, 123456, 4)");
  return driver;
}

describe("migrate: v2 → v3", () => {
  it("schema_version が最新 (v4) になり、final_turn 列が追加される (NULL = 無期限)", async () => {
    const driver = createV2Driver();

    migrate(driver);

    // migrate は現在の version から SCHEMA_VERSION (v4) まで一気に進めるため、
    // v2 の DB でも最終的には v4 になる (v3 は通過点)。
    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);

    const row = driver.get<{ final_turn: number | null; start_at: number }>(
      "SELECT final_turn, start_at FROM game WHERE id = 1",
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
    const meta = repo.getMeta();
    expect(meta.turn).toBe(3);
    expect(meta.lastTime).toBe(123456);
    expect(meta.nextIslandId).toBe(4);
    expect(meta.finalTurn).toBeNull();
    expect(meta.startAt).toBe(123456);
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

  it("新規 DB (schema_version が無い) は v3 の DDL を直接適用する", async () => {
    const driver = new NodeSqliteDriver(":memory:");

    migrate(driver);

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);
    // final_turn / start_at 列が最初から存在すること。
    const cols = driver.all<{ name: string }>("PRAGMA table_info(game)").map((c) => c.name);
    expect(cols).toContain("final_turn");
    expect(cols).toContain("start_at");
  });
});

/**
 * v3 時点 (tmp/16-season.md「開始時刻と最終ターン」節までの) `game`/`schema_version` の DDL。
 * v4 (「ターンの長さも DB に持つ (追加要件)」節) 移行前のスナップショット。
 */
const V3_GAME_SCHEMA_SQL = `
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
`;

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
  it("schema_version が 4 になり、unit_time_sec 列が defaultUnitTimeSec でバックフィルされる", async () => {
    const driver = createV3Driver();

    migrate(driver, { defaultUnitTimeSec: 3600 });

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(4);

    const row = driver.get<{ unit_time_sec: number }>(
      "SELECT unit_time_sec FROM game WHERE id = 1",
    );
    expect(row?.unit_time_sec).toBe(3600);
  });

  it("defaultUnitTimeSec 省略時は 21600 (6時間) でバックフィルされる", async () => {
    const driver = createV3Driver();

    migrate(driver);

    const row = driver.get<{ unit_time_sec: number }>(
      "SELECT unit_time_sec FROM game WHERE id = 1",
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
    const meta = repo.getMeta();
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
    expect(versionRow?.version).toBe(4);
    // 2回目の migrate は何もしないため、defaultUnitTimeSec=999 は反映されない。
    const row = driver.get<{ unit_time_sec: number }>(
      "SELECT unit_time_sec FROM game WHERE id = 1",
    );
    expect(row?.unit_time_sec).toBe(3600);
  });

  it("v2 (final_turn/start_at も無い) からでも v4 まで一気に移行できる", async () => {
    const driver = createV2Driver();

    migrate(driver, { defaultUnitTimeSec: 3600 });

    const repo = new SqliteGameRepository(driver, {
      islandSize: defaultConfig.islandSize,
      commandMax: defaultConfig.commandMax,
    });
    const meta = repo.getMeta();
    expect(meta.turn).toBe(3);
    expect(meta.startAt).toBe(123456);
    expect(meta.unitTimeSec).toBe(3600);
  });

  it("defaultUnitTimeSec が 0 以下なら Error を投げる", async () => {
    const driver = createV3Driver();
    expect(() => migrate(driver, { defaultUnitTimeSec: 0 })).toThrow();
    expect(() => migrate(driver, { defaultUnitTimeSec: -1 })).toThrow();
  });

  it("新規 DB (schema_version が無い) は v4 の DDL を直接適用する", async () => {
    const driver = new NodeSqliteDriver(":memory:");

    migrate(driver);

    const versionRow = driver.get<{ version: number }>("SELECT version FROM schema_version");
    expect(versionRow?.version).toBe(SCHEMA_VERSION);
    const cols = driver.all<{ name: string }>("PRAGMA table_info(game)").map((c) => c.name);
    expect(cols).toContain("unit_time_sec");
  });
});
