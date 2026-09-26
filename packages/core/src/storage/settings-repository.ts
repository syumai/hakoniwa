// tmp/14-users-auth.md 「ログイン方法の設定 (settings 表)」節の実 SQLite 実装。
import type { SettingsRepository } from "../app/ports.ts";
import type { SqlDriver } from "./driver.ts";

export class SqliteSettingsRepository implements SettingsRepository {
  readonly #driver: SqlDriver;

  constructor(driver: SqlDriver) {
    this.#driver = driver;
  }

  get(key: string): string | undefined {
    const row = this.#driver.get<{ value: string }>(
      "SELECT value FROM settings WHERE key = ?",
      key,
    );
    return row?.value;
  }

  set(key: string, value: string): void {
    this.#driver.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    );
  }
}
