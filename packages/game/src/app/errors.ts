// tmp/06-web-routes-and-views.md 「AppError → 画面」の表に対応するエラー種別。
// web 層 (Phase 3b) の onError がこの kind を見て HTTP ステータス・画面を決める。
export type AppErrorKind =
  | "wrong_password"
  | "island_not_found"
  | "island_full"
  | "no_name"
  | "bad_name"
  | "name_taken"
  | "no_password"
  | "no_money"
  | "nothing_to_change"
  | "lbbs_empty"
  | "not_initialized"
  | "lbbs_disabled"
  /** 確認用パスワード不一致。Perl は tempWrongPassword を流用しているが、意味が異なるため分ける。 */
  | "password_mismatch"
  | "invalid_input";

/** app 層のユースケースが throw する唯一のエラー型。 */
export class AppError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "AppError";
    this.kind = kind;
  }
}
