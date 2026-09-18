// tmp/14-users-auth.md 「ログイン方法の設定 (settings 表)」節の移植。
// X / Discord / メールログインを管理画面から個別に有効・無効にできるようにする。
// 判定はここ (AuthMethodPolicy) にまとめ、`/login` の表示、`/auth/*` の自前ルート、
// better-auth の `hooks.before` の 3 箇所 (いずれも web/bootstrap 層) から同じ関数を呼ぶ。
import type { SettingsRepository } from "./ports.ts";

export interface AuthMethodsFlags {
  x: boolean;
  discord: boolean;
  email: boolean;
}

/** settings 表のキー。値は `AuthMethodsFlags` の JSON。 */
const AUTH_METHODS_SETTINGS_KEY = "auth.methods";

function parseStoredFlags(raw: string | undefined): Partial<AuthMethodsFlags> {
  if (raw === undefined) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    return {
      ...(typeof record.x === "boolean" ? { x: record.x } : {}),
      ...(typeof record.discord === "boolean" ? { discord: record.discord } : {}),
      ...(typeof record.email === "boolean" ? { email: record.email } : {}),
    };
  } catch {
    return {};
  }
}

export interface AuthMethodPolicyDeps {
  /** 環境変数から見た「設定済み」(クライアント ID がある等) の方法。email は常に true (Mailer は常に存在するため)。 */
  configured: AuthMethodsFlags;
  settings: SettingsRepository;
}

/**
 * ログイン方法ごとの「設定済みか」「(管理画面で) 有効か」を判定する。
 * settings 表に行が無ければ、設定済みの方法はすべて有効として扱う。
 */
export class AuthMethodPolicy {
  readonly #deps: AuthMethodPolicyDeps;

  constructor(deps: AuthMethodPolicyDeps) {
    this.#deps = deps;
  }

  /** 環境変数の設定状況 (クライアント ID の有無等)。 */
  configured(): AuthMethodsFlags {
    return { ...this.#deps.configured };
  }

  /** 設定済み かつ 管理画面で無効化されていない方法。 */
  enabled(): AuthMethodsFlags {
    const stored = parseStoredFlags(this.#deps.settings.get(AUTH_METHODS_SETTINGS_KEY));
    const configured = this.#deps.configured;
    return {
      x: configured.x && (stored.x ?? true),
      discord: configured.discord && (stored.discord ?? true),
      email: configured.email && (stored.email ?? true),
    };
  }

  /** 管理画面からの ON/OFF 切り替え。設定済みでない方法を true にしても enabled() には反映されない。 */
  setEnabled(methods: AuthMethodsFlags): void {
    this.#deps.settings.set(AUTH_METHODS_SETTINGS_KEY, JSON.stringify(methods));
  }
}

/** ログイン方法。better-auth の `hooks.before` (`authMethodOf`) の判定結果と同じ語彙。 */
export type AuthMethodKind = "x" | "discord" | "email";
