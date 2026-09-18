// tmp/14-users-auth.md 「複数ログイン方法の紐付け (アカウント設定 /account)」節の画面。
import type { AuthMethodsVM } from "../../app/admin-service.ts";
import { Notice } from "./messages.tsx";

export interface AccountLinkedAccount {
  id: string;
  providerId: string;
}

export interface AccountPageProps {
  email: string;
  name: string;
  accounts: readonly AccountLinkedAccount[];
  methods: AuthMethodsVM;
  csrfToken: string;
  notice?: string | undefined;
}

function providerLabel(providerId: string): string {
  if (providerId === "twitter") {
    return "X (Twitter)";
  }
  if (providerId === "discord") {
    return "Discord";
  }
  return providerId;
}

export function AccountPage({
  email,
  name,
  accounts,
  methods,
  csrfToken,
  notice,
}: AccountPageProps) {
  const isPlaceholderEmail = email.endsWith(".invalid");
  const linkedProviders = new Set(accounts.map((a) => a.providerId));

  return (
    <div class="account-page">
      {notice !== undefined ? <Notice message={notice} /> : ""}
      <p class="big">アカウント設定</p>

      <h1>連携中のログイン方法</h1>
      {accounts.length === 0 ? (
        <p>連携中のログイン方法はありません。</p>
      ) : (
        <div class="table-scroll">
          <table class="account-links" border={1}>
            <tr>
              <th>方法</th>
              <th>操作</th>
            </tr>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{providerLabel(account.providerId)}</td>
                <td>
                  <form action="/account/unlink" method="post">
                    <input type="hidden" name="_csrf" value={csrfToken} />
                    <input type="hidden" name="accountId" value={account.id} />
                    <input type="submit" value="連携解除" />
                  </form>
                </td>
              </tr>
            ))}
          </table>
        </div>
      )}

      <hr />
      <h1>ログイン方法を追加</h1>
      {methods.enabled.x && !linkedProviders.has("twitter") ? (
        <form action="/account/link/x" method="post">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="submit" value="X (Twitter) を連携する" />
        </form>
      ) : (
        ""
      )}
      {methods.enabled.discord && !linkedProviders.has("discord") ? (
        <form action="/account/link/discord" method="post">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="submit" value="Discord を連携する" />
        </form>
      ) : (
        ""
      )}

      <hr />
      <h1>メールアドレス</h1>
      <p>現在のメールアドレス: {isPlaceholderEmail ? "未設定" : email}</p>
      <form action="/account/email" method="post">
        <input type="email" name="email" size={32} placeholder="you@example.com" required />
        <input type="hidden" name="_csrf" value={csrfToken} />
        <input type="submit" value="メールアドレスを設定/変更する" />
      </form>

      <hr />
      <h1>表示名</h1>
      <form action="/account/name" method="post">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <input type="text" name="name" size={32} maxlength={32} value={name} />
        <input type="submit" value="表示名を変更する" />
      </form>
    </div>
  );
}
