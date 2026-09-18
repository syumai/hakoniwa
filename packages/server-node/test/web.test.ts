// tmp/06-web-routes-and-views.md / tmp/08-turn-trigger-admin-cli.md / tmp/14-users-auth.md の結合テスト。
// 実 DB (:memory:) + 実 better-auth (composeNode) + 開発ログインを使い、Perl 版 t/Main.t 相当
// (トップ/新規作成/観光/開発/コマンド/コメント) と t/Maintenance.t 相当 (管理: 初期化/削除) を確認する。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@hakoniwa/game";
import type { GameConfig } from "@hakoniwa/game";
import { afterEach, describe, expect, it } from "vitest";
import { composeNode } from "../src/compose.ts";
import type { ComposedNode } from "../src/compose.ts";
import type { NodeConfig } from "../src/config.ts";

interface SetupOptions {
  debug?: boolean;
  adminEmails?: string[];
  /** 初期化 (adminService.initialize) をスキップする (未初期化/初期化テスト用)。 */
  skipInit?: boolean;
  gameOverrides?: Partial<GameConfig>;
}

interface Ctx {
  deps: ComposedNode;
  backupDir: string;
}

/**
 * `:memory:` DB + 一時バックアップディレクトリで `composeNode` する。開発ログイン
 * (`HAKONIWA_DEV_LOGIN` 相当) を常に有効にし、実 better-auth 経由でログインする。
 * `Clock` はシステム時計 (`composeNode` 既定) なので、`lastTime` は実時間の直近の
 * `unitTimeSec` 境界に切り下げる。実時間との差が `unitTimeSec` を超えないため、
 * `turnCheckMiddleware` によるターンの巻き戻し進行は起きない。
 */
function setup(options: SetupOptions = {}): Ctx {
  const backupDir = mkdtempSync(join(tmpdir(), "hakoniwa-web-test-"));
  const debug = options.debug ?? false;
  const config: NodeConfig = {
    game: { ...defaultConfig, debug, ...options.gameOverrides },
    auth: {
      baseUrl: "http://localhost:5173",
      secret: "a".repeat(32),
      devLogin: true,
      adminEmails: options.adminEmails ?? [],
    },
    mail: { mailFrom: "hakoniwa@example.com" },
    ngWords: [],
    adminEnabled: true,
    debug,
    port: 0,
    dbPath: ":memory:",
    backupDir,
    turnCheckIntervalSec: 0,
  };
  const deps = composeNode(config);
  if (options.skipInit !== true) {
    const now = Math.floor(Date.now() / 1000);
    deps.adminService.initialize(now);
  }
  return { deps, backupDir };
}

function formBody(fields: Record<string, string | number>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, String(value));
  }
  return params;
}

/** Set-Cookie のうち `name=value` の部分だけを取り出す (属性は落とす)。 */
function cookieValue(setCookieHeader: string | null, name: string): string | undefined {
  if (setCookieHeader === null) {
    return undefined;
  }
  for (const part of setCookieHeader.split(/,(?=[^;]+?=)/)) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.split(";")[0];
    }
  }
  return undefined;
}

