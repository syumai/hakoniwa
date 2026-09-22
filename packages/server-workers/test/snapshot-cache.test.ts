// tmp/21-kv-snapshot-cache.md「テスト」節 + 「キャッシュ期間の区別」節の TTL 選択 +
// 「ログイン中も KV から返す」節のテストを確認する。
// `packages/server-workers/src/worker.ts` の `export default` (`fetch`) を直接呼び出し、
// KV スナップショットキャッシュの経路を検証する (他のテストファイルのように DO の `fetch` を
// 直接叩くだけでは worker.ts のキャッシュ経路を経由しないため)。
//
// `worker.ts` の `getGame()` は常に `env.GAME.idFromName("main")` を使う (本番は世界が 1 つの
// ため) ので、このファイル内のテストはすべて同じ DO インスタンス ("main") を共有する。
// `afterEach` で `reset()` (KV・DO のデータを含め全バインディングをリセットする) を呼び、
// 各テストを独立させる。
import { createExecutionContext, reset, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/worker.ts";
import { islandSnapshotKey, topSnapshotKey } from "../src/snapshot.ts";
import type { Env } from "../src/env.ts";

afterEach(async () => {
  await reset();
});

function mainGameStub() {
  const id = env.GAME.idFromName("main");
  return env.GAME.get(id);
}

/** `worker.ts` の `export default.fetch` を直接呼ぶ (Worker のトップレベルの経路)。 */
async function fetchWorker(
  url: string,
  init?: RequestInit,
  overrideEnv: Env = env,
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(url, init), overrideEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** 開発ログイン (管理者) して Cookie と管理画面の CSRF トークンを取り出す。DO への直接 fetch。 */
async function loginAsAdmin(): Promise<{ cookie: string; csrfToken: string }> {
  const stub = mainGameStub();
  const loginRes = await stub.fetch("http://example.com/auth/dev", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=admin%40example.com",
    redirect: "manual",
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("login failed");
  }
  const adminRes = await stub.fetch("http://example.com/admin", { headers: { cookie } });
  const csrfToken = (await adminRes.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
  if (csrfToken === undefined) {
    throw new Error("csrf token not found");
  }
  return { cookie, csrfToken };
}

/**
 * 開発ログイン (管理者以外) して Cookie と CSRF トークンを取り出す。DO への直接 fetch。
 * `HAKONIWA_ADMIN_EMAILS` は `admin@example.com` のみ (`vitest.config.ts`) なので、それ以外の
 * メールアドレスは常に非管理者になる。CSRF トークンはどのページの Nav (ログアウトフォーム) にも
 * 埋め込まれているため、`/account` から取り出す。
 */
async function loginAs(email: string): Promise<{ cookie: string; csrfToken: string }> {
  const stub = mainGameStub();
  const loginRes = await stub.fetch("http://example.com/auth/dev", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(email)}`,
    redirect: "manual",
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("login failed");
  }
  const accountRes = await stub.fetch("http://example.com/account", { headers: { cookie } });
  const csrfToken = (await accountRes.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
  if (csrfToken === undefined) {
    throw new Error("csrf token not found");
  }
  return { cookie, csrfToken };
}

/** ゲームを開始する (DO への直接 fetch)。既定 (start-at 省略) なら即座に開始扱いになる。 */
async function startGame(cookie: string, csrfToken: string): Promise<void> {
  const stub = mainGameStub();
  const res = await stub.fetch("http://example.com/admin/games", {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: `_csrf=${encodeURIComponent(csrfToken)}`,
  });
  if (res.status !== 200) {
    throw new Error(`startGame failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * 島を作成する (DO への直接 fetch。ログイン中のユーザーが所有者になる)。
 * `NewIslandPage` のレスポンスに島 ID へのリンクが無いため ID は返さない。各テストは
 * `reset()` 後の新しい "main" DO ・新しいゲームに対して 1 つだけ島を作る前提で、
 * 最初の島の ID は常に 1 になる (`cache-control.test.ts` 等、既存のテストと同じ前提)。
 */
async function createIsland(
  cookie: string,
  csrfToken: string,
  gameId: number,
  name: string,
): Promise<void> {
  const stub = mainGameStub();
  const res = await stub.fetch(`http://example.com/games/${gameId}/islands`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: `name=${encodeURIComponent(name)}&_csrf=${encodeURIComponent(csrfToken)}`,
  });
  if (res.status !== 200) {
    throw new Error(`createIsland failed: ${res.status} ${await res.text()}`);
  }
}

/** 島主本人としてコメントを更新する (DO への直接 fetch)。 */
async function updateComment(
  cookie: string,
  csrfToken: string,
  gameId: number,
  comment: string,
): Promise<void> {
  const stub = mainGameStub();
  const res = await stub.fetch(`http://example.com/games/${gameId}/my-island/comment`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: `message=${encodeURIComponent(comment)}&_csrf=${encodeURIComponent(csrfToken)}`,
  });
  if (res.status !== 200) {
    throw new Error(`updateComment failed: ${res.status} ${await res.text()}`);
  }
}

describe("KV スナップショットキャッシュ (tmp/21-kv-snapshot-cache.md)", () => {
  it("1. 未ログイン GET /games/:id は 1 回目 miss (KV に書く)、2 回目 hit (DO の最新値ではなく古い値が返る)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);
    await createIsland(cookie, csrfToken, 1, "いちごう");
    const islandId = 1;
    await updateComment(cookie, csrfToken, 1, "さいしょのコメント");

    const first = await fetchWorker("http://example.com/games/1");
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const firstHtml = await first.text();
    expect(firstHtml).toContain("さいしょのコメント");

    // KV に書かれていることを直接確認する。
    const stored = await env.SNAPSHOT?.get(topSnapshotKey(1));
    expect(stored).not.toBeNull();
    expect(stored).toBeDefined();

    // DO への直接 fetch (worker.ts のキャッシュ経路を経由しない) でコメントを更新する。
    // 誰も worker 経由でこのページに触れない限り、未ログインのキャッシュは invalidate
    // されない (設計どおり) ため、KV には古い値が残る。
    await updateComment(cookie, csrfToken, 1, "あたらしいコメント");
    // DO 側では既に更新されていることを直接確認する。
    const doRes = await mainGameStub().fetch("http://example.com/games/1", { headers: { cookie } });
    expect(await doRes.text()).toContain("あたらしいコメント");

    // 未ログインの 2 回目は KV から返り (hit)、DO の最新値 (あたらしいコメント) ではなく
    // 1 回目にキャッシュした古い値のままになる。
    const second = await fetchWorker("http://example.com/games/1");
    expect(second.status).toBe(200);
    expect(second.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    const secondHtml = await second.text();
    expect(secondHtml).toContain("さいしょのコメント");
    expect(secondHtml).not.toContain("あたらしいコメント");

    // 島ページも同様に miss → hit で古い値が返ることを確認する。
    const islandFirst = await fetchWorker(`http://example.com/games/1/islands/${islandId}`);
    expect(islandFirst.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const islandKey = islandSnapshotKey(1, islandId);
    expect(await env.SNAPSHOT?.get(islandKey)).not.toBeNull();
    const islandSecond = await fetchWorker(`http://example.com/games/1/islands/${islandId}`);
    expect(islandSecond.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
  });

  it("2. ログイン中の GET でも 1 回目は miss (RPC 経由)、2 回目は DO を呼ばず KV から hit で返る", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);
    await createIsland(cookie, csrfToken, 1, "いちごう");
    await updateComment(cookie, csrfToken, 1, "さいしょのコメント");

    const first = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const firstHtml = await first.text();
    expect(firstHtml).toContain("さいしょのコメント");
    // ログイン中のみ出るナビ (自分の島へのリンク・管理者リンク) が含まれる。
    expect(firstHtml).toContain('href="/my-island"');
    expect(firstHtml).toContain('href="/admin"');

    // viewer もキャッシュされていることを直接確認する。
    const viewerEntries = await env.SNAPSHOT?.list({ prefix: "viewer:" });
    expect(viewerEntries?.keys.length).toBe(1);

    // DO への直接 fetch (worker.ts のキャッシュ経路を経由しない) でコメントを更新する。
    await updateComment(cookie, csrfToken, 1, "あたらしいコメント");

    // 2 回目は (ページ・viewer とも KV にあるため) DO を呼ばない。更新前の値のまま返る
    // ことで DO が呼ばれていないことを確認する。
    const second = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(second.status).toBe(200);
    expect(second.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    const secondHtml = await second.text();
    expect(secondHtml).toContain("さいしょのコメント");
    expect(secondHtml).not.toContain("あたらしいコメント");

    // 島ページも同様 (viewer キャッシュはゲームごとに共有されるため、ページだけが miss になる)。
    const islandFirst = await fetchWorker("http://example.com/games/1/islands/1", {
      headers: { cookie },
    });
    expect(islandFirst.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const islandSecond = await fetchWorker("http://example.com/games/1/islands/1", {
      headers: { cookie },
    });
    expect(islandSecond.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
  });

  it("2a. ログイン中に Worker が返す HTML が DO が返す HTML と (_csrf を含めて) 一致する (トップ・島ページ)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);
    await createIsland(cookie, csrfToken, 1, "にごう");
    const islandId = 1;

    const workerTop = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(workerTop.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const workerTopHtml = await workerTop.text();
    const doTopHtml = await (
      await mainGameStub().fetch("http://example.com/games/1", { headers: { cookie } })
    ).text();
    expect(workerTopHtml).toBe(doTopHtml);
    // _csrf が実際にレンダリングされていることも確認する (空文字列でないこと)。
    expect(workerTopHtml).toContain(`value="${csrfToken}"`);

    const workerIsland = await fetchWorker(`http://example.com/games/1/islands/${islandId}`, {
      headers: { cookie },
    });
    expect(workerIsland.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const workerIslandHtml = await workerIsland.text();
    const doIslandHtml = await (
      await mainGameStub().fetch(`http://example.com/games/1/islands/${islandId}`, {
        headers: { cookie },
      })
    ).text();
    expect(workerIslandHtml).toBe(doIslandHtml);
  });

  it("2b. 別のユーザーのセッションでアクセスすると、そのユーザー自身のナビ (名前) が出る (他人の名前は出ない)", async () => {
    const { cookie: adminCookie, csrfToken } = await loginAsAdmin();
    await startGame(adminCookie, csrfToken);
    const { cookie: playerCookie } = await loginAs("player1@example.com");

    const adminRes = await fetchWorker("http://example.com/games/1", {
      headers: { cookie: adminCookie },
    });
    expect(adminRes.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const adminHtml = await adminRes.text();
    expect(adminHtml).toContain("adminさん");
    expect(adminHtml).not.toContain("player1さん");

    const playerRes = await fetchWorker("http://example.com/games/1", {
      headers: { cookie: playerCookie },
    });
    expect(playerRes.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const playerHtml = await playerRes.text();
    expect(playerHtml).toContain("player1さん");
    expect(playerHtml).not.toContain("adminさん");
    // 非管理者には「管理」リンクが出ない。
    expect(playerHtml).not.toContain('href="/admin"');

    // 2 回目 (KV から hit) でも取り違えないことを確認する。
    const adminRes2 = await fetchWorker("http://example.com/games/1", {
      headers: { cookie: adminCookie },
    });
    expect(adminRes2.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    expect(await adminRes2.text()).toContain("adminさん");

    const playerRes2 = await fetchWorker("http://example.com/games/1", {
      headers: { cookie: playerCookie },
    });
    expect(playerRes2.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    expect(await playerRes2.text()).toContain("player1さん");
  });

  it("2c. 管理者のセッションでは「管理」リンクが出る (isAdmin がキャッシュされる)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);

    const first = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(first.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    expect(await first.text()).toContain('href="/admin"');

    // KV から返るとき (hit) も admin リンクが維持されることを確認する。
    const second = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(second.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    expect(await second.text()).toContain('href="/admin"');
  });

  it("2d. 無効・期限切れの Cookie では匿名として描画される (authenticated: false としてキャッシュされる)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);

    // ログアウトしてセッションを DB 上失効させる (Cookie の値自体は手元に残しておくことで
    // 「無効・期限切れの Cookie」を再現する)。
    const logoutRes = await mainGameStub().fetch("http://example.com/logout", {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: `_csrf=${encodeURIComponent(csrfToken)}`,
      redirect: "manual",
    });
    expect(logoutRes.status).toBe(302);

    const first = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const firstHtml = await first.text();
    expect(firstHtml).toContain('href="/login"');
    expect(firstHtml).not.toContain('href="/my-island"');
    expect(firstHtml).not.toContain("adminさん");

    // 2 回目も (authenticated: false がキャッシュされているため) DO を呼ばず匿名のまま。
    const second = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(second.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    expect(await second.text()).toContain('href="/login"');
  });

  it("2e. __Secure- 接頭辞つきのセッション Cookie (本番の https 環境) でもログイン中として描画される", async () => {
    // 本番 (https://hakoniwa.syumai.dev) では better-auth が実際のセッション Cookie 名の先頭に
    // `__Secure-` を付ける (`useSecureCookies` の既定挙動。worker.ts の `SESSION_COOKIE_NAMES`
    // のコメント参照)。
    //
    // 注意: このローカル Workers テスト環境 (@cloudflare/vitest-pool-workers) では、
    // better-auth 自身のセッション検証 (DO 側の `auth.api.getSession`) が実行環境の判定上、
    // 常に接頭辞無しの名前を期待する (http/https どちらの URL でリクエストしても変わらないことを
    // 確認済み)。そのため `__Secure-` 付きの Cookie だけを送ると DO 側の検証自体が失敗し、
    // 「ログイン中として描画される」ところまでは確認できない。ここでは素の Cookie も同じ
    // ヘッダに含めることで DO 側のセッション検証を成立させつつ、`__Secure-` 側を先に置いて
    // worker.ts がその Cookie を拾ってキャッシュ/RPC の経路に正しく載せることを検証する
    // (末尾に置いた `hako.session_token` を無視しているわけではない点は、
    // `extractSessionCookieValue` の挙動を直接検証する `test/worker-cookie.test.ts` の方が
    // 厳密に確認できる。そちらが本番バグの回帰テストの本体で、このテストは統合経路の疎通確認)。
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);
    const sessionTokenValue = cookie.slice(cookie.indexOf("=") + 1);
    const cookieWithSecurePrefix = `__Secure-hako.session_token=${sessionTokenValue}; ${cookie}`;

    const first = await fetchWorker("http://example.com/games/1", {
      headers: { cookie: cookieWithSecurePrefix },
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const firstHtml = await first.text();
    expect(firstHtml).toContain("adminさん");
    expect(firstHtml).toContain('href="/admin"');
    expect(firstHtml).toContain('href="/my-island"');
    expect(firstHtml).toContain(`value="${csrfToken}"`);

    // 2 回目は (ページ・viewer とも KV にあるため) DO を呼ばず hit で返る。
    const second = await fetchWorker("http://example.com/games/1", {
      headers: { cookie: cookieWithSecurePrefix },
    });
    expect(second.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    const secondHtml = await second.text();
    expect(secondHtml).toContain("adminさん");
    expect(secondHtml).toContain(`value="${csrfToken}"`);
  });

  it("3. env.SNAPSHOT 未バインドでも 200 が返る (常に DO へ転送)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);

    // `exactOptionalPropertyTypes` があるため `SNAPSHOT: undefined` は入れられない
    // (`Env.SNAPSHOT` は optional であって `| undefined` ではないため)。分割代入でプロパティ
    // 自体を落とし、未バインドの状態を再現する。
    const { SNAPSHOT: _snapshot, ...envWithoutSnapshot } = env;
    const res = await fetchWorker("http://example.com/games/1", undefined, envWithoutSnapshot);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Hakoniwa-Snapshot")).toBe("bypass");
    expect(await res.text()).toContain("諸島の状況");
  });

  it("4. Worker が返す HTML が DO が返す HTML と一致する (トップ・島ページ)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);
    await createIsland(cookie, csrfToken, 1, "にごう");
    const islandId = 1;

    // トップページ: 同時期に Worker 経由 (キャッシュ miss → RPC + レンダリング) と
    // DO 直接 (通常の HTML レンダリング) の両方を叩いて比較する。
    const workerTop = await fetchWorker("http://example.com/games/1");
    expect(workerTop.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const workerTopHtml = await workerTop.text();
    const doTopHtml = await (await mainGameStub().fetch("http://example.com/games/1")).text();
    expect(workerTopHtml).toBe(doTopHtml);

    // 島ページも同様に比較する (terrain の JSON 往復を経由したレンダリングであることが重要)。
    const workerIsland = await fetchWorker(`http://example.com/games/1/islands/${islandId}`);
    expect(workerIsland.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    const workerIslandHtml = await workerIsland.text();
    const doIslandHtml = await (
      await mainGameStub().fetch(`http://example.com/games/1/islands/${islandId}`)
    ).text();
    expect(workerIslandHtml).toBe(doIslandHtml);
  });

  it("5. POST や /games/:id/my-island はキャッシュ経路に入らない (bypass)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);

    const postRes = await fetchWorker("http://example.com/games/1/islands", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `name=${encodeURIComponent("さんごう")}&_csrf=x`,
    });
    expect(postRes.headers.get("X-Hakoniwa-Snapshot")).toBe("bypass");

    const myIslandRes = await fetchWorker("http://example.com/games/1/my-island");
    expect(myIslandRes.headers.get("X-Hakoniwa-Snapshot")).toBe("bypass");

    // クエリ文字列付きの GET /games/:id も対象外 (bypass) にする。
    const withQuery = await fetchWorker("http://example.com/games/1?notice=no_island");
    expect(withQuery.headers.get("X-Hakoniwa-Snapshot")).toBe("bypass");
  });

  it("応答の Cache-Control は HTML なので private, no-store のまま (hit/miss/bypass 共通)", async () => {
    const { cookie, csrfToken } = await loginAsAdmin();
    await startGame(cookie, csrfToken);

    const miss = await fetchWorker("http://example.com/games/1");
    expect(miss.headers.get("Cache-Control")).toBe("private, no-store");
    const hit = await fetchWorker("http://example.com/games/1");
    expect(hit.headers.get("X-Hakoniwa-Snapshot")).toBe("hit");
    expect(hit.headers.get("Cache-Control")).toBe("private, no-store");

    // ログイン中の GET も (今は miss/hit でキャッシュ経路に入るが) Cache-Control は変わらない。
    const authedMiss = await fetchWorker("http://example.com/games/1", { headers: { cookie } });
    expect(authedMiss.headers.get("X-Hakoniwa-Snapshot")).toBe("miss");
    expect(authedMiss.headers.get("Cache-Control")).toBe("private, no-store");

    // 実際の bypass 経路 (/my-island はキャッシュ対象外) も同じヘッダになることを確認する。
    const bypass = await fetchWorker("http://example.com/games/1/my-island", {
      headers: { cookie },
    });
    expect(bypass.headers.get("X-Hakoniwa-Snapshot")).toBe("bypass");
    expect(bypass.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it(
    "TTL: 過去のゲーム/終了済みトップは長期、進行中・終了済み島ページは短期になる " +
      "(DO の RPC pageSnapshot を直接叩いて確認する)",
    async () => {
      const { cookie, csrfToken } = await loginAsAdmin();
      const stub = mainGameStub();

      // ゲーム 1: 開始してすぐ running にする (turn-check を待たず checkTurn() で確定させる)。
      await startGame(cookie, csrfToken);
      await stub.checkTurn();
      await createIsland(cookie, csrfToken, 1, "よんごう");
      const islandId = 1;

      const runningTop = await stub.pageSnapshot({ kind: "top", gameId: 1 });
      const runningIsland = await stub.pageSnapshot({ kind: "island", gameId: 1, islandId });
      // 既定の HAKONIWA_UNIT_TIME_SEC (21600) は既定の HAKONIWA_SNAPSHOT_TTL_SEC (60) より
      // 十分大きいため、進行中は ttlSec (60) がそのまま採用される。
      expect(runningTop?.ttl).toBe(60);
      expect(runningIsland?.ttl).toBe(60);

      // 現在のゲームを終了する (isCurrent のまま season.state だけ 'finished' になる)。
      const finishRes = await stub.fetch("http://example.com/admin/games/current/finish", {
        method: "POST",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: `confirm=on&_csrf=${encodeURIComponent(csrfToken)}`,
      });
      expect(finishRes.status).toBe(200);

      const finishedTop = await stub.pageSnapshot({ kind: "top", gameId: 1 });
      const finishedIsland = await stub.pageSnapshot({ kind: "island", gameId: 1, islandId });
      // 終了済みのトップは (掲示板が出ないため) 不変 → 長期 TTL。
      expect(finishedTop?.ttl).toBe(2_592_000);
      // 終了済みでも島ページは記帳が入りうるため短期 TTL のまま。
      expect(finishedIsland?.ttl).toBe(60);

      // ゲーム 2 を開始する (現在のゲームが終了しているので開始できる)。ゲーム 1 は
      // isCurrent === false (過去のゲーム) になる。
      const startGame2Res = await stub.fetch("http://example.com/admin/games", {
        method: "POST",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: `_csrf=${encodeURIComponent(csrfToken)}`,
      });
      expect(startGame2Res.status).toBe(200);

      const pastTop = await stub.pageSnapshot({ kind: "top", gameId: 1 });
      const pastIsland = await stub.pageSnapshot({ kind: "island", gameId: 1, islandId });
      // 過去のゲームは記帳もできず完全に不変 → トップ・島ページとも長期 TTL。
      expect(pastTop?.ttl).toBe(2_592_000);
      expect(pastIsland?.ttl).toBe(2_592_000);
    },
  );

  it("対象のゲーム/島が無ければ pageSnapshot は undefined を返し、DO への通常経路にフォールバックする", async () => {
    const res = await fetchWorker("http://example.com/games/999");
    // KV にもゲームにも無いので DO への通常の fetch にフォールバックし、いつもどおりの
    // エラー画面 (game_not_found) になる。
    expect(res.status).not.toBe(200);
    expect(res.headers.get("X-Hakoniwa-Snapshot")).toBe("bypass");
  });
});
