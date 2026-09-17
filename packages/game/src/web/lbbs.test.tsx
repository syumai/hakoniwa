import { describe, expect, it } from "vitest";
import { postForm, setupTestApp } from "./test-helpers.ts";

async function createIsland(app: ReturnType<typeof setupTestApp>["app"]) {
  return postForm(app, "/islands", {
    name: "てすとじま",
    password: "pass1234",
    passwordConfirm: "pass1234",
  });
}

describe("ローカル掲示板", () => {
  it("useLbbs=false なら 404", async () => {
    const { app } = setupTestApp({ gameOverrides: { useLbbs: false } });
    await createIsland(app);
    const res = await postForm(app, "/islands/1/lbbs", { name: "たろう", message: "こんにちは" });
    expect(res.status).toBe(404);
  });

  it("useLbbs=true: 観光者の記帳が反映される", async () => {
    const { app } = setupTestApp({ gameOverrides: { useLbbs: true } });
    await createIsland(app);
    const res = await postForm(app, "/islands/1/lbbs", { name: "たろう", message: "こんにちは" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("記帳を行いました");
    expect(html).toContain("たろう");
    expect(html).toContain("こんにちは");
  });

  it("Origin ヘッダが host と不一致なら 403", async () => {
    const { app } = setupTestApp({ gameOverrides: { useLbbs: true } });
    await createIsland(app);
    const res = await postForm(
      app,
      "/islands/1/lbbs",
      { name: "たろう", message: "こんにちは" },
      { origin: "http://evil.example.com", host: "example.com" },
    );
    expect(res.status).toBe(403);
  });

  it("Origin ヘッダが host と一致すれば 200", async () => {
    const { app } = setupTestApp({ gameOverrides: { useLbbs: true } });
    await createIsland(app);
    const res = await postForm(
      app,
      "/islands/1/lbbs",
      { name: "たろう", message: "こんにちは" },
      { origin: "http://example.com", host: "example.com" },
    );
    expect(res.status).toBe(200);
  });

  it("島主の記帳と削除ができる", async () => {
    const { app } = setupTestApp({ gameOverrides: { useLbbs: true } });
    await createIsland(app);
    const post = await postForm(app, "/islands/1/lbbs/owner", {
      password: "pass1234",
      name: "島主",
      message: "よろしく",
    });
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("記帳を行いました");

    const del = await postForm(app, "/islands/1/lbbs/delete", {
      password: "pass1234",
      number: 0,
    });
    expect(del.status).toBe(200);
    expect(await del.text()).toContain("記帳内容を削除しました");
  });

  it("lbbs_empty: 名前が空なら 400", async () => {
    const { app } = setupTestApp({ gameOverrides: { useLbbs: true } });
    await createIsland(app);
    const res = await postForm(app, "/islands/1/lbbs", { name: "", message: "こんにちは" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("名前または内容の欄が空欄です");
  });
});
