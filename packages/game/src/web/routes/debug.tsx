// tmp/08-turn-trigger-admin-cli.md 「デバッグ用 POST /turn」節。config.debug=false なら app.ts が
// このルーターをマウントしないため 404 になる。
import { Hono } from "hono";
import type { WebDeps } from "../deps.ts";
import type { DefaultsCookieEnv } from "../middleware/defaults-cookie.ts";
import { Layout } from "../views/layout.tsx";
import { TopPage } from "../views/top.tsx";

export function createDebugRoutes(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  app.post("/turn", (c) => {
    deps.turnService.advanceTurn(deps.clock.now());
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
