import { describe, expect, it } from "vitest";
import type { AuthUser } from "./auth.ts";
import { defaultConfig } from "../core/config.ts";
import { CommandKind, LandKind } from "../core/constants.ts";
import { createSeededRng } from "../core/rng.ts";
import { createTerrain } from "../core/terrain.ts";
import { AppError } from "./errors.ts";
import { FakeClock, FakeGameRepository } from "./fake-repository.ts";
import type { GameServiceDeps } from "./game-service.ts";
import { GameService } from "./game-service.ts";

function user(id: string, name = `user-${id}`): AuthUser {
  return { id, name, email: `${id}@example.com`, isAdmin: false };
}

function setup(overrides: Partial<GameServiceDeps> = {}, options: { skipInit?: boolean } = {}) {
  const repo = overrides.repo ?? new FakeGameRepository();
  if (!options.skipInit && !repo.isInitialized()) {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
  }
  const deps: GameServiceDeps = {
    repo,
    clock: new FakeClock(1_000_000),
    config: defaultConfig,
    rng: createSeededRng(42),
    ...overrides,
  };
  return { repo, deps, service: new GameService(deps) };
}

function expectAppError(fn: () => unknown, kind: string): void {
  try {
    fn();
    expect.fail(`expected AppError(${kind}) but nothing was thrown`);
  } catch (err) {
    expect(err instanceof AppError && err.kind).toBe(kind);
  }
}

describe("GameService.createIsland", () => {
  it("正常に作成でき、NewIslandVM を返し、発見が history に記録される", () => {
    const { service, repo } = setup();
    const vm = service.createIsland(user("u1"), "テスト島");
    expect(vm.name).toBe("テスト島");
    expect(vm.rank).toBe(1);
    expect(vm.money).toBe(defaultConfig.initialMoney);

    const history = repo.listHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0]?.html).toContain("テスト島");
  });

  it("login_required: 未ログインでは作成できない", () => {
    const { service } = setup();
    expectAppError(() => service.createIsland(undefined, "テスト島"), "login_required");
  });

  it("already_has_island: 既に自分の島を持っていると作成できない", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "島1");
    expectAppError(() => service.createIsland(user("u1"), "島2"), "already_has_island");
  });

  it("island_full: 上限に達していると作成できない", () => {
    const { service } = setup({ config: { ...defaultConfig, maxIslands: 0 } });
    expectAppError(() => service.createIsland(user("u1"), "テスト島"), "island_full");
  });

  it("no_name: 名前が空", () => {
    const { service } = setup();
    expectAppError(() => service.createIsland(user("u1"), ""), "no_name");
  });

  it("bad_name: 禁止文字を含む", () => {
    const { service } = setup();
    expectAppError(() => service.createIsland(user("u1"), "island?1"), "bad_name");
  });

  it("bad_name: 「無人」という名前", () => {
    const { service } = setup();
    expectAppError(() => service.createIsland(user("u1"), "無人"), "bad_name");
  });

  it("ng_word: NG ワードを含む名前", () => {
    const { service } = setup();
    expectAppError(() => service.createIsland(user("u1"), "エロティズム島"), "ng_word");
  });

  it("HAKONIWA_NG_WORDS 由来の追加語も検出する", () => {
    const { service } = setup({ ngWords: ["きんしご"] });
    expectAppError(() => service.createIsland(user("u1"), "きんしご島"), "ng_word");
  });

  it("name_taken: 既に存在する名前", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "テスト島");
    expectAppError(() => service.createIsland(user("u2"), "テスト島"), "name_taken");
  });

  it("2番目以降の島は末尾の順位になる", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "島1");
    const vm2 = service.createIsland(user("u2"), "島2");
    expect(vm2.rank).toBe(2);
  });
});

