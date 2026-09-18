// tmp/06-web-routes-and-views.md ルート表: GET /
import { Hono } from "hono";
import type { WebDeps } from "../deps.ts";
import type { DefaultsCookieEnv } from "../middleware/defaults-cookie.ts";
import { Layout } from "../views/layout.tsx";
import { TopPage } from "../views/top.tsx";

export function createTopRoutes(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  app.get("/", (c) => {
    const vm = deps.gameService.getTopPage(undefined);
    const defaults = c.get("defaults");
    return c.html(
      <Layout config={deps.config.game}>
        <TopPage vm={vm} config={deps.config.game} defaults={defaults} />
      </Layout>,
    );
  });

  return app;
}
