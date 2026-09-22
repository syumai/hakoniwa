// tmp/21-kv-snapshot-cache.md: 読み取り専用ページの View Model を Workers KV にキャッシュし、
// Worker 側でレンダリングして Durable Object への往復を省く機能のための、ランタイム非依存な
// レンダリング関数。DO 側 (routes/render.tsx の renderPage + views/layout.tsx の Layout) と
// 同じ JSX を、Context に依存せず描画する。
// hono/jsx から HTML 文字列を得る方法は `c.html()` (hono の Context) の実装
// (`resolveCallback(jsxElement, HtmlEscapedCallbackPhase.Stringify, false, {})`) と同じにして、
// 出力が一致することを保証する。
//
// tmp/21-kv-snapshot-cache.md「ログイン中も KV から返す」節: `user`/`csrfToken` を省略すれば
// 従来どおり未ログイン扱いで描画する。ログイン中は Worker (呼び出し側) が KV にキャッシュした
// セッション解決結果 (`AuthUserRef` + `_csrf` + `hasIsland`) を渡す。
import { HtmlEscapedCallbackPhase, resolveCallback } from "hono/utils/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { AuthUserRef } from "../app/auth.ts";
import type { GameConfig } from "../core/config.ts";
import type { IslandPageVM, TopPageVM } from "../app/view-models.ts";
import { IslandOgpHead, IslandPage } from "./views/island.tsx";
import { Layout } from "./views/layout.tsx";
import { TopPage } from "./views/top.tsx";

/** hono/jsx の要素 (`JSX.Element` = `HtmlEscapedString | Promise<HtmlEscapedString>`) の型。 */
type JsxElement = HtmlEscapedString | Promise<HtmlEscapedString>;

/** `c.html(jsxElement)` と同じ処理を Context 無しで行う。 */
function renderJsxToHtml(node: JsxElement): Promise<string> {
  return resolveCallback(node, HtmlEscapedCallbackPhase.Stringify, false, {});
}

export interface RenderTopPageHtmlInput {
  vm: TopPageVM;
  config: GameConfig;
  /** datetime-local の解釈と日時表示に使うタイムゾーン (`AppConfig.timezone`)。 */
  timezone: string;
  /** 表示時点の unix 秒。「次のターンまであと N 分」の計算に使う。 */
  now: number;
  /** ログイン中のユーザー。省略 (undefined) なら未ログイン扱いで描画する。 */
  user?: AuthUserRef | undefined;
  /** ログイン中のみ渡す (`Layout` のログアウトフォーム・`TopPage` 内の各フォームの `_csrf`)。 */
  csrfToken?: string | undefined;
  /** ログイン中の「自分の島」の有無 (`vm.viewer.hasIsland` を上書きする)。`user` 省略時は無視する。 */
  hasIsland?: boolean;
}

/**
 * `GET /games/:gameId` (トップ) を描画する。`routes/top.tsx` の `createGameTopRoutes` と同じ
 * JSX (`Layout` + `TopPage`) を使う。`vm` はログイン状態に依存しない KV スナップショット
 * (`viewer` は常に `{ hasIsland: false }`) なので、ログイン中は `user`/`hasIsland` で
 * `viewer` を上書きしてから `TopPage` に渡す (`MyIslandSection` の出し分けに必要)。
 * `user`/`csrfToken` を省略すれば従来どおり未ログイン扱いになる (CSRF トークンやフォームが
 * 無いことは tmp/21-kv-snapshot-cache.md で確認済み)。
 */
export function renderTopPageHtml({
  vm,
  config,
  timezone,
  now,
  user,
  csrfToken,
  hasIsland,
}: RenderTopPageHtmlInput): Promise<string> {
  const pageVm: TopPageVM =
    user === undefined ? vm : { ...vm, viewer: { user, hasIsland: hasIsland ?? false } };
  return renderJsxToHtml(
    <Layout config={config} user={user} csrfToken={csrfToken}>
      <TopPage vm={pageVm} config={config} timezone={timezone} now={now} csrfToken={csrfToken} />
    </Layout>,
  );
}

export interface RenderIslandPageHtmlInput {
  vm: IslandPageVM;
  config: GameConfig;
  /** OGP メタタグの絶対 URL 化に使うオリジン (`config.auth.baseUrl` かリクエストのオリジン)。 */
  origin: string;
  /** ログイン中のユーザー。省略 (undefined) なら未ログイン扱いで描画する。 */
  user?: AuthUserRef | undefined;
  /** ログイン中のみ渡す (`Layout` のログアウトフォーム・記帳フォームの `_csrf`)。 */
  csrfToken?: string | undefined;
}

/**
 * `GET /games/:gameId/islands/:id` (観光) を描画する。`routes/islands.tsx` と同じ JSX
 * (`Layout` + `IslandPage`、`extraHead` に `IslandOgpHead`) を使う。`IslandPageVM` 自体は
 * ログイン状態に依存しないため、`user`/`csrfToken` を省略すれば従来どおり未ログイン扱いになる。
 */
export function renderIslandPageHtml({
  vm,
  config,
  origin,
  user,
  csrfToken,
}: RenderIslandPageHtmlInput): Promise<string> {
  return renderJsxToHtml(
    <Layout
      config={config}
      user={user}
      csrfToken={csrfToken}
      extraHead={<IslandOgpHead vm={vm} origin={origin} />}
    >
      <IslandPage vm={vm} config={config} csrfToken={csrfToken} />
    </Layout>,
  );
}
