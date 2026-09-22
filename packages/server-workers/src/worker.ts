// tmp/12-workers-adapter.md 「Worker エントリ」節の実装。
// Worker は基本的にすべてのリクエストを単一の DO (`GAME.getByName('main')`) へ転送するだけ。
// 静的アセット (images/style.css/owner.js) は wrangler.jsonc の assets 設定により
// この fetch より先に Workers Static Assets が応答する。
//
// tmp/17-ogp.md 「キャッシュ」節 (方針変更): Cache API (`caches.default`) を自前で呼ぶ実装は
// 使わない。代わりに Workers Cache (`wrangler.jsonc` の `cache.enabled`) を使う。これは
// 応答の `Cache-Control` に従って Cloudflare 側が自動でキャッシュする機能で、workers.dev でも
// 有効。応答ごとの `Cache-Control` (OGP 画像は `public, max-age=3600` 等、それ以外は
// `private, no-store`) は `packages/game/src/web/app.tsx` の
// `defaultCacheControlMiddleware` / `routes/islands.tsx` が付ける。
//
// tmp/21-kv-snapshot-cache.md: GET `/games/:gameId` (トップ) と `/games/:gameId/islands/:id`
// (観光) だけは、DO への往復を省くために View Model を Workers KV (`env.SNAPSHOT`。バインド
// 省略可能) にキャッシュし、Worker 側でレンダリングして応答する (`tryServeFromSnapshot`)。
// HTML 自体はキャッシュしない (`Cache-Control` は従来どおり `private, no-store`) ので、
// 「次のターンまであと N 分」はリクエスト時刻で再計算され古くならない。
//
// 「ログイン中も KV から返す」節 (追加要件): 当初は未ログイン (セッション Cookie 無し) の GET
// だけが対象だったが、セッションの解決結果 (viewer) も KV にキャッシュすることで、ログイン中の
// GET も対象にした。ページの View Model は閲覧者に依存しないため、同じページキャッシュを
// 使い回しつつ、viewer キャッシュ (ナビの名前・管理者フラグ・`_csrf`・`hasIsland`) を別キーで
// 短期 TTL キャッシュする。ページ・viewer のどちらかが KV に無ければ、DO の RPC
// `pageSnapshot(request, cookieHeader)` を 1 回だけ呼んで両方をまとめて取得し、両方を KV に
// 書く (DO への往復は従来と同じ 1 回のまま)。
// 対象外・KV 未バインド・キャッシュにも DO にも無ければ、従来どおり DO への HTTP 転送に委ねる。
import {
  createCsrfToken,
  loadConfigFromEnv,
  renderIslandPageHtml,
  renderTopPageHtml,
} from "@hakoniwa/game";
import type { AuthUserRef } from "@hakoniwa/game";
import type { Env } from "./env.ts";
import { HakoniwaGame, pickStringEnv } from "./game-object.ts";
import {
  fromIslandPageSnapshotVM,
  hashSessionCookieValue,
  islandSnapshotKey,
  loadSnapshotTtlConfig,
  topSnapshotKey,
  viewerSnapshotKey,
} from "./snapshot.ts";
import type {
  IslandPageSnapshotEnvelope,
  TopPageSnapshotEnvelope,
  ViewerSnapshotEnvelope,
} from "./snapshot.ts";

// DO の取得に location hint `apac-ne` (北東アジア) を指定する。
// 注意:
// - location hint が効くのは DO の **初回作成時のみ** で、ベストエフォート。既存の DO は移動しない。
// - プレイヤーは日本在住が中心のため `apac-ne` を選択している。
// - 変更する場合は次のいずれかから選ぶ: wnam, enam, sam, weur, eeur, apac, apac-ne, apac-se, oc, afr, me
//   (参考: https://developers.cloudflare.com/durable-objects/reference/data-location/#provide-a-location-hint)
function getGame(env: Env) {
  const id = env.GAME.idFromName("main");
  return env.GAME.get(id, { locationHint: "apac-ne" });
}

