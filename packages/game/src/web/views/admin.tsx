// Perl 版 Maintenance.pm (hako-mente.cgi) mainMode/dataPrint の移植。
import type { AdminStatus } from "../../app/admin-service.ts";
import type { BackupInfo } from "../../app/ports.ts";

/** unix 秒 → ローカル日時文字列。Perl 版 timeToString。 */
function timeToString(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("ja-JP");
}

function BackupRow({ backup }: { backup: BackupInfo }) {
  return (
    <div class="backup-row">
      <h3>バックアップ: {backup.label}</h3>
      <p>
        <b>ターン{backup.turn}</b>
      </p>
      <p>
        <b>作成時刻</b>:{timeToString(backup.createdAt)}
        (1970年1月1日から{backup.createdAt}秒)
      </p>
      <form action={`/admin/backups/${backup.label}/restore`} method="post">
        <b>パスワード:</b>
        <input type="password" name="password" size={32} maxlength={32} />
        <input type="submit" value="このデータを現役に" />
      </form>
      <form action={`/admin/backups/${backup.label}/delete`} method="post">
        <b>パスワード:</b>
        <input type="password" name="password" size={32} maxlength={32} />
        <input type="submit" value="このデータを削除" />
      </form>
    </div>
  );
}

export function AdminPage({ status, notice }: { status: AdminStatus; notice: string | undefined }) {
  return (
    <div class="admin-page">
      <h1>箱島２ メンテナンスツール</h1>
      {notice !== undefined ? <p class="notice big">{notice}</p> : ""}

      <hr />
      {status.initialized ? (
        <div class="current-data">
          <h2>現役データ</h2>
          <p>
            <b>ターン{status.turn}</b>
          </p>
          <p>
            <b>最終更新時間</b>:{status.lastTime !== undefined ? timeToString(status.lastTime) : ""}
          </p>
          <p>
            <b>最終更新時間(秒数表示)</b>:1970年1月1日から{status.lastTime}秒
          </p>
          <form action="/admin/reset" method="post">
            <b>パスワード:</b>
            <input type="password" name="password" size={32} maxlength={32} />
            <input type="submit" value="このデータを削除" />
          </form>

          <h3>最終更新時間の変更</h3>
          <form action="/admin/last-time" method="post">
            <input type="datetime-local" name="datetime" />
            <b>パスワード:</b>
            <input type="password" name="password" size={32} maxlength={32} />
            <input type="submit" value="変更" />
          </form>
          <form action="/admin/last-time" method="post">
            1970年1月1日から
            <input type="text" size={32} name="unix" />秒<b>パスワード:</b>
            <input type="password" name="password" size={32} maxlength={32} />
            <input type="submit" value="秒指定で変更" />
          </form>

          <h3>ターン進行</h3>
          <form action="/admin/turn" method="post">
            <b>パスワード:</b>
            <input type="password" name="password" size={32} maxlength={32} />
            <input type="submit" value="ターンを進める" />
          </form>
        </div>
      ) : (
        <div class="current-data">
          <h2>現役データ</h2>
          <form action="/admin/init" method="post">
            <b>パスワード:</b>
            <input type="password" name="password" size={32} maxlength={32} />
            <input type="submit" value="新しいデータを作る" />
          </form>
        </div>
      )}

      <hr />
      <h2>バックアップ一覧</h2>
      <form action="/admin/backups" method="post">
        ラベル(省略可)
        <input type="text" name="label" size={32} />
        <b>パスワード:</b>
        <input type="password" name="password" size={32} maxlength={32} />
        <input type="submit" value="バックアップを作成" />
      </form>
      {status.backups.map((backup) => (
        <BackupRow backup={backup} key={backup.label} />
      ))}
    </div>
  );
}