describe("GameService.openOwnerPage", () => {
  it("自分の島の OwnerPageVM を返す", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "テスト島");
    const vm = service.openOwnerPage(user("u1"));
    expect(vm.name).toBe("テスト島");
    expect(vm.money).toBe(defaultConfig.initialMoney);
    expect(vm.commands).toHaveLength(defaultConfig.commandMax);
    expect(vm.defaults).toEqual({});
  });

  it("login_required: 未ログイン", () => {
    const { service } = setup();
    expectAppError(() => service.openOwnerPage(undefined), "login_required");
  });

  it("no_island: 自分の島を持っていない", () => {
    const { service } = setup();
    expectAppError(() => service.openOwnerPage(user("u1")), "no_island");
  });
});

describe("GameService.registerCommand", () => {
  function setupIsland() {
    const s = setup();
    s.service.createIsland(user("u1"), "テスト島");
    return s;
  }

  it("write モード: 指定位置に書き込み、user_prefs が更新される", () => {
    const { service, repo } = setupIsland();
    const result = service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.Prepare,
      x: 1,
      y: 1,
      amount: 0,
      target: 0,
      mode: "write",
    });
    expect(result.commands[0]?.text).toContain("整地");
    expect(result.notice).toBeTruthy();
    expect(repo.getUserPrefs("u1")).toEqual({
      targetIslandId: 0,
      pointX: 1,
      pointY: 1,
      kind: CommandKind.Prepare,
    });
    expect(result.defaults).toEqual({
      targetIslandId: 0,
      pointX: 1,
      pointY: 1,
      kind: CommandKind.Prepare,
    });
  });

  it("insert モード: 既存を後ろへずらして挿入する", () => {
    const { service } = setupIsland();
    service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.Prepare,
      x: 1,
      y: 1,
      amount: 0,
      target: 0,
      mode: "write",
    });
    const result = service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.Reclaim,
      x: 2,
      y: 2,
      amount: 0,
      target: 0,
      mode: "insert",
    });
    expect(result.commands[0]?.text).toContain("埋め立て");
    expect(result.commands[1]?.text).toContain("整地");
  });

  it("delete モード: 指定位置を削除し、末尾に資金繰りを補充する", () => {
    const { service } = setupIsland();
    service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.Prepare,
      x: 1,
      y: 1,
      amount: 0,
      target: 0,
      mode: "write",
    });
    const result = service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.DoNothing,
      x: 0,
      y: 0,
      amount: 0,
      target: 0,
      mode: "delete",
    });
    expect(result.commands[0]?.text).toBe("資金繰り");
    expect(result.commands[defaultConfig.commandMax - 1]?.text).toBe("資金繰り");
  });

  it("AutoPrepare: 荒地を自動で整地予定に入れる", () => {
    const { service, repo } = setupIsland();
    const summary = repo.findIslandByOwner("u1");
    if (summary === undefined) throw new Error("island not found");
    const island = repo.findIsland(summary.id);
    if (island === undefined) throw new Error("island not found");
    island.terrain = createTerrain(defaultConfig.islandSize);
    island.terrain.setKind(0, 0, LandKind.Waste, 0);
    island.terrain.setKind(1, 1, LandKind.Waste, 0);
    repo.updateIsland(island);

    const result = service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.AutoPrepare,
      x: 0,
      y: 0,
      amount: 0,
      target: 0,
      mode: "write",
    });
    const texts = result.commands.map((c) => c.text);
    expect(texts.filter((t) => t.includes("整地"))).toHaveLength(2);
  });

  it("AutoDelete: 全て資金繰りにする", () => {
    const { service } = setupIsland();
    service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.Prepare,
      x: 1,
      y: 1,
      amount: 0,
      target: 0,
      mode: "write",
    });
    const result = service.registerCommand(user("u1"), {
      number: 0,
      kind: CommandKind.AutoDelete,
      x: 0,
      y: 0,
      amount: 0,
      target: 0,
      mode: "write",
    });
    expect(result.commands.every((c) => c.text === "資金繰り")).toBe(true);
  });

  it("forbidden: 他人の島には登録できない", () => {
    const { service } = setupIsland();
    expectAppError(
      () =>
        service.registerCommand(user("u2"), {
          number: 0,
          kind: CommandKind.Prepare,
          x: 0,
          y: 0,
          amount: 0,
          target: 0,
          mode: "write",
        }),
      "no_island",
    );
  });

  it.each([
    { field: "number", value: { number: -1 } },
    { field: "number", value: { number: defaultConfig.commandMax } },
    { field: "x", value: { x: -1 } },
    { field: "x", value: { x: defaultConfig.islandSize } },
    { field: "y", value: { y: -1 } },
    { field: "amount", value: { amount: -1 } },
    { field: "amount", value: { amount: 100 } },
    { field: "kind", value: { kind: 9999 } },
  ])("範囲外の入力 ($field) は invalid_input", ({ value }) => {
    const { service } = setupIsland();
    expectAppError(
      () =>
        service.registerCommand(user("u1"), {
          number: 0,
          kind: CommandKind.Prepare,
          x: 0,
          y: 0,
          amount: 0,
          target: 0,
          mode: "write",
          ...value,
        }),
      "invalid_input",
    );
  });
});

