# 開発者向けドキュメント

箱庭諸島２ (TypeScript 版) の開発に参加する方向けのドキュメントです。自分の環境へのデプロイ・設置だけが目的の場合は [設置ガイド](setup-guide.md) を参照してください。

## 構成

pnpm workspace によるモノレポです。パッケージ化しているのは差し替え単位となる Adapter だけで、ゲーム本体は 1 パッケージです。

| パッケージ                                       | 役割                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (`@hakoniwajs/core`)             | ゲーム本体。ランタイム非依存で、Node や Cloudflare 固有の API を使いません。`core` (ゲームロジック)、`app` (ユースケース)、`storage` (SQLite 用ストレージ抽象)、`web` (Hono + hono/jsx の画面)、`bootstrap` (組み立て) と、画像や CSS などの `public` を含みます |
| `packages/node` (`@hakoniwajs/node`)             | Node.js 向け Adapter。`node:sqlite` によるストレージ、HTTP サーバー、ファイルバックアップ、CLI                                                                                                                                                                   |
| `packages/cloudflare` (`@hakoniwajs/cloudflare`) | Cloudflare Workers (Durable Objects SQLite) 向け Adapter。DO のストレージ、Cron Trigger によるターン進行、PITR バックアップ                                                                                                                                      |

`packages/core` 内の層は依存方向が一方向になるよう分けています。

- `core`: ゲームロジック本体。上位層にも Hono にも依存しません
- `app`: ユースケース (サービス層)。`core` を組み合わせてリクエスト単位の処理を組み立てます
- `storage`: SQLite 用のストレージ抽象 (スキーマ、リポジトリ IF)。`node:sqlite` などランタイム固有の実装は `SqlDriver` として Adapter 側から差し込みます
- `web`: Hono + hono/jsx によるルーティングと画面
- `bootstrap`: 上記を組み立てて `app`/`web` を構成する層。環境変数の読み込み (`config-from-env.ts`) もここに含まれます

`packages/node`・`packages/cloudflare` は `SqlDriver`/`BackupStore` などランタイム固有の実装だけを持ち、ゲームロジックやスキーマは共通です。

## 必要なツール

