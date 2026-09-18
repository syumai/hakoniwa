// tmp/10-implementation-plan.md Phase 8、tmp/12-workers-adapter.md の受け入れ確認。
// DO 経由で migrate が通り、better-auth (開発ログイン) と管理画面、Cron 用 RPC (checkTurn) が
// 一連の HTTP リクエストとして動くことを確認する。
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function getStub(name: string) {
  const id = env.GAME.idFromName(name);
  return env.GAME.get(id);
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

describe("HakoniwaGame (DO 経由の Hono app)", () => {
  it("migrate が通り GET /login が 200 を返す", async () => {
    const stub = getStub("game-test-login");
    const res = await stub.fetch("http://example.com/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ログイン");
  });

  it("開発ログイン → 管理画面から初期化 → checkTurn() は期限前で 0 を返す", async () => {
    const stub = getStub("game-test-flow");

    // HAKONIWA_DEV_LOGIN=true, HAKONIWA_ADMIN_EMAILS=admin@example.com は
    // vitest.config.ts の miniflare.bindings で設定している (実運用は wrangler secret/vars)。
    // `redirect: "manual"` を指定しないと fetch が 302 を自動で追いかけてしまい、
    // (未初期化な世界の) GET / を踏んで 503 になるため 302 のまま観測できない。
    const loginRes = await stub.fetch("http://example.com/auth/dev", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=admin%40example.com",
      redirect: "manual",
    });
    expect(loginRes.status).toBe(302);
    const cookie = cookieValue(loginRes.headers.get("set-cookie"), "hako.session_token");
    expect(cookie).toBeDefined();
    if (cookie === undefined) {
      throw new Error("unreachable");
    }

    // 管理画面から _csrf を取り出し、POST /admin/init で初期化する
    // (管理画面自体は未初期化でも表示できる)。
    const adminRes = await stub.fetch("http://example.com/admin", { headers: { cookie } });
    expect(adminRes.status).toBe(200);
    const adminHtml = await adminRes.text();
    const csrfMatch = adminHtml.match(/name="_csrf" value="([^"]+)"/);
    expect(csrfMatch).not.toBeNull();
    const csrfToken = csrfMatch?.[1] ?? "";

    const initRes = await stub.fetch("http://example.com/admin/init", {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: `_csrf=${encodeURIComponent(csrfToken)}`,
    });
    expect(initRes.status).toBe(200);
    expect(await initRes.text()).toContain("新しいデータを作成しました");

    // 初期化直後は last_time が現在時刻なので、Cron (checkTurn) は期限前として 0 を返す。
    const advanced = await stub.checkTurn();
    expect(advanced).toBe(0);

    const topAfterInit = await stub.fetch("http://example.com/", { headers: { cookie } });
    expect(topAfterInit.status).toBe(200);
    expect(await topAfterInit.text()).toContain("ターン1");
  });

  // HAKONIWA_BASE_URL は vitest.config.ts の miniflare.bindings で設定していない
  // (tmp/12-workers-adapter.md「Deploy to Cloudflare ボタン」節: 省略可能)。
  // この場合の Origin 検査はリクエスト URL のオリジンを基準にする
  // (packages/game/src/web/middleware/csrf.tsx)。
  it("HAKONIWA_BASE_URL 未設定でも、Origin がリクエストのオリジンと一致すれば POST が通る", async () => {
    const stub = getStub("game-test-origin-match");
    const res = await stub.fetch("http://example.com/auth/dev", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://example.com",
      },
      body: "email=origin-match%40example.com",
      redirect: "manual",
    });
    expect(res.status).toBe(302);
  });

  it("HAKONIWA_BASE_URL 未設定で Origin がリクエストのオリジンと異なれば 403", async () => {
    const stub = getStub("game-test-origin-mismatch");
    const res = await stub.fetch("http://example.com/auth/dev", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://evil.example",
      },
      body: "email=origin-mismatch%40example.com",
      redirect: "manual",
    });
    expect(res.status).toBe(403);
  });
});
