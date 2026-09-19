// 実 DB (:memory:) + buildDeps で GameService/TurnService を結合テストする。
import {
  buildDeps,
  createSeededRng,
  defaultConfig,
  FakeBackupStore,
  FakeClock,
  migrate,
} from "@hakoniwa/game";
import type { AppConfig, AuthUser } from "@hakoniwa/game";
import { beforeEach, describe, expect, it } from "vitest";
import { NodeSqliteDriver } from "../src/driver.ts";

function user(id: string): AuthUser {
  return { id, name: `user-${id}`, email: `${id}@example.com`, isAdmin: false };
}

function setup(
  overrides: Partial<typeof defaultConfig> = {},
  initOptions: { startAt?: number } = {},
) {
  const driver = new NodeSqliteDriver(":memory:");
  migrate(driver);
  const clock = new FakeClock(0);
  const backupStore = new FakeBackupStore();
  const config: AppConfig = {
    game: { ...defaultConfig, ...overrides, maxCatchUpTurns: 10 },
    auth: {
      baseUrl: "http://localhost:5173",
      secret: "test-secret",
      devLogin: false,
      adminEmails: [],
    },
    mail: { mailFrom: "hakoniwa@example.com" },
    ngWords: [],
    adminEnabled: true,
    debug: false,
    timezone: "Asia/Tokyo",
  };
  const deps = buildDeps({
    driver,
    backupStore,
    clock,
    config,
    rng: createSeededRng(42),
  });
  deps.adminService.initialize(clock.now(), initOptions);
  const gameId = deps.repo.getCurrentGameId();
  if (gameId === undefined) {
    throw new Error("unreachable: game not created");
  }
  return { driver, clock, backupStore, gameId, ...deps };
}

describe("turn-integration (実 DB)", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("createIsland で 2 島作成 → advanceTurn 数回で turn が進み、島が読み戻せる", () => {
    const { gameService, turnService, driver, gameId } = ctx;

    const created1 = gameService.createIsland(user("u1"), gameId, "島1");
    const created2 = gameService.createIsland(user("u2"), gameId, "島2");
    expect(created1.id).toBe(1);
    expect(created2.id).toBe(2);

    // tmp/16-season.md「開始前の状態 = ターン 0」節: 新しいゲームは turn=0 (開始前) で作られる。
    const before = driver.get<{ turn: number }>("SELECT turn FROM games WHERE id = ?", gameId);
    expect(before?.turn).toBe(0);

    turnService.advanceTurn(ctx.clock.now());
    turnService.advanceTurn(ctx.clock.now());
    turnService.advanceTurn(ctx.clock.now());

    const after = driver.get<{ turn: number }>("SELECT turn FROM games WHERE id = ?", gameId);
    expect(after?.turn).toBe(3);

    const top = gameService.getTopPage(undefined, gameId);
    expect(top.turn).toBe(3);
    expect(top.islands.map((i) => i.name).sort()).toEqual(["島1", "島2"]);
  });

  it("advanceTurnIfDue は期限が来るまで進まず、期限が来ると maxCatchUpTurns まで進む", () => {
    // tmp/16-season.md「開始前の状態 = ターン 0」節: turn=0 の期限判定は `now >= startAt` のみで
    // 判定する (省略時の startAt は現在時刻の切り下げなので即座に期限到来してしまう)。
    // 「期限前は進まない」を確かめるため、startAt を明示的に未来にする。
    const startAt = defaultConfig.unitTimeSec;
    const localCtx = setup({}, { startAt });
    const { turnService, clock, driver, gameId } = localCtx;

    // startAt 前は進まない。
    expect(turnService.advanceTurnIfDue(clock.now())).toBe(0);

    // startAt 到達 (turn 0→1) 後、さらに 2 ターン分の期限が来ている状態にする。
    clock.advance(startAt + defaultConfig.unitTimeSec * 2);
    const advanced = turnService.advanceTurnIfDue(clock.now());
    expect(advanced).toBe(3);

    const meta = driver.get<{ turn: number }>("SELECT turn FROM games WHERE id = ?", gameId);
    expect(meta?.turn).toBe(3);
  });

  it("発見時の history はターン処理をまたいでも読み出せる (repo 経由の永続化確認)", () => {
    const { gameService, turnService, clock, gameId } = ctx;
    gameService.createIsland(user("u1"), gameId, "島1");

    turnService.advanceTurn(clock.now());

    const top = gameService.getTopPage(undefined, gameId);
    // 発見ログが history に記録され、ターン処理後も残っている。
    expect(top.history.some((h) => h.html.includes("島1"))).toBe(true);
  });

  it("最終ターン到達で status が finished になり、それ以降ターンが進まない (tmp/18-games.md)", () => {
    const driver = new NodeSqliteDriver(":memory:");
    migrate(driver);
    const clock = new FakeClock(0);
    const backupStore = new FakeBackupStore();
    const config: AppConfig = {
      game: { ...defaultConfig, maxCatchUpTurns: 10 },
      auth: {
        baseUrl: "http://localhost:5173",
        secret: "test-secret",
        devLogin: false,
        adminEmails: [],
      },
      mail: { mailFrom: "hakoniwa@example.com" },
      ngWords: [],
      adminEnabled: true,
      debug: false,
      timezone: "Asia/Tokyo",
    };
    const deps = buildDeps({ driver, backupStore, clock, config, rng: createSeededRng(42) });
    deps.adminService.initialize(clock.now(), { finalTurn: 2 });
    const gameId = deps.repo.getCurrentGameId();
    if (gameId === undefined) throw new Error("unreachable");

    // tmp/16-season.md「開始前の状態 = ターン 0」節: 新しいゲームは turn=0 で始まるため、
    // finalTurn=2 は 2 回の処理 (turn=2) で終了する。
    deps.turnService.advanceTurn(clock.now());
    expect(deps.repo.getMeta(gameId).status).toBe("running");
    deps.turnService.advanceTurn(clock.now());
    const meta = deps.repo.getMeta(gameId);
    expect(meta.turn).toBe(2);
    expect(meta.status).toBe("finished");
    expect(meta.finishedAt).not.toBeNull();

    // それ以降は進まない。
    deps.turnService.advanceTurn(clock.now());
    expect(deps.repo.getMeta(gameId).turn).toBe(2);
    expect(deps.turnService.advanceTurnIfDue(clock.now() + 100000)).toBe(0);
  });
});