/** `/games/:gameId` (トップ)。 */
const TOP_PATH = /^\/games\/([0-9]+)$/;
/** `/games/:gameId/islands/:id` (観光)。 */
const ISLAND_PATH = /^\/games\/([0-9]+)\/islands\/([0-9]+)$/;

/**
 * better-auth のセッション Cookie 名の候補。`bootstrap/auth.ts` の `cookiePrefix: "hako"` により
 * 素の名前は `hako.session_token` になるが、better-auth (`createCookieGetter`,
 * node_modules/better-auth/dist/cookies/cookie-utils.mjs の `SECURE_COOKIE_PREFIX`) は
 * `useSecureCookies` (既定値: `advanced.useSecureCookies` を明示していなければ、リクエストが
 * https かどうかなど実行時の状況で決まる) が有効なとき、Cookie 名の先頭に `__Secure-` を付ける。
 * したがって https で運用している本番では `__Secure-hako.session_token`、ローカル開発の http では
 * 素の `hako.session_token` になる (better-auth の実装から導いたもので、本番の Cookie を直接
 * 確認したわけではないため、両方の名前を受け付ける)。
 * このズレにより、以前の実装 (素の名前への完全一致のみ) は本番でセッション Cookie を
 * 見つけられず、ログイン中のユーザーにも匿名のスナップショットが返ってしまっていた
 * (トップ・観光ページでログアウトしているように見えるバグ)。
 * `__Host-` は better-auth が (別の Cookie で) 使う、より厳格な接頭辞。session cookie では
 * 通常使われないが、念のため候補に含めておく。
 */
const SESSION_COOKIE_NAMES = [
  "__Host-hako.session_token",
  "__Secure-hako.session_token",
  "hako.session_token",
];

/**
 * Cookie ヘッダからセッション Cookie (`SESSION_COOKIE_NAMES` のいずれか) の値だけを取り出す。
 * 候補が複数あるのは、上記 `SESSION_COOKIE_NAMES` のコメントのとおり、Cookie 名が実行時の
 * 状況 (https かどうか等) によって変わりうるため。無ければ `undefined` (= 未ログイン扱い。
 * それ以外の Cookie は無視する)。テスト (`test/worker-cookie.test.ts`) のために export する。
 */
export function extractSessionCookieValue(cookieHeader: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    if ((SESSION_COOKIE_NAMES as readonly string[]).includes(name)) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

function snapshotResponse(html: string, status: "hit" | "miss"): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      // HTML 自体はキャッシュしない (KV に置くのは View Model のみ)。
      "Cache-Control": "private, no-store",
      "X-Hakoniwa-Snapshot": status,
    },
  });
}

/** DO への通常の転送応答に `X-Hakoniwa-Snapshot: bypass` を付け足す (動作確認用)。 */
function withBypassHeader(response: Response): Response {
  const copy = new Response(response.body, response);
  copy.headers.set("X-Hakoniwa-Snapshot", "bypass");
  return copy;
}

/** レンダリングに渡す viewer 情報。`renderTopPageHtml`/`renderIslandPageHtml` にそのまま渡せる形。 */
interface ViewerRenderProps {
  user: AuthUserRef | undefined;
  csrfToken: string | undefined;
  hasIsland: boolean;
}

const ANONYMOUS_VIEWER_PROPS: ViewerRenderProps = {
  user: undefined,
  csrfToken: undefined,
  hasIsland: false,
};

/**
 * `ViewerSnapshotEnvelope` (KV/RPC からの viewer) をレンダリング用の props に変換する。
 * `_csrf` は `HAKONIWA_AUTH_SECRET` があれば Worker 側で再計算できる (`createCsrfToken`)。
 * Cookie が不正・期限切れ (`authenticated: false`) や、viewer 自体が無い (未ログイン) 場合は
 * 匿名として描画する。
 */
