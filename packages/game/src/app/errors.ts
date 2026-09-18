// tmp/06-web-routes-and-views.md 「AppError → 画面」の表 (v2 で 14 の認可ルールに合わせて更新) に
// 対応するエラー種別。web 層の onError がこの kind を見て HTTP ステータス・画面を決める。
export type AppErrorKind =
  | "island_not_found"
  | "island_full"
  | "no_name"
  | "bad_name"
  | "name_taken"
  | "no_money"
  | "lbbs_empty"
  | "not_initialized"
  | "lbbs_disabled"
  | "invalid_input"
  /** 未ログイン。14「認可ルール」節。 */
  | "login_required"
  /** ログイン済みだが対象 (自分の島でない等) への権限がない。 */
  | "forbidden"
  /** 1 ユーザー 1 島の制約に反する新規作成。 */
  | "already_has_island"
  /** ログイン済みだが自分の島を持っていない (開発画面等)。 */
  | "no_island"
  /** NG ワードを含む入力 (島名・コメント・掲示板)。15「NG ワード」節。 */
  | "ng_word";

/** app 層のユースケースが throw する唯一のエラー型。 */
export class AppError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "AppError";
    this.kind = kind;
  }
}
