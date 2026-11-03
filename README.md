# flicktasks

モバイルファーストのタスクメモ。開いた瞬間に書けて、フリックでステータスを動かす。
Cloudflare Workers + D1 + Workers AI、Google ログインのみ。

## できること

- **開いた瞬間メモ**: ログイン不要・オンボーディングなし。起動直後にメモ欄へフォーカスし、どこにもフォーカスがない状態でキーを打ち始めても自動でメモ欄に流れる。スケルトン表示中の入力も失われない。
- **フリックでステータス管理**: カードを右へフリックで `メモ → 進行中 → 完了`、左へフリックで戻す。ドラッグ量に応じて次のステータスが背後からせり出す。
- **ゲスト → ログインで同期**: 未ログイン時はローカル(localStorage)に保存。Google でログインすると、それまでのメモをサーバー(D1)へ取り込み、以後は端末をまたいで同期。オフライン時もローカル状態は保持。
- **AI で整理**(Workers AI): 雑なメモを「タイトル / 手順(チェックリスト) / 優先度」に分解し、ワンタップで適用(取り消し可)。
- **Liquid Glass UI / 白ベース**: 背景の淡いブロブを `backdrop-filter` で屈折させたガラス面、スペキュラハイライト、スプリングアニメーション(追加・退場・タブ・シート・トースト・チェック)。`prefers-reduced-motion` を尊重。
- **全画面スケルトンローディング**: 初回ロード時はレイアウトと同形のスケルトンを全画面表示し、ぼかし付きでクロスフェード。
- キャッチコピーなし。UI 文言は機能ラベルのみ。

## 技術選定と理由

| 領域                    | 採用                                                           | 理由                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ホスティング / 実行基盤 | **Cloudflare Workers + Static Assets**                         | 指定の Cloudflare 基本。Pages ではなく Workers の Static Assets を使うのは、API と SPA を **1 つの Worker・1 回の `wrangler deploy`** で配信でき、`run_worker_first` で `/api/*` `/auth/*` だけ Worker に通せるから。Pages Functions より構成が単純で、Cloudflare 自身が新規は Workers を推奨している。                                        |
| API フレームワーク      | **Hono**                                                       | Workers ネイティブで極小(数十 KB)、Web 標準 API ベース。型付きルーティング、`hono/cookie` など必要十分なミドルウェアが同梱で、Express 系のような Node 依存がない。                                                                                                                                                                             |
| データベース            | **Cloudflare D1 (SQLite)**                                     | タスク/ユーザー/セッションはリレーショナルで十分。`wrangler d1 migrations` でマイグレーション管理でき、ローカルでも miniflare が同じ SQLite を動かすので **E2E がクラウド無しで回る**。KV は結果整合性で「追加→即一覧」に向かず、Durable Objects は過剰。                                                                                      |
| セッション              | **D1 の `sessions` テーブル + HttpOnly Cookie**                | バインディングを D1 と AI の 2 つに絞って初期設定を最小化。Cookie にはランダムトークンのみ、DB には SHA-256 ハッシュを保存(DB 漏洩でもセッション乗っ取り不可)。KV(TTL)でも可だが、追加バインディングに見合う利点がなかった。                                                                                                                   |
| 認証                    | **Google OAuth 2.0 / OIDC 認可コードフロー + PKCE を自前実装** | 要件が Google のみなので、Auth.js / Lucia 等の汎用ライブラリは依存とバンドルが重いだけ。実装は 100 行程度で、state は HMAC 署名付き Cookie、`id_token` の `iss/aud/exp` を検証。トークンエンドポイントから TLS で直接受け取る id_token は OIDC Core 3.1.3.7.6 により署名検証省略が許容される。                                                 |
| AI                      | **Workers AI `@cf/meta/llama-3.1-8b-instruct`**                | 指定の Workers AI。8B は数百 ms で返り、`response_format: json_schema` で構造化出力が取れる。出力はさらに `normalizeRefinement` で防御的に正規化(壊れた JSON や余計な説明文に耐える)。ローカル/CI では AI バインディングは必ずリモート接続(= Cloudflare 認証が必要)なので、`env.test` では AI を外し `MOCK_AI=1` の決定的モックで E2E を回す。 |
| フロントエンド          | **React 19 + TypeScript + Vite 8**                             | ジェスチャー駆動の複雑なアニメーション UI は、エコシステム最大の React + motion の組み合わせが最も実績がある。Vite は Cloudflare 公式プラグインで Worker をそのまま開発サーバー内の workerd で動かせる(本番同等の実行環境で HMR)。                                                                                                             |
| Cloudflare × Vite       | **@cloudflare/vite-plugin**                                    | `wrangler.jsonc` を単一の真実として、dev / preview / build が同じ設定を読む。`vite build` でクライアントと Worker を両方出力し、`vite preview` は本番ビルドを workerd で配信するため **E2E は本番ビルドに対して実行**できる。                                                                                                                  |
| アニメーション          | **motion (旧 Framer Motion) v14**                              | `drag="x"` + `onDragEnd` の offset/velocity で「フリック」判定が自然に書ける。`layout` / `AnimatePresence` / `layoutId` で並び替え・退場・タブのインジケータ移動がほぼ宣言的。`useMotionValue` でドラッグ量に連動する背面レイヤーを 60fps で描ける。                                                                                           |
| スタイリング            | **Tailwind CSS v4**                                            | ユーティリティで速く組め、ガラス表現のような「生 CSS が必要な部分」は `styles.css` に `.glass` としてまとめ、両者を無理なく併用。v4 は Vite プラグイン一つで設定ファイル不要。                                                                                                                                                                 |
| 状態管理                | **zustand**                                                    | 1 KB 台で `useSyncExternalStore` ベース。ローカル永続化・楽観的更新・サーバー同期を 1 つのストアに閉じ込められる。Redux は過剰、Context は再レンダリングの制御が面倒。                                                                                                                                                                         |
| バリデーション          | **zod v4**                                                     | API 境界でのスキーマ検証。Hono と組み合わせやすく、型をそのまま推論できる。                                                                                                                                                                                                                                                                    |
| E2E テスト              | **Playwright**                                                 | モバイル(Pixel 7 相当)のビューポートとタッチを再現でき、実ブラウザでフリック・シート・ログイン同期まで検証。`webServer` でビルド → マイグレーション → preview 起動まで自動化。                                                                                                                                                                 |
| ユニットテスト          | **Vitest**                                                     | Vite と同じ変換パイプライン。純粋関数(AI 出力の正規化、ステータス遷移、署名/検証)だけを対象に高速に回す。                                                                                                                                                                                                                                      |
| Lint / Format           | **Biome**                                                      | ESLint + Prettier を 1 ツール・1 設定・高速で置き換え。                                                                                                                                                                                                                                                                                        |
| CI / CD                 | **GitHub Actions**                                             | lint → typecheck → unit → build → E2E。`main` への push で Cloudflare へデプロイ(Secrets 未設定ならスキップ)。                                                                                                                                                                                                                                 |

