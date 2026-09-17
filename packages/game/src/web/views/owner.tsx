// Perl 版 Map.pm tempOwner/tempCommand の移植。
import type { GameConfig } from "../../core/config.ts";
import { commandList } from "../../core/constants.ts";
import type { FormattedCommand } from "../../core/commands/format.ts";
import type { IslandSelectVM, OwnerPageVM } from "../../app/view-models.ts";
import { buildMoneyDisplay } from "../../app/view-models.ts";
import type { FormDefaults } from "../middleware/defaults-cookie.ts";
import { IslandInfo } from "./island-info.tsx";
import { IslandMap } from "./island-map.tsx";
import { LbbsContents, LbbsHead, LbbsInputOwner } from "./lbbs.tsx";
import { LogList } from "./logs.tsx";
import { Notice } from "./messages.tsx";

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** 計画の費用表示。「無料」「n億円」「n00トン」。Perl 版 tempOwner のコスト表示部分。 */
function costLabel(cost: number, config: GameConfig): string {
  if (cost === 0) {
    return "無料";
  }
  if (cost < 0) {
    return `${-cost}${config.units.food}`;
  }
  return `${cost}${config.units.money}`;
}

/** 計画入力フォーム。Perl 版 tempOwner のフォーム部分。 */
function CommandForm({
  islandId,
  password,
  config,
  defaults,
  targets,
}: {
  islandId: number;
  password: string;
  config: GameConfig;
  defaults: FormDefaults;
  targets: readonly IslandSelectVM[];
}) {
  return (
    <form action={`/islands/${islandId}/commands`} method="post">
      <input type="submit" value="計画送信" />
      <hr />
      <b>パスワード</b>
      <br />
      <input type="password" name="password" size={32} maxlength={32} value={password} />
      <hr />
      <b>計画番号</b>
      <select name="number">
        {range(config.commandMax).map((i) => (
          <option value={i} key={i}>
            {i + 1}
          </option>
        ))}
      </select>
      <br />
      <hr />
      <b>開発計画</b>
      <br />
      <select name="kind">
        {commandList.map((spec) => (
          <option value={spec.kind} key={spec.kind} selected={spec.kind === defaults.kind}>
            {spec.name}({costLabel(spec.cost, config)})
          </option>
        ))}
      </select>
      <hr />
      <b>座標(</b>
      <select name="x">
        {range(config.islandSize).map((i) => (
          <option value={i} key={i} selected={i === defaults.pointX}>
            {i}
          </option>
        ))}
      </select>
      、
      <select name="y">
        {range(config.islandSize).map((i) => (
          <option value={i} key={i} selected={i === defaults.pointY}>
            {i}
          </option>
        ))}
      </select>
      <b>)</b>
      <hr />
      <b>数量</b>
      <select name="amount">
        {range(100).map((i) => (
          <option value={i} key={i}>
            {i}
          </option>
        ))}
      </select>
      <hr />
      <b>目標の島</b>
      <br />
      <select name="target">
        {targets.map((island) => (
          <option
            value={island.id}
            key={island.id}
            selected={island.id === defaults.targetIslandId}
          >
            {island.name}島
          </option>
        ))}
      </select>
      <hr />
      <b>動作</b>
      <br />
      <input type="radio" name="mode" value="insert" checked />
      挿入
      <input type="radio" name="mode" value="write" />
      上書き
      <br />
      <input type="radio" name="mode" value="delete" />
      削除
      <hr />
      <input type="submit" value="計画送信" />
    </form>
  );
}

/**
 * 入力済み計画 1 件の表示。Perl 版 tempCommand。
 * `data-number` は 0 始まりの欄番号 (owner.js が `<select name="number">` を書き換えるのに使う。
 * Perl 版 ns(x) と同じく 0 始まり。表示用の `command.number` は "01：" 形式の文字列なので別物)。
 */
function CommandLine({ index, command }: { index: number; command: FormattedCommand }) {
  return (
    <div class="command-line">
      <a href="#" data-number={index} class="command-number">
        {command.number}
      </a>
      <span class="command-name">{command.text}</span>
      <br />
    </div>
  );
}

export interface OwnerPageProps {
  vm: OwnerPageVM;
  config: GameConfig;
  defaults: FormDefaults;
  /** 開発画面を開いたときに送られたパスワード。各フォームに持ち回る (Cookie には保存しない)。 */
  password: string;
  /** 「目標の島」セレクト用の島一覧。 */
  targets: readonly IslandSelectVM[];
  notice?: string;
}

/** 開発画面。Perl 版 tempOwner + tempLbbs* + tempRecent(1)。 */
export function OwnerPage({ vm, config, defaults, password, targets, notice }: OwnerPageProps) {
  return (
    <div class="owner-page">
      {notice !== undefined ? <Notice message={notice} /> : ""}
      <p class="big">
        <span class="island-name">{vm.name}島</span>開発計画
      </p>
      <IslandInfo detail={vm} money={buildMoneyDisplay(vm.money, config, true)} config={config} />
      <table class="owner-layout" border={1}>
        <tr>
          <td class="input-cell">
            <CommandForm
              islandId={vm.id}
              password={password}
              config={config}
              defaults={defaults}
              targets={targets}
            />
          </td>
          <td class="map-cell">
            <IslandMap
              terrain={vm.terrain}
              mode="owner"
              turn={vm.turn}
              config={config}
              commands={vm.rawCommands}
            />
          </td>
          <td class="command-cell">
            {vm.commands.map((command, index) => (
              <CommandLine index={index} command={command} key={index} />
            ))}
          </td>
        </tr>
      </table>
      <hr />
      <p class="big">コメント更新</p>
      <form action={`/islands/${vm.id}/comment`} method="post">
        コメント
        <input type="text" name="message" size={80} />
        <br />
        パスワード
        <input type="password" name="password" size={32} maxlength={32} value={password} />
        <input type="submit" value="コメント更新" />
      </form>

      {config.useLbbs ? (
        <>
          <LbbsHead islandName={vm.name} />
          <LbbsInputOwner
            islandId={vm.id}
            password={password}
            defaultName={defaults.lbbsName ?? ""}
            lbbsMax={config.lbbsMax}
          />
          <LbbsContents posts={vm.lbbs} />
        </>
      ) : (
        ""
      )}

      <hr />
      <p class="big">
        <span class="island-name">{vm.name}島</span>の近況
      </p>
      <LogList logs={vm.logs} />
    </div>
  );
}
