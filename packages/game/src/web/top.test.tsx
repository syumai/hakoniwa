import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.ts";
import { INITIAL_CLOCK, loginAs, postForm, setupTestApp } from "./test-helpers.ts";

describe("GET /", () => {
  it("200 で配布元リンク、ターン数、各見出しを含む (未ログイン)", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html");
    expect(html).toContain("箱庭諸島スクリプト配布元");
    expect(html).toContain("ターン1");
    expect(html).toContain("自分の島へ");
    expect(html).toContain("諸島の状況");
    expect(html).toContain("最近の出来事");
    expect(html).toContain("発見の記録");
    expect(html).toContain("ログイン");
  });

  it("ログイン済みで島未所持なら「新しい島を探す」フォームを含む", async () => {
    const testApp = setupTestApp();
    const { cookie } = await loginAs(testApp, {
      id: "u1",
      name: "たろう",
      email: "u1@example.com",
    });
    const res = await testApp.app.request("/", { headers: { cookie } });
    const html = await res.text();
    expect(html).toContain("新しい島を探す");
    expect(html).not.toContain('action="/my-island"');
  });

  it("ログイン済みで島所持なら「自分の島の開発計画へ」リンクを含む", async () => {
    const testApp = setupTestApp();
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    await postForm(
      testApp.app,
      "/islands",
      { name: "てすと", _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    const res = await testApp.app.request("/", { headers: { cookie: auth.cookie } });
    const html = await res.text();
    expect(html).toContain("自分の島の開発計画へ");
    expect(html).not.toContain("新しい島を探す");
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

  it("順位表の島名: absent === 0 なら island-name クラス", async () => {
    const testApp = setupTestApp();
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    await postForm(
      testApp.app,
      "/islands",
      { name: "てすと", _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    const island = testApp.repo.findIsland(1);
    if (island === undefined) {
      throw new Error("island not found");
    }
    testApp.repo.updateIsland({ ...island, absent: 0 });

    const res = await testApp.app.request("/");
    const html = await res.text();
    expect(html).toContain('class="island-name"');
    expect(html).not.toContain('class="island-name-faded"');
  });

  it("順位表の島名: absent > 0 なら island-name-faded クラスで薄く表示する", async () => {
    const testApp = setupTestApp();
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    await postForm(
      testApp.app,
      "/islands",
      { name: "てすと", _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    const island = testApp.repo.findIsland(1);
    if (island === undefined) {
      throw new Error("island not found");
    }
    testApp.repo.updateIsland({ ...island, absent: 25 });

    const res = await testApp.app.request("/");
    const html = await res.text();
    expect(html).toContain('class="island-name-faded"');
    expect(html).toContain("てすと島(25)");
  });
});

describe("フッタ", () => {
  it("管理者名・メール・掲示板・トップページ URL が未設定なら該当行を表示しない (配布元リンクは常に表示)", async () => {
    const { app } = setupTestApp();
    const res = await app.request("/");
    const html = await res.text();
    expect(html).not.toContain("管理者:");
    expect(html).not.toContain("掲示板(");
    expect(html).not.toContain("トップページ(");
    expect(html).toContain("箱庭諸島のページ(");
  });

  it("管理者名だけ設定なら「管理者:名前」のみ表示する (メールの括弧は付かない)", async () => {
    const { app } = setupTestApp({
      gameOverrides: { site: { ...defaultConfig.site, adminName: "かんりしゃ" } },
    });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain("管理者:かんりしゃ");
    expect(html).not.toContain("管理者:かんりしゃ(");
  });

  it("メールだけ設定なら「管理者:(mailto リンク)」を表示する", async () => {
    const { app } = setupTestApp({
      gameOverrides: { site: { ...defaultConfig.site, email: "admin@example.com" } },
    });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain('管理者:(<a href="mailto:admin@example.com">admin@example.com</a>)');
  });

  it("すべて設定されていれば管理者・掲示板・トップページの行を表示する", async () => {
    const { app } = setupTestApp({
      gameOverrides: {
        site: {
          title: defaultConfig.site.title,
          adminName: "かんりしゃ",
          email: "admin@example.com",
          bbsUrl: "https://example.com/bbs",
          topPageUrl: "https://example.com/",
        },
      },
    });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain(
      '管理者:かんりしゃ(<a href="mailto:admin@example.com">admin@example.com</a>)',
    );
    expect(html).toContain('掲示板(<a href="https://example.com/bbs">https://example.com/bbs</a>)');
    expect(html).toContain('トップページ(<a href="https://example.com/">https://example.com/</a>)');
  });

  it("http(s) で始まらない掲示板 URL はリンクにせず文字列のまま表示する", async () => {
    const { app } = setupTestApp({
      gameOverrides: { site: { ...defaultConfig.site, bbsUrl: "掲示板は別紙参照" } },
    });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain("掲示板(掲示板は別紙参照)");
    expect(html).not.toContain('<a href="掲示板は別紙参照"');
  });
});

describe("POST /turn (デバッグ用)", () => {
  it("debug=false なら 404", async () => {
    const { app } = setupTestApp({ debug: false });
    const res = await app.request("/turn", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("debug=true でも未ログインなら 401", async () => {
    const { app } = setupTestApp({ debug: true });
    const res = await app.request("/turn", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("debug=true でも管理者でなければ 403", async () => {
    const testApp = setupTestApp({ debug: true });
    const auth = await loginAs(testApp, { id: "u1", name: "たろう", email: "u1@example.com" });
    const res = await postForm(
      testApp.app,
      "/turn",
      { _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(403);
  });

  it("debug=true かつ管理者なら 200 でターンが進みトップを再描画する", async () => {
    const testApp = setupTestApp({ debug: true, adminEmails: ["admin@example.com"] });
    const auth = await loginAs(testApp, {
      id: "admin1",
      name: "かんりしゃ",
      email: "admin@example.com",
    });
    const res = await postForm(
      testApp.app,
      "/turn",
      { _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ターン2");
    expect(testApp.repo.getMeta().turn).toBe(2);
  });
});

describe("tmp/16-season.md: トップの3状態 (開始前/進行中/終了)", () => {
  it("進行中: 「ターンN」/「最終ターンM」と「次のターン:」+残り時間を表示する", async () => {
    const { app } = setupTestApp({ finalTurn: 10 });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain("ターン1");
    expect(html).toContain("最終ターン10");
    expect(html).toContain("次のターン:");
    expect(html).not.toContain("結果発表");
    expect(html).not.toContain("ゲーム開始:");
  });

  it("開始前: 「ゲーム開始: …」を表示し、「次のターン:」は表示しない", async () => {
    const futureStart = INITIAL_CLOCK + 10_000;
    const { app } = setupTestApp({ startAt: futureStart, lastTime: futureStart });
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain("ゲーム開始:");
    expect(html).not.toContain("次のターン:");
    expect(html).not.toContain("結果発表");
  });

  it("終了後: 「結果発表 (ターンM終了時点)」を表示し、「次のターン:」は表示しない", async () => {
    const testApp = setupTestApp({ finalTurn: 1 });
    const meta = testApp.repo.getMeta();
    testApp.repo.saveMeta({ ...meta, turn: 2 });

    const res = await testApp.app.request("/");
    const html = await res.text();
    expect(html).toContain("結果発表");
    expect(html).toContain("ターン1終了時点");
    expect(html).not.toContain("次のターン:");
    // 終了後も既存の順位表 (諸島の状況) はそのまま表示する。
    expect(html).toContain("諸島の状況");
  });
});
