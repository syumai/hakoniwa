// tmp/14-users-auth.md ルート表: GET /
import { Hono } from "hono";
import type { WebDeps } from "../deps.ts";
import type { AppEnv } from "../env.ts";
import { renderPage } from "./render.tsx";
import { requireCurrentGameId } from "./helpers.ts";
import { TopPage } from "../views/top.tsx";
import { errorMessage } from "../views/messages.tsx";

export function createTopRoutes(deps: WebDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => {
    const gameId = requireCurrentGameId(deps.gameService);
    const vm = deps.gameService.getTopPage(c.get("user"), gameId);
    // app.onError の no_island リダイレクト (`/?notice=no_island`) を受けての通知表示。
    const notice = c.req.query("notice") === "no_island" ? errorMessage("no_island") : undefined;
    return renderPage(
      c,
      deps,
      <TopPage
        vm={vm}
        config={deps.config.game}
        timezone={deps.config.timezone}
        now={deps.clock.now()}
        csrfToken={c.get("csrfToken")}
        notice={notice}
      />,
    );
  });

  return app;
}