describe("GameService.updateComment", () => {
  it("コメントを更新できる", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "テスト島");
    const result = service.updateComment(user("u1"), "よろしく");
    expect(result.comment).toBe("よろしく");
  });

  it("ng_word: NG ワードを含むコメント", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "テスト島");
    expectAppError(() => service.updateComment(user("u1"), "エロティズム"), "ng_word");
  });

  it("no_island: 自分の島を持っていない", () => {
    const { service } = setup();
    expectAppError(() => service.updateComment(user("u1"), "よろしく"), "no_island");
  });
});

describe("GameService.changeName", () => {
  it("資金が十分なら成功し、コストが引かれる", () => {
    const { service, repo } = setup({ config: { ...defaultConfig, costChangeName: 10 } });
    service.createIsland(user("u1"), "元の名前");
    service.changeName(user("u1"), "新しい名前");

    const summary = repo.findIslandByOwner("u1");
    const island = summary && repo.findIsland(summary.id);
    expect(island?.name).toBe("新しい名前");
    expect(island?.money).toBe(defaultConfig.initialMoney - 10);
  });

  it("資金が不足していると no_money", () => {
    const { service, repo } = setup();
    service.createIsland(user("u1"), "元の名前");
    const summary = repo.findIslandByOwner("u1");
    if (summary === undefined) throw new Error("island not found");
    const island = repo.findIsland(summary.id);
    if (island === undefined) throw new Error("island not found");
    island.money = 0;
    repo.updateIsland(island);

    expectAppError(() => service.changeName(user("u1"), "新しい名前"), "no_money");
  });

  it("ng_word: NG ワードを含む新しい名前", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "元の名前");
    expectAppError(() => service.changeName(user("u1"), "エロティズム"), "ng_word");
  });

  it("no_island: 自分の島を持っていない", () => {
    const { service } = setup();
    expectAppError(() => service.changeName(user("u1"), "新しい名前"), "no_island");
  });
});

