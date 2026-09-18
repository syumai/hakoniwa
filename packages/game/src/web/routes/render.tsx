// 各ルートで共通に使う描画ヘルパ。Layout に user/csrfToken を毎回渡す手間を減らす。
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { WebDeps } from "../deps.ts";
import type { AppEnv } from "../env.ts";
import { Layout } from "../views/layout.tsx";

export function renderPage(
  c: Context<AppEnv>,
  deps: WebDeps,
  children: Child,
  status?: ContentfulStatusCode,
) {
  return c.html(
    <Layout config={deps.config.game} user={c.get("user")} csrfToken={c.get("csrfToken")}>
      {children}
    </Layout>,
    status,
  );
}
