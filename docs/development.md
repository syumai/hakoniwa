# 開発者向けドキュメント

箱庭諸島２ (TypeScript 版) の開発に参加する方向けのドキュメントです。自分の環境へのデプロイ・設置だけが目的の場合は [設置ガイド](setup-guide.md) を参照してください。

## 構成

pnpm workspace によるモノレポです。パッケージ化しているのは差し替え単位となる Adapter だけで、ゲーム本体は 1 パッケージです。

| パッケージ                                             | 役割                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/game` (`@hakoniwa/game`)                     | ゲーム本体。ランタイム非依存で、Node や Cloudflare 固有の API を使いません。`core` (ゲームロジック)、`app` (ユースケース)、`storage` (SQLite 用ストレージ抽象)、`web` (Hono + hono/jsx の画面)、`bootstrap` (組み立て) と、画像や CSS などの `public` を含みます |
| `packages/server-node` (`@hakoniwa/server-node`)       | Node.js 向け Adapter。`node:sqlite` によるストレージ、HTTP サーバー、ファイルバックアップ、CLI                                                                                                                                                                   |
| `packages/server-workers` (`@hakoniwa/server-workers`) | Cloudflare Workers (Durable Objects SQLite) 向け Adapter。DO のストレージ、Cron Trigger によるターン進行、PITR バックアップ                                                                                                                                      |

`packages/game` 内の層は依存方向が一方向になるよう分けています。

- `core`: ゲームロジック本体。上位層にも Hono にも依存しません
- `app`: ユースケース (サービス層)。`core` を組み合わせてリクエスト単位の処理を組み立てます
- `storage`: SQLite 用のストレージ抽象 (スキーマ、リポジトリ IF)。`node:sqlite` などランタイム固有の実装は `SqlDriver` として Adapter 側から差し込みます
- `web`: Hono + hono/jsx によるルーティングと画面
- `bootstrap`: 上記を組み立てて `app`/`web` を構成する層。環境変数の読み込み (`config-from-env.ts`) もここに含まれます

`packages/server-node`・`packages/server-workers` は `SqlDriver`/`BackupStore` などランタイム固有の実装だけを持ち、ゲームロジックやスキーマは共通です。

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
- CLI で開始する: `vp run --filter ./packages/server-node cli -- db init` (`game new` のエイリアス)

ゲームが終了したら (最終ターン到達、または管理画面の「このゲームを終了する」)、管理画面や CLI (`game new`) から次のゲームを開始できます。過去のゲームは `/games` から一覧・閲覧できます (読み取り専用。再開はできません)。

データベースのスキーマ変更は、Node/Workers いずれも起動時に自動でマイグレーションされます。ただし初期のスキーマ (v1) で作られたデータベースファイルが残っている場合はスキーマに互換性が無いため、`vp run --filter ./packages/server-node cli -- db reset --yes` で一度削除してから初期化し直してください (`HAKONIWA_DB_PATH` を新しいパスにして作り直しても構いません)。

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
pnpm --filter @hakoniwa/server-workers dev
# もしくは
cd packages/server-workers && vp run dev   # = wrangler dev --config ../../wrangler.jsonc
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

```sh
node packages/server-node/dist/cli.js --help
node packages/server-node/dist/cli.js db init          # ゲームが無いときだけ新しいゲームを開始する (game new のエイリアス)
node packages/server-node/dist/cli.js db init --start-at 2026-10-01T21:00:00+09:00 --final-turn 100 --unit-time 6h30m
node packages/server-node/dist/cli.js db status        # 現在のゲーム名・状態・ターン数・最終更新時刻・開始時刻・最終ターン・1ターンの長さ・状態・島数・過去のゲーム数など
node packages/server-node/dist/cli.js db reset --yes    # 全ゲームを削除する (古いスキーマの DB を作り直す場合にも使う)
node packages/server-node/dist/cli.js turn check       # 期限が来ていればターンを進める (終了後は 0)
node packages/server-node/dist/cli.js turn advance     # 強制的に 1 ターン進める (終了後は何もしない)
node packages/server-node/dist/cli.js time set <unix|ISO8601>
node packages/server-node/dist/cli.js game new         # 新しいゲームを開始する (現在のゲームが running なら失敗)
node packages/server-node/dist/cli.js game new --name 第2回 --start-at 2026-10-01T21:00:00+09:00 --final-turn 100 --unit-time 6h30m
node packages/server-node/dist/cli.js game finish      # 現在のゲームを終了する (running でなければ失敗)
node packages/server-node/dist/cli.js game list        # ゲーム一覧 (現在 + 過去) を表示する
node packages/server-node/dist/cli.js game set-final-turn <N|none>  # 現在のゲームの最終ターン数の変更 (none で無期限に戻す)
node packages/server-node/dist/cli.js game set-unit-time <値>       # 現在のゲームの1ターンの長さの変更 (次のターン境界から効く。6h/90m/1h30m/3600 (数字のみは秒) を受け付ける)
node packages/server-node/dist/cli.js backup list|create [label]|restore <label>|delete <label>
```

ローカル開発では `vp run --filter ./packages/server-node cli -- <command>` でビルド無しに実行できます。

## テストと静的検査

```sh
vp test    # Vitest (packages/server-workers 以外)
vp check   # フォーマット、lint、型チェック (packages/server-workers を含む全パッケージ)
vp fmt     # フォーマットの自動修正
```

`packages/server-workers` のテストは `@cloudflare/vitest-pool-workers` (workerd 上で実行する Vitest プール) を使っていますが、`vp test` が内蔵する vitest ランナーとは別インスタンスのため `vp test` の集約実行には乗らず、`vite.config.ts` の `test.projects` から明示的に除外しています。単体では次のコマンドで実行できます。

```sh
pnpm --filter @hakoniwa/server-workers test
```

## OGP タイル画像の生成

OGP 画像のタイル画像データ (`packages/game/src/ogp/`) は事前生成したものをコミットしています。元画像 (`packages/game/public/images`) を差し替えた場合は、次のコマンドで再生成してください。

```sh
pnpm --filter @hakoniwa/game generate:ogp-tiles
```

## ターン進行の仕組み

ターンは「最終更新時刻から 1 ターン分の時間が経過しているか」で判定します (`TurnService.advanceTurnIfDue`)。この判定をいつ呼ぶか (トリガー) は Adapter ごとに異なり、`buildDeps` の `turnCheckOnRequest: boolean` (必須。Adapter が明示する) で切り替えます。`turnCheckOnRequest: false` の場合、`createApp` はリクエスト時の turn-check ミドルウェア自体を登録しません。

- **Node サーバー**: `turnCheckOnRequest: true` (既定。`HAKONIWA_TURN_CHECK_ON_REQUEST` で変更可能)。リクエスト時のミドルウェアに加えて、`HAKONIWA_TURN_CHECK_INTERVAL_SEC` (既定 60 秒) 間隔のタイマーからも判定されるため、アクセスがなくてもターンが進みます
- **Cloudflare Workers**: `turnCheckOnRequest: false` (`packages/server-workers/src/game-object.ts` で固定。環境変数での変更は不可)。ターン進行のトリガーを `wrangler.jsonc` の `triggers.crons` (既定 `*/15 * * * *`、15 分ごと) だけに限定しています。Worker の `scheduled` ハンドラから DO の RPC `checkTurn()` (`turnService.advanceTurnIfDue`) を実行し、アクセス (GET/POST) だけではターンが進みません。実際にターンを進めるべきかどうかは DB に保存された1ターンの長さ (初期化時に `HAKONIWA_UNIT_TIME_SEC` で決まり、以後は管理画面/CLI で変更できる) と最終更新時刻から判定するため、Cron 側は境界を意識しません。ターン境界と Cron 間隔の差 (最大 15 分) だけ進行が遅れます。ローカルの `wrangler dev` では Cron は自動発火しないため、手動で `curl http://localhost:8787/cdn-cgi/local/scheduled` を叩いて試せます

