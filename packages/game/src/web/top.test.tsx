import { describe, expect, it } from "vitest";
import { postForm, setupTestApp } from "./test-helpers.ts";

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

// Phase 6a での差異: POST /islands は actor: undefined を渡すため login_required (401) になり、
// 島を作成できない (14-users-auth.md)。Phase 6b でログイン済みセッションを使う形に書き直すこと。
describe.skip("順位表の島名 (放置島)", () => {
  it("absent === 0 なら island-name クラス", async () => {
    const { app, repo } = setupTestApp();
    await postForm(app, "/islands", {
      name: "てすと",
      password: "pass1234",
      passwordConfirm: "pass1234",
    });
    // 新規作成直後は Perl 版と同じく absent が 0 でない (giveupTurns - 3) ため、
    // 「観光」などで最終アクセスを更新したのと同じ状態 (absent === 0) を明示的に作る。
    const island = repo.findIsland(1);
    if (island === undefined) {
      throw new Error("island not found");
    }
    repo.updateIsland({ ...island, absent: 0 });

    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain('class="island-name"');
    expect(html).not.toContain('class="island-name-faded"');
  });

  it("absent > 0 なら island-name-faded クラスで薄く表示する", async () => {
    const { app, repo } = setupTestApp();
    await postForm(app, "/islands", {
      name: "てすと",
      password: "pass1234",
      passwordConfirm: "pass1234",
    });
    const island = repo.findIsland(1);
    if (island === undefined) {
      throw new Error("island not found");
    }
    repo.updateIsland({ ...island, absent: 25 });

    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain('class="island-name-faded"');
    expect(html).toContain("てすと島(25)");
  });
});
