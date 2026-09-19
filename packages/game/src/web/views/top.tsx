// Perl 版 Top.pm tempTopPage/logPrintTop/historyPrint の移植。
// tmp/14-users-auth.md によりパスワード関連フォームを撤去し、ログイン状態で出し分ける。
import type { GameConfig } from "../../core/config.ts";
import { monsters } from "../../core/constants.ts";
import { formatDuration } from "../../app/format.ts";
import type { SeasonVM } from "../../app/season.ts";
import { formatDateTime } from "../../app/timezone.ts";
import type { GameHeaderVM, IslandRowVM, TopPageVM } from "../../app/view-models.ts";
import { facilityScale } from "./island-info.tsx";
import { HistoryList, LogList } from "./logs.tsx";
import { Notice } from "./messages.tsx";

/**
 * ゲームが 1 つも無いときのトップ画面。tmp/18-games.md「ルート」節: `GET /` がゲーム未開始時に
 * 表示する画面。管理者には `/admin` への案内を出す。
 */
export function NoGamePage({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div class="no-game-page">
      <p class="big">ゲームはまだ開始されていません。</p>
      {isAdmin ? (
        <p>
          <a href="/admin">管理画面</a>から新しいゲームを開始できます。
        </p>
      ) : (
        ""
      )}
    </div>
  );
}

/** 賞のアイコン列。Perl 版 tempTopPage の $prize 組み立て部分。 */
function PrizeIcons({ prize }: { prize: IslandRowVM["prize"] }) {
  return (
    <>
      {prize.turnPrizes.map((turn) => (
        <img
          key={`turn-${turn}`}
          src="/images/prize0.gif"
          alt={`${turn}ターン杯`}
          width={16}
          height={16}
        />
      ))}
      {prize.flagPrizes.map((flag) => (
        <img
          key={`flag-${flag.index}`}
          src={`/images/${flag.image}`}
          alt={flag.name}
          width={16}
          height={16}
        />
      ))}
      {prize.killedMonsters.maxKind !== -1 ? (
        <img
          src={`/images/${monsters[prize.killedMonsters.maxKind]?.image ?? ""}`}
          alt={prize.killedMonsters.names.map((n) => `[${n}]`).join(" ")}
          width={16}
          height={16}
        />
      ) : (
        ""
      )}
    </>
  );
}

function IslandRow({
  island,
  config,
  gameId,
}: {
  island: IslandRowVM;
  config: GameConfig;
  gameId: number;
}) {
  const moneyCell =
    island.moneyDisplay.mode === "exact" ? (
      <td>
        {island.moneyDisplay.value}
        {config.units.money}
      </td>
    ) : island.moneyDisplay.mode === "about" ? (
      <td>{island.moneyDisplay.text}</td>
    ) : (
      ""
    );
  return (
    <>
      <tr>
        <td class="rank-cell" rowspan={2}>
          {island.rank}
        </td>
        <td class={island.absent !== 0 ? "island-name-faded" : "island-name"} rowspan={2}>
          <a href={`/games/${gameId}/islands/${island.id}`}>
            {island.name}島{island.absent !== 0 ? `(${island.absent})` : ""}
          </a>
          <br />
          <PrizeIcons prize={island.prize} />
        </td>
        <td>
          {island.pop}
          {config.units.pop}
        </td>
        <td>
          {island.area}
          {config.units.area}
        </td>
        {moneyCell}
        <td>
          {island.food}
          {config.units.food}
        </td>
        <td>{facilityScale(island.farm, config)}</td>
        <td>{facilityScale(island.factory, config)}</td>
        <td>{facilityScale(island.mountain, config)}</td>
      </tr>
      <tr>
        <td colspan={7} class="comment-cell">
          コメント：{island.comment}
        </td>
      </tr>
    </>
  );
}

/** 「自分の島へ」/「新しい島を探す」節。ログイン状態と島の所持状況で出し分ける。 */
function MyIslandSection({ vm, csrfToken }: { vm: TopPageVM; csrfToken: string | undefined }) {
  const { viewer } = vm;
  if (viewer.user === undefined) {
    return (
      <>
        <h1>自分の島へ</h1>
        <p>
          島を持つには<a href="/login">ログイン</a>してください。
        </p>
      </>
    );
  }
  if (viewer.hasIsland) {
    return (
      <>
        <h1>自分の島へ</h1>
        <p>
          <a href="/my-island">自分の島の開発計画へ</a>
        </p>
      </>
    );
  }
  // tmp/16-season.md「表示」節: 終了後は新しい島を探すフォームを出さない。
  // tmp/18-games.md: 過去のゲーム (isCurrent === false) は必ず終了しているので同じ分岐に入る。
  if (vm.season.state === "finished") {
    return (
      <>
        <h1>新しい島を探す</h1>
        <p>ゲームは終了しました。</p>
      </>
    );
  }
  return (
    <>
      <h1>新しい島を探す</h1>
      {vm.canCreate ? (
        <form action={`/games/${vm.game.id}/islands`} method="post">
          <input type="hidden" name="_csrf" value={csrfToken ?? ""} />
          どんな名前をつける予定？
          <br />
          <input type="text" name="name" size={32} maxlength={32} />島
          <br />
          <input type="submit" value="探しに行く" />
        </form>
      ) : (
        <p>島の数が最大数です・・・現在登録できません。</p>
      )}
    </>
  );
}

