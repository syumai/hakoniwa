// Perl 版 Top.pm tempTopPage/logPrintTop/historyPrint の移植。
import type { GameConfig } from "../../core/config.ts";
import { monsters } from "../../core/constants.ts";
import type { IslandRowVM, TopPageVM } from "../../app/view-models.ts";
import type { FormDefaults } from "../middleware/defaults-cookie.ts";
import { facilityScale } from "./island-info.tsx";
import { HistoryList, LogList } from "./logs.tsx";

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
        <td class="island-name" rowspan={2}>
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

export interface TopPageProps {
  vm: TopPageVM;
  config: GameConfig;
  defaults: FormDefaults;
}

export function TopPage({ vm, config, defaults }: TopPageProps) {
  const showMoneyColumn = config.hideMoneyMode !== 0;
  return (
    <div class="top-page">
      <p class="big">{config.site.title}</p>

      {vm.debug ? (
        <form action="/turn" method="post">
          <input type="submit" value="ターンを進める" />
        </form>
      ) : (
        ""
      )}

      <h1>ターン{vm.turn}</h1>

      <hr />
      <h1>自分の島へ</h1>
      <form action="/owner" method="post">
        あなたの島の名前は？
        <br />
        <select name="islandId">
          {vm.islands.map((island) => (
            <option value={island.id} key={island.id} selected={island.id === defaults.ownIslandId}>
              {island.name}島
            </option>
          ))}
        </select>
        <br />
        パスワードをどうぞ！！
        <br />
        <input type="password" name="password" size={32} maxlength={32} value="" />
        <br />
        <input type="submit" value="開発しに行く" />
      </form>

      <hr />
      <h1>諸島の状況</h1>
      <p>
        島の名前をクリックすると、<b>観光</b>することができます。
      </p>
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

      <hr />
      <h1>新しい島を探す</h1>
      {vm.canCreate ? (
        <form action="/islands" method="post">
          どんな名前をつける予定？
          <br />
          <input type="text" name="name" size={32} maxlength={32} />島
          <br />
          パスワードは？
          <br />
          <input type="password" name="password" size={32} maxlength={32} />
          <br />
          念のためパスワードをもう一回
          <br />
          <input type="password" name="passwordConfirm" size={32} maxlength={32} />
          <br />
          <input type="submit" value="探しに行く" />
        </form>
      ) : (
        <p>島の数が最大数です・・・現在登録できません。</p>
      )}

      <hr />
      <h1>島の名前とパスワードの変更</h1>
      <p>
        (注意)名前の変更には{config.costChangeName}
        {config.units.money}かかります。
      </p>
      <form action="/settings" method="post">
        どの島ですか？
        <br />
        <select name="islandId">
          {vm.islands.map((island) => (
            <option value={island.id} key={island.id}>
              {island.name}島
            </option>
          ))}
        </select>
        <br />
        どんな名前に変えますか？(変更する場合のみ)
        <br />
        <input type="text" name="name" size={32} maxlength={32} />島
        <br />
        パスワードは？(必須)
        <br />
        <input type="password" name="oldPassword" size={32} maxlength={32} />
        <br />
        新しいパスワードは？(変更する時のみ)
        <br />
        <input type="password" name="password" size={32} maxlength={32} />
        <br />
        念のためパスワードをもう一回(変更する時のみ)
        <br />
        <input type="password" name="passwordConfirm" size={32} maxlength={32} />
        <br />
        <input type="submit" value="変更する" />
      </form>

      <hr />
      <h1>最近の出来事</h1>
      <LogList logs={vm.logs} />
      <h1>発見の記録</h1>
      <HistoryList history={vm.history} />
    </div>
  );
}
