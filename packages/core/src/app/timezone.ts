// tmp/16-season.md 「タイムゾーン」節の移植。
// datetime-local の解釈と画面の日時表示を、`Intl.DateTimeFormat` のみで行う小関数。
// ライブラリは使わない。

/** `timeZone` で `instantMs` (unix ミリ秒) を整形したときの年月日時分秒を返す。 */
function zonedParts(
  instantMs: number,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(instantMs))) {
    map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * `timeZone` の `instantMs` 時点でのオフセット (UTC からのずれ、ミリ秒。東側が正) を求める。
 * 「その瞬間を tz で整形した値と UTC の差」から求める (tmp/16-season.md の実装方針)。
 */
function offsetMsAt(instantMs: number, timeZone: string): number {
  const p = zonedParts(instantMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instantMs;
}

/**
 * `datetime-local` の値 (`"YYYY-MM-DDTHH:mm"`、秒を含む場合もある) を、指定タイムゾーンでの
 * ローカル時刻とみなして unix 秒に変換する。
 * DST の境界では 1 回目のオフセット推定がずれることがあるため、2 回反復して補正する。
 */
export function parseLocalDateTime(datetimeLocal: string, timeZone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(datetimeLocal);
  if (m === null) {
    throw new Error(`parseLocalDateTime: invalid datetime-local value: ${datetimeLocal}`);
  }
  const [, y, mo, d, h, mi, s] = m;
  const naiveUtcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s !== undefined ? Number(s) : 0,
  );

  // 1 回目: 素朴なオフセットで概算し、2 回目でその概算時刻でのオフセットに補正する。
  let offsetMs = offsetMsAt(naiveUtcMs, timeZone);
  let utcMs = naiveUtcMs - offsetMs;
  offsetMs = offsetMsAt(utcMs, timeZone);
  utcMs = naiveUtcMs - offsetMs;

  return Math.floor(utcMs / 1000);
}

/** 2 桁ゼロ埋め。 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** unix 秒 → `"YYYY/MM/DD HH:mm"` (指定タイムゾーン)。 */
export function formatDateTime(unixSeconds: number, timeZone: string): string {
  const p = zonedParts(unixSeconds * 1000, timeZone);
  return `${p.year}/${pad2(p.month)}/${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** unix 秒 → `datetime-local` 入力欄にそのまま渡せる `"YYYY-MM-DDTHH:mm"` (指定タイムゾーン)。 */
export function formatDateTimeLocalValue(unixSeconds: number, timeZone: string): string {
  const p = zonedParts(unixSeconds * 1000, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}
