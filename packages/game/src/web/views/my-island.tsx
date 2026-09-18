// Perl 版 Map.pm tempOwner/tempCommand の移植。tmp/14-users-auth.md によりパスワード欄を撤去し、
// 名前変更フォーム (旧 POST /settings) をこの画面に統合した (GameService.changeName は
// actor 自身の島にしか効かないため、URL/フォームに islandId を含める必要がなくなったため)。
import type { GameConfig } from "../../core/config.ts";
import { commandList } from "../../core/constants.ts";
import type { FormattedCommand } from "../../core/commands/format.ts";
import type { IslandSelectVM, OwnerPageVM } from "../../app/view-models.ts";
import { buildMoneyDisplay } from "../../app/view-models.ts";
import { IslandInfo } from "./island-info.tsx";
import { IslandMap } from "./island-map.tsx";
import { LbbsContents, LbbsDeleteForm, LbbsHead, LbbsInput } from "./lbbs.tsx";
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
  config,
  defaults,
  targets,
  csrfToken,
}: {
  config: GameConfig;
  defaults: OwnerPageVM["defaults"];
  targets: readonly IslandSelectVM[];
  csrfToken: string;
}) {
  return (
    <form action="/my-island/commands" method="post">
      <input type="hidden" name="_csrf" value={csrfToken} />

      <div class="field">
        <label>
          計画番号
          <select name="number">
            {range(config.commandMax).map((i) => (
              <option value={i} key={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="field">
        <label>
          開発計画
          <select name="kind">
            {commandList.map((spec) => (
              <option value={spec.kind} key={spec.kind} selected={spec.kind === defaults.kind}>
                {spec.name}({costLabel(spec.cost, config)})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="field">
        <span>座標</span>
        <div class="coord-fields">
          <label>
            x
            <select name="x">
              {range(config.islandSize).map((i) => (
                <option value={i} key={i} selected={i === defaults.pointX}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label>
            y
            <select name="y">
              {range(config.islandSize).map((i) => (
                <option value={i} key={i} selected={i === defaults.pointY}>
                  {i}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div class="field">
        <label>
          数量
          <select name="amount">
            {range(100).map((i) => (
              <option value={i} key={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="field">
        <label>
          目標の島
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
        </label>
      </div>

      <div class="field">
        <span>動作</span>
        <label>
          <input type="radio" name="mode" value="insert" checked />
          挿入
        </label>
        <label>
          <input type="radio" name="mode" value="write" />
          上書き
        </label>
        <label>
          <input type="radio" name="mode" value="delete" />
          削除
        </label>
      </div>

      <button type="submit" class="btn btn-primary">
        計画送信
      </button>
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

/** 名前変更フォーム。旧 POST /settings をこの画面に統合したもの。 */
function NameChangeForm({
  costChangeName,
  unit,
  csrfToken,
}: {
  costChangeName: number;
  unit: string;
  csrfToken: string;
}) {
  return (
    <form action="/my-island/name" method="post">
      <input type="hidden" name="_csrf" value={csrfToken} />
      <p>
        (注意)名前の変更には{costChangeName}
        {unit}かかります。
      </p>
      <div class="field">
        <label>
          どんな名前に変えますか？
          <input type="text" name="name" size={32} maxlength={32} />島
        </label>
      </div>
      <button type="submit" class="btn">
        変更する
      </button>
    </form>
  );
}

export interface MyIslandPageProps {
  vm: OwnerPageVM;
  config: GameConfig;
  /** 「目標の島」セレクト用の島一覧。 */
  targets: readonly IslandSelectVM[];
  csrfToken: string;
  notice?: string;
}

/** 開発画面。Perl 版 tempOwner + tempLbbs* + tempRecent(1)。旧 web/views/owner.tsx。 */
export function MyIslandPage({ vm, config, targets, csrfToken, notice }: MyIslandPageProps) {
  return (
    <div class="owner-page">
      {/* 座標選択の補助スクリプト (この画面だけで読み込む)。 */}
      <script src="/owner.js" defer></script>
      {notice !== undefined ? <Notice message={notice} /> : ""}
      <p class="big">
        <span class="island-name">{vm.name}島</span>開発計画
      </p>

      <section class="card">
        <h2>島の状況</h2>
        <div class="table-scroll">
          <IslandInfo
            detail={vm}
            money={buildMoneyDisplay(vm.money, config, true)}
            config={config}
          />
        </div>
      </section>

      <section class="card">
        <h2>開発計画</h2>
        <div class="owner-layout">
          <div class="owner-map-col">
            <IslandMap
              terrain={vm.terrain}
              mode="owner"
              turn={vm.turn}
              config={config}
              commands={vm.rawCommands}
            />
          </div>
          <div class="owner-form-col">
            <CommandForm
              config={config}
              defaults={vm.defaults}
              targets={targets}
              csrfToken={csrfToken}
            />
          </div>
          <div class="owner-commands-col">
            {vm.commands.map((command, index) => (
              <CommandLine index={index} command={command} key={index} />
            ))}
          </div>
        </div>
      </section>

      <section class="card">
        <h2>コメント更新</h2>
        <form action="/my-island/comment" method="post" class="field-row">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="text" name="message" size={80} placeholder="コメント" />
          <button type="submit" class="btn">
            コメント更新
          </button>
        </form>
      </section>

      <section class="card">
        <h2>名前の変更</h2>
        <NameChangeForm
          costChangeName={config.costChangeName}
          unit={config.units.money}
          csrfToken={csrfToken}
        />
      </section>

      {config.useLbbs ? (
        <section class="card">
          <LbbsHead islandName={vm.name} />
          <LbbsInput islandId={vm.id} csrfToken={csrfToken} />
          <LbbsDeleteForm lbbsMax={config.lbbsMax} csrfToken={csrfToken} />
          <div class="table-scroll">
            <LbbsContents posts={vm.lbbs} />
          </div>
        </section>
      ) : (
        ""
      )}

      <section class="card">
        <p class="big">
          <span class="island-name">{vm.name}島</span>の近況
        </p>
        <LogList logs={vm.logs} />
      </section>
    </div>
  );
}
