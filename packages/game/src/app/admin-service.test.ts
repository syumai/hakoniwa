import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.ts";
import { createSeededRng } from "../core/rng.ts";
import { makeTestIsland } from "../core/test-helpers.ts";
import { AdminService } from "./admin-service.ts";
import { AuthMethodPolicy } from "./auth-methods.ts";
import {
  FakeBackupStore,
  FakeClock,
  FakeGameRepository,
  FakeLogger,
  FakeSettingsRepository,
} from "./fake-repository.ts";
import { TurnService } from "./turn-service.ts";

function setup() {
  const repo = new FakeGameRepository();
  const backupStore = new FakeBackupStore();
  const clock = new FakeClock(1_000_000);
  const turnService = new TurnService({
    repo,
    config: defaultConfig,
    rng: createSeededRng(1),
    backupStore,
    logger: new FakeLogger(),
  });
  const settings = new FakeSettingsRepository();
  const authMethods = new AuthMethodPolicy({
    configured: { x: true, discord: true, email: true },
    settings,
  });
  const admin = new AdminService({
    repo,
    clock,
    config: defaultConfig,
    backupStore,
    turnService,
    authMethods,
    mailerIsConsole: true,
  });
  return { repo, backupStore, clock, turnService, admin, authMethods };
}

describe("AdminService.initialize", () => {
  it("turn=1, nextIslandId=1、lastTime は unitTimeSec で切り下げる", () => {
    const { repo, admin } = setup();
    const now = defaultConfig.unitTimeSec * 3 + 123;

    admin.initialize(now);

    expect(repo.isInitialized()).toBe(true);
    const meta = repo.getMeta();
    expect(meta.turn).toBe(1);
    expect(meta.nextIslandId).toBe(1);
    expect(meta.lastTime).toBe(defaultConfig.unitTimeSec * 3);
  });

  it("既存データがあっても上書きしてやり直せる", () => {
    const { repo, admin } = setup();
    admin.initialize(0);
    repo.saveMeta({ turn: 99, lastTime: 0, nextIslandId: 5 });

    admin.initialize(defaultConfig.unitTimeSec);

    expect(repo.getMeta().turn).toBe(1);
  });
});

describe("AdminService.reset", () => {
  it("全データを削除し isInitialized が false になる", () => {
    const { repo, admin } = setup();
    admin.initialize(0);
    expect(repo.isInitialized()).toBe(true);

    admin.reset();

    expect(repo.isInitialized()).toBe(false);
  });
});

describe("AdminService.setLastTime", () => {
  it("lastTime だけを更新する", () => {
    const { repo, admin } = setup();
    admin.initialize(0);

    admin.setLastTime(123456);

    const meta = repo.getMeta();
    expect(meta.lastTime).toBe(123456);
    expect(meta.turn).toBe(1);
  });
});

describe("AdminService.status", () => {
  it("未初期化なら initialized: false を返す", async () => {
    const { admin } = setup();
    const status = await admin.status();
    expect(status.initialized).toBe(false);
    expect(status.backups).toEqual([]);
  });

  it("初期化後は turn/lastTime を返す", async () => {
    const { admin } = setup();
    admin.initialize(0);
    const status = await admin.status();
    expect(status.initialized).toBe(true);
    expect(status.turn).toBe(1);
  });
});

describe("AdminService バックアップ操作", () => {
  it("作成・一覧・削除ができる", async () => {
    const { admin } = setup();
    admin.initialize(0);

    await admin.createBackup("manual-1");
    let backups = await admin.listBackups();
    expect(backups.map((b) => b.label)).toContain("manual-1");

    await admin.deleteBackup("manual-1");
    backups = await admin.listBackups();
    expect(backups.map((b) => b.label)).not.toContain("manual-1");
  });

  it("復元は BackupStore に委譲される", async () => {
    const { admin, backupStore } = setup();
    admin.initialize(0);
    await admin.createBackup("manual-1");

    await expect(admin.restoreBackup("manual-1")).resolves.toBeUndefined();
    await expect(admin.restoreBackup("does-not-exist")).rejects.toThrow();
    void backupStore;
  });
});

describe("AdminService.advanceTurn", () => {
  it("TurnService.advanceTurn に委譲する", () => {
    const { repo, admin } = setup();
    admin.initialize(0);

    admin.advanceTurn(0);

    expect(repo.getMeta().turn).toBe(2);
  });
});

describe("AdminService.maximizeIsland", () => {
  it("資金と食料を9999にする", () => {
    const { repo, admin } = setup();
    admin.initialize(0);
    const island = makeTestIsland({ id: 1, money: 10, food: 10 });
    repo.insertIsland(island, 0);

    admin.maximizeIsland(1);

    const updated = repo.findIsland(1);
    expect(updated?.money).toBe(9999);
    expect(updated?.food).toBe(9999);
  });

  it("存在しない島は Error", () => {
    const { admin } = setup();
    admin.initialize(0);
    expect(() => admin.maximizeIsland(999)).toThrow();
  });
});

describe("AdminService.getAuthMethods / setAuthMethods", () => {
  it("既定はすべて有効、mailerIsConsole を含む", () => {
    const { admin } = setup();
    expect(admin.getAuthMethods()).toEqual({
      configured: { x: true, discord: true, email: true },
      enabled: { x: true, discord: true, email: true },
      mailerIsConsole: true,
    });
  });

  it("setAuthMethods で切り替えると getAuthMethods に反映される", () => {
    const { admin } = setup();
    admin.setAuthMethods({ x: false, discord: true, email: true });
    expect(admin.getAuthMethods().enabled).toEqual({ x: false, discord: true, email: true });
  });
});
