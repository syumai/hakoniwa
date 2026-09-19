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
  | "ng_word"
  /** ゲームが終了している (最終ターンを超えた、または手動終了) 状態での更新系操作。16「ターン進行」節。 */
  | "game_finished"
  /**
   * running だがまだ開始時刻 (`meta.startAt`) に達していない状態での計画登録。
   * 16「開始前の状態 (追加要件)」節。島の作成・コメント・名前変更・掲示板は開始前でも許可する。
   */
  | "game_not_started"
  /** 存在しない gameId を指定した。18「複数ゲーム」節。 */
  | "game_not_found"
  /** 現在のゲームが終了していない状態で新しいゲームを開始しようとした。18「複数ゲーム」節。 */
  | "game_running";

/** app 層のユースケースが throw する唯一のエラー型。 */
export class AppError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "AppError";
    this.kind = kind;
  }
}
