// 04-database.md / fake-repository.test.ts と同等の観点を実 SQLite (:memory:) で検証する。
import {
  createSeededRng,
  estimate,
  FakeGameRepository,
  makeNewIsland,
  migrate,
  SqliteGameRepository,
  defaultConfig,
} from "@hakoniwa/game";
import type { GameRepository, Island } from "@hakoniwa/game";
import { beforeEach, describe, expect, it } from "vitest";
import { NodeSqliteDriver } from "../src/driver.ts";

function makeIsland(id: number, name: string): Island {
  const island = makeNewIsland(defaultConfig, createSeededRng(id), {
    id,
    name,
    passwordHash: "hash",
  });
  estimate(island);
  return island;
}

function createRepo(): { driver: NodeSqliteDriver; repo: SqliteGameRepository } {
  const driver = new NodeSqliteDriver(":memory:");
  migrate(driver);
  const repo = new SqliteGameRepository(driver, {
    islandSize: defaultConfig.islandSize,
    commandMax: defaultConfig.commandMax,
  });
  return { driver, repo };
}

describe("SqliteGameRepository", () => {
  let driver: NodeSqliteDriver;
  let repo: SqliteGameRepository;

  beforeEach(() => {
    ({ driver, repo } = createRepo());
  });

  it("初期化前は isInitialized が false、initialize 後は true", () => {
    expect(repo.isInitialized()).toBe(false);
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    expect(repo.isInitialized()).toBe(true);
    expect(repo.getMeta()).toEqual({ turn: 1, lastTime: 0, nextIslandId: 1 });
  });

  it("tryBumpTurn は expectedTurn が一致する時のみ成功する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    expect(repo.tryBumpTurn(2, { turn: 3, lastTime: 100, nextIslandId: 1 })).toBe(false);
    expect(repo.getMeta().turn).toBe(1);
    expect(repo.tryBumpTurn(1, { turn: 2, lastTime: 100, nextIslandId: 1 })).toBe(true);
    expect(repo.getMeta()).toEqual({ turn: 2, lastTime: 100, nextIslandId: 1 });
  });

  it("insertIsland → findIsland は terrain/commands/prize/lbbs を含めて完全往復し、返り値の変更は DB に影響しない", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    const island = makeIsland(1, "島1");
    repo.insertIsland(island, 0);

    const loaded = repo.findIsland(1);
    expect(loaded).toBeDefined();
    if (loaded === undefined) throw new Error("unreachable");
    expect(loaded.name).toBe("島1");
    expect(loaded.terrain.toJSON()).toEqual(island.terrain.toJSON());
    expect(loaded.commands).toEqual(island.commands);
    expect(loaded.prize).toEqual(island.prize);
    expect(loaded.lbbs).toEqual([]);

    // 返り値を書き換えても DB には影響しない。
    loaded.comment = "書き換え";
    loaded.commands[0] = { ...loaded.commands[0]!, arg: 99 };
    const reloaded = repo.findIsland(1);
    expect(reloaded?.comment).not.toBe("書き換え");
    expect(reloaded?.commands[0]?.arg).not.toBe(99);
  });

  it("updateIsland は rank 以外の全列と lbbs を更新する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    const island = makeIsland(1, "島1");
    repo.insertIsland(island, 0);

    const loaded = repo.findIsland(1);
    if (loaded === undefined) throw new Error("unreachable");
    loaded.comment = "更新済み";
    loaded.money = 12345;
    loaded.lbbs = [{ author: "owner", name: "島主", message: "こんにちは", turn: 1 }];
    repo.updateIsland(loaded);

    const reloaded = repo.findIsland(1);
    expect(reloaded?.comment).toBe("更新済み");
    expect(reloaded?.money).toBe(12345);
    expect(reloaded?.lbbs).toEqual([
      { author: "owner", name: "島主", message: "こんにちは", turn: 1 },
    ]);
  });

  it("listIslandSummaries / loadAllIslands は rank 昇順", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 3 });
    repo.insertIsland(makeIsland(1, "島1"), 0);
    repo.insertIsland(makeIsland(2, "島2"), 1);

    expect(repo.listIslandSummaries().map((s) => s.id)).toEqual([1, 2]);
    expect(repo.loadAllIslands().map((i) => i.id)).toEqual([1, 2]);
  });

  it("findIslandByName で名前から検索できる", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(1, "島1"), 0);
    expect(repo.findIslandByName("島1")?.id).toBe(1);
    expect(repo.findIslandByName("存在しない島")).toBeUndefined();
  });

  it("replaceAllIslands は渡された順に rank を振り直し、含まれない島を lbbs ごと削除する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 3 });
    const island1 = makeIsland(1, "島1");
    const island2 = makeIsland(2, "島2");
    repo.insertIsland(island1, 0);
    repo.insertIsland(island2, 1);
    repo.replaceLbbs(1, [{ author: "visitor", name: "旅人", message: "やあ", turn: 1 }]);

    // island2 が 1 位、island1 は死滅として除外。
    island2.money = 999;
    repo.replaceAllIslands([island2]);

    expect(repo.listIslandSummaries().map((s) => s.id)).toEqual([2]);
    expect(repo.findIsland(1)).toBeUndefined();
    expect(repo.findIsland(2)?.money).toBe(999);

    // island1 の lbbs_posts も削除されていること。
    const lbbsCount = driver.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM lbbs_posts WHERE island_id = 1",
    );
    expect(lbbsCount?.n).toBe(0);
  });

  it("replaceAllIslands で順序を入れ替えても rank の UNIQUE 制約に抵触しない", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 3 });
    const island1 = makeIsland(1, "島1");
    const island2 = makeIsland(2, "島2");
    repo.insertIsland(island1, 0);
    repo.insertIsland(island2, 1);

    // 逆順に入れ替え。
    repo.replaceAllIslands([island2, island1]);
    expect(repo.listIslandSummaries().map((s) => s.id)).toEqual([2, 1]);
  });

  it("deleteIsland は lbbs_posts も削除する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(1, "島1"), 0);
    repo.replaceLbbs(1, [{ author: "owner", name: "島主", message: "hi", turn: 1 }]);
    repo.deleteIsland(1);
    expect(repo.findIsland(1)).toBeUndefined();
    const lbbsCount = driver.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM lbbs_posts WHERE island_id = 1",
    );
    expect(lbbsCount?.n).toBe(0);
  });

  it("listLogs は sinceTurn / islandId / includeSecretFor で絞り込み、turn DESC, seq ASC で返す", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    repo.appendLogs([
      { turn: 1, secret: false, islandId: 1, targetId: 0, html: "通常1", seq: 0 },
      { turn: 1, secret: true, islandId: 1, targetId: 0, html: "機密1", seq: 1 },
      { turn: 1, secret: false, islandId: 2, targetId: 1, html: "通常2", seq: 2 },
      { turn: 0, secret: false, islandId: 1, targetId: 0, html: "古い", seq: 0 },
      { turn: 2, secret: false, islandId: 1, targetId: 0, html: "新しい", seq: 0 },
    ]);

    const visitor = repo.listLogs({ sinceTurn: 1, islandId: 1 });
    // island_id = 1 OR target_id = 1、機密は除外、turn DESC, seq ASC。
    expect(visitor.map((l) => l.html)).toEqual(["新しい", "通常1", "通常2"]);

    const owner = repo.listLogs({ sinceTurn: 1, islandId: 1, includeSecretFor: 1 });
    expect(owner.map((l) => l.html)).toEqual(["新しい", "通常1", "機密1", "通常2"]);

    const top = repo.listLogs({ sinceTurn: 1 });
    expect(top.map((l) => l.html).sort()).toEqual(["新しい", "通常1", "通常2"].sort());
  });

  it("appendLogs / listLogs は secret の真偽値を保持する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    repo.appendLogs([{ turn: 1, secret: true, islandId: 1, targetId: 0, html: "s", seq: 0 }]);
    const logs = repo.listLogs({ sinceTurn: 1, includeSecretFor: 1 });
    expect(logs[0]?.secret).toBe(true);
  });

  it("deleteLogsBefore は指定 turn 未満を削除する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    repo.appendLogs([
      { turn: 1, secret: false, islandId: 0, targetId: 0, html: "a", seq: 0 },
      { turn: 3, secret: false, islandId: 0, targetId: 0, html: "b", seq: 0 },
    ]);
    repo.deleteLogsBefore(3);
    expect(repo.listLogs({ sinceTurn: 0 }).map((l) => l.html)).toEqual(["b"]);
  });

  it("history: appendHistory / listHistory (新しい順) / trimHistory", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    repo.appendHistory([
      { turn: 1, html: "a" },
      { turn: 2, html: "b" },
      { turn: 3, html: "c" },
    ]);
    expect(repo.listHistory(10).map((h) => h.html)).toEqual(["c", "b", "a"]);
    repo.trimHistory(2);
    expect(repo.listHistory(10).map((h) => h.html)).toEqual(["c", "b"]);
  });

  it("reset は全テーブルの行を削除する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(1, "島1"), 0);
    repo.appendLogs([{ turn: 1, secret: false, islandId: 0, targetId: 0, html: "a", seq: 0 }]);
    repo.appendHistory([{ turn: 1, html: "a" }]);

    repo.reset();

    expect(repo.isInitialized()).toBe(false);
    expect(repo.listIslandSummaries()).toEqual([]);
    expect(repo.listLogs({ sinceTurn: 0 })).toEqual([]);
    expect(repo.listHistory(10)).toEqual([]);
  });

  it("transaction 内で throw すると変更が残らない (ROLLBACK)", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    expect(() =>
      repo.transaction(() => {
        repo.insertIsland(makeIsland(1, "島1"), 0);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(repo.listIslandSummaries()).toEqual([]);
  });

  it("壊れた JSON (terrain) は findIsland 時に throw する", () => {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(1, "島1"), 0);
    driver.run("UPDATE islands SET terrain = ? WHERE id = 1", "not-json");
    expect(() => repo.findIsland(1)).toThrow();
  });

  it("FakeGameRepository と同じ意味論であることの確認 (簡易比較)", () => {
    const fake: GameRepository = new FakeGameRepository();
    fake.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    const island = makeIsland(1, "島1");
    fake.insertIsland(island, 0);
    repo.insertIsland(island, 0);
    expect(repo.listIslandSummaries().map((s) => s.id)).toEqual(
      fake.listIslandSummaries().map((s) => s.id),
    );
  });
});