### 採らなかったもの

- **Next.js / Remix / SvelteKit**: SSR は不要(UI は完全にクライアント状態)。Workers 上のフレームワークアダプタより、Hono + SPA の方がバンドルも心理的負荷も小さい。
- **Cloudflare Pages**: 新規は Workers Static Assets が推奨。1 Worker で完結させたかった。
- **KV セッション / Durable Objects**: 上記の通り。
- **Auth.js などの認証ライブラリ**: Google 単一のため。
- **SVG 変位フィルタによる「本物の」屈折**: 全画面 `backdrop-filter` と組み合わせるとモバイル GPU 負荷が高く、スクロール時のフレーム落ちと引き換えになるため、ブラー + 彩度 + スペキュラハイライトで表現。

## 構成

```
src/
  client/        React SPA (Vite)
    components/  Composer / TaskCard(フリック) / TaskSheet / StatusTabs / Skeleton / Toast ...
    store.ts     zustand: ローカル永続化・楽観的更新・サーバー同期
  worker/        Hono (Cloudflare Workers)
    auth.ts      Google OAuth (PKCE) / セッション / dev-login
    index.ts     /api/tasks, /api/ai/refine
    ai.ts        Workers AI 呼び出し
    db.ts        D1 アクセス
  shared/        クライアント/Worker 共通の型とロジック
migrations/      D1 マイグレーション
e2e/             Playwright
```

## ローカル開発

```bash
npm install
cp .dev.vars.example .dev.vars      # DEV_LOGIN=1, MOCK_AI=1 が入っている
npm run db:migrate:local
CLOUDFLARE_ENV=test npm run dev     # http://localhost:5173
```

- `CLOUDFLARE_ENV=test` は AI バインディングを外した環境。実 AI を使うには `wrangler login` 後に `npm run dev`(`MOCK_AI` を空にする)。
- `DEV_LOGIN=1` のとき `POST /auth/dev-login` で Google なしにログインできる(本番では絶対に有効にしない)。

## テスト

```bash
npm run lint && npm run typecheck
npm test            # Vitest
npm run test:e2e    # Playwright(本番ビルドを workerd で起動して実ブラウザで操作)
```

## デプロイ(Cloudflare)

1. D1 を作成し、出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に貼る。

   ```bash
   npx wrangler d1 create flicktasks
   npx wrangler d1 migrations apply DB --remote
   ```
2. Google Cloud Console で OAuth クライアント(ウェブ アプリケーション)を作成。
   - 承認済みのリダイレクト URI: `https://<your-worker>.workers.dev/auth/google/callback`
3. `wrangler.jsonc` の `vars` を本番値に(`APP_ORIGIN`, `GOOGLE_CLIENT_ID`)。
4. シークレットを登録。

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET      # openssl rand -base64 48
   ```
5. デプロイ。

   ```bash
   npm run deploy
   ```

GitHub Actions で自動デプロイする場合は、リポジトリの Secrets に `CLOUDFLARE_API_TOKEN`(Workers Scripts / D1 / Workers AI の編集権限)と `CLOUDFLARE_ACCOUNT_ID` を設定する。

## API

| Method       | Path                    | 説明                                    |
| ------------ | ----------------------- | --------------------------------------- |
| GET          | `/auth/google`          | Google 認可画面へリダイレクト           |
| GET          | `/auth/google/callback` | コールバック。セッション Cookie を発行  |
| POST         | `/auth/logout`          | セッション破棄                          |
| GET          | `/api/me`               | ログイン中ユーザー(未ログインは `null`) |
| GET/POST     | `/api/tasks`            | 一覧 / 作成                             |
| POST         | `/api/tasks/import`     | ゲスト時のメモを一括取り込み            |
| PATCH/DELETE | `/api/tasks/:id`        | 更新 / 削除                             |
| POST         | `/api/ai/refine`        | Workers AI でメモを整理                 |

## License

MIT