describe("GameService.postLbbs", () => {
  function setupWithLbbs() {
    return setup({ config: { ...defaultConfig, useLbbs: true } });
  }

  it("自分の島には owner として記帳できる", () => {
    const { service } = setupWithLbbs();
    const created = service.createIsland(user("u1"), "テスト島");
    const result = service.postLbbs(user("u1", "島主"), created.id, "ようこそ");
    expect(result.lbbs[0]).toMatchObject({ author: "owner", name: "島主", message: "ようこそ" });
  });

  it("他人の島には visitor として記帳できる", () => {
    const { service } = setupWithLbbs();
    const created = service.createIsland(user("u1"), "テスト島");
    const result = service.postLbbs(user("u2", "旅人"), created.id, "こんにちは");
    expect(result.lbbs[0]).toMatchObject({
      author: "visitor",
      name: "旅人",
      message: "こんにちは",
    });
  });

  it("login_required: 未ログインでは記帳できない", () => {
    const { service } = setupWithLbbs();
    const created = service.createIsland(user("u1"), "テスト島");
    expectAppError(() => service.postLbbs(undefined, created.id, "こんにちは"), "login_required");
  });

  it("useLbbs が false なら lbbs_disabled", () => {
    const { service } = setup();
    const created = service.createIsland(user("u1"), "テスト島");
    expectAppError(() => service.postLbbs(user("u2"), created.id, "こんにちは"), "lbbs_disabled");
  });

  it("メッセージが空なら lbbs_empty", () => {
    const { service } = setupWithLbbs();
    const created = service.createIsland(user("u1"), "テスト島");
    expectAppError(() => service.postLbbs(user("u2"), created.id, ""), "lbbs_empty");
  });

  it("ng_word: NG ワードを含むメッセージ", () => {
    const { service } = setupWithLbbs();
    const created = service.createIsland(user("u1"), "テスト島");
    expectAppError(() => service.postLbbs(user("u2"), created.id, "エロティズム"), "ng_word");
  });

  it("lbbsMax を超えた分は切り詰められる", () => {
    const { service } = setup({ config: { ...defaultConfig, useLbbs: true, lbbsMax: 2 } });
    const created = service.createIsland(user("u1"), "テスト島");
    service.postLbbs(user("u2", "旅人1"), created.id, "1件目");
    service.postLbbs(user("u3", "旅人2"), created.id, "2件目");
    const result = service.postLbbs(user("u4", "旅人3"), created.id, "3件目");
    expect(result.lbbs).toHaveLength(2);
    expect(result.lbbs[0]?.name).toBe("旅人3");
  });
});

describe("GameService.deleteLbbs", () => {
  function setupWithLbbs() {
    return setup({ config: { ...defaultConfig, useLbbs: true } });
  }

  it("自分の島の記帳を削除できる", () => {
    const { service } = setupWithLbbs();
    const created = service.createIsland(user("u1"), "テスト島");
    service.postLbbs(user("u2", "旅人1"), created.id, "1件目");
    service.postLbbs(user("u3", "旅人2"), created.id, "2件目");
    const result = service.deleteLbbs(user("u1"), 0);
    expect(result.lbbs[0]).toMatchObject({ name: "旅人1" });
  });

  it("no_island: 自分の島を持っていない", () => {
    const { service } = setupWithLbbs();
    expectAppError(() => service.deleteLbbs(user("u1"), 0), "no_island");
  });
});

describe("GameService.getTopPage / getIslandPage", () => {
  it("not_initialized: 初期化前は例外", () => {
    const repo = new FakeGameRepository();
    const { service } = setup({ repo }, { skipInit: true });
    expectAppError(() => service.getTopPage(undefined), "not_initialized");
  });

  it("島を作ると canCreate や順位が反映される", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "島1");
    const top = service.getTopPage(undefined);
    expect(top.islands).toHaveLength(1);
    expect(top.islands[0]?.rank).toBe(1);
    expect(top.canCreate).toBe(true);
    expect(top.viewer).toEqual({ hasIsland: false });
  });

  it("viewer は actor とその島の有無を反映する", () => {
    const { service } = setup();
    service.createIsland(user("u1"), "島1");
    const top = service.getTopPage(user("u1"));
    expect(top.viewer.user?.id).toBe("u1");
    expect(top.viewer.hasIsland).toBe(true);

    const topOther = service.getTopPage(user("u2"));
    expect(topOther.viewer.hasIsland).toBe(false);
  });

  it("観光画面は moneyDisplay を持つ", () => {
    const { service } = setup();
    const created = service.createIsland(user("u1"), "島1");
    const page = service.getIslandPage(created.id);
    expect(page.moneyDisplay.mode).toBe("about");
  });

  it("存在しない島は island_not_found", () => {
    const { service } = setup();
    expectAppError(() => service.getIslandPage(999), "island_not_found");
  });
});