async function toViewerRenderProps(
  viewer: ViewerSnapshotEnvelope | undefined,
  secret: string,
): Promise<ViewerRenderProps> {
  if (viewer === undefined || !viewer.authenticated) {
    return ANONYMOUS_VIEWER_PROPS;
  }
  const csrfToken = await createCsrfToken(secret, viewer.sessionId);
  return { user: viewer.user, csrfToken, hasIsland: viewer.hasIsland };
}

/** viewer キャッシュの KV キーと現在のキャッシュ値。セッション Cookie が無ければ両方 `undefined`/`null`。 */
interface ViewerCacheLookup {
  key: string | undefined;
  cached: ViewerSnapshotEnvelope | null;
}

async function readViewerCache(
  snapshot: KVNamespace,
  sessionCookieValue: string | undefined,
  gameId: number,
): Promise<ViewerCacheLookup> {
  if (sessionCookieValue === undefined) {
    return { key: undefined, cached: null };
  }
  const key = viewerSnapshotKey(await hashSessionCookieValue(sessionCookieValue), gameId);
  const cached = await snapshot.get<ViewerSnapshotEnvelope>(key, "json");
  return { key, cached };
}

/**
 * 未ログイン GET の `/games/:gameId` / `/games/:gameId/islands/:id` を KV スナップショット
 * (View Model の JSON) から応答する。対象外リクエスト、`env.SNAPSHOT` 未バインド、
 * キャッシュにも DO 側にも対象が無い場合は `undefined` を返す
 * (呼び出し側が従来どおり DO への HTTP 転送にフォールバックする)。
 */
