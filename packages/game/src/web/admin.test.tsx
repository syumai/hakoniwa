import { describe, expect, it } from "vitest";
import { postForm, setupTestApp } from "./test-helpers.ts";

describe("管理画面 (/admin)", () => {
  it("adminEnabled=false なら GET /admin も 404", async () => {
    const { app } = setupTestApp({ adminEnabled: false });
    const res = await app.request("/admin");
    expect(res.status).toBe(404);
  });

  it("GET /admin は未認証で 200 表示できる", async () => {
    const { app } = setupTestApp({ masterPassword: "master1" });
    const res = await app.request("/admin");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("メンテナンスツール");
    expect(html).toContain("現役データ");
  });

  it("未初期化なら「新しいデータを作る」を表示する", async () => {
    const { app } = setupTestApp({ masterPassword: "master1", skipInit: true });
    const res = await app.request("/admin");
    const html = await res.text();
    expect(html).toContain("新しいデータを作る");
  });

  it("POST /admin/init: 誤パスワードは 403", async () => {
    const { app } = setupTestApp({ masterPassword: "master1", skipInit: true });
    const res = await postForm(app, "/admin/init", { password: "wrong" });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("パスワードが違います");
  });

  it("POST /admin/init: 正しいパスワードで初期化できる", async () => {
    const { app, repo } = setupTestApp({ masterPassword: "master1", skipInit: true });
    const res = await postForm(app, "/admin/init", { password: "master1" });
    expect(res.status).toBe(200);
    expect(repo.isInitialized()).toBe(true);
    expect(repo.getMeta().turn).toBe(1);
  });

  it("POST /admin/turn: ターンを進められる", async () => {
    const { app, repo } = setupTestApp({ masterPassword: "master1" });
    const res = await postForm(app, "/admin/turn", { password: "master1" });
    expect(res.status).toBe(200);
    expect(repo.getMeta().turn).toBe(2);
  });

  it("POST /admin/reset: 現役データを削除できる", async () => {
    const { app, repo } = setupTestApp({ masterPassword: "master1" });
    const res = await postForm(app, "/admin/reset", { password: "master1" });
    expect(res.status).toBe(200);
    expect(repo.isInitialized()).toBe(false);
  });

  it("POST /admin/last-time: unix 秒指定で変更できる", async () => {
    const { app, repo } = setupTestApp({ masterPassword: "master1" });
    const res = await postForm(app, "/admin/last-time", { password: "master1", unix: 12345 });
    expect(res.status).toBe(200);
    expect(repo.getMeta().lastTime).toBe(12345);
  });

  it("POST /admin/backups → restore で「復元しました」を表示する", async () => {
    const { app } = setupTestApp({ masterPassword: "master1" });
    const create = await postForm(app, "/admin/backups", { password: "master1", label: "b1" });
    expect(create.status).toBe(200);
    expect(await create.text()).toContain("バックアップを作成しました");

    const restore = await postForm(app, "/admin/backups/b1/restore", { password: "master1" });
    expect(restore.status).toBe(200);
    expect(await restore.text()).toContain("復元しました。再読み込みしてください");
  });

  it("POST /admin/backups/:label/delete でバックアップを削除できる", async () => {
    const { app } = setupTestApp({ masterPassword: "master1" });
    await postForm(app, "/admin/backups", { password: "master1", label: "b1" });
    const del = await postForm(app, "/admin/backups/b1/delete", { password: "master1" });
    expect(del.status).toBe(200);
    expect(await del.text()).toContain("バックアップを削除しました");
  });
});
