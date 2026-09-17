// Perl 版 Main.pm/Map.pm/Turn.pm の各種メッセージ画面 (tempWrongPassword 等) の移植。
// $HtempBack (「トップへ戻る」リンク) に相当する共通コンポーネントを併せて定義する。
import type { AppErrorKind } from "../../app/errors.ts";

/** Perl 版 $HtempBack。「トップへ戻る」リンク。 */
export function BackLink() {
  return (
    <p>
      <a href="/" class="back-link">
        トップへ戻る
      </a>
    </p>
  );
}

/** 計画登録/削除、コメント更新、記帳等の結果メッセージ。Perl 版 tempCommandAdd 等。 */
export function Notice({ message }: { message: string }) {
  return (
    <div class="notice">
      <p class="big">{message}</p>
      <hr />
    </div>
  );
}

/** AppError.kind → 画面文言。tmp/06-web-routes-and-views.md の表 + Perl 版 temp* の文言。 */
export function errorMessage(kind: AppErrorKind): string {
  switch (kind) {
    case "wrong_password":
      return "パスワードが違います。";
    case "island_not_found":
      return "問題発生、とりあえず戻ってください。";
    case "island_full":
      return "申し訳ありません、島が一杯で登録できません！！";
    case "no_name":
      return "島につける名前が必要です。";
    case "bad_name":
      return "',?()<>$'とか入ってたり、「無人島」とかいった変な名前はやめましょうよ〜";
    case "name_taken":
      return "その島ならすでに発見されています。";
    case "no_password":
      return "パスワードが必要です。";
    case "no_money":
      return "資金不足のため変更できません";
    case "nothing_to_change":
      return "名前、パスワードともに空欄です";
    case "lbbs_empty":
      return "名前または内容の欄が空欄です。";
    case "not_initialized":
      return "データファイルが開けません。";
    case "lbbs_disabled":
      return "問題発生、とりあえず戻ってください。";
    // 設計書との差異: password_mismatch/invalid_input は 06 の表にない (追加した AppError.kind)。
    // password_mismatch は Perl 版でも tempWrongPassword を流用しているため同じ文言にする。
    case "password_mismatch":
      return "パスワードが違います。";
    case "invalid_input":
      return "入力内容が不正です。";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** AppError.kind → HTTP ステータス。tmp/06-web-routes-and-views.md の表 + 追加分。 */
export function errorStatus(kind: AppErrorKind): 400 | 403 | 404 | 409 | 503 {
  switch (kind) {
    case "wrong_password":
      return 403;
    case "island_not_found":
      return 404;
    case "island_full":
      return 409;
    case "no_name":
    case "bad_name":
    case "name_taken":
    case "no_password":
    case "no_money":
    case "nothing_to_change":
    case "lbbs_empty":
    case "password_mismatch":
    case "invalid_input":
      return 400;
    case "not_initialized":
      return 503;
    case "lbbs_disabled":
      return 404;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** 想定外のエラー・AppError 共通の画面。Perl 版 tempProblem/tempWrongPassword 等。 */
export function ErrorPage({ message }: { message: string }) {
  return (
    <div class="error">
      <p class="big">{message}</p>
      <BackLink />
    </div>
  );
}

/** 名前/パスワード変更完了画面。Perl 版 Turn.pm tempChange。 */
export function ChangeDonePage() {
  return (
    <div class="notice">
      <p class="big">変更完了しました</p>
      <BackLink />
    </div>
  );
}
