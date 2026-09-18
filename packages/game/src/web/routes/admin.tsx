// tmp/08-turn-trigger-admin-cli.md 「Web 管理画面」節、tmp/14-users-auth.md
// 「認可ルール」節 (管理画面は管理者セッション必須) の移植。パスワード認証は撤去した。
import { Hono } from "hono";
import type { Context } from "hono";
import type { AuthUser } from "../../app/auth.ts";
import { AppError } from "../../app/errors.ts";
import type { WebDeps } from "../deps.ts";
import type { AppEnv } from "../env.ts";
import { parseStrictNonNegativeInt, parseStringBody } from "../forms/common.ts";
import {
  parseAdminBackupForm,
  parseAdminInitForm,
  parseAdminLastTimeForm,
  parseAuthMethodsForm,
  parseFinalTurnForm,
} from "../forms/admin-forms.ts";
import { listIslandSelectOptions } from "./helpers.ts";
import { renderPage } from "./render.tsx";
import { AdminPage } from "../views/admin.tsx";

/** GET/POST とも管理者セッション必須。未ログインは login_required、非管理者は forbidden。 */
function requireAdmin(c: Context<AppEnv>): AuthUser {
  const user = c.get("user");
  if (user === undefined) {
    throw new AppError("login_required");
  }
  if (!user.isAdmin) {
    throw new AppError("forbidden");
  }
  return user;
}

async function renderAdmin(c: Context<AppEnv>, deps: WebDeps, notice: string | undefined) {
  const status = await deps.adminService.status();
  const authMethods = deps.adminService.getAuthMethods();
  // 未初期化のときに gameService.getTopPage (listIslandSelectOptions が内部で呼ぶ) を叩くと
  // not_initialized で例外になるため、初期化済みのときだけ島一覧 (maximize 用) を取得する。
  const islands = status.initialized ? listIslandSelectOptions(deps.gameService) : [];
  return renderPage(
    c,
    deps,
    <AdminPage
      status={status}
      authMethods={authMethods}
      islands={islands}
      timezone={deps.config.timezone}
      initDefaults={{
        ...(deps.config.startAt !== undefined ? { startAt: deps.config.startAt } : {}),
        ...(deps.config.finalTurn !== undefined ? { finalTurn: deps.config.finalTurn } : {}),
      }}
      csrfToken={c.get("csrfToken") ?? ""}
      notice={notice}
    />,
  );
}

export function createAdminRoutes(deps: WebDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/admin", async (c) => {
    requireAdmin(c);
    return renderAdmin(c, deps, undefined);
  });

  app.post("/admin/init", async (c) => {
    requireAdmin(c);
    const body = await parseStringBody(c);
    const form = parseAdminInitForm(body, deps.config.timezone);
    deps.adminService.initialize(deps.clock.now(), form);
    return renderAdmin(c, deps, "新しいデータを作成しました。");
  });

  app.post("/admin/reset", async (c) => {
    requireAdmin(c);
    deps.adminService.reset();
    return renderAdmin(c, deps, "データを削除しました。");
  });

  app.post("/admin/last-time", async (c) => {
    requireAdmin(c);
    const body = await parseStringBody(c);
    const form = parseAdminLastTimeForm(body, deps.config.timezone);
    deps.adminService.setLastTime(form.unix);
    return renderAdmin(c, deps, "最終更新時間を変更しました。");
  });

  // 追加: tmp/16-season.md「設定の入口」節。「ゲーム設定」の最終ターン数変更。
  app.post("/admin/final-turn", async (c) => {
    requireAdmin(c);
    const body = await parseStringBody(c);
    const finalTurn = parseFinalTurnForm(body);
    deps.adminService.setFinalTurn(finalTurn);
    return renderAdmin(c, deps, "最終ターン数を変更しました。");
  });

  app.post("/admin/turn", async (c) => {
    requireAdmin(c);
    deps.adminService.advanceTurn(deps.clock.now());
    return renderAdmin(c, deps, "ターンを進めました。");
  });

  app.post("/admin/backups", async (c) => {
    requireAdmin(c);
    const body = await parseStringBody(c);
    const form = parseAdminBackupForm(body);
    await deps.adminService.createBackup(form.label);
    return renderAdmin(c, deps, "バックアップを作成しました。");
  });

  app.post("/admin/backups/:label/restore", async (c) => {
    requireAdmin(c);
    await deps.adminService.restoreBackup(c.req.param("label"));
    return renderAdmin(c, deps, "復元しました。再読み込みしてください。");
  });

  app.post("/admin/backups/:label/delete", async (c) => {
    requireAdmin(c);
    await deps.adminService.deleteBackup(c.req.param("label"));
    return renderAdmin(c, deps, "バックアップを削除しました。");
  });

  // 追加: tmp/14-users-auth.md 「ログイン方法の設定」節。管理画面からの ON/OFF 切り替え。
  app.post("/admin/auth-methods", async (c) => {
    requireAdmin(c);
    const body = await parseStringBody(c);
    const form = parseAuthMethodsForm(body);
    deps.adminService.setAuthMethods(form);
    return renderAdmin(c, deps, "ログイン方法の設定を変更しました。");
  });

  // 追加: tmp/14-users-auth.md 「決定事項」6。特殊パスワードの代わりの資金・食料最大化。
  // 設計書との差異: タスク指示は `POST /admin/islands/:id/maximize` (島の select + ボタン) だが、
  // <select> だけで動的に POST 先の URL (path param) を変えるには JS が必要になる。
  // owner.js のような座標選択専用スクリプトをここに広げるより、id をフォームの通常フィールドで
  // 送る `POST /admin/maximize` (JS 不要) にした方が単純に動くため、こちらを採用した。
  app.post("/admin/maximize", async (c) => {
    requireAdmin(c);
    const body = await parseStringBody(c);
    const id = parseStrictNonNegativeInt(body, "id");
    deps.adminService.maximizeIsland(id);
    return renderAdmin(c, deps, "資金・食料を最大化しました。");
  });

  return app;
}
