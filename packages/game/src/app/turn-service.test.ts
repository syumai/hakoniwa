import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.ts";
import type { GameConfig } from "../core/config.ts";
import { estimate, makeNewIsland } from "../core/island.ts";
import { createSeededRng } from "../core/rng.ts";
import type { Rng } from "../core/rng.ts";
import { createTerrain } from "../core/terrain.ts";
import type { Island } from "../core/types.ts";
import { FakeBackupStore, FakeGameRepository, FakeLogger } from "./fake-repository.ts";
import type { GameMeta } from "./ports.ts";
import { buildSeasonVM } from "./season.ts";
import { TurnService } from "./turn-service.ts";

/** テスト用の島を作る。alive: false なら地形を全面海にして人口0にする。 */
function makeIsland(
  config: GameConfig,
  rng: Rng,
  id: number,
  opts: { alive?: boolean } = {},
): Island {
  const island = makeNewIsland(config, rng, { id, name: `島${id}`, ownerUserId: `owner-${id}` });
  if (opts.alive === false) {
    island.terrain = createTerrain(config.islandSize);
  }
  estimate(island);
  return island;
}

/**
 * `repo.createGame` でゲームを作り、必要なら `turn`/`lastTime`/`nextIslandId` を上書きして
 * gameId を返す (旧 `repo.initialize({...})` の代わり)。
 */
function setupGame(
  repo: FakeGameRepository,
  overrides: {
    turn?: number;
    /**
     * tmp/16-season.md「開始前の状態 = ターン 0」節「既存ゲームとの互換」用。省略時は
     * `repo.createGame` の既定 (0、新方式)。1 を指定すると旧方式 (firstTurn=1) のゲームを模せる。
     */
    firstTurn?: number;
    lastTime?: number;
    nextIslandId?: number;
    finalTurn?: number | null;
    startAt?: number;
    unitTimeSec?: number;
  } = {},
): number {
  const startAt = overrides.startAt ?? 0;
  const unitTimeSec = overrides.unitTimeSec ?? defaultConfig.unitTimeSec;
  const gameId = repo.createGame(
    { name: "第 1 回", startAt, finalTurn: overrides.finalTurn ?? null, unitTimeSec },
    startAt,
  );
  const meta = repo.getMeta(gameId);
  const patch: Partial<GameMeta> = {};
  if (overrides.turn !== undefined) patch.turn = overrides.turn;
  if (overrides.firstTurn !== undefined) patch.firstTurn = overrides.firstTurn;
  if (overrides.lastTime !== undefined) patch.lastTime = overrides.lastTime;
  if (overrides.nextIslandId !== undefined) patch.nextIslandId = overrides.nextIslandId;
  if (Object.keys(patch).length > 0) {
    repo.saveMeta({ ...meta, ...patch });
  }
  return gameId;
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
    const gameId = setupGame(repo, { turn: 1, lastTime: 1000, nextIslandId: 2 });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(1000 + defaultConfig.unitTimeSec - 1);

    expect(advanced).toBe(0);
    expect(repo.getMeta(gameId).turn).toBe(1);
  });

  // tmp/16-season.md「開始前の状態 = ターン 0 (改訂 2026-09-20)」節: turn===0 (開始前) は
  // `now >= startAt` で期限到来とみなす (lastTime は見ない)。
  it("開始前 (turn===0): now < startAt なら 0 を返し、meta は変わらない (lastTime は見ない)", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, {
      turn: 0,
      startAt: 2000,
      // lastTime を意図的に startAt と異なる値にしても、turn===0 の期限判定は lastTime を見ない。
      lastTime: 500,
      unitTimeSec: 100,
      nextIslandId: 2,
    });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    // now(700) - lastTime(500) = 200 >= unitTimeSec(100) なので lastTime 基準の期限判定だけなら
    // 満たすが、turn===0 の判定は now(700) < startAt(2000) を見るので進まない。
    const advanced = turnService.advanceTurnIfDue(700);

    expect(advanced).toBe(0);
    expect(repo.getMeta(gameId).turn).toBe(0);
  });

  it("期限後なら 1 ターン進め、meta が更新される", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 1, lastTime: 1000, nextIslandId: 2 });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(1000 + defaultConfig.unitTimeSec);

    expect(advanced).toBe(1);
    expect(repo.getMeta(gameId).turn).toBe(2);
    expect(repo.getMeta(gameId).lastTime).toBe(1000 + defaultConfig.unitTimeSec);
  });

  it("maxCatchUpTurns を上限にまとめて進める", () => {
    const config = { ...defaultConfig, maxCatchUpTurns: 2 };
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(gameId, makeIsland(config, createSeededRng(1), 1), 0);
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
    expect(repo.getMeta(gameId).turn).toBe(3);
  });

  it("tryBumpTurn に失敗したら 0 を返し、状態を変えない (楽観ロック)", () => {
    const repo = new NeverAdvanceRepo();
    const gameId = setupGame(repo, { turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(defaultConfig.unitTimeSec * 10);

    expect(advanced).toBe(0);
    expect(repo.getMeta(gameId).turn).toBe(1);
  });

  it("ターン処理後、logKeepTurns より古いログを削除する", () => {
    const config = { ...defaultConfig, logKeepTurns: 2 };
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 5, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(gameId, makeIsland(config, createSeededRng(1), 1), 0);
    repo.appendLogs(gameId, [
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
    expect(repo.listLogs(gameId, { sinceTurn: 0 }).some((l) => l.html === "古いログ")).toBe(false);
  });

  it("人口が0になった島はターン処理後にリポジトリから削除される", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 1, lastTime: 0, nextIslandId: 3 });
    const dead = makeIsland(defaultConfig, createSeededRng(1), 1, { alive: false });
    const alive = makeIsland(defaultConfig, createSeededRng(3), 2, { alive: true });
    repo.insertIsland(gameId, dead, 0);
    repo.insertIsland(gameId, alive, 1);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    const ids = repo.listIslandSummaries(gameId).map((s) => s.id);
    expect(ids).not.toContain(1);
    expect(ids).toContain(2);
  });

  it("backupEveryTurns の倍数なら fire-and-forget でバックアップを作成する", async () => {
    const config = { ...defaultConfig, backupEveryTurns: 1 };
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(gameId, makeIsland(config, createSeededRng(1), 1), 0);
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

describe("tmp/16-season.md: ターンの長さも DB に持つ (meta.unitTimeSec を使う)", () => {
  it("期限判定は config.unitTimeSec ではなく meta.unitTimeSec を使う", () => {
    const repo = new FakeGameRepository();
    // config は 6 時間だが、meta は 60 秒。
    const gameId = setupGame(repo, { turn: 1, lastTime: 1000, nextIslandId: 2, unitTimeSec: 60 });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    // config.unitTimeSec (21600) 未満だが meta.unitTimeSec (60) 以上なので進む。
    const advanced = turnService.advanceTurnIfDue(1000 + 60);

    expect(advanced).toBe(1);
    expect(repo.getMeta(gameId).turn).toBe(2);
    expect(repo.getMeta(gameId).lastTime).toBe(1000 + 60);
  });

  it("lastTime の増分も meta.unitTimeSec を使う (config とは異なる値)", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 1, lastTime: 1000, nextIslandId: 2, unitTimeSec: 120 });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    expect(repo.getMeta(gameId).lastTime).toBe(1000 + 120);
  });
});