async function postForm(
  app: ComposedNode["app"],
  path: string,
  fields: Record<string, string | number>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await app.request(path, {
    method: "POST",
    body: formBody(fields),
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}

/** `_csrf` を HTML から取り出す (最初に見つかったものを使う)。 */
function extractCsrfToken(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html);
  if (match?.[1] === undefined) {
    throw new Error(`_csrf token not found in HTML: ${html.slice(0, 200)}`);
  }
  return match[1];
}

/** 開発ログイン (POST /auth/dev) でログインし、Cookie ヘッダと `_csrf` トークンを返す。 */
async function devLogin(
  app: ComposedNode["app"],
  email: string,
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await postForm(app, "/auth/dev", { email }, { origin: "http://localhost:5173" });
  expect(res.status).toBe(302);
  const cookie = cookieValue(res.headers.get("set-cookie"), "hako.session_token");
  if (cookie === undefined) {
    throw new Error(`hako.session_token cookie not set: ${res.headers.get("set-cookie")}`);
  }
  const top = await app.request("/", { headers: { cookie } });
  const csrfToken = extractCsrfToken(await top.text());
  return { cookie, csrfToken };
}

async function createIsland(
  app: ComposedNode["app"],
  auth: { cookie: string; csrfToken: string },
  name: string,
): Promise<Response> {
  return await postForm(app, "/islands", { name, _csrf: auth.csrfToken }, { cookie: auth.cookie });
}

describe("packages/server-node 結合テスト (実 DB :memory: + 実 better-auth devLogin)", () => {
  let ctx: Ctx | undefined;

  afterEach(() => {
    if (ctx !== undefined) {
      ctx.deps.driver.close();
      rmSync(ctx.backupDir, { recursive: true, force: true });
      ctx = undefined;
    }
  });

  it("トップ表示: 未初期化なら 503「データファイルが開けません。」", async () => {
    ctx = setup({ skipInit: true });
    const res = await ctx.deps.app.request("/");
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("データファイルが開けません。");
  });

  it("トップ表示: 初期化後は 200 でターン1と配布元リンクを表示する", async () => {
    ctx = setup();
    const res = await ctx.deps.app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ターン1");
    expect(html).toContain("箱庭諸島スクリプト配布元");
  });

  it("GET /login: 開発ログインフォームを表示する", async () => {
    ctx = setup();
    const res = await ctx.deps.app.request("/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("開発ログイン");
    expect(html).toContain('action="/auth/dev"');
  });

  it("開発ログイン → Cookie を持って / にアクセスすると「新しい島を探す」導線が出る", async () => {
    ctx = setup();
    const auth = await devLogin(ctx.deps.app, "player1@example.com");
    const res = await ctx.deps.app.request("/", { headers: { cookie: auth.cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("新しい島を探す");
  });

  it("新しい島を探す → /my-island → 計画登録 → コメント → ログアウト後は /my-island が 302", async () => {
    ctx = setup();
    const auth = await devLogin(ctx.deps.app, "player2@example.com");

    const createRes = await createIsland(ctx.deps.app, auth, "てすとじま");
    expect(createRes.status).toBe(200);
    expect(await createRes.text()).toContain("「てすとじま島」");

    const myIslandRes = await ctx.deps.app.request("/my-island", {
      headers: { cookie: auth.cookie },
    });
    expect(myIslandRes.status).toBe(200);
    const myIslandHtml = await myIslandRes.text();
    expect(myIslandHtml).toContain("開発計画");
    expect(myIslandHtml).toContain("/owner.js");
    expect(myIslandHtml).toContain("map-cell");

    const commandRes = await postForm(
      ctx.deps.app,
      "/my-island/commands",
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
    expect(commandRes.status).toBe(200);
    expect(await commandRes.text()).toContain("コマンドを登録しました");

    const commentRes = await postForm(
      ctx.deps.app,
      "/my-island/comment",
      { _csrf: auth.csrfToken, message: "よろしくお願いします" },
      { cookie: auth.cookie },
    );
    expect(commentRes.status).toBe(200);
    expect(await commentRes.text()).toContain("コメントを更新しました");

    const top = await ctx.deps.app.request("/");
    expect(await top.text()).toContain("よろしくお願いします");

    const logoutRes = await postForm(
      ctx.deps.app,
      "/logout",
      { _csrf: auth.csrfToken },
      { cookie: auth.cookie },
    );
    expect(logoutRes.status).toBe(302);
    const loggedOutCookie =
      cookieValue(logoutRes.headers.get("set-cookie"), "hako.session_token") ?? auth.cookie;

    const afterLogout = await ctx.deps.app.request("/my-island", {
      headers: { cookie: loggedOutCookie },
      redirect: "manual",
    });
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.get("location")).toBe("/login");
  });

  it("観光: GET /islands/:id でようこそ画面を表示する", async () => {
    ctx = setup();
    const auth = await devLogin(ctx.deps.app, "player3@example.com");
    await createIsland(ctx.deps.app, auth, "てすとじま");
    const res = await ctx.deps.app.request("/islands/1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("へようこそ！！");
  });

  it("名前変更: 資金不足のときは 400", async () => {
    ctx = setup();
    const auth = await devLogin(ctx.deps.app, "player4@example.com");
    await createIsland(ctx.deps.app, auth, "てすとじま");
    const res = await postForm(
      ctx.deps.app,
      "/my-island/name",
      { _csrf: auth.csrfToken, name: "しんめい" },
      { cookie: auth.cookie },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("資金不足のため変更できません");
  });

  it("島を 10 個作成できる (ユーザーごとに 1 島)", async () => {
    ctx = setup();
    for (let i = 0; i < 10; i++) {
      const auth = await devLogin(ctx.deps.app, `player-multi-${i}@example.com`);
      const res = await createIsland(ctx.deps.app, auth, `島${i}`);
      expect(res.status).toBe(200);
    }
    const top = await ctx.deps.app.request("/");
    const html = await top.text();
    for (let i = 0; i < 10; i++) {
      expect(html).toContain(`島${i}島`);
    }
  });

  it("管理: 管理者メールでログインして /admin が 200", async () => {
    ctx = setup({ adminEmails: ["admin@example.com"] });
    const auth = await devLogin(ctx.deps.app, "admin@example.com");
    const res = await ctx.deps.app.request("/admin", { headers: { cookie: auth.cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("メンテナンスツール");
  });

  it("管理: 管理者以外は /admin が 403", async () => {
    ctx = setup({ adminEmails: ["admin@example.com"] });
    const auth = await devLogin(ctx.deps.app, "notadmin@example.com");
    const res = await ctx.deps.app.request("/admin", { headers: { cookie: auth.cookie } });
    expect(res.status).toBe(403);
  });

  it("管理: POST /admin/init で初期化できる", async () => {
    ctx = setup({ adminEmails: ["admin@example.com"], skipInit: true });
    expect(ctx.deps.repo.isInitialized()).toBe(false);
    const auth = await devLogin(ctx.deps.app, "admin@example.com");
    const res = await postForm(
      ctx.deps.app,
      "/admin/init",
      { _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("新しいデータを作成しました");
    expect(ctx.deps.repo.isInitialized()).toBe(true);
  });

  it("管理: POST /admin/reset で削除できる", async () => {
    ctx = setup({ adminEmails: ["admin@example.com"] });
    const auth = await devLogin(ctx.deps.app, "admin@example.com");
    const res = await postForm(
      ctx.deps.app,
      "/admin/reset",
      { _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("データを削除しました");
    expect(ctx.deps.repo.isInitialized()).toBe(false);
  });

  it("管理: POST /admin/auth-methods で email を無効化すると /login にメールフォームが出ない", async () => {
    ctx = setup({ adminEmails: ["admin@example.com"] });
    const auth = await devLogin(ctx.deps.app, "admin@example.com");

    const before = await ctx.deps.app.request("/login");
    expect(await before.text()).toContain('action="/auth/magic-link"');

    const res = await postForm(
      ctx.deps.app,
      "/admin/auth-methods",
      { _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(200);

    const after = await ctx.deps.app.request("/login");
    expect(await after.text()).not.toContain('action="/auth/magic-link"');
  });

  it("ターンを進める: debug=true かつ管理者で POST /turn するとターン2になる", async () => {
    ctx = setup({ debug: true, adminEmails: ["admin@example.com"] });
    const before = await ctx.deps.app.request("/");
    expect(await before.text()).toContain("ターン1");

    const auth = await devLogin(ctx.deps.app, "admin@example.com");
    const res = await postForm(
      ctx.deps.app,
      "/turn",
      { _csrf: auth.csrfToken },
      {
        cookie: auth.cookie,
      },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("ターン2");
  });
});
