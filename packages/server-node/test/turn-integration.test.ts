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

function setup(overrides: Partial<typeof defaultConfig> = {}) {
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
  };
  const deps = buildDeps({
    driver,
    backupStore,
    clock,
    config,
    rng: createSeededRng(42),
  });
  deps.adminService.initialize(clock.now());
  return { driver, clock, backupStore, ...deps };
}

describe("turn-integration (実 DB)", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("createIsland で 2 島作成 → advanceTurn 数回で turn が進み、島が読み戻せる", () => {
    const { gameService, turnService, driver } = ctx;

    const created1 = gameService.createIsland(user("u1"), "島1");
    const created2 = gameService.createIsland(user("u2"), "島2");
    expect(created1.id).toBe(1);
    expect(created2.id).toBe(2);

    const before = driver.get<{ turn: number }>("SELECT turn FROM game WHERE id = 1");
    expect(before?.turn).toBe(1);

    turnService.advanceTurn(ctx.clock.now());
    turnService.advanceTurn(ctx.clock.now());
    turnService.advanceTurn(ctx.clock.now());

    const after = driver.get<{ turn: number }>("SELECT turn FROM game WHERE id = 1");
    expect(after?.turn).toBe(4);

    const top = gameService.getTopPage(undefined);
    expect(top.turn).toBe(4);
    expect(top.islands.map((i) => i.name).sort()).toEqual(["島1", "島2"]);
  });

  it("advanceTurnIfDue は期限が来るまで進まず、期限が来ると maxCatchUpTurns まで進む", () => {
    const { turnService, clock, driver } = ctx;
    // unitTimeSec 経過前は進まない。
    expect(turnService.advanceTurnIfDue(clock.now())).toBe(0);

    clock.advance(defaultConfig.unitTimeSec * 3);
    const advanced = turnService.advanceTurnIfDue(clock.now());
    expect(advanced).toBe(3);

    const meta = driver.get<{ turn: number }>("SELECT turn FROM game WHERE id = 1");
    expect(meta?.turn).toBe(4);
  });

  it("発見時の history はターン処理をまたいでも読み出せる (repo 経由の永続化確認)", () => {
    const { gameService, turnService, clock } = ctx;
    gameService.createIsland(user("u1"), "島1");

    turnService.advanceTurn(clock.now());

    const top = gameService.getTopPage(undefined);
    // 発見ログが history に記録され、ターン処理後も残っている。
    expect(top.history.some((h) => h.html.includes("島1"))).toBe(true);
  });
});
