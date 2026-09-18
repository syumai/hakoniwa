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
    // 設計書との差異 (Phase 6b までの最小対応): actor は Phase 6b でセッションミドルウェアが
    // c.get('user') から渡す。現時点では login_required で必ず失敗する。
    const vm = deps.gameService.createIsland(undefined, form.name);
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
    // id は v1 の名残 (URL に islandId を含めていた)。v2 の changeName は actor 自身の島にしか
    // 効かないため、id 自体はもう使わない (Phase 6b でこのルート自体を置き換える)。
    parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseSettingsForm(body);
    deps.gameService.changeName(undefined, form.name ?? "");
    return c.html(
      <Layout config={deps.config.game}>
        <ChangeDonePage />
      </Layout>,
    );
  });

  // 追加ルート: トップページの「島の名前の変更」フォーム用 (islandId を body で受け取る)。
  app.post("/settings", async (c) => {
    const body = await parseStringBody(c);
    const form = parseSettingsFormWithId(body);
    deps.gameService.changeName(undefined, form.name ?? "");
    return c.html(
      <Layout config={deps.config.game}>
        <ChangeDonePage />
      </Layout>,
    );
  });

  return app;
}
