import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.ts";
import { CommandKind, LandKind } from "../core/constants.ts";
import { createSeededRng } from "../core/rng.ts";
import { createTerrain } from "../core/terrain.ts";
import { AppError } from "./errors.ts";
import { FakeClock, FakeGameRepository, FakePasswordHasher } from "./fake-repository.ts";
import type { GameServiceDeps } from "./game-service.ts";
import { GameService } from "./game-service.ts";

function setup(overrides: Partial<GameServiceDeps> = {}, options: { skipInit?: boolean } = {}) {
  const repo = overrides.repo ?? new FakeGameRepository();
  if (!options.skipInit && !repo.isInitialized()) {
    repo.initialize({ turn: 1, lastTime: 0, nextIslandId: 1 });
  }
  const deps: GameServiceDeps = {
    repo,
    hasher: new FakePasswordHasher(),
    clock: new FakeClock(1_000_000),
    config: defaultConfig,
    rng: createSeededRng(42),
    ...overrides,
  };
  return { repo, deps, service: new GameService(deps) };
}

async function expectAppError(promise: Promise<unknown>, kind: string): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (err: unknown) => err instanceof AppError && err.kind === kind,
  );
}

function expectAppErrorSync(fn: () => unknown, kind: string): void {
  try {
    fn();
    expect.fail(`expected AppError(${kind}) but nothing was thrown`);
  } catch (err) {
    expect(err instanceof AppError && err.kind).toBe(kind);
  }
}

describe("GameService.createIsland", () => {
  it("正常に作成でき、NewIslandVM を返し、発見が history に記録される", async () => {
    const { service, repo } = setup();
    const vm = await service.createIsland("テスト島", "pass", "pass");
    expect(vm.name).toBe("テスト島");
    expect(vm.rank).toBe(1);
    expect(vm.money).toBe(defaultConfig.initialMoney);

    const history = repo.listHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0]?.html).toContain("テスト島");
  });

  it("island_full: 上限に達していると作成できない", async () => {
    const { service } = setup({ config: { ...defaultConfig, maxIslands: 0 } });
    await expectAppError(service.createIsland("テスト島", "pass", "pass"), "island_full");
  });

  it("no_name: 名前が空", async () => {
    const { service } = setup();
    await expectAppError(service.createIsland("", "pass", "pass"), "no_name");
  });

  it("bad_name: 禁止文字を含む", async () => {
    const { service } = setup();
    await expectAppError(service.createIsland("island?1", "pass", "pass"), "bad_name");
  });

  it("bad_name: 「無人」という名前", async () => {
    const { service } = setup();
    await expectAppError(service.createIsland("無人", "pass", "pass"), "bad_name");
  });

  it("name_taken: 既に存在する名前", async () => {
    const { service } = setup();
    await service.createIsland("テスト島", "pass", "pass");
    await expectAppError(service.createIsland("テスト島", "pass2", "pass2"), "name_taken");
  });

  it("no_password: パスワードが空", async () => {
    const { service } = setup();
    await expectAppError(service.createIsland("テスト島", "", ""), "no_password");
  });

  it("password_mismatch: 確認用パスワードが不一致", async () => {
    const { service } = setup();
    await expectAppError(service.createIsland("テスト島", "pass", "pass2"), "password_mismatch");
  });

  it("2番目以降の島は末尾の順位になる", async () => {
    const { service } = setup();
    await service.createIsland("島1", "pass", "pass");
    const vm2 = await service.createIsland("島2", "pass", "pass");
    expect(vm2.rank).toBe(2);
  });
});

describe("GameService.openOwnerPage", () => {
  it("正しいパスワードなら OwnerPageVM を返す", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    const vm = await service.openOwnerPage(created.id, "pass");
    expect(vm.name).toBe("テスト島");
    expect(vm.money).toBe(defaultConfig.initialMoney);
    expect(vm.commands).toHaveLength(defaultConfig.commandMax);
  });

  it("誤ったパスワードなら wrong_password", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    await expectAppError(service.openOwnerPage(created.id, "chigau"), "wrong_password");
  });

  it("マスターパスワードでも開ける", async () => {
    const { service } = setup({ masterPassword: "master1" });
    const created = await service.createIsland("テスト島", "pass", "pass");
    const vm = await service.openOwnerPage(created.id, "master1");
    expect(vm.name).toBe("テスト島");
  });

  it("存在しない島は island_not_found", async () => {
    const { service } = setup();
    await expectAppError(service.openOwnerPage(999, "pass"), "island_not_found");
  });
});

