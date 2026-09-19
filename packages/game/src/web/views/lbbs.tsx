// Perl 版 Map.pm tempLbbsHead/tempLbbsInput/tempLbbsContents の移植。
// tmp/14-users-auth.md により記帳はログイン必須になり、表示名は actor.name (フォームでは
// 受け取らない) になったため、フォームは message + _csrf だけになった。
import type { LbbsPost } from "../../core/types.ts";

export function LbbsHead({ islandName }: { islandName: string }) {
  return (
    <h1>
      <span class="island-name">{islandName}島</span>観光者通信
    </h1>
  );
}

/**
 * 記帳フォーム。観光者・島主どちらも同じ `POST /games/:gameId/islands/:id/lbbs` を使う
 * (表示名は actor.name)。tmp/18-games.md「ルート」節。
 */
export function LbbsInput({
  islandId,
  gameId,
  csrfToken,
}: {
  islandId: number;
  gameId: number;
  csrfToken: string;
}) {
  return (
    <form action={`/games/${gameId}/islands/${islandId}/lbbs`} method="post">
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="text" size={80} name="message" placeholder="ひとこと記帳する" />
      <input type="submit" value="記帳する" />
    </form>
  );
}

/** 島主用の記帳削除フォーム。Perl 版 tempLbbsInputOW の削除部分。 */
export function LbbsDeleteForm({
  gameId,
  lbbsMax,
  csrfToken,
}: {
  gameId: number;
  lbbsMax: number;
  csrfToken: string;
}) {
  const numbers = Array.from({ length: lbbsMax }, (_, i) => i);
  return (
    <form action={`/games/${gameId}/my-island/lbbs/delete`} method="post">
      <input type="hidden" name="_csrf" value={csrfToken} />
      番号
      <select name="number">
        {numbers.map((i) => (
          <option value={i} key={i}>
            {i + 1}
          </option>
        ))}
      </select>
      <input type="submit" value="削除する" />
    </form>
  );
}

/** 掲示板内容。Perl 版 tempLbbsContents。 */
export function LbbsContents({ posts }: { posts: readonly LbbsPost[] }) {
  return (
    <table class="lbbs-contents" border={1}>
      <tr>
        <th>番号</th>
        <th>記帳内容</th>
      </tr>
      {posts.map((post, index) => (
        <tr key={index}>
          <td class="rank-cell">{index + 1}</td>
          <td class={post.author === "visitor" ? "lbbs-visitor" : "lbbs-owner"}>
            {post.turn}：{post.name} &gt; {post.message}
          </td>
        </tr>
      ))}
    </table>
  );
}
