# 箱庭諸島２

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/syumai/hakoniwa)

徳岡宏樹氏による Web ブラウザゲーム「箱庭諸島２」を、TypeScript (Node.js + Hono + `node:sqlite`) で書き直したものです。
ゲームロジックと HTTP 層をランタイムから独立させてあり、Node.js と Cloudflare Workers (Durable Objects SQLite) の両方で動かせる構成にしています。

プレイヤーは自分の島を発見し、開発計画 (整地、農場整備、ミサイル発射など) を登録します。
一定時間 (既定 6 時間) ごとにターンが進み、すべての島で計画の実行、人口の増減、災害、怪獣の出現などが処理されます。

このリポジトリは [neguse/hakoniwa](https://github.com/neguse/hakoniwa) の fork です。fork 元は、オリジナルの Perl スクリプトを UTF-8 化し、モジュール分割と Plack 対応を施して現代の Perl で動くようにしたものでした。本リポジトリではその Perl 版をもとに TypeScript へ移植し、Perl 版のコードは削除しています (履歴は git log で辿れます)。

## 機能

- **ゲーム本体**: オリジナル (箱庭諸島 ver2.3) のルールを移植しています。1 ユーザー 1 島です。
- **ログイン**: X (Twitter) / Discord / メール (マジックリンク) / 開発ログイン (ローカル開発・検証用) に対応しています ([better-auth](https://www.better-auth.com/) を使用)。管理画面から方法ごとに ON/OFF を切り替えられ、アカウント設定画面から複数の方法を同じアカウントに連携できます。
- **管理者**: メールアドレスを指定した特定のユーザーだけが管理画面 (`/admin`) を使えます。
- **NG ワード**: 島名・コメント・掲示板の投稿に含まれる不適切な語を拒否します。
- **シーズン**: 開始時刻、最終ターン (結果発表)、1 ターンの長さを設定できます。最終ターンに達するとゲームが終了し、以降は計画登録などができなくなります。
- **OGP 画像**: 島ページをシェアすると、島の地図を描画した PNG が OGP 画像として表示されます。
- **スマートフォン対応**: スマートフォンの画面幅でも入力欄や長い URL がはみ出さないようにしています。
- **2 つの実行環境**: Node.js (`node:sqlite`) と Cloudflare Workers (Durable Objects SQLite) のどちらでも同じゲームロジックで動きます。

## 構成

pnpm workspace によるモノレポです。パッケージ化しているのは差し替え単位となる Adapter だけで、ゲーム本体は 1 パッケージです。

| パッケージ                                             | 役割                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/game` (`@hakoniwa/game`)                     | ゲーム本体。ランタイム非依存で、Node や Cloudflare 固有の API を使いません。`core` (ゲームロジック)、`app` (ユースケース)、`storage` (SQLite 用ストレージ抽象)、`web` (Hono + hono/jsx の画面)、`bootstrap` (組み立て) と、画像や CSS などの `public` を含みます |
| `packages/server-node` (`@hakoniwa/server-node`)       | Node.js 向け Adapter。`node:sqlite` によるストレージ、HTTP サーバー、ファイルバックアップ、CLI                                                                                                                                                                   |
| `packages/server-workers` (`@hakoniwa/server-workers`) | Cloudflare Workers (Durable Objects SQLite) 向け Adapter。DO のストレージ、Cron Trigger によるターン進行、PITR バックアップ                                                                                                                                      |

## はじめ方 (Node でローカル開発)

### 必要なツール

Node.js、pnpm、[Vite+](https://viteplus.dev/) (`vp`) は [mise](https://mise.jdx.dev/) で管理しています。

```sh
mise install
mise exec -- vp install
```

シェルで mise を有効化していない場合は、以降のコマンドにも `mise exec -- ` を付けて実行してください。

### 環境変数の設定

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

### 起動と初期化

```sh
vp run dev
```

開発サーバーが http://localhost:5173/ で起動します。初回はデータが未初期化なので、次のいずれかで作成してください。

- `/login` を開き、開発ログインのフォームに任意のメールアドレス (`HAKONIWA_ADMIN_EMAILS` に指定したもの) を入力してログインし、`/admin` で「新しいデータを作る」(開始日時・最終ターン・1 ターンの長さを指定可能) を実行する
- CLI で初期化する: `vp run --filter ./packages/server-node cli -- db init`

データベースのスキーマ変更は、Node/Workers いずれも起動時に自動でマイグレーションされます。ただし初期のスキーマ (v1) で作られたデータベースファイルが残っている場合はスキーマに互換性が無いため、`vp run --filter ./packages/server-node cli -- db reset --yes` で一度削除してから初期化し直してください (`HAKONIWA_DB_PATH` を新しいパスにして作り直しても構いません)。

## 運用 (Node)

### ビルドと起動

```sh
vp run build
HAKONIWA_AUTH_SECRET=xxxx HAKONIWA_DEV_LOGIN=true HAKONIWA_ADMIN_EMAILS=you@example.com node packages/server-node/dist/server.js
```

`packages/server-node/dist/` にサーバー (`server.js`)、CLI (`cli.js`)、静的ファイルが生成されます。

### CLI

```sh
node packages/server-node/dist/cli.js --help
node packages/server-node/dist/cli.js db init          # データの新規作成
node packages/server-node/dist/cli.js db init --start-at 2026-10-01T21:00:00+09:00 --final-turn 100 --unit-time 3600
node packages/server-node/dist/cli.js db status        # ターン数、最終更新時刻、開始時刻、最終ターン、1ターンの長さ、状態、島数など
node packages/server-node/dist/cli.js db reset --yes    # 現役データを削除する (古いスキーマの DB を作り直す場合にも使う)
node packages/server-node/dist/cli.js turn check       # 期限が来ていればターンを進める (終了後は 0)
node packages/server-node/dist/cli.js turn advance     # 強制的に 1 ターン進める (終了後は何もしない)
node packages/server-node/dist/cli.js time set <unix|ISO8601>
node packages/server-node/dist/cli.js game set-final-turn <N|none>  # 最終ターン数の変更 (none で無期限に戻す)
node packages/server-node/dist/cli.js game set-unit-time <sec>      # 1ターンの長さ(秒)の変更 (次のターン境界から効く)
node packages/server-node/dist/cli.js backup list|create [label]|restore <label>|delete <label>
```

### ターン進行の仕組み

ターンは「最終更新時刻から 1 ターン分の時間が経過しているか」で判定します。判定はリクエスト時に行われるほか、Node サーバーでは `HAKONIWA_TURN_CHECK_INTERVAL_SEC` (既定 60 秒) 間隔のタイマーからも呼ばれるため、アクセスがなくてもターンが進みます。

### バックアップ

CLI の `backup list|create|restore|delete`、または管理画面の「バックアップ一覧」から、`HAKONIWA_BACKUP_DIR` (既定 `./data/backups`) 配下にファイルとしてバックアップを作成・復元・削除できます。

## Cloudflare Workers 版

`packages/server-workers` は Cloudflare Workers (Durable Objects の SQLite バックエンド) 向けの Adapter です。世界全体を 1 つの Durable Object (`HakoniwaGame`) に収め、`packages/game` が提供する Hono app をそのまま動かします。ゲームロジックやスキーマは Node 版と共通で、`SqlDriver`/`BackupStore` の実装だけが異なります。

Wrangler の設定はリポジトリ直下の `wrangler.jsonc` 1 つだけです (`main` は `packages/server-workers/src/worker.ts`、静的アセットは `packages/game/public` を指します)。`packages/server-workers` は workspace 依存の `@hakoniwa/game` を参照するため、Wrangler をそのパッケージ単体では完結させられず、リポジトリ全体を 1 つのデプロイ単位にしています。

[Cloudflare アカウント](https://dash.cloudflare.com/sign-up) が必要です。手動デプロイや `wrangler dev` を使う場合は `wrangler login` も必要です (ワンクリックデプロイはブラウザ上の GitHub 連携のみで完結し、ログインは不要です)。

### ワンクリックデプロイ (Deploy to Cloudflare ボタン)

デプロイ画面に表示される項目は、`wrangler.jsonc` の `vars` (環境変数) と `.dev.vars.example` (secret) から決まり、各項目の説明は `package.json` の `cloudflare.bindings` に書いてあります。デプロイ時に入力する secret は必須の `HAKONIWA_AUTH_SECRET` だけです。X / Discord / Resend の secret は任意なので、デプロイ後にダッシュボード (Settings → Variables and Secrets) か `wrangler secret put` で追加します。

一番手軽な方法です。

1. README 冒頭の「Deploy to Cloudflare」ボタンを押す
2. Cloudflare のダッシュボードに遷移するので、GitHub と連携してこのリポジトリを自分のアカウントにフォークする
3. 変数・secret の入力画面が出るので、最低限次の 2 つを入力する (他は空でもデプロイできる)
   - `HAKONIWA_AUTH_SECRET` (必須。`openssl rand -base64 32` などで生成したランダム文字列)
   - `HAKONIWA_ADMIN_EMAILS` (自分を管理者にするメールアドレス。X ログインはメールを返さないため、Discord かメールログインで使うアドレスを指定する)
4. デプロイを実行する
5. デプロイ完了後に表示される公開 URL (`https://<name>.<subdomain>.workers.dev` 形式) を確認する
6. X / Discord ログインを使いたい場合は、[X Developer Portal](https://developer.x.com/) / [Discord Developer Portal](https://discord.com/developers/applications) でアプリを作成し、コールバック URL に `https://あなたのWorkerのURL/api/auth/callback/twitter` または `.../callback/discord` を登録した上で、Cloudflare ダッシュボードの当該 Worker の Settings → Variables and Secrets から `HAKONIWA_X_CLIENT_ID`/`HAKONIWA_X_CLIENT_SECRET` や `HAKONIWA_DISCORD_CLIENT_ID`/`HAKONIWA_DISCORD_CLIENT_SECRET` を追加する (Secret として登録する)
7. 公開 URL の `/login` から、手順 3 で指定した `HAKONIWA_ADMIN_EMAILS` のメールアドレスでログインする (開発ログインは本番では無効)。Discord や Resend をまだ設定していない場合は「メールでログイン」を使う。Resend 未設定のときはメールは送られず、ログイン用リンクが Worker のログに出力されるので、ダッシュボードの当該 Worker の Logs (リアルタイムログ) か `wrangler tail` でリンクを確認して開く
8. `/admin` に入り、「新しいデータを作る」でゲームを初期化し、必要なログイン方法を有効化する

`HAKONIWA_BASE_URL` はここでは設定不要です (未設定ならリクエストから自動判定されます)。カスタムドメインを使う場合だけ、あとから Variables and Secrets に追加してください。

### 手動デプロイ

```sh
wrangler login
wrangler secret put HAKONIWA_AUTH_SECRET
wrangler secret put HAKONIWA_X_CLIENT_ID
wrangler secret put HAKONIWA_X_CLIENT_SECRET
wrangler secret put HAKONIWA_DISCORD_CLIENT_ID
wrangler secret put HAKONIWA_DISCORD_CLIENT_SECRET
wrangler secret put HAKONIWA_RESEND_API_KEY
pnpm deploy
```

コマンドはすべてリポジトリ直下 (root) から実行してください (`wrangler.jsonc` が root にあるため)。`pnpm deploy` は root `package.json` の `deploy` スクリプト (`wrangler deploy`) です。`wrangler.jsonc` の `name` は必要に応じて自分の Workers サブドメインに合わせて書き換えてください。

非秘密の設定 (`HAKONIWA_UNIT_TIME_SEC`、`HAKONIWA_ADMIN_EMAILS` 等) は `wrangler.jsonc` の `vars` に書きます。`HAKONIWA_DEV_LOGIN` は本番の `vars` では必ず `false` のままにしてください。`HAKONIWA_BASE_URL` は通常不要です (カスタムドメイン時のみ `vars` に追加してください)。

### ローカル開発 (`wrangler dev`)

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

初回のデータ作成手順は Node 版と同じです (`/login` から開発ログイン → `/admin` で「新しいデータを作る」)。ローカルの DO の状態は `.wrangler/state` (リポジトリ直下) に保存されます (git 管理外)。

### ターン進行の仕組み (Cron Trigger)

Node 版のタイマーの代わりに、`wrangler.jsonc` の `triggers.crons` (既定 `*/15 * * * *`、15 分ごと) から Worker の `scheduled` ハンドラが呼ばれ、DO の RPC `checkTurn()` (`turnService.advanceTurnIfDue`) を実行します。実際にターンを進めるべきかどうかは DB に保存された1ターンの長さ (初期化時に `HAKONIWA_UNIT_TIME_SEC` で決まり、以後は管理画面/CLI で変更できる) と最終更新時刻から判定するため、Cron 側は境界を意識しません。ターン境界と Cron 間隔の差 (最大 15 分) だけ進行が遅れますが、リクエストごとの遅延判定 (turn-check ミドルウェア) も併存するのでアクセスがあればその時点で進みます。ローカルの `wrangler dev` では Cron は自動発火しないため、手動で `curl http://localhost:8787/cdn-cgi/local/scheduled` を叩いて試せます。

### Workers Cache (OGP 画像のキャッシュ)

島の URL (`/islands/:id`) を X や Discord、Slack 等でシェアすると、`GET /islands/:id/ogp.png` (800×420 PNG) の地図画像が OGP (`og:image`) として表示されます。地図は観光者向けの表示 (基地→森、海底基地→海、ハリボテ→防衛施設に見える偽装ルールを含む) をそのまま敷き詰めたもので、文字は描画しません (島名やターン・人口・面積・順位は `og:title`/`og:description` に載せます)。画像 URL には現在ターンの `?turn=N` が付き、ターンが進むと URL が変わるため、SNS 側のキャッシュも新しい地図に更新されます。画像は外部サービスやネイティブライブラリを使わず、`packages/game/src/ogp/` の純粋な TypeScript (自前の PNG エンコーダ + 事前生成したタイル画像データ) で毎回組み立てます。`GET /islands/:id/ogp.png` のレスポンスは `Cache-Control: public, max-age=3600` (1 時間) を返します。

Cloudflare Workers 版は、自前で Cache API (`caches.default`) を呼ぶ実装は持たず、代わりに [Workers Cache](https://developers.cloudflare.com/workers/cache/) (`wrangler.jsonc` の `cache.enabled: true`) を使います。これは応答の `Cache-Control` に従って Cloudflare 側が自動でキャッシュする機能で、**`*.workers.dev` のデフォルトドメインでも有効**です (Cache API と違いカスタムドメインは不要)。

Workers Cache は `Cache-Control` の無い応答も RFC 9111 のヒューリスティックでキャッシュしてしまい、しかも Cookie 付きリクエストをバイパスしません (バイパス対象は `Set-Cookie` を含む応答と `Authorization` 付きリクエストのみ)。そのため、セッション依存の HTML (`/api/auth/*` の better-auth の応答を含む) が他人に配信されてしまわないよう、`packages/game/src/web/app.tsx` の `defaultCacheControlMiddleware` が **すべての応答に既定で `Cache-Control: private, no-store` を付け**、ルートが明示的に `Cache-Control` を設定している場合だけそちらを優先します。`GET /islands/:id/ogp.png` は自身で `public, max-age=3600` (と、将来のパージ用に `Cache-Tag: island-<id>`) を設定するので、そちらがキャッシュされます。

この既定 no-store のミドルウェアは Node 版でも同じように動きますが、Node 版自体はキャッシュ層を持たないため実質無害です (必要ならリバースプロキシ側でキャッシュしてください)。

### バックアップ (PITR)

ファイルベースのバックアップの代わりに、SQLite backend の DO が持つ Point-in-Time Recovery のブックマークを使います。管理画面からの操作は Node 版と同じですが、`restore` は DO を再起動する (`ctx.abort()`) ため、実行後は「復元を予約しました。数秒後に再読み込みしてください」という案内になります。

## 環境変数

`packages/game/src/bootstrap/config-from-env.ts` (ゲーム本体・両ランタイム共通) と `packages/server-node/src/config.ts` (Node 固有) の一覧です。Node では `.env` (または環境変数) に、Workers では `wrangler.jsonc` の `vars` か `wrangler secret put` (secret) に設定します。

| 環境変数                                                        | 既定値                                    | 用途                                                                                                                                                                    | Node | Workers                     |
| --------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: | --------------------------- |
| `HAKONIWA_AUTH_SECRET`                                          | (なし、**必須**)                          | better-auth の secret と CSRF トークンの鍵。`openssl rand -base64 32` 等                                                                                                |  ○   | secret (必須)               |
| `HAKONIWA_BASE_URL`                                             | (なし = リクエストのオリジンから自動判定) | better-auth の baseURL。OAuth コールバックと Origin 検査に使う。通常は不要。カスタムドメインや逆プロキシ配下で明示したいときだけ設定する                                |  ○   | vars (通常不要)             |
| `HAKONIWA_X_CLIENT_ID` / `HAKONIWA_X_CLIENT_SECRET`             | (なし)                                    | 両方設定すると X (Twitter) ログインが有効になる                                                                                                                         |  ○   | secret                      |
| `HAKONIWA_DISCORD_CLIENT_ID` / `HAKONIWA_DISCORD_CLIENT_SECRET` | (なし)                                    | 両方設定すると Discord ログインが有効になる                                                                                                                             |  ○   | secret                      |
| `HAKONIWA_DEV_LOGIN`                                            | `false`                                   | `true` で開発ログイン (任意のメールアドレスでログイン) を有効化。本番では必ず `false`                                                                                   |  ○   | vars                        |
| `HAKONIWA_ADMIN_EMAILS`                                         | (なし)                                    | 管理者とみなすメールアドレス (カンマ区切り)                                                                                                                             |  ○   | vars                        |
| `HAKONIWA_RESEND_API_KEY`                                       | (なし)                                    | メール送信 (Resend)。未設定ならコンソール/ログにリンクを出力するだけの開発用 Mailer                                                                                     |  ○   | secret                      |
| `HAKONIWA_MAIL_FROM`                                            | `hakoniwa@example.com`                    | メールの送信元アドレス                                                                                                                                                  |  ○   | vars                        |
| `HAKONIWA_NG_WORDS`                                             | (なし)                                    | 追加の NG ワード (カンマ区切り)                                                                                                                                         |  ○   | vars                        |
| `HAKONIWA_DEBUG`                                                | `false`                                   | `true` でトップに「ターンを進める」ボタンを表示 (管理者ログイン必須)                                                                                                    |  ○   | vars                        |
| `HAKONIWA_ADMIN_ENABLED`                                        | `true`                                    | 管理画面 (`/admin`) の有効 / 無効                                                                                                                                       |  ○   | vars                        |
| `HAKONIWA_USE_LBBS`                                             | `false`                                   | 島ごとのローカル掲示板の有効 / 無効                                                                                                                                     |  ○   | vars                        |
| `HAKONIWA_UNIT_TIME_SEC`                                        | `21600`                                   | 新しいデータを作るときの1ターンの長さ (秒) の既定値。以後は管理画面「ゲーム設定」/ CLI `game set-unit-time` で変更する (この環境変数を変えても既存データには影響しない) |  ○   | vars                        |
| `HAKONIWA_MAX_CATCH_UP_TURNS`                                   | `1`                                       | 1 回の判定で進める最大ターン数 (Workers 版は Cron が 15 分間隔のため `wrangler.jsonc` では既定 `3`)                                                                     |  ○   | vars                        |
| `HAKONIWA_SITE_TITLE`                                           | `箱庭諸島２`                              | サイトタイトル                                                                                                                                                          |  ○   | vars                        |
| `HAKONIWA_ADMIN_NAME`                                           | (なし)                                    | フッタの管理者名。未設定ならフッタに表示しない                                                                                                                          |  ○   | vars                        |
| `HAKONIWA_EMAIL`                                                | (なし)                                    | フッタの連絡先。未設定ならフッタに表示しない                                                                                                                            |  ○   | vars                        |
| `HAKONIWA_BBS_URL`                                              | (なし)                                    | フッタの掲示板リンク。未設定ならフッタに表示しない                                                                                                                      |  ○   | vars                        |
| `HAKONIWA_TOPPAGE_URL`                                          | (なし)                                    | フッタのトップページリンク。未設定ならフッタに表示しない                                                                                                                |  ○   | vars                        |
| `HAKONIWA_START_AT`                                             | (なし)                                    | ターン1が始まる開始日時 (ISO 8601)。管理画面の初期化フォームと CLI `db init` の既定値。未設定なら初期化時の現在時刻を切り下げた時刻を使う                               |  ○   | vars                        |
| `HAKONIWA_FINAL_TURN`                                           | (なし)                                    | 最終ターン数 (正の整数)。管理画面の初期化フォームと CLI `db init` の既定値。未設定なら無期限                                                                            |  ○   | vars                        |
| `HAKONIWA_TIMEZONE`                                             | `Asia/Tokyo`                              | datetime-local の解釈と日時表示に使う IANA タイムゾーン名                                                                                                               |  ○   | vars                        |
| `PORT`                                                          | `3000`                                    | サーバーの待受ポート                                                                                                                                                    |  ○   | - (Workers は不要)          |
| `HAKONIWA_DB_PATH`                                              | `./data/hakoniwa.sqlite`                  | SQLite データベースファイル                                                                                                                                             |  ○   | - (DO の SQLite ストレージ) |
| `HAKONIWA_BACKUP_DIR`                                           | `./data/backups`                          | バックアップの出力先                                                                                                                                                    |  ○   | - (PITR を使う)             |
| `HAKONIWA_TURN_CHECK_INTERVAL_SEC`                              | `60`                                      | ターン進行判定のタイマー間隔 (秒)。`0` で無効                                                                                                                           |  ○   | - (Cron Trigger を使う)     |

最終ターンを設定すると、そのターンの処理が終わった時点でゲームが終了し、以降はターンが進まなくなります (管理画面の「ゲーム設定」または CLI `game set-final-turn` でいつでも変更・解除できます)。終了後もトップと観光・開発画面は閲覧でき、掲示板への記帳もできますが、計画登録・コメント更新・名前変更・新しい島の作成はできなくなります。

## 管理画面の機能一覧 (`/admin`)

- **データ作成・削除**: 「新しいデータを作る」(開始日時・最終ターン・1 ターンの長さを指定可能) / 「このデータを削除」
- **最終更新時刻の変更**: 日時指定 (datetime-local) または unix 秒指定
- **ゲーム設定**: 最終ターン数の変更 (空欄で無期限)、1 ターンの長さの変更 (次のターン境界から反映)
- **ターンを進める**: `HAKONIWA_DEBUG=true` のときにトップページにも表示される、手動でのターン進行 (管理者ログイン必須)
- **ログイン方法の ON/OFF**: X / Discord / メールをそれぞれ有効化・無効化 (環境変数で未設定の方法は選べない)
- **資金・食料の最大化**: 島を選んで資金・食料を最大値にする
- **バックアップ**: 一覧表示、作成 (ラベル指定可)、現役データへの復元、削除 (Node はファイル、Workers は PITR)

## 開発

```sh
vp test    # Vitest (packages/server-workers 以外)
vp check   # フォーマット、lint、型チェック (packages/server-workers を含む全パッケージ)
vp fmt     # フォーマットの自動修正
```

`packages/server-workers` のテストは `@cloudflare/vitest-pool-workers` (workerd 上で実行する Vitest プール) を使っていますが、`vp test` が内蔵する vitest ランナーとは別インスタンスのため `vp test` の集約実行には乗らず、`vite.config.ts` の `test.projects` から明示的に除外しています。単体では次のコマンドで実行できます。

```sh
pnpm --filter @hakoniwa/server-workers test
```

OGP 画像のタイル画像データ (`packages/game/src/ogp/`) は事前生成したものをコミットしています。元画像 (`packages/game/public/images`) を差し替えた場合は、次のコマンドで再生成してください。

```sh
pnpm --filter @hakoniwa/game generate:ogp-tiles
```

設計の詳細は `tmp/` (gitignore 対象) の設計書にまとめています。

## ライセンス

このリポジトリはオリジナルの「箱庭諸島２」の利用条件に従います。素晴らしいゲームを作られた原作者の方々、および Perl 版を現代の環境で動くよう整備してくださった fork 元 ([neguse/hakoniwa](https://github.com/neguse/hakoniwa)) の作者に感謝します。

- 字: 徳岡宏樹
- 絵: 小川克人
- 題字: 稲葉修吾
- テストプレイ他協力: 井上友博、小澤武史、さかもと、ほえほえ、ありづか

### スクリプトについて

オリジナルの readme (`hako-readme.txt` に同梱) では、改変版を配布する際の条件として次を定めています。

- 無料で配布すること
- ゲーム画面の最上部にある、スクリプト配布元 (http://www.bekkoame.ne.jp/~tokuoka/hakoniwa.html) へのリンクを消さないこと。それ以外の改造は自由
- 改変版も同じ条件で再配布を許可すること
- 配布ページに、オリジナルの配布元へのリンクを置くこと

この移植版でも画面最上部の配布元リンクは維持しています。なお原作者のサイトは現在アクセスできないため、最後の条件は実質的に満たせない状態です。

### 画像について

同梱の画像 (`packages/game/public/images`) は小川克人氏の著作物です。原作者サイトのアーカイブにある FAQ によれば、その後の許諾により「商用でない限り、箱庭諸島以外の用途でも配布・改変可」とされています。商用利用はできません。何か問題が起きても画像の原作者は関知しない、とのことです。

## 参考にしたサイト

- 再配布: [箱庭諸島の保管庫](http://www.hakoniwa.net/hako/)、[箱庭なページ](http://hako.gob.jp/)、[Neo-INO](http://neo-sub.sakura.ne.jp/ino/hako/download.html)
- 解説: [箱庭解体新書](http://qqmh3psd.web.fc2.com/sadoga/)
- 原作者サイトのアーカイブ: [Wayback Machine](https://web.archive.org/web/20070113153728/http://t.pos.to/hako/)
