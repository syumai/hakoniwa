import { describe, expect, it } from "vitest";
import { setupTestApp } from "./test-helpers.ts";

describe("GET /", () => {
  it("200 で配布元リンク、ターン数、各フォームの見出しを含む", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html");
    expect(html).toContain("箱庭諸島スクリプト配布元");
    expect(html).toContain("ターン1");
    expect(html).toContain("自分の島へ");
    expect(html).toContain("諸島の状況");
    expect(html).toContain("新しい島を探す");
    expect(html).toContain("島の名前とパスワードの変更");
    expect(html).toContain("最近の出来事");
    expect(html).toContain("発見の記録");
  });

  it("debug=false ならターンを進めるボタンを含まない", async () => {
    const { app } = setupTestApp({ debug: false });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).not.toContain("ターンを進める");
  });

  it("debug=true ならターンを進めるボタンを含む", async () => {
    const { app } = setupTestApp({ debug: true });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain("ターンを進める");
  });

  it("not_initialized: 未初期化なら 503 でデータファイルが開けませんと表示する", async () => {
    const { app } = setupTestApp({ skipInit: true });
    const res = await app.request("/");
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("データファイルが開けません");
  });
});

describe("POST /turn (デバッグ用)", () => {
  it("debug=false なら 404", async () => {
    const { app } = setupTestApp({ debug: false });
    const res = await app.request("/turn", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("debug=true なら 200 でターンが進みトップを再描画する", async () => {
    const { app, repo } = setupTestApp({ debug: true });
    const res = await app.request("/turn", { method: "POST" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ターン2");
    expect(repo.getMeta().turn).toBe(2);
  });
});
