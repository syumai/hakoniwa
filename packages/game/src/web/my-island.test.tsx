import { describe, expect, it } from "vitest";
import { currentGameId, currentMeta, loginAs, postForm, setupTestApp } from "./test-helpers.ts";
import type { TestApp } from "./test-helpers.ts";

async function createIsland(testApp: TestApp, name = "てすとじま") {
  const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
  const res = await postForm(
    testApp.app,
    "/games/1/islands",
    { name, _csrf: auth.csrfToken },
    {
      cookie: auth.cookie,
    },
  );
  return { res, auth };
}

describe("POST /games/:gameId/islands (新規作成)", () => {
  it("未ログインなら 401", async () => {
    const { app } = setupTestApp();
    const res = await postForm(app, "/games/1/islands", { name: "てすと" });
    expect(res.status).toBe(401);
  });

  it("成功: 発見画面を表示する", async () => {
    const testApp = setupTestApp();
    const { res } = await createIsland(testApp);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("島を発見しました！！");
    expect(html).toContain("「てすとじま島」");
    expect(html).toContain('href="/games/1"');
  });

  it("island_full: 上限のとき 409", async () => {
    const testApp = setupTestApp({ gameOverrides: { maxIslands: 0 } });
    const { res } = await createIsland(testApp);
    expect(res.status).toBe(409);
    const html = await res.text();
    expect(html).toContain("申し訳ありません、島が一杯で登録できません");
  });

  it("no_name: 名前が空のとき 400", async () => {
    const testApp = setupTestApp();
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    const res = await postForm(
      testApp.app,
      "/games/1/islands",
      { name: "", _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("島につける名前が必要です");
  });

  it("already_has_island: 2 つ目の島は 409「島はひとり1つまでです。」", async () => {
    const testApp = setupTestApp();
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    await postForm(
      testApp.app,
      "/games/1/islands",
      { name: "ひとつめ", _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    const res = await postForm(
      testApp.app,
      "/games/1/islands",
      { name: "ふたつめ", _csrf: auth.csrfToken },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("島はひとり1つまでです。");
  });

  it("ng_word: NG ワードを含む名前は 400", async () => {
    const testApp = setupTestApp({ ngWords: ["だめな単語"] });
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    const res = await postForm(
      testApp.app,
      "/games/1/islands",
      { name: "だめな単語島", _csrf: auth.csrfToken },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("その名前/内容は使えません。");
  });

  it("_csrf なしの POST は 403", async () => {
    const testApp = setupTestApp();
    const { cookieHeader } = testApp.auth.login({
      id: "u1",
      name: "たろう",
      email: "u1@example.com",
    });
    const res = await postForm(
      testApp.app,
      "/games/1/islands",
      { name: "てすと" },
      {
        cookie: cookieHeader,
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /games/:gameId/islands/:id (観光)", () => {
  it("成功: ようこそ画面を表示する", async () => {
    const testApp = setupTestApp();
    await createIsland(testApp);
    const res = await testApp.app.request("/games/1/islands/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("「てすとじま島」");
    expect(html).toContain("へようこそ！！");
  });

  it("存在しない島は 404", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/games/1/islands/999");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("問題発生");
  });

  it("存在しないゲームは 404", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/games/999/islands/1");
    expect(res.status).toBe(404);
  });
});

describe("GET /games/:gameId/my-island (開発画面)", () => {
  it("未ログインなら /login へ 302", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/games/1/my-island", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("ログイン済みだが島が無ければトップへ通知付きで 302", async () => {
    const testApp = setupTestApp();
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    const res = await testApp.app.request("/games/1/my-island", {
      headers: { cookie: auth.cookie },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/games/1?notice=no_island");
  });

  it("成功: 開発計画画面を表示する", async () => {
    const testApp = setupTestApp();
    const { auth } = await createIsland(testApp);
    const res = await testApp.app.request("/games/1/my-island", {
      headers: { cookie: auth.cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("開発計画");
    expect(html).toContain("/owner.js");
    expect(html).toContain("map-cell");
  });
});

describe("POST /games/:gameId/my-island/commands (計画登録)", () => {
  it("成功: コマンドを登録しました と (0,0)で整地 を表示する", async () => {
    const testApp = setupTestApp();
    const { auth } = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/commands",
      {
        _csrf: auth.csrfToken,
        number: 0,
        kind: 1,
        x: 0,
        y: 0,
        amount: 0,
        target: 0,
        mode: "insert",
      },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("コマンドを登録しました");
    expect(html).toContain("(0,0)で整地");
  });

  it("invalid_input: kind が不正な文字列なら 400", async () => {
    const testApp = setupTestApp();
    const { auth } = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/commands",
      {
        _csrf: auth.csrfToken,
        number: 0,
        kind: "abc",
        x: 0,
        y: 0,
        amount: 0,
        target: 0,
        mode: "insert",
      },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(400);
  });

  it("応答の描画に送信した x/y/kind/target がフォームの選択初期値として反映される", async () => {
    const testApp = setupTestApp();
    const { auth } = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/commands",
      {
        _csrf: auth.csrfToken,
        number: 0,
        kind: 2,
        x: 5,
        y: 6,
        amount: 0,
        target: 1,
        mode: "insert",
      },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<select name="kind">[\s\S]*?<option value="2"[^>]*selected/);
    expect(html).toMatch(/<select name="x">[\s\S]*?<option value="5"[^>]*selected/);
    expect(html).toMatch(/<select name="y">[\s\S]*?<option value="6"[^>]*selected/);
    expect(html).toMatch(/<select name="target">[\s\S]*?<option value="1"[^>]*selected/);
  });

  it("_csrf なしの POST は 403", async () => {
    const testApp = setupTestApp();
    const { auth } = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/commands",
      { number: 0, kind: 1, x: 0, y: 0, amount: 0, target: 0, mode: "insert" },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /games/:gameId/my-island/comment (コメント更新)", () => {
  it("成功: コメントを更新しました を表示し、トップにも反映される", async () => {
    const testApp = setupTestApp();
    const { auth } = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/comment",
      { _csrf: auth.csrfToken, message: "よろしくお願いします" },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("コメントを更新しました");

    const top = await testApp.app.request("/games/1");
    const topHtml = await top.text();
    expect(topHtml).toContain("コメント：");
    expect(topHtml).toContain("よろしくお願いします");
  });
});

describe("POST /games/:gameId/my-island/name (名前変更)", () => {
  it("no_money: 資金不足のときは 400", async () => {
    const testApp = setupTestApp();
    const { auth } = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/name",
      { _csrf: auth.csrfToken, name: "しんめい" },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("資金不足のため変更できません");
  });
});

describe("POST /games/:gameId/my-island/* は他人の島には効かない (actor 自身の島に限定される)", () => {
  it("島を持たないユーザーが計画登録すると no_island でトップへ 302", async () => {
    const testApp = setupTestApp();
    await createIsland(testApp);
    const auth = await loginAs(testApp, { id: "u2", name: "じろう", email: "u2@example.com" });
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/commands",
      {
        _csrf: auth.csrfToken,
        number: 0,
        kind: 1,
        x: 0,
        y: 0,
        amount: 0,
        target: 0,
        mode: "insert",
      },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/games/1?notice=no_island");
  });
});

describe("tmp/16-season.md: ゲーム終了後 (現在のゲームのまま)", () => {
  async function createFinishedIsland(testApp: TestApp) {
    const { auth } = await createIsland(testApp);
    const meta = currentMeta(testApp);
    testApp.repo.saveMeta({ ...meta, turn: 2, finalTurn: 1 });
    // tmp/18-games.md: 終了判定は status 列に昇格したため、明示的に finishGame を呼ぶ。
    testApp.repo.finishGame(currentGameId(testApp), meta.lastTime);
    return auth;
  }

  it("GET /games/:gameId/my-island: 計画・コメント・名前変更フォームを出さず「ゲームは終了しました。」を表示するが、地図・計画一覧・近況は表示する", async () => {
    const testApp = setupTestApp();
    const auth = await createFinishedIsland(testApp);
    const res = await testApp.app.request("/games/1/my-island", {
      headers: { cookie: auth.cookie },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ゲームは終了しました。");
    expect(html).not.toContain('action="/games/1/my-island/commands"');
    expect(html).not.toContain('action="/games/1/my-island/comment"');
    expect(html).not.toContain('action="/games/1/my-island/name"');
    expect(html).toContain("map-cell");
    expect(html).toContain("開発計画");
  });

  it("POST /games/:gameId/my-island/commands は 409 game_finished", async () => {
    const testApp = setupTestApp();
    const auth = await createFinishedIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/commands",
      {
        _csrf: auth.csrfToken,
        number: 0,
        kind: 1,
        x: 0,
        y: 0,
        amount: 0,
        target: 0,
        mode: "insert",
      },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("ゲームは終了しました。");
  });

  it("POST /games/:gameId/my-island/comment は 409 game_finished", async () => {
    const testApp = setupTestApp();
    const auth = await createFinishedIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/comment",
      { _csrf: auth.csrfToken, message: "よろしく" },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("ゲームは終了しました。");
  });

  it("POST /games/:gameId/my-island/name は 409 game_finished", async () => {
    const testApp = setupTestApp();
    const auth = await createFinishedIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/my-island/name",
      { _csrf: auth.csrfToken, name: "しんめい" },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("ゲームは終了しました。");
  });

  it("POST /games/:gameId/islands/:id/lbbs (記帳) は現在のゲームなら終了後も許可される", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    const auth = await createFinishedIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/games/1/islands/1/lbbs",
      { _csrf: auth.csrfToken, message: "感想です" },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("記帳を行いました");
  });

  it("POST /games/:gameId/islands (新しい島を探す) は 409 game_finished", async () => {
    const testApp = setupTestApp();
    await createFinishedIsland(testApp);
    const auth = await loginAs(testApp, { id: "u2", name: "じろう", email: "u2@example.com" });
    const res = await postForm(
      testApp.app,
      "/games/1/islands",
      { name: "あたらしいしま", _csrf: auth.csrfToken },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("ゲームは終了しました。");
  });
});
