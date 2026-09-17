// ログの HTML 断片を安全に組み立てるヘルパ。
// Perl 版の ${HtagName_}...${H_tagName} 等の FONT/B タグを CSS クラス付き span/b に置き換える。
// 引数の文字列は必ずエスケープしてから埋め込む。

/** HTML の特殊文字をエスケープする。 */
export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 島名・地点表記など。Perl の ${HtagName_}...${H_tagName}。 */
export function name(s: string): string {
  return `<span class="island-name">${escapeHtml(s)}</span>`;
}

/** `${name}島` を name() で包む補助。 */
export function islandName(n: string): string {
  return name(`${n}島`);
}

/** コマンド名。Perl の ${HtagComName_}...${H_tagComName}。 */
export function com(s: string): string {
  return `<span class="command-name">${escapeHtml(s)}</span>`;
}

/** 災害名。Perl の ${HtagDisaster_}...${H_tagDisaster}。 */
export function disaster(s: string): string {
  return `<span class="disaster">${escapeHtml(s)}</span>`;
}

/** 強調。Perl の <B>...</B>。 */
export function b(s: string): string {
  return `<b>${escapeHtml(s)}</b>`;
}

/** 座標表記。Perl の "($x, $y)" と同じ (カンマの後に半角スペース)。 */
export function point(x: number, y: number): string {
  return `(${x}, ${y})`;
}