describe("GameService.registerCommand", () => {
  async function setupIsland() {
    const s = setup();
    const created = await s.service.createIsland("テスト島", "pass", "pass");
    return { ...s, islandId: created.id };
  }

  it("write モード: 指定位置に書き込む", async () => {
    const { service, islandId } = await setupIsland();
    const result = await service.registerCommand(islandId, "pass", {
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
  });

  it("insert モード: 既存を後ろへずらして挿入する", async () => {
    const { service, islandId } = await setupIsland();
    await service.registerCommand(islandId, "pass", {
      number: 0,
      kind: CommandKind.Prepare,
      x: 1,
      y: 1,
      amount: 0,
      target: 0,
      mode: "write",
    });
    const result = await service.registerCommand(islandId, "pass", {
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

  it("delete モード: 指定位置を削除し、末尾に資金繰りを補充する", async () => {
    const { service, islandId } = await setupIsland();
    await service.registerCommand(islandId, "pass", {
      number: 0,
      kind: CommandKind.Prepare,
      x: 1,
      y: 1,
      amount: 0,
      target: 0,
      mode: "write",
    });
    const result = await service.registerCommand(islandId, "pass", {
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

  it("AutoPrepare: 荒地を自動で整地予定に入れる", async () => {
    const { service, repo, islandId } = await setupIsland();
    const island = repo.findIsland(islandId);
    if (island === undefined) throw new Error("island not found");
    // 自然生成された地形には既に荒地が含まれ得るため、全面海にリセットしてから
    // 荒地を2箇所だけ用意し、期待値を決定的にする。
    island.terrain = createTerrain(defaultConfig.islandSize);
    island.terrain.setKind(0, 0, LandKind.Waste, 0);
    island.terrain.setKind(1, 1, LandKind.Waste, 0);
    repo.updateIsland(island);

    const result = await service.registerCommand(islandId, "pass", {
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

  it("AutoDelete: 全て資金繰りにする", async () => {
    const { service, islandId } = await setupIsland();
    await service.registerCommand(islandId, "pass", {
      number: 0,
      kind: CommandKind.Prepare,
      x: 1,
      y: 1,
      amount: 0,
      target: 0,
      mode: "write",
    });
    const result = await service.registerCommand(islandId, "pass", {
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

  it("誤ったパスワードなら wrong_password", async () => {
    const { service, islandId } = await setupIsland();
    await expectAppError(
      service.registerCommand(islandId, "chigau", {
        number: 0,
        kind: CommandKind.Prepare,
        x: 0,
        y: 0,
        amount: 0,
        target: 0,
        mode: "write",
      }),
      "wrong_password",
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
  ])("範囲外の入力 ($field) は invalid_input", async ({ value }) => {
    const { service, islandId } = await setupIsland();
    await expectAppError(
      service.registerCommand(islandId, "pass", {
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
  it("コメントを更新できる", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    const result = await service.updateComment(created.id, "pass", "よろしく");
    expect(result.comment).toBe("よろしく");
  });

  it("誤ったパスワードなら wrong_password", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    await expectAppError(service.updateComment(created.id, "chigau", "よろしく"), "wrong_password");
  });
});

describe("GameService.changeSettings", () => {
  it("名前変更: 資金が十分なら成功し、コストが引かれる", async () => {
    // defaultConfig.initialMoney(100) < costChangeName(500) なので、資金を十分に持たせるため
    // costChangeName を下げた設定でテストする。
    const { service, repo } = setup({ config: { ...defaultConfig, costChangeName: 10 } });
    const created = await service.createIsland("元の名前", "pass", "pass");
    await service.changeSettings(created.id, "pass", "新しい名前");

    const island = repo.findIsland(created.id);
    expect(island?.name).toBe("新しい名前");
    expect(island?.money).toBe(defaultConfig.initialMoney - 10);
  });

  it("名前変更: 資金が不足していると no_money", async () => {
    const { service, repo } = setup();
    const created = await service.createIsland("元の名前", "pass", "pass");
    const island = repo.findIsland(created.id);
    if (island === undefined) throw new Error("island not found");
    island.money = 0;
    repo.updateIsland(island);

    await expectAppError(service.changeSettings(created.id, "pass", "新しい名前"), "no_money");
  });

  it("パスワード変更: 新しいパスワードでログインできる", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    await service.changeSettings(created.id, "pass", undefined, "newpass", "newpass");

    await expectAppError(service.openOwnerPage(created.id, "pass"), "wrong_password");
    const vm = await service.openOwnerPage(created.id, "newpass");
    expect(vm.name).toBe("テスト島");
  });

  it("特殊パスワード: 資金と食料を9999にし、旧パスワード検証を免除する", async () => {
    const { service, repo } = setup({ specialPassword: "tokusyu" });
    const created = await service.createIsland("テスト島", "pass", "pass");
    await service.changeSettings(created.id, "tokusyu");

    const island = repo.findIsland(created.id);
    expect(island?.money).toBe(9999);
    expect(island?.food).toBe(9999);
  });

  it("何も変更がなければ nothing_to_change", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    await expectAppError(service.changeSettings(created.id, "pass"), "nothing_to_change");
  });

  it("確認用パスワードが不一致なら password_mismatch", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    await expectAppError(
      service.changeSettings(created.id, "pass", undefined, "newpass", "chigau"),
      "password_mismatch",
    );
  });

  it("旧パスワードが誤りなら wrong_password", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    await expectAppError(
      service.changeSettings(created.id, "chigau", "新しい名前"),
      "wrong_password",
    );
  });
});

describe("GameService lbbs", () => {
  function setupWithLbbs() {
    return setup({ config: { ...defaultConfig, useLbbs: true } });
  }

  it("観光者が記帳できる", async () => {
    const { service } = setupWithLbbs();
    const created = await service.createIsland("テスト島", "pass", "pass");
    const result = service.postLbbsAsVisitor(created.id, "旅人", "こんにちは");
    expect(result.lbbs[0]).toMatchObject({
      author: "visitor",
      name: "旅人",
      message: "こんにちは",
    });
    expect(result.notice).toBeTruthy();
  });

  it("useLbbs が false なら lbbs_disabled", async () => {
    const { service } = setup();
    const created = await service.createIsland("テスト島", "pass", "pass");
    expectAppErrorSync(
      () => service.postLbbsAsVisitor(created.id, "旅人", "こんにちは"),
      "lbbs_disabled",
    );
  });

  it("名前が空なら lbbs_empty", async () => {
    const { service } = setupWithLbbs();
    const created = await service.createIsland("テスト島", "pass", "pass");
    expectAppErrorSync(() => service.postLbbsAsVisitor(created.id, "", "こんにちは"), "lbbs_empty");
  });

  it("メッセージが空なら lbbs_empty (B5: Perl 版のバグを修正)", async () => {
    const { service } = setupWithLbbs();
    const created = await service.createIsland("テスト島", "pass", "pass");
    expectAppErrorSync(() => service.postLbbsAsVisitor(created.id, "旅人", ""), "lbbs_empty");
  });

  it("島主が記帳できる", async () => {
    const { service } = setupWithLbbs();
    const created = await service.createIsland("テスト島", "pass", "pass");
    const result = await service.postLbbsAsOwner(created.id, "pass", "島主", "ようこそ");
    expect(result.lbbs[0]).toMatchObject({ author: "owner", name: "島主", message: "ようこそ" });
  });

  it("島主の記帳: パスワードが誤りなら wrong_password", async () => {
    const { service } = setupWithLbbs();
    const created = await service.createIsland("テスト島", "pass", "pass");
    await expectAppError(
      service.postLbbsAsOwner(created.id, "chigau", "島主", "ようこそ"),
      "wrong_password",
    );
  });

  it("島主が削除できる", async () => {
    const { service } = setupWithLbbs();
    const created = await service.createIsland("テスト島", "pass", "pass");
    service.postLbbsAsVisitor(created.id, "旅人1", "1件目");
    service.postLbbsAsVisitor(created.id, "旅人2", "2件目");
    const result = await service.deleteLbbs(created.id, "pass", 0);
    expect(result.lbbs[0]).toMatchObject({ name: "旅人1" });
  });

  it("lbbsMax を超えた分は切り詰められる", async () => {
    const { service } = setup({ config: { ...defaultConfig, useLbbs: true, lbbsMax: 2 } });
    const created = await service.createIsland("テスト島", "pass", "pass");
    service.postLbbsAsVisitor(created.id, "旅人1", "1件目");
    service.postLbbsAsVisitor(created.id, "旅人2", "2件目");
    const result = service.postLbbsAsVisitor(created.id, "旅人3", "3件目");
    expect(result.lbbs).toHaveLength(2);
    expect(result.lbbs[0]?.name).toBe("旅人3");
  });
});

describe("GameService.getTopPage / getIslandPage", () => {
  it("not_initialized: 初期化前は例外", () => {
    const repo = new FakeGameRepository();
    const { service } = setup({ repo }, { skipInit: true });
    expectAppErrorSync(() => service.getTopPage(), "not_initialized");
  });

  it("島を作ると canCreate や順位が反映される", async () => {
    const { service } = setup();
    await service.createIsland("島1", "pass", "pass");
    const top = service.getTopPage();
    expect(top.islands).toHaveLength(1);
    expect(top.islands[0]?.rank).toBe(1);
    expect(top.canCreate).toBe(true);
  });

  it("観光画面は moneyDisplay を持つ", async () => {
    const { service } = setup();
    const created = await service.createIsland("島1", "pass", "pass");
    const page = service.getIslandPage(created.id);
    expect(page.moneyDisplay.mode).toBe("about");
  });

  it("存在しない島は island_not_found", () => {
    const { service } = setup();
    expectAppErrorSync(() => service.getIslandPage(999), "island_not_found");
  });
});