## 島の放棄

開発画面の「島を放棄する」(`POST /games/:gameId/my-island/abandon`) から、自分の島を放棄して新しい島を探しに行けます。放棄すると `islands.abandoned_at` が記録され、町のヘックスは荒地に、計画はすべて資金繰りに戻ります。所有判定 (`findIslandByOwner`) は放棄されていない島だけを返すため、放棄直後から新しい島を作成できます。放棄島はターン処理の収入・計画・成長・災害の各フェーズをスキップし、ターン末の死滅判定で除去されます (除去時のログは通常の死滅ではなく「放棄され、無人島になりました」)。放棄回数は `GameConfig.maxAbandonsPerGame` (既定 3) までで、`abandonments` 表に (game_id, user_id) ごとに記録が残ります (放棄島がターン末に削除されても記録は残ります)。

## Workers Cache と `no-store` の方針

島の URL (`/games/:gameId/islands/:id`) を X や Discord、Slack 等でシェアすると、`GET /games/:gameId/islands/:id/ogp.png` (800×420 PNG) の地図画像が OGP (`og:image`) として表示されます。地図は観光者向けの表示 (基地→森、海底基地→海、ハリボテ→防衛施設に見える偽装ルールを含む) をそのまま敷き詰めたもので、文字は描画しません (島名やターン・人口・面積・順位は `og:title`/`og:description` に載せます)。画像は外部サービスやネイティブライブラリを使わず、`packages/game/src/ogp/` の純粋な TypeScript (自前の PNG エンコーダ + 事前生成したタイル画像データ) で毎回組み立てます。`GET /islands/:id/ogp.png` のレスポンスは `Cache-Control: public, max-age=3600` (1 時間) を返します。