describe("TurnService.advanceTurn", () => {
  it("期限に関係なく 1 ターン進める", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 1, lastTime: 1_000_000, nextIslandId: 2 });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    expect(repo.getMeta(gameId).turn).toBe(2);
  });

  it("tmp/16-season.md/tmp/18-games.md: 終了済み (status='finished') は何もしない", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, {
      turn: 6,
      lastTime: 1_000_000,
      nextIslandId: 2,
      finalTurn: 5,
    });
    repo.finishGame(gameId, 1_000_000);
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    expect(repo.getMeta(gameId).turn).toBe(6);
  });

  // tmp/16-season.md「開始前の状態 (追加要件)」節: 管理者の手動進行 (advanceTurn) も
  // 開始前 (now < startAt) は進めない。
  it("開始前 (turn===0、now < startAt) は何もしない", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, {
      turn: 0,
      startAt: 2000,
      lastTime: 2000,
      nextIslandId: 2,
    });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(1000);

    expect(repo.getMeta(gameId).turn).toBe(0);
  });

  it("tmp/18-games.md: ゲームが1つも無ければ何もしない (例外にならない)", () => {
    const repo = new FakeGameRepository();
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    expect(() => turnService.advanceTurn(0)).not.toThrow();
    expect(repo.isInitialized()).toBe(false);
  });

  it("tmp/18-games.md: 過去のゲーム (現在でない) は進めない。現在のゲームだけ進む", () => {
    const repo = new FakeGameRepository();
    const game1 = setupGame(repo, { turn: 3, lastTime: 0, nextIslandId: 2 });
    repo.finishGame(game1, 0);
    const game2 = setupGame(repo, { turn: 1, lastTime: 0, nextIslandId: 2 });
    repo.insertIsland(game2, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    turnService.advanceTurn(0);

    expect(repo.getMeta(game1).turn).toBe(3);
    expect(repo.getMeta(game2).turn).toBe(2);
  });
});

