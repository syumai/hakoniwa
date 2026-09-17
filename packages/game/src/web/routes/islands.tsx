// tmp/06-web-routes-and-views.md ルート表: POST /islands, GET /islands/:id, POST /islands/:id/settings
// 設計書との差異: トップページの「島の名前とパスワードの変更」フォームは select で islandId を
// 指定するため、パスにIDを含まない POST /settings (body で islandId を受け取る) を追加した。
import { Hono } from "hono";
import { parseIdParam, parseStringBody } from "../forms/common.ts";
import {
  parseNewIslandForm,
  parseSettingsForm,
  parseSettingsFormWithId,
} from "../forms/island-forms.ts";
import type { WebDeps } from "../deps.ts";
import type { DefaultsCookieEnv } from "../middleware/defaults-cookie.ts";
import { Layout } from "../views/layout.tsx";
import { IslandPage } from "../views/island.tsx";
import { NewIslandPage } from "../views/new-island.tsx";
import { ChangeDonePage } from "../views/messages.tsx";

export function createIslandsRoutes(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  app.post("/islands", async (c) => {
    const body = await parseStringBody(c);
    const form = parseNewIslandForm(body);
    const vm = await deps.gameService.createIsland(form.name, form.password, form.passwordConfirm);
    return c.html(
      <Layout config={deps.config.game}>
        <NewIslandPage vm={vm} config={deps.config.game} />
      </Layout>,
    );
  });

  app.get("/islands/:id{[0-9]+}", (c) => {
    const id = parseIdParam(c);
    const vm = deps.gameService.getIslandPage(id);
    const defaults = c.get("defaults");
    return c.html(
      <Layout config={deps.config.game}>
        <IslandPage vm={vm} config={deps.config.game} defaults={defaults} />
      </Layout>,
    );
  });

  app.post("/islands/:id{[0-9]+}/settings", async (c) => {
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseSettingsForm(body);
    await deps.gameService.changeSettings(
      id,
      form.oldPassword,
      form.name,
      form.password,
      form.passwordConfirm,
    );
    return c.html(
      <Layout config={deps.config.game}>
        <ChangeDonePage />
      </Layout>,
    );
  });

  // 追加ルート: トップページの「島の名前とパスワードの変更」フォーム用 (islandId を body で受け取る)。
  app.post("/settings", async (c) => {
    const body = await parseStringBody(c);
    const form = parseSettingsFormWithId(body);
    await deps.gameService.changeSettings(
      form.islandId,
      form.oldPassword,
      form.name,
      form.password,
      form.passwordConfirm,
    );
    return c.html(
      <Layout config={deps.config.game}>
        <ChangeDonePage />
      </Layout>,
    );
  });

  return app;
}
