// Perl 版 Top.pm tempTopPage/logPrintTop/historyPrint の移植。
// tmp/14-users-auth.md によりパスワード関連フォームを撤去し、ログイン状態で出し分ける。
import type { GameConfig } from "../../core/config.ts";
import { monsters } from "../../core/constants.ts";
import type { IslandRowVM, TopPageVM } from "../../app/view-models.ts";
import { facilityScale } from "./island-info.tsx";
import { HistoryList, LogList } from "./logs.tsx";
import { Notice } from "./messages.tsx";

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

function IslandRow({ island, config }: { island: IslandRowVM; config: GameConfig }) {
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
          <a href={`/islands/${island.id}`}>
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
  return (
    <>
      <h1>新しい島を探す</h1>
      {vm.canCreate ? (
        <form action="/islands" method="post">
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

export interface TopPageProps {
  vm: TopPageVM;
  config: GameConfig;
  csrfToken?: string | undefined;
  notice?: string | undefined;
}

export function TopPage({ vm, config, csrfToken, notice }: TopPageProps) {
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

      <h1>ターン{vm.turn}</h1>

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
            <IslandRow island={island} config={config} key={island.id} />
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
