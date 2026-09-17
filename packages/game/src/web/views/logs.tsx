// Perl 版 Main.pm logFilePrint / Top.pm historyPrint の移植。
// LogEntry.html / HistoryEntry.html は core/log/markup.ts で生成時にエスケープ済みのため、
// raw() でそのまま埋め込む (JSX の自動エスケープを迂回する唯一の箇所)。
import { raw } from "hono/html";
import type { HistoryEntry, LogEntry } from "../../core/types.ts";

/** 「ターンN(機密)：{html}」の 1 行。Perl 版 logFilePrint の表示形式。 */
export function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div class="log-entry">
      <span class="log-turn">
        ターン{entry.turn}
        {entry.secret ? <b class="log-secret">(機密)</b> : ""}：
      </span>
      {raw(entry.html)}
    </div>
  );
}

export function LogList({ logs }: { logs: readonly LogEntry[] }) {
  return (
    <div class="log-list">
      {logs.map((entry) => (
        <LogLine key={entry.seq} entry={entry} />
      ))}
    </div>
  );
}

/** 「ターンN：{html}」の 1 行。Perl 版 historyPrint の表示形式。 */
export function HistoryList({ history }: { history: readonly HistoryEntry[] }) {
  return (
    <div class="history-list">
      {history.map((entry, index) => (
        <div class="history-entry" key={index}>
          <span class="log-turn">ターン{entry.turn}：</span>
          {raw(entry.html)}
        </div>
      ))}
    </div>
  );
}
