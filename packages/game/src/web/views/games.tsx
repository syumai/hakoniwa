// tmp/18-games.md「ルート」節 GET /games、「表示」節 (ゲーム一覧: 名前/開始/終了/ターン数/島数/状態)。
import { GAME_NOT_STARTED_LABEL } from "../../app/format.ts";
import { formatDateTime } from "../../app/timezone.ts";
import type { GameStatus, GameSummary } from "../../app/ports.ts";

function gameStatusLabel(status: GameStatus): string {
  return status === "running" ? "進行中" : "終了";
}

/**
 * ゲーム一覧の表。GET /games (`GamesPage`) と管理画面 (`AdminPage`、`AdminStatus.games` は
 * `GameSummary[]`) の両方から使う共有部品。名前は `/games/:id` へのリンク、
 * `currentGameId` と一致する行には「(現在)」を付ける。
 */
export function GamesTable({
  games,
  currentGameId,
  timezone,
}: {
  games: readonly GameSummary[];
  currentGameId?: number | undefined;
  timezone: string;
}) {
  return (
    <div class="table-scroll">
      <table class="games-table" border={1}>
        <tr>
          <th>名前</th>
          <th>開始</th>
          <th>終了</th>
          <th>ターン</th>
          <th>島数</th>
          <th>状態</th>
        </tr>
        {games.map((game) => (
          <tr key={game.id}>
            <td>
              <a href={`/games/${game.id}`}>{game.name}</a>
              {game.id === currentGameId ? "(現在)" : ""}
            </td>
            <td>{formatDateTime(game.startAt, timezone)}</td>
            <td>{game.finishedAt !== null ? formatDateTime(game.finishedAt, timezone) : ""}</td>
            <td>{game.turn === 0 ? GAME_NOT_STARTED_LABEL : game.turn}</td>
            <td>{game.islandCount}</td>
            <td>{gameStatusLabel(game.status)}</td>
          </tr>
        ))}
      </table>
    </div>
  );
}

export interface GamesPageProps {
  games: readonly GameSummary[];
  currentGameId?: number | undefined;
  timezone: string;
}

/** GET /games。現在 + 過去のゲームを一覧表示する。 */
export function GamesPage({ games, currentGameId, timezone }: GamesPageProps) {
  return (
    <div class="games-page">
      <h1>ゲーム一覧</h1>
      {games.length === 0 ? (
        <p>まだゲームがありません。</p>
      ) : (
        <GamesTable games={games} currentGameId={currentGameId} timezone={timezone} />
      )}
    </div>
  );
}