async function tryServeFromSnapshot(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | undefined> {
  const snapshot = env.SNAPSHOT;
  if (request.method !== "GET" || snapshot === undefined) {
    return undefined;
  }
  const url = new URL(request.url);
  // 対象は素の GET (クエリ文字列無し) のみにする。エラー通知のリダイレクト
  // (`/games/:id?notice=no_island` 等) はログイン中のユーザー向けの導線なので、通常は
  // セッション Cookie 判定で既に弾かれているはずだが、クエリ文字列があれば常に DO の通常経路
  // (`app.onError` 由来の表示分岐など) に委ねる方が安全なため、ここでも対象外にする。
  if (url.search !== "") {
    return undefined;
  }

  const topMatch = TOP_PATH.exec(url.pathname);
  const islandMatch = topMatch === null ? ISLAND_PATH.exec(url.pathname) : null;
  if (topMatch === null && islandMatch === null) {
    return undefined;
  }

  const config = loadConfigFromEnv(pickStringEnv(env));
  const now = Math.floor(Date.now() / 1000);
  const cookieHeader = request.headers.get("Cookie") ?? undefined;
  const sessionCookieValue =
    cookieHeader !== undefined ? extractSessionCookieValue(cookieHeader) : undefined;

  if (topMatch !== null) {
    const gameId = Number(topMatch[1]);
    const pageKey = topSnapshotKey(gameId);

    const [cachedPage, viewerLookup] = await Promise.all([
      snapshot.get<TopPageSnapshotEnvelope>(pageKey, "json"),
      readViewerCache(snapshot, sessionCookieValue, gameId),
    ]);

    if (cachedPage !== null && (viewerLookup.key === undefined || viewerLookup.cached !== null)) {
      const viewerProps = await toViewerRenderProps(
        viewerLookup.cached ?? undefined,
        config.auth.secret,
      );
      const html = await renderTopPageHtml({
        vm: cachedPage.vm,
        config: config.game,
        timezone: config.timezone,
        now,
        ...viewerProps,
      });
      return snapshotResponse(html, "hit");
    }

    // viewerLookup.key !== undefined (= セッション Cookie あり) のときだけ RPC に Cookie
    // ヘッダを渡し、DO 側でセッションもあわせて解決してもらう (往復を 1 回に保つ)。
    const result = await getGame(env).pageSnapshot(
      { kind: "top", gameId },
      viewerLookup.key !== undefined ? cookieHeader : undefined,
    );
    if (result === undefined) {
      return undefined;
    }
    if (result.kind !== "top") {
      throw new Error("HakoniwaGame.pageSnapshot: expected kind 'top'");
    }
    const viewerProps = await toViewerRenderProps(result.viewer, config.auth.secret);
    const html = await renderTopPageHtml({
      vm: result.vm,
      config: config.game,
      timezone: config.timezone,
      now,
      ...viewerProps,
    });
    const envelope: TopPageSnapshotEnvelope = { vm: result.vm };
    ctx.waitUntil(snapshot.put(pageKey, JSON.stringify(envelope), { expirationTtl: result.ttl }));
    if (viewerLookup.key !== undefined && result.viewer !== undefined) {
      const viewerTtl = loadSnapshotTtlConfig(env).ttlSec;
      ctx.waitUntil(
        snapshot.put(viewerLookup.key, JSON.stringify(result.viewer), {
          expirationTtl: viewerTtl,
        }),
      );
    }
    return snapshotResponse(html, "miss");
  }

  // topMatch === null の分岐なので islandMatch は必ず非 null (正規表現の相互排他性による)。
  if (islandMatch === null) {
    return undefined;
  }
  const gameId = Number(islandMatch[1]);
  const islandId = Number(islandMatch[2]);
  const pageKey = islandSnapshotKey(gameId, islandId);
  const origin = config.auth.baseUrl ?? url.origin;

  const [cachedPage, viewerLookup] = await Promise.all([
    snapshot.get<IslandPageSnapshotEnvelope>(pageKey, "json"),
    readViewerCache(snapshot, sessionCookieValue, gameId),
  ]);

  if (cachedPage !== null && (viewerLookup.key === undefined || viewerLookup.cached !== null)) {
    const vm = fromIslandPageSnapshotVM(cachedPage.vm, config.game.islandSize);
    const viewerProps = await toViewerRenderProps(
      viewerLookup.cached ?? undefined,
      config.auth.secret,
    );
    const html = await renderIslandPageHtml({
      vm,
      config: config.game,
      origin,
      user: viewerProps.user,
      csrfToken: viewerProps.csrfToken,
    });
    return snapshotResponse(html, "hit");
  }

  const result = await getGame(env).pageSnapshot(
    { kind: "island", gameId, islandId },
    viewerLookup.key !== undefined ? cookieHeader : undefined,
  );
  if (result === undefined) {
    return undefined;
  }
  if (result.kind !== "island") {
    throw new Error("HakoniwaGame.pageSnapshot: expected kind 'island'");
  }
  const vm = fromIslandPageSnapshotVM(result.vm, config.game.islandSize);
  const viewerProps = await toViewerRenderProps(result.viewer, config.auth.secret);
  const html = await renderIslandPageHtml({
    vm,
    config: config.game,
    origin,
    user: viewerProps.user,
    csrfToken: viewerProps.csrfToken,
  });
  const envelope: IslandPageSnapshotEnvelope = { vm: result.vm };
  ctx.waitUntil(snapshot.put(pageKey, JSON.stringify(envelope), { expirationTtl: result.ttl }));
  if (viewerLookup.key !== undefined && result.viewer !== undefined) {
    const viewerTtl = loadSnapshotTtlConfig(env).ttlSec;
    ctx.waitUntil(
      snapshot.put(viewerLookup.key, JSON.stringify(result.viewer), { expirationTtl: viewerTtl }),
    );
  }
  return snapshotResponse(html, "miss");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const snapshotRes = await tryServeFromSnapshot(request, env, ctx);
    if (snapshotRes !== undefined) {
      return snapshotRes;
    }
    return withBypassHeader(await getGame(env).fetch(request));
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // 進めるべきかどうか (unitTimeSec と game.last_time から判定) は DO 側 (checkTurn) に任せる。
    ctx.waitUntil(getGame(env).checkTurn());
  },
} satisfies ExportedHandler<Env>;

export { HakoniwaGame };
