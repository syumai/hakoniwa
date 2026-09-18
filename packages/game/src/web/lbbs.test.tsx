import { describe, expect, it } from "vitest";
import { loginAs, postForm, setupTestApp } from "./test-helpers.ts";
import type { TestApp } from "./test-helpers.ts";

async function createIsland(testApp: TestApp) {
  const auth = await loginAs(testApp, {
    id: "owner1",
    name: "しまぬし",
    email: "owner1@example.com",
  });
  await postForm(
    testApp.app,
    "/islands",
    { name: "てすとじま", _csrf: auth.csrfToken },
    {
      cookie: auth.cookie,
    },
  );
  return auth;
}

describe("ローカル掲示板", () => {
  it("useLbbs=false なら 404", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: false } });
    const owner = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "こんにちは", _csrf: owner.csrfToken },
      { cookie: owner.cookie },
    );
    expect(res.status).toBe(404);
  });

  it("未ログインでの記帳は 401", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    await createIsland(testApp);
    const res = await postForm(testApp.app, "/islands/1/lbbs", { message: "こんにちは" });
    expect(res.status).toBe(401);
  });

  it("他人の島の掲示板に観光者として記帳できる", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    await createIsland(testApp);
    const visitor = await loginAs(testApp, {
      id: "visitor1",
      name: "たびびと",
      email: "visitor1@example.com",
    });
    const res = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "こんにちは", _csrf: visitor.csrfToken },
      { cookie: visitor.cookie },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("記帳を行いました");
    expect(html).toContain("たびびと");
    expect(html).toContain("こんにちは");
    // 観光者としての記帳なので観光画面 (へようこそ) が描画される。
    expect(html).toContain("へようこそ！！");
  });

  it("島主が自分の島の掲示板 (観光ルート) に記帳すると開発画面が描画される", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    const owner = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "よろしく", _csrf: owner.csrfToken },
      { cookie: owner.cookie },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("記帳を行いました");
    expect(html).toContain("開発計画");
  });

  it("Origin ヘッダが host と不一致なら 403", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    const owner = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "こんにちは", _csrf: owner.csrfToken },
      { cookie: owner.cookie, origin: "http://evil.example.com", host: "example.com" },
    );
    expect(res.status).toBe(403);
  });

  it("Origin ヘッダが host と一致すれば 200", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    const owner = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "こんにちは", _csrf: owner.csrfToken },
      { cookie: owner.cookie, origin: "http://localhost:5173", host: "localhost:5173" },
    );
    expect(res.status).toBe(200);
  });

  it("島主の記帳と削除ができる", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    const owner = await createIsland(testApp);
    const post = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "よろしく", _csrf: owner.csrfToken },
      { cookie: owner.cookie },
    );
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("記帳を行いました");

    const del = await postForm(
      testApp.app,
      "/my-island/lbbs/delete",
      { number: 0, _csrf: owner.csrfToken },
      { cookie: owner.cookie },
    );
    expect(del.status).toBe(200);
    expect(await del.text()).toContain("記帳内容を削除しました");
  });

  it("lbbs_empty: メッセージが空なら 400", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true } });
    const owner = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "", _csrf: owner.csrfToken },
      { cookie: owner.cookie },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("名前または内容の欄が空欄です");
  });

  it("ng_word: NG ワードを含む記帳は 400", async () => {
    const testApp = setupTestApp({ gameOverrides: { useLbbs: true }, ngWords: ["ng"] });
    const owner = await createIsland(testApp);
    const res = await postForm(
      testApp.app,
      "/islands/1/lbbs",
      { message: "ngだめ", _csrf: owner.csrfToken },
      { cookie: owner.cookie },
    );
    expect(res.status).toBe(400);
  });
});
