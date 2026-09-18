// tmp/08-turn-trigger-admin-cli.md 「Web 管理画面 (/admin)」節の移植。
// Perl 版 Maintenance.pm (hako-mente.cgi) の run_maintenance/passCheck/mainMode に相当する。
import { Hono } from "hono";
import type { Context } from "hono";
import { safeEqual } from "../../app/auth.ts";
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

/** マスターパスワードが設定されていないメッセージ。GET/POST 双方で共有する。 */
const MASTER_PASSWORD_NOT_CONFIGURED_NOTICE =
  "マスターパスワードが設定されていません。環境変数 HAKONIWA_MASTER_PASSWORD を設定してサーバーを起動し直してください。";

function hasMasterPasswordConfigured(deps: WebDeps): boolean {
  const master = deps.config.masterPassword;
  return master !== undefined && master !== "";
}

function isMasterPassword(deps: WebDeps, password: string): boolean {
  const master = deps.config.masterPassword;
  return master !== undefined && master !== "" && password !== "" && safeEqual(password, master);
}

async function renderAdmin(
  c: Context<DefaultsCookieEnv>,
  deps: WebDeps,
  notice: string | undefined,
  status: 200 | 403 = 200,
) {
  const adminStatus = await deps.adminService.status();
  // マスターパスワード未設定時は、どの画面でも常にその旨の注意文を優先して表示する。
  const effectiveNotice = hasMasterPasswordConfigured(deps)
    ? notice
    : MASTER_PASSWORD_NOT_CONFIGURED_NOTICE;
  return c.html(
    <Layout config={deps.config.game}>
      <AdminPage status={adminStatus} notice={effectiveNotice} />
    </Layout>,
    status,
  );
}

/** パスワードを検証し、不一致なら管理画面をエラー付きで再描画したレスポンスを返す。一致すれば undefined。 */
async function requireMasterPassword(
  c: Context<DefaultsCookieEnv>,
  deps: WebDeps,
  password: string,
): Promise<Response | undefined> {
  if (isMasterPassword(deps, password)) {
    return undefined;
  }
  const message = hasMasterPasswordConfigured(deps)
    ? "パスワードが違います。"
    : MASTER_PASSWORD_NOT_CONFIGURED_NOTICE;
  return renderAdmin(c, deps, message, 403);
}

export function createAdminRoutes(deps: WebDeps): Hono<DefaultsCookieEnv> {
  const app = new Hono<DefaultsCookieEnv>();

  app.get("/admin", (c) => renderAdmin(c, deps, undefined));

  app.post("/admin/init", async (c) => {
    const body = await parseStringBody(c);
    const form = parseAdminAuthForm(body);
    const denied = await requireMasterPassword(c, deps, form.password);
    if (denied !== undefined) {
      return denied;
    }
    deps.adminService.initialize(deps.clock.now());
    return renderAdmin(c, deps, "新しいデータを作成しました。");
  });

  app.post("/admin/reset", async (c) => {
    const body = await parseStringBody(c);
    const form = parseAdminAuthForm(body);
    const denied = await requireMasterPassword(c, deps, form.password);
    if (denied !== undefined) {
      return denied;
    }
    deps.adminService.reset();
    return renderAdmin(c, deps, "データを削除しました。");
  });

  app.post("/admin/last-time", async (c) => {
    const body = await parseStringBody(c);
    const form = parseAdminLastTimeForm(body);
    const denied = await requireMasterPassword(c, deps, form.password);
    if (denied !== undefined) {
      return denied;
    }
    deps.adminService.setLastTime(form.unix);
    return renderAdmin(c, deps, "最終更新時間を変更しました。");
  });

  app.post("/admin/turn", async (c) => {
    const body = await parseStringBody(c);
    const form = parseAdminAuthForm(body);
    const denied = await requireMasterPassword(c, deps, form.password);
    if (denied !== undefined) {
      return denied;
    }
    deps.adminService.advanceTurn(deps.clock.now());
    return renderAdmin(c, deps, "ターンを進めました。");
  });

  app.post("/admin/backups", async (c) => {
    const body = await parseStringBody(c);
    const form = parseAdminBackupForm(body);
    const denied = await requireMasterPassword(c, deps, form.password);
    if (denied !== undefined) {
      return denied;
    }
    await deps.adminService.createBackup(form.label);
    return renderAdmin(c, deps, "バックアップを作成しました。");
  });

  app.post("/admin/backups/:label/restore", async (c) => {
    const body = await parseStringBody(c);
    const form = parseAdminAuthForm(body);
    const denied = await requireMasterPassword(c, deps, form.password);
    if (denied !== undefined) {
      return denied;
    }
    await deps.adminService.restoreBackup(c.req.param("label"));
    return renderAdmin(c, deps, "復元しました。再読み込みしてください。");
  });

  app.post("/admin/backups/:label/delete", async (c) => {
    const body = await parseStringBody(c);
    const form = parseAdminAuthForm(body);
    const denied = await requireMasterPassword(c, deps, form.password);
    if (denied !== undefined) {
      return denied;
    }
    await deps.adminService.deleteBackup(c.req.param("label"));
    return renderAdmin(c, deps, "バックアップを削除しました。");
  });

  return app;
}
