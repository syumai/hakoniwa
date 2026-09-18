// tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節: 「管理画面・トップの表示は
// 『1 ターン = N 時間 (M 分)』のように分かりやすく整形する (秒数のまま出さない)」の実装。

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
