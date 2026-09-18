// Perl 版 Map.pm tempPrintIslandHead + islandInfo + islandMap(0) + tempLbbs* + tempRecent(0) の移植。
// tmp/14-users-auth.md により掲示板の記帳はログイン必須になったため、未ログイン時はログインへの
// 導線を表示する。
import type { GameConfig } from "../../core/config.ts";
import type { IslandPageVM } from "../../app/view-models.ts";
import { IslandInfo } from "./island-info.tsx";
import { IslandMap } from "./island-map.tsx";
import { LbbsContents, LbbsHead, LbbsInput } from "./lbbs.tsx";
import { LogList } from "./logs.tsx";
import { BackLink, Notice } from "./messages.tsx";

export interface IslandPageProps {
  vm: IslandPageVM;
  config: GameConfig;
  /** ログイン中のみ渡ってくる (未ログインなら記帳フォームの代わりにログイン導線を出す)。 */
  csrfToken?: string | undefined;
  notice?: string;
}

/** 観光画面。Perl 版 printIslandMain。 */
export function IslandPage({ vm, config, csrfToken, notice }: IslandPageProps) {
  return (
    <div class="island-page">
      {notice !== undefined ? <Notice message={notice} /> : ""}
      <p class="big">
        <span class="island-name">「{vm.name}島」</span>へようこそ！！
      </p>
      <BackLink />

      <section class="card">
        <h2>島の様子</h2>
        <div class="table-scroll">
          <IslandInfo detail={vm} money={vm.moneyDisplay} config={config} />
        </div>
        <IslandMap terrain={vm.terrain} mode="visitor" turn={vm.turn} config={config} />
      </section>

      {config.useLbbs ? (
        <section class="card">
          <LbbsHead islandName={vm.name} />
          {csrfToken !== undefined ? (
            <LbbsInput islandId={vm.id} csrfToken={csrfToken} />
          ) : (
            <p>
              記帳するには<a href="/login">ログイン</a>してください。
            </p>
          )}
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
