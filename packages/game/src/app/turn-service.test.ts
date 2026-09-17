import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.ts";
import type { GameConfig } from "../core/config.ts";
import { estimate, makeNewIsland } from "../core/island.ts";
import { createSeededRng } from "../core/rng.ts";
import type { Rng } from "../core/rng.ts";
import { createTerrain } from "../core/terrain.ts";
import type { Island } from "../core/types.ts";
import { FakeBackupStore, FakeGameRepository, FakeLogger } from "./fake-repository.ts";
import { TurnService } from "./turn-service.ts";

/** テスト用の島を作る。alive: false なら地形を全面海にして人口0にする。 */
function makeIsland(
  config: GameConfig,
  rng: Rng,
  id: number,
  opts: { alive?: boolean } = {},
): Island {
  const island = makeNewIsland(config, rng, { id, name: `島${id}`, passwordHash: "hash" });
  if (opts.alive === false) {
    island.terrain = createTerrain(config.islandSize);
  }
  estimate(island);
  return island;
}

/** tryBumpTurn が常に失敗する (楽観ロック競合を模したテスト用) リポジトリ。 */
class NeverAdvanceRepo extends FakeGameRepository {
  tryBumpTurn(): boolean {
    return false;
  }
}

describe("TurnService.advanceTurnIfDue", () => {
  it("期限前なら 0 を返し、meta は変わらない", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 1000, nextIslandId: 2 });
    repo.insertIsland(makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(1000 + defaultConfig.unitTimeSec - 1);

    expect(advanced).toBe(0);
    expect(repo.getMeta().turn).toBe(1);
  });

  it("期限後なら 1 ターン進め、meta が更新される", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 1000, nextIslandId: 2 });
    repo.insertIsland(makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(1000 + defaultConfig.unitTimeSec);

    expect(advanced).toBe(1);
    expect(repo.getMeta().turn).toBe(2);
    expect(repo.getMeta().lastTime).toBe(1000 + defaultConfig.unitTimeSec);
  });

  it("maxCatchUpTurns を上限にまとめて進める", () => {
    const config = { ...defaultConfig, maxCatchUpTurns: 2 };
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(config, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    // 十分先の未来を指定し、3ターン分の期限が来ていても maxCatchUpTurns=2 で止まる。
    const advanced = turnService.advanceTurnIfDue(config.unitTimeSec * 5);

    expect(advanced).toBe(2);
    expect(repo.getMeta().turn).toBe(3);
  });

  it("tryBumpTurn に失敗したら 0 を返し、状態を変えない (楽観ロック)", () => {
    const repo = new NeverAdvanceRepo();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(defaultConfig.unitTimeSec * 10);

    expect(advanced).toBe(0);
    expect(repo.getMeta().turn).toBe(1);
  });

  it("ターン処理後、logKeepTurns より古いログを削除する", () => {
    const config = { ...defaultConfig, logKeepTurns: 2 };
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 5, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(config, createSeededRng(1), 1), 0);
    repo.appendLogs([
      { turn: 1, secret: false, islandId: 0, targetId: 0, html: "古いログ", seq: 0 },
    ]);
    const turnService = new TurnService({
      repo,
      config,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    // 進行後 turn=6。保持範囲は turn >= 6 - 2 + 1 = 5 なので turn=1 のログは消える。
    expect(repo.listLogs({ sinceTurn: 0 }).some((l) => l.html === "古いログ")).toBe(false);
  });

  it("人口が0になった島はターン処理後にリポジトリから削除される", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 3 });
    const dead = makeIsland(defaultConfig, createSeededRng(1), 1, { alive: false });
    const alive = makeIsland(defaultConfig, createSeededRng(3), 2, { alive: true });
    repo.insertIsland(dead, 0);
    repo.insertIsland(alive, 1);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    const ids = repo.listIslandSummaries().map((s) => s.id);
    expect(ids).not.toContain(1);
    expect(ids).toContain(2);
  });

  it("backupEveryTurns の倍数なら fire-and-forget でバックアップを作成する", async () => {
    const config = { ...defaultConfig, backupEveryTurns: 1 };
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(makeIsland(config, createSeededRng(1), 1), 0);
    const backupStore = new FakeBackupStore();
    const turnService = new TurnService({
      repo,
      config,
      rng: createSeededRng(2),
      backupStore,
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);
    // create/rotate は非同期 (fire-and-forget) なのでマイクロタスクを flush する。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(backupStore.items.some((b) => b.label === "turn-2" && b.turn === 2)).toBe(true);
  });
});

describe("TurnService.advanceTurn", () => {
  it("期限に関係なく 1 ターン進める", () => {
    const repo = new FakeGameRepository();
    repo.initialize({ turn: 1, lastTime: 1_000_000, nextIslandId: 2 });
    repo.insertIsland(makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    expect(repo.getMeta().turn).toBe(2);
  });
});