describe("TurnService.advanceTurnIfDue (終了後)", () => {
  it("tmp/16-season.md: status='finished' なら期限が来ていても 0 を返し、進めない", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, { turn: 6, lastTime: 0, nextIslandId: 2, finalTurn: 5 });
    repo.finishGame(gameId, 0);
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(defaultConfig.unitTimeSec * 100);

    expect(advanced).toBe(0);
    expect(repo.getMeta(gameId).turn).toBe(6);
  });

  it("tmp/18-games.md: 最終ターン到達で TurnService が status を 'finished' にし finishedAt を記録する", () => {
    const config = { ...defaultConfig, maxCatchUpTurns: 5 };
    const repo = new FakeGameRepository();
    // tmp/16-season.md「開始前の状態 = ターン 0」節: 新方式 (firstTurn=0) では実行済みの処理回数は
    // turn そのもの。finalTurn=5 なら turn=5 に達した時点 (5 回目の処理) で終了する。
    const gameId = setupGame(repo, { turn: 3, lastTime: 0, nextIslandId: 2, finalTurn: 5 });
    repo.insertIsland(gameId, makeIsland(config, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    // maxCatchUpTurns=5 分の期限が来ていても、finalTurn=5 に達した時点 (turn=5) で止まる。
    const now = config.unitTimeSec * 100;
    const advanced = turnService.advanceTurnIfDue(now);

    expect(advanced).toBe(2);
    const meta = repo.getMeta(gameId);
    expect(meta.turn).toBe(5);
    expect(meta.status).toBe("finished");
    expect(meta.finishedAt).not.toBeNull();

    // 終了後にさらに advanceTurnIfDue/advanceTurn を呼んでも進まない。
    expect(turnService.advanceTurnIfDue(now + config.unitTimeSec * 10)).toBe(0);
    turnService.advanceTurn(now);
    expect(repo.getMeta(gameId).turn).toBe(5);
  });
});

// tmp/16-season.md「開始前の状態 = ターン 0 (改訂 2026-09-20)」節。design のテスト項目
// (a)〜(d) を `repo.createGame` から直接組み立てるエンドツーエンドのシナリオとして確認する。
describe("tmp/16-season.md: 開始前の状態 = ターン 0", () => {
  it("(a) 新しいゲームは turn=0 で作られ、startAt 前は advanceTurnIfDue が 0 を返す", () => {
    const repo = new FakeGameRepository();
    const gameId = repo.createGame(
      { name: "第 1 回", startAt: 1000, finalTurn: null, unitTimeSec: 100 },
      1000,
    );
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    expect(repo.getMeta(gameId).turn).toBe(0);
    expect(repo.getMeta(gameId).firstTurn).toBe(0);
    expect(turnService.advanceTurnIfDue(999)).toBe(0);
    expect(repo.getMeta(gameId).turn).toBe(0);
  });

  it("(b) now >= startAt で 0→1 になり、lastTime は startAt のまま、ログが「ターン1」で記録される", () => {
    const repo = new FakeGameRepository();
    const gameId = repo.createGame(
      { name: "第 1 回", startAt: 1000, finalTurn: null, unitTimeSec: 100 },
      1000,
    );
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: defaultConfig,
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(1000);

    expect(advanced).toBe(1);
    const meta = repo.getMeta(gameId);
    expect(meta.turn).toBe(1);
    expect(meta.lastTime).toBe(1000);
    const logs = repo.listLogs(gameId, { sinceTurn: 0 });
    expect(logs.every((log) => log.turn === 1)).toBe(true);
  });

  it("(c) finalTurn=3 なら 3 回の処理で finished になり、finishedAtTurn === 3", () => {
    const repo = new FakeGameRepository();
    const gameId = repo.createGame(
      { name: "第 1 回", startAt: 0, finalTurn: 3, unitTimeSec: 100 },
      0,
    );
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: { ...defaultConfig, maxCatchUpTurns: 10 },
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    const advanced = turnService.advanceTurnIfDue(1000);

    expect(advanced).toBe(3);
    const meta = repo.getMeta(gameId);
    expect(meta.turn).toBe(3);
    expect(meta.status).toBe("finished");
    expect(buildSeasonVM(meta).finishedAtTurn).toBe(3);
  });

  // tmp/16-season.md「既存ゲームとの互換」節: firstTurn=1 の旧方式ゲームは番号・終了時刻を
  // 変えない (`turn > finalTurn` になった時点で終了する従来挙動のまま)。
  it("(d) firstTurn=1 の旧方式ゲームは turn > finalTurn で終了する (従来挙動)", () => {
    const repo = new FakeGameRepository();
    const gameId = setupGame(repo, {
      turn: 4,
      firstTurn: 1,
      lastTime: 0,
      finalTurn: 5,
      nextIslandId: 2,
    });
    repo.insertIsland(gameId, makeIsland(defaultConfig, createSeededRng(1), 1), 0);
    const turnService = new TurnService({
      repo,
      config: { ...defaultConfig, maxCatchUpTurns: 10 },
      rng: createSeededRng(2),
      backupStore: new FakeBackupStore(),
      logger: new FakeLogger(),
    });

    // turn=4 → 5 (5 > 5 は false、続行) → 6 (6 > 5 で終了)。
    const advanced = turnService.advanceTurnIfDue(defaultConfig.unitTimeSec * 100);

    expect(advanced).toBe(2);
    const meta = repo.getMeta(gameId);
    expect(meta.turn).toBe(6);
    expect(meta.firstTurn).toBe(1);
    expect(meta.status).toBe("finished");
    expect(buildSeasonVM(meta).finishedAtTurn).toBe(5);
  });
});
