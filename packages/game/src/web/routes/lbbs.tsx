// tmp/06-web-routes-and-views.md ルート表:
// POST /islands/:id/lbbs, POST /islands/:id/lbbs/owner, POST /islands/:id/lbbs/delete
// useLbbs=false の場合はこのルーター自体を app.ts でマウントしないため 404 になる。
// 設計書との差異 (Phase 6b までの最小対応): 14 により掲示板の記帳はログイン必須になり、
// GameService.postLbbs(actor, islandId, message) / deleteLbbs(actor, number) に統合された。
// セッションミドルウェア (Phase 6b) が無い現時点では actor は常に undefined を渡す。
import { Hono } from "hono";
import { parseIdParam, parseStringBody } from "../forms/common.ts";
import {
  parseLbbsDeleteForm,
  parseLbbsOwnerForm,
  parseLbbsVisitorForm,
} from "../forms/island-forms.ts";
import type { WebDeps } from "../deps.ts";
import type { DefaultsCookieEnv } from "../middleware/defaults-cookie.ts";
import { listIslandSelectOptions } from "./helpers.ts";
import { Layout } from "../views/layout.tsx";
import { IslandPage } from "../views/island.tsx";
import { OwnerPage } from "../views/owner.tsx";
import { ErrorPage } from "../views/messages.tsx";

/**
 * 観光者の記帳のみ Origin 検査を行う (tmp/07-auth-and-security.md 「CSRF」節)。
 * パスワード不要な唯一の書き込みルートのため、簡易対策として Origin ヘッダの host を比較する。
 */
function isOriginMismatch(
  originHeader: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (originHeader === undefined || originHeader === "") {
    return false;
  }
  try {
    const originHost = new URL(originHeader).host;
    return originHost !== hostHeader;
  } catch {
    // 不正な Origin ヘッダは不一致として扱う。
    return true;
  }
}

export function createLbbsRoutes(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  app.post("/islands/:id{[0-9]+}/lbbs", async (c) => {
    if (isOriginMismatch(c.req.header("origin"), c.req.header("host"))) {
      return c.html(
        <Layout config={deps.config.game}>
          <ErrorPage message="不正なリクエストです。" />
        </Layout>,
        403,
      );
    }
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseLbbsVisitorForm(body);
    const result = deps.gameService.postLbbs(undefined, id, form.message);
    return c.html(
      <Layout config={deps.config.game}>
        <IslandPage
          vm={result as Parameters<typeof IslandPage>[0]["vm"]}
          config={deps.config.game}
          defaults={c.get("defaults")}
          notice={result.notice}
        />
      </Layout>,
    );
  });

  app.post("/islands/:id{[0-9]+}/lbbs/owner", async (c) => {
    const id = parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseLbbsOwnerForm(body);
    const result = deps.gameService.postLbbs(undefined, id, form.message);
    const targets = listIslandSelectOptions(deps.gameService);
    return c.html(
      <Layout config={deps.config.game}>
        <OwnerPage
          vm={result as Parameters<typeof OwnerPage>[0]["vm"]}
          config={deps.config.game}
          defaults={c.get("defaults")}
          password={form.password}
          targets={targets}
          notice={result.notice}
        />
      </Layout>,
    );
  });

  app.post("/islands/:id{[0-9]+}/lbbs/delete", async (c) => {
    parseIdParam(c);
    const body = await parseStringBody(c);
    const form = parseLbbsDeleteForm(body);
    const result = deps.gameService.deleteLbbs(undefined, form.number);
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
