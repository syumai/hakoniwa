// tmp/06-web-routes-and-views.md 「ルーティング」「ミドルウェア」節、tmp/14-users-auth.md
// のルート表・ミドルウェア順 (session → csrf → turn-check) への置き換え。ランタイム非依存の
// Hono app 組み立て。
import { Hono } from "hono";
import { AppError } from "../app/errors.ts";
import type { WebDeps } from "./deps.ts";
import type { AppEnv } from "./env.ts";
import { csrfMiddleware } from "./middleware/csrf.tsx";
import { sessionMiddleware } from "./middleware/session.ts";
import { turnCheckMiddleware } from "./middleware/turn-check.ts";
import { renderPage } from "./routes/render.tsx";
import { createAccountRoutes } from "./routes/account.tsx";
import { createAdminRoutes } from "./routes/admin.tsx";
import { createAuthRoutes } from "./routes/auth.tsx";
import { createDebugRoutes } from "./routes/debug.tsx";
import { createIslandsRoutes } from "./routes/islands.tsx";
import { createMyIslandRoutes } from "./routes/my-island.tsx";
import { createTopRoutes } from "./routes/top.tsx";
import { ErrorPage, errorMessage, errorStatus } from "./views/messages.tsx";

/** ランタイム非依存の Hono app を組み立てる。静的配信 (`/images/*`, `/style.css`, `/owner.js`) は Adapter の責務。 */
export function createApp(deps: WebDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // better-auth の HTTP エンドポイント。session/csrf/turn-check より前に (最初に) マウントし、
  // それらのミドルウェアを経由させない (better-auth 自身が Cookie とセッションを扱う。
  // trustedOrigins による Origin 検証も better-auth 側の責務)。
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  app.use("*", sessionMiddleware({ auth: deps.auth, adminEmails: deps.config.auth.adminEmails }));
  app.use(
    "*",
    csrfMiddleware({
      secret: deps.config.auth.secret,
      ...(deps.config.auth.baseUrl !== undefined ? { baseUrl: deps.config.auth.baseUrl } : {}),
      gameConfig: deps.config.game,
    }),
  );

  // ゲーム系ルートの前にターン進行判定。auth/account/admin/静的には掛けない。
  const turnCheck = turnCheckMiddleware({ turnService: deps.turnService, clock: deps.clock });
  app.use("/", turnCheck);
  app.use("/islands", turnCheck);
  app.use("/islands/*", turnCheck);
  app.use("/my-island", turnCheck);
  app.use("/my-island/*", turnCheck);
  app.use("/turn", turnCheck);

  app.route("/", createAuthRoutes(deps));
  app.route("/", createAccountRoutes(deps));
  app.route("/", createTopRoutes(deps));
  app.route("/", createIslandsRoutes(deps));
  app.route("/", createMyIslandRoutes(deps));

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
      // GET の login_required はログイン画面へ誘導する (POST は 401 画面のまま)。
      if (err.kind === "login_required" && c.req.method === "GET") {
        return c.redirect("/login", 302);
      }
      // no_island はトップへ戻し、通知として表示する (GET/POST 共通)。
      if (err.kind === "no_island") {
        return c.redirect("/?notice=no_island", 302);
      }
      return renderPage(
        c,
        deps,
        <ErrorPage message={errorMessage(err.kind)} />,
        errorStatus(err.kind),
      );
    }
    // 想定外のエラー。Perl 版 tempProblem 相当。
    return renderPage(c, deps, <ErrorPage message="問題発生、とりあえず戻ってください。" />, 500);
  });

  return app;
}