Node.js、pnpm、[Vite+](https://viteplus.dev/) (`vp`) は [mise](https://mise.jdx.dev/) で管理しています。

```sh
mise install
mise exec -- vp install
```

シェルで mise を有効化していない場合は、以降のコマンドにも `mise exec -- ` を付けて実行してください。

## ローカル開発 (Node)

島の作成やログインにはユーザー認証が必須です。ローカル開発では「開発ログイン」(任意のメールアドレスでログインできる機能) を使うのが手軽です。

```sh
cp .env.node.example .env
```

`.env` を開き、少なくとも次の 3 つを設定してください。

- `HAKONIWA_AUTH_SECRET`: `openssl rand -base64 32` などで生成した 32 バイト以上のランダム文字列
- `HAKONIWA_DEV_LOGIN=true`: 開発ログインを有効化
- `HAKONIWA_ADMIN_EMAILS=自分のメールアドレス`: 管理画面 (`/admin`) に入れるようにする (開発ログインでそのままログインすれば管理者になれる)

mise 経由 (`mise exec -- ...` や `mise activate` 済みのシェル) であれば、リポジトリ直下の `.env` は自動的に読み込まれます。mise を使わない場合は、同じシェルで環境変数を指定してください。環境変数を変更したときは、開発サーバー (`vp run dev`) を再起動しないと反映されません。

X (Twitter) / Discord ログインを試したい場合は `HAKONIWA_X_CLIENT_ID`/`HAKONIWA_X_CLIENT_SECRET` や `HAKONIWA_DISCORD_CLIENT_ID`/`HAKONIWA_DISCORD_CLIENT_SECRET` を設定してください (OAuth アプリ側のコールバック URL は `<公開 URL>/api/auth/callback/twitter`・`.../callback/discord`。`<公開 URL>` はローカル開発なら `http://localhost:5173` です。`HAKONIWA_BASE_URL` は通常は不要ですが、カスタムドメインや逆プロキシ配下で動かす場合だけ明示的に設定してください)。メールログインは `HAKONIWA_RESEND_API_KEY` を設定しない限りコンソールにリンクを出力するだけの開発用 Mailer で動きます。

環境変数の一覧は [設置ガイド](setup-guide.md#4-環境変数一覧) を参照してください。

```sh
vp run dev
```

開発サーバーが http://localhost:5173/ で起動します。初回はゲームがまだ無いので、次のいずれかで開始してください。

- `/login` を開き、開発ログインのフォームに任意のメールアドレス (`HAKONIWA_ADMIN_EMAILS` に指定したもの) を入力してログインし、`/admin` で「新しいゲームを開始」(ゲーム名・開始日時・最終ターン・1 ターンの長さを指定可能。名前は省略すると「第 N 回」になる) を実行する
- CLI で開始する: `vp run --filter ./packages/node cli -- db init` (`game new` のエイリアス)

ゲームが終了したら (最終ターン到達、または管理画面の「このゲームを終了する」)、管理画面や CLI (`game new`) から次のゲームを開始できます。過去のゲームは `/games` から一覧・閲覧できます (読み取り専用。再開はできません)。

データベースのスキーマ変更は、Node/Workers いずれも起動時に自動でマイグレーションされます。ただし初期のスキーマ (v1) で作られたデータベースファイルが残っている場合はスキーマに互換性が無いため、`vp run --filter ./packages/node cli -- db reset --yes` で一度削除してから初期化し直してください (`HAKONIWA_DB_PATH` を新しいパスにして作り直しても構いません)。

## ローカル開発 (`wrangler dev`)

ローカル用の秘密情報は root の `.dev.vars` に書きます (git 管理外)。secret の一覧は `.dev.vars.example` にあるので、コピーして値を入れてください (`cp .dev.vars.example .dev.vars`)。開発ログイン等の非秘密の設定は `--var` か `.dev.vars` への追記で指定します。

> [!NOTE]
> `wrangler.jsonc` を root に置いているため、Wrangler の「設定ファイルと同じディレクトリの `.env`/`.env.local` を自動的に読み込む」機能により、`wrangler dev` は Node 版の開発で使っている root の `.env` も (`.dev.vars` と合わせて) 読み込みます。`.env` に `HAKONIWA_BASE_URL=http://localhost:5173` を設定している場合、`wrangler dev --port 8788` のように別ポートで動かすと Origin 検査の基準が食い違うことがあります (通常ブラウザが送る `Origin` はリクエスト先のポートと一致するので実害は無いことが多いですが、気になる場合は `.env` の `HAKONIWA_BASE_URL` をコメントアウトするか、`--var HAKONIWA_BASE_URL:http://localhost:8788` で明示的に上書きしてください)。`wrangler deploy` (本番デプロイ) はこの自動読み込みの対象外で、`wrangler.jsonc` の `vars` と `wrangler secret put` で登録した secret だけが使われます。

```sh
# .dev.vars (リポジトリ直下)
HAKONIWA_AUTH_SECRET=（openssl rand -base64 32 などで生成した32バイト以上のランダム文字列）
HAKONIWA_DEV_LOGIN=true
HAKONIWA_ADMIN_EMAILS=you@example.com
```

```sh
pnpm --filter @hakoniwajs/cloudflare dev
# もしくは
cd packages/cloudflare && vp run dev   # = wrangler dev --config ../../wrangler.jsonc
```

`.dev.vars` を作らずに一時的な値で試したい場合は `--var` オプションでも指定できます。

```sh
wrangler dev --port 8787 \
  --var HAKONIWA_AUTH_SECRET:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --var HAKONIWA_DEV_LOGIN:true \
  --var HAKONIWA_ADMIN_EMAILS:you@example.com
```

初回のゲーム開始手順は Node 版と同じです (`/login` から開発ログイン → `/admin` で「新しいゲームを開始」)。ローカルの DO の状態は `.wrangler/state` (リポジトリ直下) に保存されます (git 管理外)。

## CLI 一覧

npm パッケージとしてインストールした環境では `npx hakoniwa <command>` で実行できます (`@hakoniwajs/node` の `bin`)。このリポジトリ内のビルド成果物では `node packages/node/dist/cli.js` が同等です。

```sh
node packages/node/dist/cli.js --help
node packages/node/dist/cli.js db init          # ゲームが無いときだけ新しいゲームを開始する (game new のエイリアス)
node packages/node/dist/cli.js db init --start-at 2026-10-01T21:00:00+09:00 --final-turn 100 --unit-time 6h30m
node packages/node/dist/cli.js db status        # 現在のゲーム名・状態・ターン数・最終更新時刻・開始時刻・最終ターン・1ターンの長さ・状態・島数・過去のゲーム数など
node packages/node/dist/cli.js db reset --yes    # 全ゲームを削除する (古いスキーマの DB を作り直す場合にも使う)
node packages/node/dist/cli.js turn check       # 期限が来ていればターンを進める (終了後は 0)
node packages/node/dist/cli.js turn advance     # 強制的に 1 ターン進める (終了後は何もしない)
node packages/node/dist/cli.js time set <unix|ISO8601>
node packages/node/dist/cli.js game new         # 新しいゲームを開始する (現在のゲームが running なら失敗)
node packages/node/dist/cli.js game new --name 第2回 --start-at 2026-10-01T21:00:00+09:00 --final-turn 100 --unit-time 6h30m
node packages/node/dist/cli.js game finish      # 現在のゲームを終了する (running でなければ失敗)
node packages/node/dist/cli.js game list        # ゲーム一覧 (現在 + 過去) を表示する
node packages/node/dist/cli.js game set-final-turn <N|none>  # 現在のゲームの最終ターン数の変更 (none で無期限に戻す)
node packages/node/dist/cli.js game set-unit-time <値>       # 現在のゲームの1ターンの長さの変更 (次のターン境界から効く。6h/90m/1h30m/3600 (数字のみは秒) を受け付ける)
node packages/node/dist/cli.js backup list|create [label]|restore <label>|delete <label>
```

ローカル開発では `vp run --filter ./packages/node cli -- <command>` でビルド無しに実行できます。

## テストと静的検査

```sh
vp test    # Vitest (packages/cloudflare 以外)
vp check   # フォーマット、lint、型チェック (packages/cloudflare を含む全パッケージ)
vp fmt     # フォーマットの自動修正
```

`packages/cloudflare` のテストは `@cloudflare/vitest-pool-workers` (workerd 上で実行する Vitest プール) を使っていますが、`vp test` が内蔵する vitest ランナーとは別インスタンスのため `vp test` の集約実行には乗らず、`vite.config.ts` の `test.projects` から明示的に除外しています。単体では次のコマンドで実行できます。

```sh
pnpm --filter @hakoniwajs/cloudflare test
```

## OGP タイル画像の生成

OGP 画像のタイル画像データ (`packages/core/src/ogp/`) は事前生成したものをコミットしています。元画像 (`packages/core/public/images`) を差し替えた場合は、次のコマンドで再生成してください。

```sh
pnpm --filter @hakoniwajs/core generate:ogp-tiles
```

## ターン進行の仕組み

ターンは「最終更新時刻から 1 ターン分の時間が経過しているか」で判定します。判定はリクエスト時に行われるほか、次の 2 つの経路でも進みます。

- **Node サーバー**: `HAKONIWA_TURN_CHECK_INTERVAL_SEC` (既定 60 秒) 間隔のタイマーから判定されるため、アクセスがなくてもターンが進みます
- **Cloudflare Workers**: `wrangler.jsonc` の `triggers.crons` (既定 `*/15 * * * *`、15 分ごと) から Worker の `scheduled` ハンドラが呼ばれ、DO の RPC `checkTurn()` (`turnService.advanceTurnIfDue`) を実行します。実際にターンを進めるべきかどうかは DB に保存された1ターンの長さ (初期化時に `HAKONIWA_UNIT_TIME_SEC` で決まり、以後は管理画面/CLI で変更できる) と最終更新時刻から判定するため、Cron 側は境界を意識しません。ターン境界と Cron 間隔の差 (最大 15 分) だけ進行が遅れますが、リクエストごとの遅延判定 (turn-check ミドルウェア) も併存するのでアクセスがあればその時点で進みます。ローカルの `wrangler dev` では Cron は自動発火しないため、手動で `curl http://localhost:8787/cdn-cgi/local/scheduled` を叩いて試せます

リクエスト時の判定と Cron / タイマーが同時に走っても、ターンは二重に進みません。1 ターン分の処理 (`TurnService.#advanceOnce`) は `await` を含まない同期処理としてリポジトリの 1 トランザクション内で実行され、ゲームの状態更新は `tryBumpTurn` (`UPDATE games ... WHERE id = ? AND turn = ?`) の楽観ロックで進行前のターン番号を条件にします。先に進めた側が勝ち、負けた側はロールバックして何もしません。Cloudflare Workers では Durable Object 自体が単一スレッドで、`transactionSync` の中で同期的に完結するため、そもそも 2 つのトリガーが同時に同じ DO で処理されることはありません。

## 島の放棄

開発画面の「島を放棄する」(`POST /games/:gameId/my-island/abandon`) から、自分の島を放棄して新しい島を探しに行けます。放棄すると `islands.abandoned_at` が記録され、町のヘックスは荒地に、計画はすべて資金繰りに戻ります。所有判定 (`findIslandByOwner`) は放棄されていない島だけを返すため、放棄直後から新しい島を作成できます。放棄島はターン処理の収入・計画・成長・災害の各フェーズをスキップし、ターン末の死滅判定で除去されます (除去時のログは通常の死滅ではなく「放棄され、無人島になりました」)。放棄回数は `GameConfig.maxAbandonsPerGame` (既定 3) までで、`abandonments` 表に (game_id, user_id) ごとに記録が残ります (放棄島がターン末に削除されても記録は残ります)。

## Workers Cache と `no-store` の方針

島の URL (`/games/:gameId/islands/:id`) を X や Discord、Slack 等でシェアすると、`GET /games/:gameId/islands/:id/ogp.png` (800×420 PNG) の地図画像が OGP (`og:image`) として表示されます。地図は観光者向けの表示 (基地→森、海底基地→海、ハリボテ→防衛施設に見える偽装ルールを含む) をそのまま敷き詰めたもので、文字は描画しません (島名やターン・人口・面積・順位は `og:title`/`og:description` に載せます)。画像は外部サービスやネイティブライブラリを使わず、`packages/core/src/ogp/` の純粋な TypeScript (自前の PNG エンコーダ + 事前生成したタイル画像データ) で毎回組み立てます。

`GET /islands/:id/ogp.png` の `Cache-Control` は tmp/21-kv-snapshot-cache.md「OGP 画像」節により画像の変わりやすさで出し分けます (`routes/islands.tsx` の `ogpCacheControl`)。過去のゲーム、または現在のゲームでも終了済みのゲームの画像は二度と変わらないため `public, max-age=31536000, immutable`。進行中のゲームは次のターンまでの秒数 (60〜3600 秒にクランプ)、ゲーム開始前は最短の `public, max-age=60` を返します。

Cloudflare Workers 版は、自前で Cache API (`caches.default`) を呼ぶ実装は持たず、代わりに [Workers Cache](https://developers.cloudflare.com/workers/cache/) (`wrangler.jsonc` の `cache.enabled: true`) を使います。これは応答の `Cache-Control` に従って Cloudflare 側が自動でキャッシュする機能で、**`*.workers.dev` のデフォルトドメインでも有効**です (Cache API と違いカスタムドメインは不要)。

Workers Cache は `Cache-Control` の無い応答も RFC 9111 のヒューリスティックでキャッシュしてしまい、しかも Cookie 付きリクエストをバイパスしません (バイパス対象は `Set-Cookie` を含む応答と `Authorization` 付きリクエストのみ)。そのため、セッション依存の HTML (`/api/auth/*` の better-auth の応答を含む) が他人に配信されてしまわないよう、`packages/core/src/web/app.tsx` の `defaultCacheControlMiddleware` が **すべての応答に既定で `Cache-Control: private, no-store` を付け**、ルートが明示的に `Cache-Control` を設定している場合だけそちらを優先します。`GET /games/:gameId/islands/:id/ogp.png` は自身で上記の `Cache-Control` (と、将来のパージ用に `Cache-Tag: island-<id>`) を設定するので、そちらがキャッシュされます。`GET /games/:gameId` (トップ) と `GET /games/:gameId/islands/:id` (観光) の HTML は引き続き `private, no-store` のままです (下記「KV スナップショットキャッシュ」節)。

この既定 no-store のミドルウェアは Node 版でも同じように動きますが、Node 版自体はキャッシュ層を持たないため実質無害です (必要ならリバースプロキシ側でキャッシュしてください)。

### 画像 (`packages/core/public/images/`) の長期キャッシュ

`packages/core/public/images/` の地形タイル画像 (gif) やロゴ (svg) は内容が変わらない固定名のファイルです。Workers Static Assets の既定は `Cache-Control: public, max-age=0, must-revalidate` (毎回再検証) のため、`packages/core/public/_headers` で `/images/*` だけ `Cache-Control: public, max-age=31536000, immutable` にしています (`style.css` と `owner.js` はデプロイで内容が変わるため既定のままです)。**画像を差し替える場合はファイル名を変えてください** (現状 Perl 版から引き継いだ固定名で、差し替えの予定が無いことを前提にした設定です)。`_headers` は Node 版には影響しません (Workers Static Assets 専用の仕組み)。

## KV スナップショットキャッシュ (Cloudflare Workers)

tmp/21-kv-snapshot-cache.md。未ログイン (セッション Cookie 無し) の `GET /games/:gameId` (トップ) と `GET /games/:gameId/islands/:id` (観光) は、DO への往復 (実測で 200ms 以上) を省くため、ページの View Model (DB から組み立てた `TopPageVM`/`IslandPageVM` の JSON。HTML そのものではない) を Workers KV (`env.SNAPSHOT`) に TTL 付きで保存し、Worker (`packages/cloudflare/src/worker.ts`) 側でレンダリングして応答します。HTML はキャッシュしないため、「次のターンまであと N 分」のような表示はリクエスト時刻で再計算され、キャッシュしても古くなりません。

- **対象外はすべて DO へ転送**: ログイン中 (Cookie に `hako` を含む)、POST、`/`、`/games`、開発画面、管理画面、OGP 画像などは従来どおり `HakoniwaGame` (DO) への HTTP 転送のままです。ログイン中のユーザーは常に DO から最新を見られるため、自分のコメント・記帳・島の発見は即座に反映されます。未ログインの閲覧だけが最大 TTL 分だけ古くなる可能性があります。
- **`env.SNAPSHOT` は省略可能**: 未バインドなら `worker.ts` は常に DO へ転送します (Node 版・KV 名前空間を作る前のデプロイ・テストに影響しません)。
- **レンダリングは Worker 側**: `@hakoniwajs/core` が公開する `renderTopPageHtml`/`renderIslandPageHtml` (`packages/core/src/web/render-snapshot.tsx`) が、DO 側の `routes/render.tsx` (`renderPage`) と同じ `Layout`/`TopPage`/`IslandPage` の JSX を `user`/`csrfToken` を `undefined` にして描画します。hono/jsx の要素から文字列を得る処理 (`resolveCallback`) は `c.html()` の内部実装と同じものを使っており、出力が一致することを `packages/cloudflare/test/snapshot-cache.test.ts` の「Worker が返す HTML と DO が返す HTML が一致する」テストで確認しています。
- **DO 側の RPC**: `HakoniwaGame.pageSnapshot({ kind, gameId, islandId? })` (`packages/cloudflare/src/game-object.ts`) が `{ kind, vm, nextTurnAt, ttl }` を返します (対象のゲーム/島が無ければ `undefined`)。`vm` の `terrain` は RPC 越しにクラスインスタンスのメソッドを渡せないため、`Terrain.toJSON()` (`number[][]`) にした形 (`IslandPageSnapshotVM`) で受け渡し、Worker 側で `terrainFromJSON` により復元します (`packages/cloudflare/src/snapshot.ts`)。
- **TTL は DO 側で決める**: キーにターン数は含めず (`v1:<gameId>:top` / `v1:<gameId>:island:<islandId>`)、invalidate 処理も作らずすべて TTL 任せです。過去のゲーム (`vm.game.isCurrent === false`) は記帳もできず完全に不変なので長期 TTL (既定 30 日、`HAKONIWA_SNAPSHOT_TTL_IMMUTABLE_SEC`)。現在のゲームでも終了済み (`season.state === 'finished'`) のトップは不変なので同じく長期。終了済みの島ページだけは掲示板の記帳が入りうるため短期 (既定 60 秒、`HAKONIWA_SNAPSHOT_TTL_SEC`。Workers KV の最小 TTL が 60 秒のためこれ未満は指定できない)。進行中/開始前のゲームは短期 TTL を基本に、次のターンまでの残り時間がそれより短ければそちらを優先します。
- **応答ヘッダ**: `Cache-Control` は HTML なので従来どおり `private, no-store` です。動作確認用に `X-Hakoniwa-Snapshot: hit`(KV から応答) `| miss`(DO から取得して KV に書いた) `| bypass`(DO への通常転送) を付けます。
- **運用上の注意**: 管理者がバックアップから過去のゲームのデータを復元すると、復元前にキャッシュされていたページが最大 TTL 分だけ古いまま見えることがあります (`docs/setup-guide.md` にも記載)。

## バックアップ

- **Node**: CLI の `backup list|create|restore|delete`、または管理画面の「バックアップ一覧」から、`HAKONIWA_BACKUP_DIR` (既定 `./data/backups`) 配下にファイルとしてバックアップを作成・復元・削除できます
- **Cloudflare Workers**: ファイルベースのバックアップの代わりに、SQLite backend の DO が持つ Point-in-Time Recovery のブックマークを使います。管理画面からの操作は Node 版と同じですが、`restore` は DO を再起動する (`ctx.abort()`) ため、実行後は「復元を予約しました。数秒後に再読み込みしてください」という案内になります

## npm への公開

`@hakoniwajs/core`・`@hakoniwajs/node`・`@hakoniwajs/cloudflare` の 3 パッケージを npm で配布しています。開発中は各パッケージの `exports` が `./src/index.ts` (TypeScript ソース) を指しますが、公開時は `publishConfig.exports` によりビルド済みの `dist/` (`.js` + `.d.ts`) に差し替わります。`dist` は `pnpm -r run build` (各パッケージの `tsc -p tsconfig.build.json`。packages/node は vite バンドル + `.d.ts` 生成) で生成します。

```sh
pnpm -r run build
pnpm -r publish --access public   # 各パッケージの publishConfig.access = public 済み
```

`workspace:*` 依存は publish 時に実バージョンへ自動で書き換えられます。

リリースは tagpr + npm publish を同一の `release` ワークフロー (`.github/workflows/release.yml`) で行っています。main への push ごとに tagpr がリリース PR を作成・更新し、その PR をマージすると tagpr がタグと GitHub Release を作り、同じ run 内で `pnpm -r publish` が実行されます (GITHUB_TOKEN で作られた Release は後続 workflow を起動しない GitHub の仕様のため、publish を同一ジョブに同居させています)。3 パッケージの `version` は tagpr が一括で更新します。

認証は npm Trusted Publishing (OIDC) で、NPM_TOKEN は不要です。npmjs.com 側で各パッケージの Trusted Publisher にこのリポジトリの `release.yml` を登録しておく必要があります (新規パッケージの初回公開は token または手動 publish が必要な場合があります)。publish だけ失敗した場合は Actions から `release` ワークフローを `workflow_dispatch` で既存タグを指定して再実行できます。

publish 成功後、同じジョブでテンプレートリポジトリ (既定 `hakoniwajs/template-cloudflare`、`vars.TEMPLATE_REPO` で変更可) の `@hakoniwajs/*` 依存を新バージョンに更新して push します (syumai/workers-go → syumai/workers のミラー同期と同じ構成)。GITHUB_TOKEN は他リポジトリへ push できないため、テンプレートリポジトリに発行した deploy key (書き込み可) の秘密鍵をこのリポジトリの `TEMPLATE_CLOUDFLARE_DEPLOY_KEY` secret に登録しておく必要があります (未設定のままリリースすると追従ステップが失敗します)。

## 設計書

実装の設計の詳細は `tmp/` (gitignore 対象。リポジトリのソースにのみ存在) の設計書にまとめています。
