// tmp/06-web-routes-and-views.md ルート表:
// POST /islands/:id/owner, POST /islands/:id/commands, POST /islands/:id/comment
// 設計書との差異: トップページの「自分の島へ」フォームは select で islandId を指定するため、
// パスにIDを含まない POST /owner (body で islandId を受け取る) を追加した。
import { Hono } from "hono";
import { parseIdParam, parseStringBody } from "../forms/common.ts";
import {
  parseCommandForm,
  parseCommentForm,
  parseOwnerForm,
  parseOwnerFormWithId,
} from "../forms/island-forms.ts";
import type { WebDeps } from "../deps.ts";
import { updateDefaults } from "../middleware/defaults-cookie.ts";
import type { DefaultsCookieEnv } from "../middleware/defaults-cookie.ts";
import { listIslandSelectOptions } from "./helpers.ts";
import { Layout } from "../views/layout.tsx";
import { OwnerPage } from "../views/owner.tsx";

export function createOwnerRoutes(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  app.post("/islands/:id{[0-9]+}/owner", async (c) => {
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseOwnerForm(body);
    const vm = await deps.gameService.openOwnerPage(id, form.password);
    updateDefaults(c, { ownIslandId: id });
    const targets = listIslandSelectOptions(deps.gameService);
    return c.html(
      <Layout config={deps.config.game}>
        <OwnerPage
          vm={vm}
          config={deps.config.game}
          defaults={c.get("defaults")}
          password={form.password}
          targets={targets}
        />
      </Layout>,
    );
  });

  // 追加ルート: トップページの「自分の島へ」フォーム用 (islandId を body で受け取る)。
  app.post("/owner", async (c) => {
    const body = await parseStringBody(c);
    const form = parseOwnerFormWithId(body);
    const vm = await deps.gameService.openOwnerPage(form.islandId, form.password);
    updateDefaults(c, { ownIslandId: form.islandId });
    const targets = listIslandSelectOptions(deps.gameService);
    return c.html(
      <Layout config={deps.config.game}>
        <OwnerPage
          vm={vm}
          config={deps.config.game}
          defaults={c.get("defaults")}
          password={form.password}
          targets={targets}
        />
      </Layout>,
    );
  });

  app.post("/islands/:id{[0-9]+}/commands", async (c) => {
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseCommandForm(body);
    const result = await deps.gameService.registerCommand(id, form.password, form.input);
    updateDefaults(c, {
      pointX: form.input.x,
      pointY: form.input.y,
      kind: form.input.kind,
      targetIslandId: form.input.target,
    });
    const targets = listIslandSelectOptions(deps.gameService);
    return c.html(
      <Layout config={deps.config.game}>
        <OwnerPage
          vm={result}
          config={deps.config.game}
          defaults={c.get("defaults")}
          password={form.password}
          targets={targets}
          notice={result.notice}
        />
      </Layout>,
    );
  });

  app.post("/islands/:id{[0-9]+}/comment", async (c) => {
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseCommentForm(body);
    const result = await deps.gameService.updateComment(id, form.password, form.message);
    const targets = listIslandSelectOptions(deps.gameService);
    return c.html(
      <Layout config={deps.config.game}>
        <OwnerPage
          vm={result}
          config={deps.config.game}
          defaults={c.get("defaults")}
          password={form.password}
          targets={targets}
          notice={result.notice}
        />
      </Layout>,
    );
  });

  return app;
}
