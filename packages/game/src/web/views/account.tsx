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

      <section class="card">
        <h2>連携中のログイン方法</h2>
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
                    <form action="/account/unlink" method="post" class="inline-form">
                      <input type="hidden" name="_csrf" value={csrfToken} />
                      <input type="hidden" name="accountId" value={account.id} />
                      <button type="submit" class="btn">
                        連携解除
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </table>
          </div>
        )}
      </section>

      <section class="card">
        <h2>ログイン方法を追加</h2>
        {methods.enabled.x && !linkedProviders.has("twitter") ? (
          <form action="/account/link/x" method="post" class="inline-form">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button type="submit" class="btn">
              X (Twitter) を連携する
            </button>
          </form>
        ) : (
          ""
        )}
        {methods.enabled.discord && !linkedProviders.has("discord") ? (
          <form action="/account/link/discord" method="post" class="inline-form">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button type="submit" class="btn">
              Discord を連携する
            </button>
          </form>
        ) : (
          ""
        )}
      </section>

      <section class="card">
        <h2>メールアドレス</h2>
        <p>現在のメールアドレス: {isPlaceholderEmail ? "未設定" : email}</p>
        <form action="/account/email" method="post" class="field-row">
          <input type="email" name="email" size={32} placeholder="you@example.com" required />
          <input type="hidden" name="_csrf" value={csrfToken} />
          <button type="submit" class="btn">
            メールアドレスを設定/変更する
          </button>
        </form>
      </section>

      <section class="card">
        <h2>表示名</h2>
        <form action="/account/name" method="post" class="field-row">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="text" name="name" size={32} maxlength={32} value={name} />
          <button type="submit" class="btn">
            表示名を変更する
          </button>
        </form>
      </section>
    </div>
  );
}
