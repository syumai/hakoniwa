// tmp/06-web-routes-and-views.md ルート表:
// POST /islands/:id/owner, POST /islands/:id/commands, POST /islands/:id/comment
// 設計書との差異 (Phase 6b までの最小対応): 14 (better-auth) により GameService の各メソッドは
// パスワードではなく actor (AuthUser | undefined) を受け取るようになった。セッションミドルウェア
// (Phase 6b) が無い現時点では actor は常に undefined を渡し、login_required で必ず失敗する。
// id パラメータ・password フォーム値は v1 の名残でルート自体が Phase 6b で書き換えられるため、
// 型を通すための最小限の対応に留める。
import { Hono } from "hono";
import { parseIdParam, parseStringBody } from "../forms/common.ts";
import { parseCommandForm, parseCommentForm, parseOwnerForm } from "../forms/island-forms.ts";
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
    const vm = deps.gameService.openOwnerPage(undefined);
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

  // 追加ルート: トップページの「自分の島へ」フォーム用。
  app.post("/owner", async (c) => {
    const body = await parseStringBody(c);
    const form = parseOwnerForm(body);
    const vm = deps.gameService.openOwnerPage(undefined);
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
    parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseCommandForm(body);
    const result = deps.gameService.registerCommand(undefined, form.input);
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
    parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseCommentForm(body);
    const result = deps.gameService.updateComment(undefined, form.message);
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
