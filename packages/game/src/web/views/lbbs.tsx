// Perl 版 Map.pm tempLbbsHead/tempLbbsInput/tempLbbsInputOW/tempLbbsContents の移植。
import type { LbbsPost } from "../../core/types.ts";

export function LbbsHead({ islandName }: { islandName: string }) {
  return (
    <div class="lbbs-head">
      <hr />
      <p class="big">
        <span class="island-name">{islandName}島</span>観光者通信
      </p>
    </div>
  );
}

/** 観光者モードの記帳フォーム。Perl 版 tempLbbsInput。 */
export function LbbsInputVisitor({
  islandId,
  defaultName,
}: {
  islandId: number;
  defaultName: string;
}) {
  return (
    <form action={`/islands/${islandId}/lbbs`} method="post">
      <table border={1}>
        <tr>
          <th>名前</th>
          <th>内容</th>
          <th>動作</th>
        </tr>
        <tr>
          <td>
            <input type="text" size={32} maxlength={32} name="name" value={defaultName} />
          </td>
          <td>
            <input type="text" size={80} name="message" />
          </td>
          <td>
            <input type="submit" value="記帳する" />
          </td>
        </tr>
      </table>
    </form>
  );
}

/** 島主モードの記帳/削除フォーム。Perl 版 tempLbbsInputOW。 */
export function LbbsInputOwner({
  islandId,
  password,
  defaultName,
  lbbsMax,
}: {
  islandId: number;
  password: string;
  defaultName: string;
  lbbsMax: number;
}) {
  const numbers = Array.from({ length: lbbsMax }, (_, i) => i);
  return (
    <>
      <form action={`/islands/${islandId}/lbbs/owner`} method="post">
        <table border={1}>
          <tr>
            <th>名前</th>
            <th>内容</th>
          </tr>
          <tr>
            <td>
              <input type="text" size={32} maxlength={32} name="name" value={defaultName} />
            </td>
            <td>
              <input type="text" size={80} name="message" />
            </td>
          </tr>
          <tr>
            <th>パスワード</th>
            <th>動作</th>
          </tr>
          <tr>
            <td>
              <input type="password" size={32} maxlength={32} name="password" value={password} />
            </td>
            <td>
              <input type="submit" value="記帳する" />
            </td>
          </tr>
        </table>
      </form>
      <form action={`/islands/${islandId}/lbbs/delete`} method="post">
        番号
        <select name="number">
          {numbers.map((i) => (
            <option value={i} key={i}>
              {i + 1}
            </option>
          ))}
        </select>
        <input type="password" size={32} maxlength={32} name="password" value={password} />
        <input type="submit" value="削除する" />
      </form>
    </>
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
