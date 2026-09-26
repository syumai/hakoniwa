// tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節: 「管理画面・トップの表示は
// 『1 ターン = N 時間 (M 分)』のように分かりやすく整形する (秒数のまま出さない)」の実装。
// 「1 ターンの長さの入力を『時間・分』にする」節: CLI 側の逆変換 (文字列 → 秒数) として
// parseDuration を追加した。
// 「トップと管理画面のターン表示」節: 次のターン/ゲーム開始までの残り時間を整形する
// formatRemaining を追加した (0 の単位は省略し、日数は 24 時間以上のときだけ出す)。
// tmp/16-season.md「開始前の状態 = ターン 0」節「表記の原則 (ユーザー指示 2026-09-20)」: 「ターン 0」
// という数字は画面・CLI のどこにも出さず、turn === 0 (開始前) は常に「ゲーム開始前」と表記する。
// このラベルを 1 箇所にまとめるため GAME_NOT_STARTED_LABEL / formatTurnLabel を追加した。

/**
 * 秒数を「N時間M分」のように整形する。時間/分のどちらかが 0 なら省略する
 * (例: 21600 → "6時間"、90 → "1分30秒" ではなく "1分" (秒未満は切り捨て)、3900 → "1時間5分")。
 * 60 秒未満は "N秒" とする。
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}秒`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}分`;
  }
  if (minutes === 0) {
    return `${hours}時間`;
  }
  return `${hours}時間${minutes}分`;
}

/**
 * `formatDuration` の逆変換。CLI の `db init --unit-time` / `game set-unit-time` が受け付ける
 * 書式をパースする: `"6h"` (時間のみ)、`"90m"` (分のみ)、`"1h30m"` (時間+分)、`"3600"`
 * (数字のみは秒とみなす)。不正な形式・0 以下は `undefined`。
 */
export function parseDuration(text: string): number | undefined {
  if (/^\d+$/.test(text)) {
    const sec = Number(text);
    return sec > 0 ? sec : undefined;
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(text);
  if (match === null || (match[1] === undefined && match[2] === undefined)) {
    return undefined;
  }
  const hours = match[1] !== undefined ? Number(match[1]) : 0;
  const minutes = match[2] !== undefined ? Number(match[2]) : 0;
  const sec = hours * 3600 + minutes * 60;
  return sec > 0 ? sec : undefined;
}

/**
 * 次のターン/ゲーム開始までの残り秒数を「あと N日 M時間 L分」のように整形する。
 * 0 の単位は省略する (例: 120 → "あと 2分"、86700 → "あと 1日 5分")。日数は 24 時間以上の
 * ときだけ出す。1 分未満 (0 以下も含む) は「まもなく」とする。
 */
export function formatRemaining(diffSeconds: number): string {
  if (diffSeconds < 60) {
    return "まもなく";
  }
  const totalMinutes = Math.floor(diffSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}日`);
  }
  if (hours > 0) {
    parts.push(`${hours}時間`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}分`);
  }
  return `あと ${parts.join(" ")}`;
}

/**
 * `turn === 0` (開始前) を表す表示ラベル。「ターン 0」という数字を画面・CLI に出さないための
 * 唯一の文言。tmp/16-season.md「表記の原則 (ユーザー指示 2026-09-20)」。
 */
export const GAME_NOT_STARTED_LABEL = "ゲーム開始前";

/**
 * ターン番号の表示ラベル。`turn === 0` (開始前) なら `GAME_NOT_STARTED_LABEL`、それ以外は
 * `ターン${turn}` (スペースなし、既存の「ターン{n}」表記に合わせる)。
 */
export function formatTurnLabel(turn: number): string {
  return turn === 0 ? GAME_NOT_STARTED_LABEL : `ターン${turn}`;
}
