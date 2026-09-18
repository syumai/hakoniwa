// tmp/14-users-auth.md ルート表: GET /my-island, POST /my-island/commands|comment|name|lbbs/delete
// v1 の routes/owner.tsx (パスワード認証、URL に islandId を含む) を置き換える。
import { Hono } from "hono";
import type { WebDeps } from "../deps.ts";
import type { AppEnv } from "../env.ts";
import { parseStringBody } from "../forms/common.ts";
import {
  parseCommandForm,
  parseCommentForm,
  parseLbbsDeleteForm,
  parseNameForm,
} from "../forms/island-forms.ts";
import { listIslandSelectOptions } from "./helpers.ts";
import { renderPage } from "./render.tsx";
import { MyIslandPage } from "../views/my-island.tsx";

export function createMyIslandRoutes(deps: WebDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/my-island", (c) => {
    const vm = deps.gameService.openOwnerPage(c.get("user"));
    const targets = listIslandSelectOptions(deps.gameService);
    return renderPage(
      c,
      deps,
      <MyIslandPage
        vm={vm}
        config={deps.config.game}
        targets={targets}
        csrfToken={c.get("csrfToken") ?? ""}
      />,
    );
  });

  app.post("/my-island/commands", async (c) => {
    const body = await parseStringBody(c);
    const form = parseCommandForm(body);
    const result = deps.gameService.registerCommand(c.get("user"), form.input);
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
  });

  app.post("/my-island/comment", async (c) => {
    const body = await parseStringBody(c);
    const form = parseCommentForm(body);
    const result = deps.gameService.updateComment(c.get("user"), form.message);
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
  });

  app.post("/my-island/name", async (c) => {
    const body = await parseStringBody(c);
    const form = parseNameForm(body);
    const result = deps.gameService.changeName(c.get("user"), form.name);
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
  });

  app.post("/my-island/lbbs/delete", async (c) => {
    const body = await parseStringBody(c);
    const form = parseLbbsDeleteForm(body);
    const result = deps.gameService.deleteLbbs(c.get("user"), form.number);
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
  });

  return app;
}
