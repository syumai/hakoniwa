import { describe, expect, it } from "vitest";
import { loginAs, postForm, setupTestApp } from "./test-helpers.ts";
import type { TestApp } from "./test-helpers.ts";

const ADMIN_EMAIL = "admin@example.com";

async function loginAdmin(testApp: TestApp) {
  return loginAs(testApp, { id: "admin1", name: "かんりしゃ", email: ADMIN_EMAIL });
}

describe("管理画面 (/admin)", () => {
  it("adminEnabled=false なら GET /admin も 404", async () => {
    const { app } = setupTestApp({ adminEnabled: false });
    const res = await app.request("/admin");
    expect(res.status).toBe(404);
  });

  it("未ログインでの GET /admin は /login へ 302", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/admin", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("管理者以外の GET /admin は 403", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const auth = await loginAs(testApp, { id: "u1", name: "いっぱん", email: "u1@example.com" });
    const res = await testApp.app.request("/admin", { headers: { cookie: auth.cookie } });
    expect(res.status).toBe(403);
  });

  it("管理者以外の POST /admin/reset は 403", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const auth = await loginAs(testApp, { id: "u1", name: "いっぱん", email: "u1@example.com" });
    const res = await postForm(
      testApp.app,
      "/admin/reset",
      { _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(403);
  });

  it("管理者は GET /admin が 200 でメンテナンスツールを表示する", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    const res = await testApp.app.request("/admin", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("メンテナンスツール");
    expect(html).toContain("現役データ");
  });

  it("未初期化なら「新しいデータを作る」を表示する", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL], skipInit: true });
    const admin = await loginAdmin(testApp);
    const res = await testApp.app.request("/admin", { headers: { cookie: admin.cookie } });
    const html = await res.text();
    expect(html).toContain("新しいデータを作る");
  });

  it("_csrf なしの POST /admin/init は 403", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL], skipInit: true });
    const admin = await loginAdmin(testApp);
    const res = await postForm(testApp.app, "/admin/init", {}, { cookie: admin.cookie });
    expect(res.status).toBe(403);
  });

  it("POST /admin/init: 管理者は初期化できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL], skipInit: true });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/init",
      { _csrf: admin.csrfToken },
      {
        cookie: admin.cookie,
      },
    );
    expect(res.status).toBe(200);
    expect(testApp.repo.isInitialized()).toBe(true);
    expect(testApp.repo.getMeta().turn).toBe(1);
  });

  it("POST /admin/turn: ターンを進められる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/turn",
      { _csrf: admin.csrfToken },
      {
        cookie: admin.cookie,
      },
    );
    expect(res.status).toBe(200);
    expect(testApp.repo.getMeta().turn).toBe(2);
  });

  it("POST /admin/reset: 現役データを削除できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/reset",
      { _csrf: admin.csrfToken },
      {
        cookie: admin.cookie,
      },
    );
    expect(res.status).toBe(200);
    expect(testApp.repo.isInitialized()).toBe(false);
  });

  it("POST /admin/last-time: unix 秒指定で変更できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/last-time",
      { unix: 12345, _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(res.status).toBe(200);
    expect(testApp.repo.getMeta().lastTime).toBe(12345);
  });

  it("POST /admin/backups → restore で「復元しました」を表示する", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    const create = await postForm(
      testApp.app,
      "/admin/backups",
      { label: "b1", _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(create.status).toBe(200);
    expect(await create.text()).toContain("バックアップを作成しました");

    const restore = await postForm(
      testApp.app,
      "/admin/backups/b1/restore",
      { _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(restore.status).toBe(200);
    expect(await restore.text()).toContain("復元しました。再読み込みしてください");
  });

  it("POST /admin/backups/:label/delete でバックアップを削除できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    await postForm(
      testApp.app,
      "/admin/backups",
      { label: "b1", _csrf: admin.csrfToken },
      {
        cookie: admin.cookie,
      },
    );
    const del = await postForm(
      testApp.app,
      "/admin/backups/b1/delete",
      { _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(del.status).toBe(200);
    expect(await del.text()).toContain("バックアップを削除しました");
  });

  it("POST /admin/auth-methods: ログイン方法のトグルを変更できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    expect(testApp.adminService.getAuthMethods().enabled.email).toBe(true);

    const res = await postForm(
      testApp.app,
      "/admin/auth-methods",
      { _csrf: admin.csrfToken },
      {
        cookie: admin.cookie,
      },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("ログイン方法の設定を変更しました");
    expect(testApp.adminService.getAuthMethods().enabled.email).toBe(false);
  });

  it("POST /admin/maximize: 島の資金・食料を最大化できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const owner = await loginAs(testApp, { id: "u1", name: "しまぬし", email: "u1@example.com" });
    await postForm(
      testApp.app,
      "/islands",
      { name: "てすとじま", _csrf: owner.csrfToken },
      {
        cookie: owner.cookie,
      },
    );

    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/maximize",
      { id: 1, _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("資金・食料を最大化しました");
    const island = testApp.repo.findIsland(1);
    expect(island?.money).toBe(9999);
    expect(island?.food).toBe(9999);
  });
});

describe("tmp/16-season.md: 管理画面の開始時刻・最終ターン", () => {
  it("GET /admin: 現役データに開始時刻・最終ターン・状態を表示する", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL], finalTurn: 20 });
    const admin = await loginAdmin(testApp);
    const res = await testApp.app.request("/admin", { headers: { cookie: admin.cookie } });
    const html = await res.text();
    expect(html).toContain("開始時刻");
    expect(html).toContain("最終ターン");
    expect(html).toContain("20");
    expect(html).toContain("進行中");
  });

  it("POST /admin/init: 開始日時 (start-at) と最終ターン数 (final-turn) を指定して初期化できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL], skipInit: true });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/init",
      { "start-at": "2026-10-01T21:00", "final-turn": 50, _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(res.status).toBe(200);
    const meta = testApp.repo.getMeta();
    expect(meta.finalTurn).toBe(50);
    expect(meta.turn).toBe(1);
    expect(meta.lastTime).toBe(meta.startAt);
  });

  it("POST /admin/init: start-at/final-turn を省略すると従来どおり (現在時刻の切り下げ・無期限)", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL], skipInit: true });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/init",
      { _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(res.status).toBe(200);
    expect(testApp.repo.getMeta().finalTurn).toBeNull();
  });

  it("POST /admin/final-turn: 最終ターン数を変更できる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL] });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/final-turn",
      { "final-turn": 30, _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("最終ターン数を変更しました");
    expect(testApp.repo.getMeta().finalTurn).toBe(30);
  });

  it("POST /admin/final-turn: 空欄なら無期限 (null) に戻せる", async () => {
    const testApp = setupTestApp({ adminEmails: [ADMIN_EMAIL], finalTurn: 10 });
    const admin = await loginAdmin(testApp);
    const res = await postForm(
      testApp.app,
      "/admin/final-turn",
      { "final-turn": "", _csrf: admin.csrfToken },
      { cookie: admin.cookie },
    );
    expect(res.status).toBe(200);
    expect(testApp.repo.getMeta().finalTurn).toBeNull();
  });
});
