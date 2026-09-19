// tmp/18-games.md「ルート」節: 旧 URL (ゲーム ID を含まない) は現在のゲームの同じパスへ 302 で
// 転送する (シェア済み URL 対策)。`/my-island`, `/islands/:id`, `/islands/:id/ogp.png` が対象。
import { Hono } from "hono";
import type { WebDeps } from "../deps.ts";
import type { AppEnv } from "../env.ts";
import { requireCurrentGameId } from "./helpers.ts";

export function createLegacyRoutes(deps: WebDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/my-island", (c) => {
    const gameId = requireCurrentGameId(deps.gameService);
    return c.redirect(`/games/${gameId}/my-island`, 302);
  });

  app.get("/islands/:id{[0-9]+}", (c) => {
    const gameId = requireCurrentGameId(deps.gameService);
    const id = c.req.param("id");
    return c.redirect(`/games/${gameId}/islands/${id}`, 302);
  });

  app.get("/islands/:id{[0-9]+}/ogp.png", (c) => {
    const gameId = requireCurrentGameId(deps.gameService);
    const id = c.req.param("id");
    const qs = new URL(c.req.url).search;
    return c.redirect(`/games/${gameId}/islands/${id}/ogp.png${qs}`, 302);
  });

  return app;
}
