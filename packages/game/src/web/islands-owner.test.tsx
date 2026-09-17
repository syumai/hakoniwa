import { describe, expect, it } from "vitest";
import { DEFAULTS_COOKIE_NAME } from "./middleware/defaults-cookie.ts";
import { postForm, setupTestApp } from "./test-helpers.ts";

async function createIsland(
  app: ReturnType<typeof setupTestApp>["app"],
  name = "てすとじま",
  password = "pass1234",
) {
  return postForm(app, "/islands", { name, password, passwordConfirm: password });
}

describe("POST /islands (新規作成)", () => {
  it("成功: 発見画面を表示する", async () => {
    const { app } = setupTestApp();
    const res = await createIsland(app);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("島を発見しました！！");
    expect(html).toContain("「てすとじま島」");
  });

  it("island_full: 上限のとき 409", async () => {
    const { app } = setupTestApp({ gameOverrides: { maxIslands: 0 } });
    const res = await createIsland(app);
    expect(res.status).toBe(409);
    const html = await res.text();
    expect(html).toContain("申し訳ありません、島が一杯で登録できません");
  });

  it("no_name: 名前が空のとき 400", async () => {
    const { app } = setupTestApp();
    const res = await postForm(app, "/islands", { name: "", password: "p", passwordConfirm: "p" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("島につける名前が必要です");
  });
});

describe("GET /islands/:id (観光)", () => {
  it("成功: ようこそ画面を表示する", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await app.request("/islands/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("「てすとじま島」");
    expect(html).toContain("へようこそ！！");
  });

  it("存在しない島は 404", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/islands/999");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("問題発生");
  });
});

describe("POST /owner (自分の島へ)", () => {
  it("成功: 開発計画画面を表示し hako_defaults を Set-Cookie する", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/owner", { islandId: 1, password: "pass1234" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("開発計画");
    expect(html).toContain("の近況");

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(DEFAULTS_COOKIE_NAME);
    expect(setCookie).toContain("ownIslandId%22%3A1");
  });

  it("wrong_password: 誤パスワードは 403", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/owner", { islandId: 1, password: "wrong" });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("パスワードが違います。");
  });
});

describe("POST /islands/:id/owner", () => {
  it("成功: 開発計画画面を表示する", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/islands/1/owner", { password: "pass1234" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("開発計画");
  });
});

describe("POST /islands/:id/commands (計画登録)", () => {
  it("成功: コマンドを登録しました と (0,0)で整地 を表示する", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/islands/1/commands", {
      password: "pass1234",
      number: 0,
      kind: 1,
      x: 0,
      y: 0,
      amount: 0,
      target: 0,
      mode: "insert",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("コマンドを登録しました");
    expect(html).toContain("(0,0)で整地");
  });

  it("invalid_input: kind が不正な文字列なら 400", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/islands/1/commands", {
      password: "pass1234",
      number: 0,
      kind: "abc",
      x: 0,
      y: 0,
      amount: 0,
      target: 0,
      mode: "insert",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /islands/:id/comment (コメント更新)", () => {
  it("成功: コメントを更新しました を表示し、トップにも反映される", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/islands/1/comment", {
      password: "pass1234",
      message: "よろしくお願いします",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("コメントを更新しました");

    const top = await app.request("/");
    const topHtml = await top.text();
    expect(topHtml).toContain("コメント：");
    expect(topHtml).toContain("よろしくお願いします");
  });
});

describe("POST /settings (トップページの「島の名前とパスワードの変更」フォーム、追加ルート)", () => {
  it("no_money: 資金不足のときは 400", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/settings", {
      islandId: 1,
      oldPassword: "pass1234",
      name: "しんめい",
      password: "",
      passwordConfirm: "",
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("資金不足のため変更できません");
  });
});

describe("POST /islands/:id/settings (名前/パスワード変更)", () => {
  it("no_money: 資金不足のときは 400", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/islands/1/settings", {
      oldPassword: "pass1234",
      name: "しんめい",
      password: "",
      passwordConfirm: "",
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("資金不足のため変更できません");
  });

  it("成功: パスワードのみ変更すれば完了画面を表示する", async () => {
    const { app } = setupTestApp();
    await createIsland(app);
    const res = await postForm(app, "/islands/1/settings", {
      oldPassword: "pass1234",
      name: "",
      password: "newpass1",
      passwordConfirm: "newpass1",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("変更完了しました");
  });
});
