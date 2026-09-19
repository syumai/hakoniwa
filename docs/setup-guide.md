# 設置ガイド

箱庭諸島２ (TypeScript 版) を自分の環境にデプロイ・設置する方法です。開発に参加する場合は [開発者向けドキュメント](development.md) を参照してください。

## 1. Cloudflare Workers にワンクリックでデプロイ

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/syumai/hakoniwa)

一番手軽な方法です。[Cloudflare アカウント](https://dash.cloudflare.com/sign-up) が必要です (ワンクリックデプロイはブラウザ上の GitHub 連携のみで完結し、ログインは不要です)。

デプロイ画面に表示される入力項目は、`wrangler.jsonc` の `vars` (環境変数) と `.dev.vars.example` (secret) から決まり、各項目の説明は `package.json` の `cloudflare.bindings` に書いてあります。デプロイ時に入力する secret は必須の `HAKONIWA_AUTH_SECRET` だけです。X / Discord / Resend の secret は任意なので、デプロイ後にダッシュボード (Settings → Variables and Secrets) か `wrangler secret put` で追加します。

1. 上のボタンを押す
2. Cloudflare のダッシュボードに遷移するので、GitHub と連携してこのリポジトリを自分のアカウントにフォークする
3. 変数・secret の入力画面が出るので、最低限次の 2 つを入力する (他は空でもデプロイできる)
   - `HAKONIWA_AUTH_SECRET` (必須。`openssl rand -base64 32` などで生成したランダム文字列)
   - `HAKONIWA_ADMIN_EMAILS` (自分を管理者にするメールアドレス。X ログインはメールを返さないため、Discord かメールログインで使うアドレスを指定する)
4. デプロイを実行する
5. デプロイ完了後に表示される公開 URL (`https://<name>.<subdomain>.workers.dev` 形式) を確認する
6. X / Discord ログインを使いたい場合は、[X Developer Portal](https://developer.x.com/) / [Discord Developer Portal](https://discord.com/developers/applications) でアプリを作成し、コールバック URL に `https://あなたのWorkerのURL/api/auth/callback/twitter` または `.../callback/discord` を登録した上で、Cloudflare ダッシュボードの当該 Worker の Settings → Variables and Secrets から `HAKONIWA_X_CLIENT_ID`/`HAKONIWA_X_CLIENT_SECRET` や `HAKONIWA_DISCORD_CLIENT_ID`/`HAKONIWA_DISCORD_CLIENT_SECRET` を追加する (Secret として登録する)
7. 公開 URL の `/login` から、手順 3 で指定した `HAKONIWA_ADMIN_EMAILS` のメールアドレスでログインする (開発ログインは本番では無効)。Discord や Resend をまだ設定していない場合は「メールでログイン」を使う。Resend 未設定のときはメールは送られず、ログイン用リンクが Worker のログに出力されるので、ダッシュボードの当該 Worker の Logs (リアルタイムログ) か `wrangler tail` でリンクを確認して開く
8. `/admin` に入り、「新しいゲームを開始」でゲームを開始し、必要なログイン方法を有効化する

`HAKONIWA_BASE_URL` はここでは設定不要です (未設定ならリクエストから自動判定されます)。カスタムドメインを使う場合だけ、あとから Variables and Secrets に追加してください。

## 2. Cloudflare Workers への手動デプロイ

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

非秘密の設定 (`HAKONIWA_UNIT_TIME_SEC`、`HAKONIWA_ADMIN_EMAILS` 等) は `wrangler.jsonc` の `vars` に書きます。`HAKONIWA_DEV_LOGIN` は本番の `vars` では必ず `false` のままにしてください。

カスタムドメインを使う場合は `HAKONIWA_BASE_URL` を `vars` に追加してください (通常は不要。未設定ならリクエストのオリジンから自動判定されます)。

## 3. Node.js で自前のサーバーに設置

Node.js 24 以降 (`node:sqlite` を使用) と pnpm が必要です。

```sh
pnpm install
pnpm run build
HAKONIWA_AUTH_SECRET=xxxx HAKONIWA_ADMIN_EMAILS=you@example.com node packages/server-node/dist/server.js
```

`packages/server-node/dist/` にサーバー (`server.js`)、CLI (`cli.js`)、静的ファイルが生成されます。少なくとも `HAKONIWA_AUTH_SECRET` (`openssl rand -base64 32` などで生成した 32 バイト以上のランダム文字列) の設定が必須です。管理画面 (`/admin`) を使うには `HAKONIWA_ADMIN_EMAILS` も設定してください。設定できる環境変数の一覧は次節を参照してください。

サーバー自体は HTTPS を扱いません。外部に公開する場合は nginx や Caddy などのリバースプロキシを前段に置いて HTTPS 終端してください。カスタムドメインや逆プロキシ配下で動かす場合は `HAKONIWA_BASE_URL` を設定してください。

初回のゲーム開始やバックアップなどの運用は CLI (`node packages/server-node/dist/cli.js`) から行います。コマンドの一覧は [開発者向けドキュメント](development.md#cli-一覧) を参照してください。

## 4. 環境変数一覧

`packages/game/src/bootstrap/config-from-env.ts` (ゲーム本体・両ランタイム共通) と `packages/server-node/src/config.ts` (Node 固有) の一覧です。Node では `.env` (または環境変数) に、Workers では `wrangler.jsonc` の `vars` か `wrangler secret put` (secret) に設定します。

| 環境変数                                                        | 既定値                                    | 用途                                                                                                                                                                                                                                                                  | Node | Workers                     |
| --------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: | --------------------------- |
| `HAKONIWA_AUTH_SECRET`                                          | (なし、**必須**)                          | better-auth の secret と CSRF トークンの鍵。`openssl rand -base64 32` 等                                                                                                                                                                                              |  ○   | secret (必須)               |
| `HAKONIWA_BASE_URL`                                             | (なし = リクエストのオリジンから自動判定) | better-auth の baseURL。OAuth コールバックと Origin 検査に使う。通常は不要。カスタムドメインや逆プロキシ配下で明示したいときだけ設定する                                                                                                                              |  ○   | vars (通常不要)             |
| `HAKONIWA_X_CLIENT_ID` / `HAKONIWA_X_CLIENT_SECRET`             | (なし)                                    | 両方設定すると X (Twitter) ログインが有効になる                                                                                                                                                                                                                       |  ○   | secret                      |
| `HAKONIWA_DISCORD_CLIENT_ID` / `HAKONIWA_DISCORD_CLIENT_SECRET` | (なし)                                    | 両方設定すると Discord ログインが有効になる                                                                                                                                                                                                                           |  ○   | secret                      |
| `HAKONIWA_DEV_LOGIN`                                            | `false`                                   | `true` で開発ログイン (任意のメールアドレスでログイン) を有効化。本番では必ず `false`                                                                                                                                                                                 |  ○   | vars                        |
| `HAKONIWA_ADMIN_EMAILS`                                         | (なし)                                    | 管理者とみなすメールアドレス (カンマ区切り)                                                                                                                                                                                                                           |  ○   | vars                        |
| `HAKONIWA_RESEND_API_KEY`                                       | (なし)                                    | メール送信 (Resend)。未設定ならコンソール/ログにリンクを出力するだけの開発用 Mailer                                                                                                                                                                                   |  ○   | secret                      |
| `HAKONIWA_MAIL_FROM`                                            | `hakoniwa@example.com`                    | メールの送信元アドレス                                                                                                                                                                                                                                                |  ○   | vars                        |
| `HAKONIWA_NG_WORDS`                                             | (なし)                                    | 追加の NG ワード (カンマ区切り)                                                                                                                                                                                                                                       |  ○   | vars                        |
| `HAKONIWA_DEBUG`                                                | `false`                                   | `true` でトップに「ターンを進める」ボタンを表示 (管理者ログイン必須)                                                                                                                                                                                                  |  ○   | vars                        |
| `HAKONIWA_ADMIN_ENABLED`                                        | `true`                                    | 管理画面 (`/admin`) の有効 / 無効                                                                                                                                                                                                                                     |  ○   | vars                        |
| `HAKONIWA_USE_LBBS`                                             | `false`                                   | 島ごとのローカル掲示板の有効 / 無効                                                                                                                                                                                                                                   |  ○   | vars                        |
| `HAKONIWA_UNIT_TIME_SEC`                                        | `21600`                                   | 新しいゲームを開始するときの1ターンの長さ (秒) の既定値。以後は管理画面「ゲーム設定」/ CLI `game set-unit-time` で変更する (この環境変数を変えても既存のゲームには影響しない)                                                                                         |  ○   | vars                        |
| `HAKONIWA_MAX_CATCH_UP_TURNS`                                   | `1`                                       | 1 回の判定で進める最大ターン数 (Workers 版は Cron が 15 分間隔のため `wrangler.jsonc` では既定 `3`)                                                                                                                                                                   |  ○   | vars                        |
| `HAKONIWA_SITE_TITLE`                                           | `箱庭諸島２`                              | サイトタイトル                                                                                                                                                                                                                                                        |  ○   | vars                        |
| `HAKONIWA_ADMIN_NAME`                                           | (なし)                                    | フッタの管理者名。未設定ならフッタに表示しない                                                                                                                                                                                                                        |  ○   | vars                        |
| `HAKONIWA_EMAIL`                                                | (なし)                                    | フッタの連絡先。未設定ならフッタに表示しない                                                                                                                                                                                                                          |  ○   | vars                        |
| `HAKONIWA_BBS_URL`                                              | (なし)                                    | フッタの掲示板リンク。未設定ならフッタに表示しない                                                                                                                                                                                                                    |  ○   | vars                        |
| `HAKONIWA_TOPPAGE_URL`                                          | (なし)                                    | フッタのトップページリンク。未設定ならフッタに表示しない                                                                                                                                                                                                              |  ○   | vars                        |
| `HAKONIWA_START_AT`                                             | (なし)                                    | ターン1の処理が実行される日時 (ゲーム開始、ISO 8601)。ゲームはゲーム開始前で作られ、この日時に最初のターン処理が行われてターン1になる。管理画面の「新しいゲームを開始」フォームと CLI `game new`/`db init` の既定値。未設定なら開始時の現在時刻を切り下げた時刻を使う |  ○   | vars                        |
| `HAKONIWA_FINAL_TURN`                                           | (なし)                                    | 最終ターン数 (正の整数)。管理画面の「新しいゲームを開始」フォームと CLI `game new`/`db init` の既定値。未設定なら無期限                                                                                                                                               |  ○   | vars                        |
| `HAKONIWA_TIMEZONE`                                             | `Asia/Tokyo`                              | datetime-local の解釈と日時表示に使う IANA タイムゾーン名                                                                                                                                                                                                             |  ○   | vars                        |
| `PORT`                                                          | `3000`                                    | サーバーの待受ポート                                                                                                                                                                                                                                                  |  ○   | - (Workers は不要)          |
| `HAKONIWA_DB_PATH`                                              | `./data/hakoniwa.sqlite`                  | SQLite データベースファイル                                                                                                                                                                                                                                           |  ○   | - (DO の SQLite ストレージ) |
| `HAKONIWA_BACKUP_DIR`                                           | `./data/backups`                          | バックアップの出力先                                                                                                                                                                                                                                                  |  ○   | - (PITR を使う)             |
| `HAKONIWA_TURN_CHECK_INTERVAL_SEC`                              | `60`                                      | ターン進行判定のタイマー間隔 (秒)。`0` で無効                                                                                                                                                                                                                         |  ○   | - (Cron Trigger を使う)     |

## 5. 管理画面の機能一覧と運用 (`/admin`)

- **ゲームの開始・終了**: 「新しいゲームを開始」(名前・開始日時・最終ターン・1 ターンの長さ (時間・分の入力) を指定可能。現在のゲームが無いか終了しているときだけ実行できる) / 「このゲームを終了する」(現在のゲームが進行中のときだけ、確認チェックボックス付きで実行できる) / 「このデータを削除」(現役データを削除)
- **現役データ**: 現在のゲームの名前・ID・状態・ターン数・最終更新時刻・開始時刻・最終ターン・1 ターンの長さを表示
- **ゲーム一覧**: 現在 + 過去のゲームを表 (名前・開始・終了・ターン数・島数・状態) で表示。名前から各ゲームのトップへ移動できる
- **最終更新時刻の変更**: 日時指定 (datetime-local) または unix 秒指定
- **ゲーム設定**: 最終ターン数の変更 (空欄で無期限)、1 ターンの長さの変更 (時間・分の入力。次のターン境界から反映)
- **ターンを進める**: `HAKONIWA_DEBUG=true` のときにトップページにも表示される、手動でのターン進行 (管理者ログイン必須)
- **ログイン方法の ON/OFF**: X / Discord / メールをそれぞれ有効化・無効化 (環境変数で未設定の方法は選べない)
- **資金・食料の最大化**: 島を選んで資金・食料を最大値にする
- **バックアップ**: 一覧表示、作成 (ラベル指定可)、現役データへの復元、削除 (Node はファイル、Workers は PITR)

最終ターンを N に設定すると、ゲームはゲーム開始前で始まり、N 回のターン処理でターン N に達した時点でゲームが終了し (`status` が `finished` になり)、以降はターンが進まなくなります (管理画面の「ゲーム設定」または CLI `game set-final-turn` でいつでも変更・解除できます)。終了後もトップと観光・開発画面は閲覧でき、掲示板への記帳もできますが、計画登録・コメント更新・名前変更・新しい島の作成はできなくなります。管理者が「このゲームを終了する」で手動終了させた場合も同じ状態になります。ゲームが終了すると、現在のゲームが `finished` のときだけ次のゲームを開始でき (管理画面「新しいゲームを開始」または CLI `game new`)、終了した (それまでの) ゲームは `/games` から一覧・閲覧できる読み取り専用の過去のゲームとして残ります (再開はできません)。

## 6. URL 構成

全ページのゲーム依存部分は `/games/:gameId/` 配下にあり、URL だけでどのゲームを見ているか特定できます。

| メソッド | パス                                                                  | 内容                                                                                                                     |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET      | `/`                                                                   | 現在のゲームへ 302 (`/games/:id`)。ゲームが無ければ「ゲームはまだ開始されていません」画面 (管理者には `/admin` への案内) |
| GET      | `/games`                                                              | ゲーム一覧 (名前・開始・終了・ターン数・島数・状態)                                                                      |
| GET      | `/games/:gameId`                                                      | そのゲームのトップ (順位表・出来事・発見の記録)。過去のゲームは「結果発表」表示                                          |
| POST     | `/games/:gameId/islands`                                              | 島の作成 (現在のゲームのみ)                                                                                              |
| GET      | `/games/:gameId/islands/:id`                                          | 観光                                                                                                                     |
| GET      | `/games/:gameId/islands/:id/ogp.png`                                  | OGP 画像                                                                                                                 |
| POST     | `/games/:gameId/islands/:id/lbbs`                                     | 記帳 (現在のゲームのみ。終了後でも記帳自体は可能)                                                                        |
| GET      | `/games/:gameId/my-island`                                            | 自分の島の開発画面 (過去のゲームは読み取り専用)                                                                          |
| POST     | `/games/:gameId/my-island/commands`\|`comment`\|`name`\|`lbbs/delete` | 現在のゲームのみ                                                                                                         |
| POST     | `/games/:gameId/my-island/abandon`                                    | 島の放棄 (確認チェック必須。現在のゲームのみ)                                                                            |
| GET      | `/my-island`, `/islands/:id`, `/islands/:id/ogp.png`                  | ゲーム ID を含まない旧 URL。現在のゲームの同じパスへ 302 (シェア済み URL 対策)                                           |

`/login`、`/account`、`/admin` はゲームに依存しないので従来どおりのパスのままです。同時に実行できるゲームは 1 つですが、終了後は次のゲームを開始でき、過去のゲームは読み取り専用のまま `/games` から一覧・閲覧できます。

開発画面の「島を放棄する」から、自分の島を放棄して新しい島を探しに行けます。放棄すると住民が 0 人の無人島になり (町は荒地に戻り、登録済みの計画はすべて資金繰りに戻ります)、攻撃・援助などの対象にならなくなる一方、直ちに「新しい島を探す」で新しい島を作れます。放棄は 1 ゲームにつき 3 回までです。

初めて遊ぶ方向けに、オリジナル (Perl) 版の [遊び方](https://hako2d-mj.xii.jp/pin/st/manual/man01.html) も参考にしてください (この版はパスワードの代わりに SNS などのログインを使うなど、一部の機能が異なります)。

島の URL (`/games/:gameId/islands/:id`) を X や Discord、Slack 等でシェアすると、`GET /games/:gameId/islands/:id/ogp.png` (800×420 PNG) の地図画像が OGP (`og:image`) として表示されます。画像 URL には現在ターンの `?turn=N` が付き、ターンが進むと URL が変わるため、SNS 側のキャッシュも新しい地図に更新されます。
