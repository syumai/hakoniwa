// tmp/08-turn-trigger-admin-cli.md 「Web 管理画面 (/admin)」節、tmp/14-users-auth.md
// 「認可ルール」節 (管理画面は admin メールのログイン必須) の移植。
// 設計書との差異 (Phase 6b までの最小対応): 管理者認証は better-auth のセッション + isAdmin
// 判定に置き換わるが、session-middleware (Phase 6b) がまだ無いため、ここでは
// マスターパスワード認証を撤去しただけの状態に留める (常に「未実装」で 403 を返す)。
// 実際のセッションベース認可・`POST /admin/islands/:id/maximize` は Phase 6b で実装する。
import { Hono } from "hono";
import type { Context } from "hono";
import { parseStringBody } from "../forms/common.ts";
import {
  parseAdminAuthForm,
  parseAdminBackupForm,
  parseAdminLastTimeForm,
} from "../forms/admin-forms.ts";
import type { WebDeps } from "../deps.ts";
import type { DefaultsCookieEnv } from "../middleware/defaults-cookie.ts";
import { Layout } from "../views/layout.tsx";
import { AdminPage } from "../views/admin.tsx";

const ADMIN_AUTH_NOT_IMPLEMENTED_NOTICE =
  "管理者認証は better-auth (Phase 6b) で実装します。現時点では管理画面の操作はできません。";

async function renderAdmin(
  c: Context<DefaultsCookieEnv>,
  deps: WebDeps,
  notice: string | undefined,
  status: 200 | 403 = 200,
) {
  const adminStatus = await deps.adminService.status();
  return c.html(
    <Layout config={deps.config.game}>
      <AdminPage status={adminStatus} notice={notice} />
    </Layout>,
    status,
  );
}

/** Phase 6b でセッションの isAdmin 判定に置き換える。現時点では常に拒否する。 */
async function requireAdmin(
  c: Context<DefaultsCookieEnv>,
  deps: WebDeps,
): Promise<Response | undefined> {
  return renderAdmin(c, deps, ADMIN_AUTH_NOT_IMPLEMENTED_NOTICE, 403);
}

export function createAdminRoutes(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  app.get("/admin", (c) => renderAdmin(c, deps, undefined));

  app.post("/admin/init", async (c) => {
    const denied = await requireAdmin(c, deps);
    if (denied !== undefined) {
      return denied;
    }
    await parseStringBody(c).then(parseAdminAuthForm);
    deps.adminService.initialize(deps.clock.now());
    return renderAdmin(c, deps, "新しいデータを作成しました。");
  });

  app.post("/admin/reset", async (c) => {
    const denied = await requireAdmin(c, deps);
    if (denied !== undefined) {
      return denied;
    }
    await parseStringBody(c).then(parseAdminAuthForm);
    deps.adminService.reset();
    return renderAdmin(c, deps, "データを削除しました。");
  });

  app.post("/admin/last-time", async (c) => {
    const denied = await requireAdmin(c, deps);
    if (denied !== undefined) {
      return denied;
    }
    const body = await parseStringBody(c);
    const form = parseAdminLastTimeForm(body);
    deps.adminService.setLastTime(form.unix);
    return renderAdmin(c, deps, "最終更新時間を変更しました。");
  });

  app.post("/admin/turn", async (c) => {
    const denied = await requireAdmin(c, deps);
    if (denied !== undefined) {
      return denied;
    }
    await parseStringBody(c).then(parseAdminAuthForm);
    deps.adminService.advanceTurn(deps.clock.now());
    return renderAdmin(c, deps, "ターンを進めました。");
  });

  app.post("/admin/backups", async (c) => {
    const denied = await requireAdmin(c, deps);
    if (denied !== undefined) {
      return denied;
    }
    const body = await parseStringBody(c);
    const form = parseAdminBackupForm(body);
    await deps.adminService.createBackup(form.label);
    return renderAdmin(c, deps, "バックアップを作成しました。");
  });

  app.post("/admin/backups/:label/restore", async (c) => {
    const denied = await requireAdmin(c, deps);
    if (denied !== undefined) {
      return denied;
    }
    await parseStringBody(c).then(parseAdminAuthForm);
    await deps.adminService.restoreBackup(c.req.param("label"));
    return renderAdmin(c, deps, "復元しました。再読み込みしてください。");
  });

  app.post("/admin/backups/:label/delete", async (c) => {
    const denied = await requireAdmin(c, deps);
    if (denied !== undefined) {
      return denied;
    }
    await parseStringBody(c).then(parseAdminAuthForm);
    await deps.adminService.deleteBackup(c.req.param("label"));
    return renderAdmin(c, deps, "バックアップを削除しました。");
  });

  return app;
}
