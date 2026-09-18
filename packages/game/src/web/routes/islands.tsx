// tmp/14-users-auth.md ルート表: POST /islands, GET /islands/:id, POST /islands/:id/lbbs
import { Hono } from "hono";
import type { IslandPageVM, OwnerPageVM } from "../../app/view-models.ts";
import type { WebDeps } from "../deps.ts";
import type { AppEnv } from "../env.ts";
import { parseIdParam, parseStringBody } from "../forms/common.ts";
import { parseLbbsMessageForm, parseNewIslandForm } from "../forms/island-forms.ts";
import { listIslandSelectOptions } from "./helpers.ts";
import { renderPage } from "./render.tsx";
import { IslandPage } from "../views/island.tsx";
import { MyIslandPage } from "../views/my-island.tsx";
import { NewIslandPage } from "../views/new-island.tsx";

/** postLbbs の戻り値が OwnerPageVM (島主として記帳) か IslandPageVM (観光者として記帳) かを判定する。 */
function isOwnerPageVM(vm: OwnerPageVM | IslandPageVM): vm is OwnerPageVM {
  return "commands" in vm;
}

export function createIslandsRoutes(deps: WebDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/islands", async (c) => {
    const body = await parseStringBody(c);
    const form = parseNewIslandForm(body);
    const vm = deps.gameService.createIsland(c.get("user"), form.name);
    return renderPage(c, deps, <NewIslandPage vm={vm} config={deps.config.game} />);
  });

  app.get("/islands/:id{[0-9]+}", (c) => {
    const id = parseIdParam(c);
    const vm = deps.gameService.getIslandPage(id);
    return renderPage(
      c,
      deps,
      <IslandPage vm={vm} config={deps.config.game} csrfToken={c.get("csrfToken")} />,
    );
  });

  app.post("/islands/:id{[0-9]+}/lbbs", async (c) => {
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseLbbsMessageForm(body);
    const result = deps.gameService.postLbbs(c.get("user"), id, form.message);
    if (isOwnerPageVM(result)) {
      const targets = listIslandSelectOptions(deps.gameService);
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
