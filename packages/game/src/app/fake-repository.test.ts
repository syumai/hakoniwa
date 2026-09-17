import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.ts";
import { estimate, makeNewIsland } from "../core/island.ts";
import { createSeededRng } from "../core/rng.ts";
import { FakeGameRepository, FakePasswordHasher } from "./fake-repository.ts";

function makeIsland(id: number, name: string) {
  const island = makeNewIsland(defaultConfig, createSeededRng(id), {
    id,
    name,
    passwordHash: "hash",
  });
  estimate(island);
  return island;
}

describe("FakeGameRepository", () => {
  it("初期化前は isInitialized が false", () => {
    const repo = new FakeGameRepository();
    expect(repo.isInitialized()).toBe(false);
  });

  it("insertIsland は rank の位置に挿入し、listIslandSummaries は rank 順", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 3 });
    repo.insertIsland(makeIsland(1, "島1"), 0);
    repo.insertIsland(makeIsland(2, "島2"), 1);

    const summaries = repo.listIslandSummaries();
    expect(summaries.map((s) => s.id)).toEqual([1, 2]);
  });

  it("findIsland はクローンを返す (呼び出し側の変更が反映されない)", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(1, "島1"), 0);

    const island = repo.findIsland(1);
    if (island === undefined) throw new Error("not found");
    island.comment = "書き換えてみる";

    const reloaded = repo.findIsland(1);
    expect(reloaded?.comment).not.toBe("書き換えてみる");
  });

  it("updateIsland で変更が反映される", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(1, "島1"), 0);

    const island = repo.findIsland(1);
    if (island === undefined) throw new Error("not found");
    island.comment = "更新";
    repo.updateIsland(island);

    expect(repo.findIsland(1)?.comment).toBe("更新");
  });

  it("replaceAllIslands は渡された順に rank を振り直し、含まれない島を削除する", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 3 });
    const island1 = makeIsland(1, "島1");
    const island2 = makeIsland(2, "島2");
    repo.insertIsland(island1, 0);
    repo.insertIsland(island2, 1);

    // island2 が2位、island1 は死滅として除外。
    repo.replaceAllIslands([island2]);

    const summaries = repo.listIslandSummaries();
    expect(summaries.map((s) => s.id)).toEqual([2]);
    expect(repo.findIsland(1)).toBeUndefined();
  });

  it("tryBumpTurn は expectedTurn が一致する時のみ成功する", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });

    expect(repo.tryBumpTurn(2, { turn: 3, lastTime: 100, nextIslandId: 1 })).toBe(false);
    expect(repo.tryBumpTurn(1, { turn: 2, lastTime: 100, nextIslandId: 1 })).toBe(true);
    expect(repo.getMeta().turn).toBe(2);
  });

  it("listLogs は sinceTurn / islandId / includeSecretFor で絞り込む", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    repo.appendLogs([
      { turn: 1, secret: false, islandId: 1, targetId: 0, html: "通常1", seq: 0 },
      { turn: 1, secret: true, islandId: 1, targetId: 0, html: "機密1", seq: 1 },
      { turn: 1, secret: false, islandId: 2, targetId: 0, html: "通常2", seq: 0 },
      { turn: 0, secret: false, islandId: 1, targetId: 0, html: "古い", seq: 0 },
    ]);

    const visitor = repo.listLogs({ sinceTurn: 1, islandId: 1 });
    expect(visitor.map((l) => l.html)).toEqual(["通常1"]);

    const owner = repo.listLogs({ sinceTurn: 1, islandId: 1, includeSecretFor: 1 });
    expect(owner.map((l) => l.html).sort()).toEqual(["機密1", "通常1"].sort());
  });

  it("deleteLogsBefore は指定 turn 未満を削除する", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    repo.appendLogs([
      { turn: 1, secret: false, islandId: 0, targetId: 0, html: "a", seq: 0 },
      { turn: 3, secret: false, islandId: 0, targetId: 0, html: "b", seq: 0 },
    ]);

    repo.deleteLogsBefore(3);

    expect(repo.listLogs({ sinceTurn: 0 }).map((l) => l.html)).toEqual(["b"]);
  });

  it("trimHistory は新しい順に keep 件を残す", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
    repo.appendHistory([
      { turn: 1, html: "a" },
      { turn: 2, html: "b" },
      { turn: 3, html: "c" },
    ]);

    repo.trimHistory(2);

    expect(repo.listHistory(10).map((h) => h.html)).toEqual(["c", "b"]);
  });

  it("reset は全データを削除する", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(1, "島1"), 0);

    repo.reset();

    expect(repo.isInitialized()).toBe(false);
    expect(repo.listIslandSummaries()).toEqual([]);
  });
});

describe("FakePasswordHasher", () => {
  it("hash してから verify すると true になる", async () => {
    const hasher = new FakePasswordHasher();
    const hash = await hasher.hash("himitsu");
    expect(await hasher.verify("himitsu", hash)).toBe(true);
    expect(await hasher.verify("chigau", hash)).toBe(false);
  });
});