/** 残り時間の表示。「あとN時間M分」。0 秒以下なら「まもなく」。 */
function formatRemaining(diffSeconds: number): string {
  if (diffSeconds <= 0) {
    return "まもなく";
  }
  const totalMinutes = Math.floor(diffSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `あと${hours}時間${minutes}分`;
}

/**
 * 次のターンの予定時刻と残り時間。進行中 (`nextTurnAt` が設定されているとき) のみ表示する。
 * サーバー描画時点の静的表示であり、JavaScript によるカウントダウンは行わない。
 */
function NextTurnNotice({
  nextTurnAt,
  now,
  timezone,
}: {
  nextTurnAt: number;
  now: number;
  timezone: string;
}) {
  return (
    <p>
      <small>
        次のターン:{formatDateTime(nextTurnAt, timezone)} ({formatRemaining(nextTurnAt - now)})
      </small>
    </p>
  );
}

/**
 * ゲームの見出し。tmp/18-games.md「表示」節: トップの h1 をゲーム名にする。
 * 過去のゲーム (isCurrent でない) は先頭に「このゲームは終了しています。」を表示する
 * (過去のゲームは必ず finished なので、下の SeasonHeading の「結果発表」表示と併用される)。
 */
function GameHeading({ game }: { game: GameHeaderVM }) {
  return (
    <>
      <h1>{game.name}</h1>
      {!game.isCurrent ? <p class="notice big">このゲームは終了しています。</p> : ""}
    </>
  );
}

/**
 * ターン見出し。tmp/16-season.md「表示」節: 開始前/進行中/終了で出し分ける。
 * 「トップと管理画面のターン表示」節: 「ターンN」だけを見出しにし、最終ターン・
 * 1 ターンの長さ・次のターン (または開始日時) は直下の `<p><small>` に分けて表示する
 * (従来の「ターンN / 最終ターンM」の並記はやめた)。
 * tmp/18-games.md: h1 はゲーム名 (GameHeading) にしたため、こちらは h2 に格下げした。
 */
function SeasonHeading({
  season,
  now,
  timezone,
}: {
  season: SeasonVM;
  now: number;
  timezone: string;
}) {
  if (season.state === "finished") {
    return <h2>結果発表 (ターン{season.finishedAtTurn}終了時点)</h2>;
  }
  return (
    <>
      <h2>ターン{season.turn}</h2>
      {season.finalTurn !== null ? (
        <p>
          <small>最終ターン{season.finalTurn}</small>
        </p>
      ) : (
        ""
      )}
      <p>
        <small>1 ターン: {formatDuration(season.unitTimeSec)}</small>
      </p>
      {season.state === "before" ? (
        <p>
          <small>
            ゲーム開始:{formatDateTime(season.startAt, timezone)}({timezone})
          </small>
        </p>
      ) : (
        ""
      )}
      {season.nextTurnAt !== null ? (
        <NextTurnNotice nextTurnAt={season.nextTurnAt} now={now} timezone={timezone} />
      ) : (
        ""
      )}
    </>
  );
}

export interface TopPageProps {
  vm: TopPageVM;
  config: GameConfig;
  timezone: string;
  /** 表示時点の unix 秒。次のターンまでの残り時間の計算に使う。 */
  now: number;
  csrfToken?: string | undefined;
  notice?: string | undefined;
}

export function TopPage({ vm, config, timezone, now, csrfToken, notice }: TopPageProps) {
  const showMoneyColumn = config.hideMoneyMode !== 0;
  return (
    <div class="top-page">
      {notice !== undefined ? <Notice message={notice} /> : ""}

      {vm.debug ? (
        <form action="/turn" method="post">
          <input type="hidden" name="_csrf" value={csrfToken ?? ""} />
          <input type="submit" value="ターンを進める" />
        </form>
      ) : (
        ""
      )}

      <GameHeading game={vm.game} />
      <SeasonHeading season={vm.season} now={now} timezone={timezone} />

      <hr />
      <MyIslandSection vm={vm} csrfToken={csrfToken} />

      <hr />
      <h1>諸島の状況</h1>
      <p>
        島の名前をクリックすると、<b>観光</b>することができます。
      </p>
      <div class="table-scroll">
        <table class="rank-table" border={1}>
          <tr>
            <th>順位</th>
            <th>島</th>
            <th>人口</th>
            <th>面積</th>
            {showMoneyColumn ? <th>資金</th> : ""}
            <th>食料</th>
            <th>農場規模</th>
            <th>工場規模</th>
            <th>採掘場規模</th>
          </tr>
          {vm.islands.map((island) => (
            <IslandRow island={island} config={config} gameId={vm.game.id} key={island.id} />
          ))}
        </table>
      </div>

      <hr />
      <h1>最近の出来事</h1>
      <LogList logs={vm.logs} />

      <hr />
      <h1>発見の記録</h1>
      <HistoryList history={vm.history} />
    </div>
  );
}