Cloudflare Workers 版は、自前で Cache API (`caches.default`) を呼ぶ実装は持たず、代わりに [Workers Cache](https://developers.cloudflare.com/workers/cache/) (`wrangler.jsonc` の `cache.enabled: true`) を使います。これは応答の `Cache-Control` に従って Cloudflare 側が自動でキャッシュする機能で、**`*.workers.dev` のデフォルトドメインでも有効**です (Cache API と違いカスタムドメインは不要)。

Workers Cache は `Cache-Control` の無い応答も RFC 9111 のヒューリスティックでキャッシュしてしまい、しかも Cookie 付きリクエストをバイパスしません (バイパス対象は `Set-Cookie` を含む応答と `Authorization` 付きリクエストのみ)。そのため、セッション依存の HTML (`/api/auth/*` の better-auth の応答を含む) が他人に配信されてしまわないよう、`packages/game/src/web/app.tsx` の `defaultCacheControlMiddleware` が **すべての応答に既定で `Cache-Control: private, no-store` を付け**、ルートが明示的に `Cache-Control` を設定している場合だけそちらを優先します。`GET /games/:gameId/islands/:id/ogp.png` は自身で `public, max-age=3600` (と、将来のパージ用に `Cache-Tag: island-<id>`) を設定するので、そちらがキャッシュされます。

この既定 no-store のミドルウェアは Node 版でも同じように動きますが、Node 版自体はキャッシュ層を持たないため実質無害です (必要ならリバースプロキシ側でキャッシュしてください)。

## バックアップ

- **Node**: CLI の `backup list|create|restore|delete`、または管理画面の「バックアップ一覧」から、`HAKONIWA_BACKUP_DIR` (既定 `./data/backups`) 配下にファイルとしてバックアップを作成・復元・削除できます
- **Cloudflare Workers**: ファイルベースのバックアップの代わりに、SQLite backend の DO が持つ Point-in-Time Recovery のブックマークを使います。管理画面からの操作は Node 版と同じですが、`restore` は DO を再起動する (`ctx.abort()`) ため、実行後は「復元を予約しました。数秒後に再読み込みしてください」という案内になります

## 設計書

実装の設計の詳細は `tmp/` (gitignore 対象。リポジトリのソースにのみ存在) の設計書にまとめています。
