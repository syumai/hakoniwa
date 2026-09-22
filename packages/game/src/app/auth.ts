// tmp/14-users-auth.md 「サーバーサイドでの呼び出し」節の AuthUser と、管理者判定。
// better-auth のセッションから得たユーザー情報を、GameService/AdminService が扱う
// AuthUser に変換する。better-auth 自体への依存はここには持ち込まない
// (web/bootstrap 層が better-auth の型から必要なフィールドを取り出して渡す)。

/** GameService/AdminService が受け取る、ログイン中ユーザーの情報。 */
export interface AuthUser {
  /** better-auth の user.id (文字列)。 */
  id: string;
  /** 表示名。掲示板の記帳者名等に使う。 */
  name: string;
  /** プレースホルダ (`*.placeholder.invalid`) の場合がある。 */
  email: string;
  image?: string;
  /** email が adminEmails に含まれ、かつプレースホルダでないとき true。 */
  isAdmin: boolean;
}

/**
 * email が管理者メール一覧に含まれるか判定する。
 * - 大文字小文字を無視して比較する。
 * - `.invalid` で終わるプレースホルダメール (X 等、メールを返さないプロバイダ用) は常に false。
 */
export function isAdminEmail(email: string, adminEmails: readonly string[]): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith(".invalid")) {
    return false;
  }
  return adminEmails.some((candidate) => candidate.toLowerCase() === lower);
}

/** better-auth のセッションユーザー相当の最小形。 */
export interface SessionUserLike {
  id: string;
  name: string;
  email: string;
  image?: string | null | undefined;
}

/** better-auth のセッションユーザーから AuthUser を組み立てる。 */
export function toAuthUser(user: SessionUserLike, adminEmails: readonly string[]): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    ...(user.image !== null && user.image !== undefined ? { image: user.image } : {}),
    isAdmin: isAdminEmail(user.email, adminEmails),
  };
}
