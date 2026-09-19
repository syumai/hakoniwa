// tmp/14-users-auth.md ルート表、tmp/18-games.md「ルート」節: `/games/:gameId{[0-9]+}` 配下の
// POST /islands, GET /islands/:id, POST /islands/:id/lbbs。
// tmp/17-ogp.md: GET /islands/:id/ogp.png (OGP 画像)。
import { Hono } from "hono";
import type { IslandPageVM, OwnerPageVM } from "../../app/view-models.ts";
import { renderIslandOgp } from "../../ogp/render.ts";
import type { WebDeps } from "../deps.ts";
import type { AppEnv } from "../env.ts";
import { parseIdParam, parseStringBody } from "../forms/common.ts";
import { parseLbbsMessageForm, parseNewIslandForm } from "../forms/island-forms.ts";
import { listIslandSelectOptions, requireGameIdParam } from "./helpers.ts";
import { renderPage } from "./render.tsx";
import { IslandOgpHead, IslandPage } from "../views/island.tsx";
import { MyIslandPage } from "../views/my-island.tsx";
import { NewIslandPage } from "../views/new-island.tsx";

/**
 * OGP 画像の絶対 URL 化に使うオリジン。tmp/17-ogp.md 「メタタグ」節:
 * `config.auth.baseUrl` があればそれ、無ければリクエストのオリジン。
 */
function resolveOrigin(deps: WebDeps, requestUrl: string): string {
  return deps.config.auth.baseUrl ?? new URL(requestUrl).origin;
}

/** postLbbs の戻り値が OwnerPageVM (島主として記帳) か IslandPageVM (観光者として記帳) かを判定する。 */
function isOwnerPageVM(vm: OwnerPageVM | IslandPageVM): vm is OwnerPageVM {
  return "commands" in vm;
}

/** `/games/:gameId{[0-9]+}` 配下にマウントする、島の観光・作成・記帳・OGP のルート。 */
export function createIslandsRoutes(deps: WebDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/islands", async (c) => {
    const gameId = requireGameIdParam(c);
    const body = await parseStringBody(c);
    const form = parseNewIslandForm(body);
    const vm = deps.gameService.createIsland(c.get("user"), gameId, form.name);
    return renderPage(c, deps, <NewIslandPage vm={vm} config={deps.config.game} gameId={gameId} />);
  });

  app.get("/islands/:id{[0-9]+}", (c) => {
    const gameId = requireGameIdParam(c);
    const id = parseIdParam(c);
    const vm = deps.gameService.getIslandPage(gameId, id);
    const origin = resolveOrigin(deps, c.req.url);
    return renderPage(
      c,
      deps,
      <IslandPage vm={vm} config={deps.config.game} csrfToken={c.get("csrfToken")} />,
      undefined,
      <IslandOgpHead vm={vm} origin={origin} />,
    );
  });

  // tmp/17-ogp.md 「ルートとメタタグ」節。認証・セッションに依存しない (誰でも同じ画像)。
  app.get("/islands/:id{[0-9]+}/ogp.png", async (c) => {
    const gameId = requireGameIdParam(c);
    const id = parseIdParam(c);
    const { island, turn } = deps.gameService.getIslandOgp(gameId, id);
    const png = await renderIslandOgp(island, turn);
    // TS 5.9 の DOM 型は `Uint8Array<ArrayBuffer>` を要求する。encodePng は SharedArrayBuffer を
    // 使わないため安全にキャストする。
    return c.body(png as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      // tmp/17-ogp.md 「キャッシュ (Workers Cache)」節: 将来 ctx.cache.purge({ tags }) で
      // ターン進行時にこの島の OGP 画像だけ無効化できるように付けておく (初版では purge しない)。
      "Cache-Tag": `island-${id}`,
    });
  });

  app.post("/islands/:id{[0-9]+}/lbbs", async (c) => {
    const gameId = requireGameIdParam(c);
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseLbbsMessageForm(body);
    const result = deps.gameService.postLbbs(c.get("user"), gameId, id, form.message);
    if (isOwnerPageVM(result)) {
      const targets = listIslandSelectOptions(deps.gameService, gameId);
      return renderPage(
        c,
        deps,
        <MyIslandPage
          vm={result}
          config={deps.config.game}
          targets={targets}
          csrfToken={c.get("csrfToken") ?? ""}
          notice={result.notice}
        />,
      );
    }
    return renderPage(
      c,
      deps,
      <IslandPage
        vm={result}
        config={deps.config.game}
        csrfToken={c.get("csrfToken")}
        notice={result.notice}
      />,
    );
  });

  return app;
}
