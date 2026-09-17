// tmp/06-web-routes-and-views.md 「ルーティング」「ミドルウェア」節。ランタイム非依存の Hono app 組み立て。
import { Hono } from "hono";
import { AppError } from "../app/errors.ts";
import type { WebDeps } from "./deps.ts";
import { defaultsCookieMiddleware } from "./middleware/defaults-cookie.ts";
import type { DefaultsCookieEnv } from "./middleware/defaults-cookie.ts";
import { turnCheckMiddleware } from "./middleware/turn-check.ts";
import { createAdminRoutes } from "./routes/admin.tsx";
import { createDebugRoutes } from "./routes/debug.tsx";
import { createIslandsRoutes } from "./routes/islands.tsx";
import { createLbbsRoutes } from "./routes/lbbs.tsx";
import { createOwnerRoutes } from "./routes/owner.tsx";
import { createTopRoutes } from "./routes/top.tsx";
import { Layout } from "./views/layout.tsx";
import { ErrorPage, errorMessage, errorStatus } from "./views/messages.tsx";

/** ランタイム非依存の Hono app を組み立てる。静的配信 (`/images/*`, `/style.css`, `/owner.js`) は Adapter の責務。 */
export function createApp(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  // フォーム初期値 Cookie の読み書き。admin を含め全ルートに掛けても無害 (admin は使わない)。
  app.use("*", defaultsCookieMiddleware());

  // ゲーム系ルートの前にターン進行判定。`/admin/*` と静的には掛けない。
  const turnCheck = turnCheckMiddleware({ turnService: deps.turnService, clock: deps.clock });
  app.use("/", turnCheck);
  app.use("/islands", turnCheck);
  app.use("/islands/*", turnCheck);
  app.use("/owner", turnCheck);
  app.use("/settings", turnCheck);
  app.use("/turn", turnCheck);

  app.route("/", createTopRoutes(deps));
  app.route("/", createIslandsRoutes(deps));
  app.route("/", createOwnerRoutes(deps));

  // useLbbs=false の場合はルーターごとマウントしない (未マウントのパスは Hono の既定 404 になる)。
  if (deps.config.game.useLbbs) {
    app.route("/", createLbbsRoutes(deps));
  }

  // config.debug=false の場合は POST /turn 自体を無効化する。
  if (deps.config.debug) {
    app.route("/", createDebugRoutes(deps));
  }

  // adminEnabled=false の場合は /admin/* すべて無効化する。
  if (deps.config.adminEnabled) {
    app.route("/", createAdminRoutes(deps));
  }

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.html(
        <Layout config={deps.config.game}>
          <ErrorPage message={errorMessage(err.kind)} />
        </Layout>,
        errorStatus(err.kind),
      );
    }
    // 想定外のエラー。Perl 版 tempProblem 相当。
    return c.html(
      <Layout config={deps.config.game}>
        <ErrorPage message="問題発生、とりあえず戻ってください。" />
      </Layout>,
      500,
    );
  });

  return app;
}
