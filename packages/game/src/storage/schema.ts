// tmp/04-database.md 「スキーマ」節 + tmp/14-users-auth.md 「データモデル」節 (v2) の DDL。
// 設計書との差異: 設計書は `packages/game/schema.sql` を正としてここへ文字列として埋め込む
// 想定だが、schema.sql (人が読むためのコピー) と schema.ts (実際に読まれる文字列) の二重管理を
// 避けるため、schema.sql は置かず本ファイルのみを正とする (Vite の `?raw` import は
// Workers/テストで扱いが揺れるため使わない、という設計書の指示に従った結果の選択)。
//
// better-auth の "user"/session/account/verification の列は node_modules/better-auth
// (実体は @better-auth/core) の getAuthTables (get-tables.ts) の既定スキーマと照合した実際の
// 列に合わせている。14 の DDL との差異は下記コメントを参照。

/**
 * このファイルが適用するスキーマのバージョン。v1 (パスワード認証) からの自動移行は提供しない。
 * v3: tmp/16-season.md。`game.final_turn` (最終ターン、NULL 可) を追加した。
 * v4: tmp/16-season.md「ターンの長さも DB に持つ (追加要件)」節。`game.unit_time_sec` を追加した。
 */
export const SCHEMA_VERSION = 4;

export const schemaSql = `
CREATE TABLE schema_version (
  version INTEGER NOT NULL
) STRICT;

-- Perl: hakojima.dat 先頭 4 行。常に 1 行
-- v3: final_turn (最終ターン。NULL なら無期限)、start_at (ターン1が始まる unix 秒) を追加。
-- v4: unit_time_sec (1 ターンの長さ、秒) を追加。tmp/16-season.md。
CREATE TABLE game (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  turn            INTEGER NOT NULL,
  last_time       INTEGER NOT NULL,
  next_island_id  INTEGER NOT NULL,
  final_turn      INTEGER,
  start_at        INTEGER NOT NULL,
  unit_time_sec   INTEGER NOT NULL
) STRICT;

-- Perl: hakojima.dat の島ブロック + island.N
-- v2: password_hash を削除し、owner_user_id (better-auth "user".id, 1 ユーザー 1 島) を追加。
CREATE TABLE islands (
  id              INTEGER PRIMARY KEY,
  rank            INTEGER NOT NULL UNIQUE,
  name            TEXT    NOT NULL UNIQUE,
  owner_user_id   TEXT    NOT NULL UNIQUE,
  comment         TEXT    NOT NULL DEFAULT '',
  score           INTEGER NOT NULL DEFAULT 0,
  absent          INTEGER NOT NULL DEFAULT 0,
  money           INTEGER NOT NULL,
  food            INTEGER NOT NULL,
  pop             INTEGER NOT NULL DEFAULT 0,
  area            INTEGER NOT NULL DEFAULT 0,
  farm            INTEGER NOT NULL DEFAULT 0,
  factory         INTEGER NOT NULL DEFAULT 0,
  mountain        INTEGER NOT NULL DEFAULT 0,
  prize_flags     INTEGER NOT NULL DEFAULT 0,
  prize_monsters  INTEGER NOT NULL DEFAULT 0,
  prize_turns     TEXT    NOT NULL DEFAULT '[]',
  terrain         TEXT    NOT NULL,
  commands        TEXT    NOT NULL,
  created_turn    INTEGER NOT NULL
) STRICT;

-- Perl: island.N 末尾の lbbs 行。position 0 が最新
-- 外部キーは張らない (DO の PRAGMA 制限を避け、削除はリポジトリが明示的に行う)
-- v2: user_id (投稿者の better-auth "user".id) を追加。
CREATE TABLE lbbs_posts (
  island_id   INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  author      TEXT    NOT NULL CHECK (author IN ('visitor', 'owner')),
  user_id     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  PRIMARY KEY (island_id, position)
) STRICT;

-- Perl: hakojima.logN (N = 何ターン前か)。turn 列で代替
CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  turn        INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  secret      INTEGER NOT NULL DEFAULT 0,
  island_id   INTEGER NOT NULL DEFAULT 0,
  target_id   INTEGER NOT NULL DEFAULT 0,
  html        TEXT    NOT NULL
) STRICT;
CREATE INDEX logs_turn_seq ON logs(turn, seq);
CREATE INDEX logs_island   ON logs(island_id, turn);
CREATE INDEX logs_target   ON logs(target_id, turn);

-- Perl: hakojima.his
CREATE TABLE history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  turn    INTEGER NOT NULL,
  html    TEXT    NOT NULL
) STRICT;

-- Workers 版のみ使用 (PITR ブックマークの台帳)。Node 版では空のまま
CREATE TABLE backups (
  label       TEXT    PRIMARY KEY,
  bookmark    TEXT    NOT NULL,
  turn        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
) STRICT;

-- ここから better-auth が所有する表。列名は better-auth の既定 (camelCase) のまま。
-- storage/better-auth-adapter.ts が読み書きする。
--
-- 設計書 (14) との差異: 14 の DDL は account に "issuer" 列と
-- UNIQUE INDEX account_issuer_accountId(issuer, accountId) を挙げているが、
-- better-auth 1.7.5 (@better-auth/core の getAuthTables) の既定スキーマに
-- issuer 列は存在しない (account は accountId/providerId の組で識別する)。
-- 実装は node_modules 内の get-tables.ts で確認した実際の列に合わせ、
-- issuer は追加せず、代わりに (provider_id, account_id) の UNIQUE INDEX を張る。
CREATE TABLE "user" (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image         TEXT,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL
) STRICT;

CREATE TABLE session (
  id        TEXT PRIMARY KEY,
  token     TEXT NOT NULL UNIQUE,
  userId    TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT
) STRICT;
CREATE INDEX session_userId ON session(userId);

CREATE TABLE account (
  id                    TEXT PRIMARY KEY,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  userId                TEXT NOT NULL,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  TEXT,
  refreshTokenExpiresAt TEXT,
  scope                 TEXT,
  password              TEXT,
  createdAt             TEXT NOT NULL,
  updatedAt             TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX account_providerId_accountId ON account(providerId, accountId);
CREATE INDEX account_userId ON account(userId);

CREATE TABLE verification (
  id        TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value     TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
) STRICT;
CREATE INDEX verification_identifier ON verification(identifier);

-- アプリ側: 計画登録フォームの初期値 (v1 の hako_defaults Cookie の置き換え)。
CREATE TABLE user_prefs (
  user_id TEXT NOT NULL PRIMARY KEY,
  prefs   TEXT NOT NULL
) STRICT;

-- アプリ側: 単純な key-value 設定。ログイン方法の ON/OFF (キー "auth.methods") 等に使う。
CREATE TABLE settings (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
`;
