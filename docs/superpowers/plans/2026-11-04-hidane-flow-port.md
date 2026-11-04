# hidane-flow 移植 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** flicktasks に「今日やる」「今からやる(1件・時間自動計測)」「予実の見える化」を移植する。

**Architecture:** ステータス連鎖を `inbox→today→doing→done` の4段に拡張し、doing 滞在時間を自動計測して実績にする。遷移の副作用（タイマー・1件制約・完了時刻）は `src/shared/flow.ts` の純粋関数に集約し、store・worker は器のまま薄く拡張する。UI は既存の Liquid Glass 語彙で「▶ 今から」固定カードと予実サマリー行を足す。

**Tech Stack:** 既存のまま（React 19 + zustand + motion / Hono + D1 / vitest + Playwright / biome）。依存追加なし。

**Spec:** docs/superpowers/specs/2026-11-04-hidane-flow-port-design.md

## Global Constraints

- SPEC.md 0章の設計原則を壊さない（起動→メモまでの操作を増やさない・文言は機能ラベルのみ・`prefers-reduced-motion` 尊重）
- 新 UI 要素は既存のビジュアル語彙（`.glass` / `.glass-strong` / `.glass-pill`、角丸22px、既存springパラメータ）のみ使う
- ステータス表示名: inbox=メモ / today=今日 / doing=今から / done=完了
- 見積もりチップ値は 15 / 30 / 60 / 90、数値入力は 1〜1440 分
- doing は常に最大1件（store 遷移時と読み込み時の両方で強制）。サーバーでは強制しない
- 旧 "doing" は D1 マイグレーションで全件 'today' に変換する
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 各タスク完了時に `npm run typecheck && npm run lint && npm run test` が通ること

## Review Focus

1. doing 中のタスクをシートから削除→Undo しても壊れない（固定カードが消え、Undo で doing に戻る）→ Task 6 の E2E に含めた
2. 見積もり数値入力に 0・負数・1441以上・非数値 → 反映されない（1〜1440 のみ受理）→ Task 4 の E2E に含めた
3. `doingSince` が未来時刻（時計ずれ）でも経過表示が負にならない → Task 1 の `elapsedMs` 単体テストに含めた
4. 旧形式 localStorage（新フィールド無し・旧 doing 複数）の読み込みで落ちず、正規化される → Task 1 の `hydrateTask`/`normalizeDoing` 単体テストに含めた
5. 昨日完了したタスクが今日の予実サマリーに混ざらない（日付境界）→ Task 1 の `planActual` 単体テストに含めた

---

### Task 1: shared 層 — 4段ステータスとタイマー純粋関数

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/flow.ts`
- Test: `src/shared/types.test.ts`（既存の連鎖テストを4段に更新）, `src/shared/flow.test.ts`

**Interfaces:**
- Produces（後続タスクが使う）:
  - `STATUSES = ["inbox","today","doing","done"] as const`、`STATUS_LABEL`（上記表示名）
  - `Task` に追加: `estimateMin: number | null; actualMs: number; doingSince: number | null; completedAt: number | null`
  - `ESTIMATE_CHIPS = [15, 30, 60, 90] as const`（types.ts）
  - flow.ts:
    - `applyStatus(task: Task, next: Status, now: number): Task` — 遷移副作用込みの新タスクを返す（§設計1）。status 変化なしなら同値を返す
    - `normalizeDoing(tasks: Task[], now: number): { tasks: Task[]; demoted: Task[] }` — doing 2件以上なら doingSince 降順（null は最後、同着は updatedAt 降順）で1件残し、他は `applyStatus(t,"today",now)`。demoted は変更後のタスク
    - `hydrateTask(raw: unknown): Task | null` — 旧形式データに新フィールドの既定値（null/0/null/null）を補完。Task の体を成さなければ null
    - `elapsedMs(task: Task, now: number): number` — `actualMs + (doingSince ? max(0, now - doingSince) : 0)`
    - `sameLocalDay(a: number, b: number): boolean`（端末ローカルタイム）
    - `planActual(tasks: Task[], now: number): { planMin: number; actualMs: number; empty: boolean }` — 対象 = status∈{today,doing} 全件 + completedAt が now と同日の done。planMin=estimateMin合計(null=0)、actualMs=elapsedMs合計、empty=対象0件
    - `formatElapsed(ms: number): string` — `m:ss`、1時間以上は `h:mm:ss`
    - `formatMin(min: number): string` — `30分`、60以上は `1時間30分`（端数0分は省略）

- [ ] **Step 1: `npm install` し、既存テストが通るベースラインを確認**

Run: `cd ~/dev/flicktasks && npm install && npm run test`
Expected: 既存 vitest（types/refine/crypto）全て PASS

- [ ] **Step 2: 失敗するテストを書く** — `types.test.ts` の連鎖を4段に書き換え、`flow.test.ts` を新規作成

flow.test.ts に最低限入れるケース（値は設計書の規則から）:

```ts
// applyStatus
it("doingに入るとdoingSinceが立つ", ...);           // doingSince === now
it("doingから出るとactualMsに加算されdoingSinceがnull", ...); // t0に着手→t0+60_000でtoday → actualMs 60_000
it("doneに入るとcompletedAtが立ち、doing経由なら加算もされる", ...);
it("doneから戻すとcompletedAtがnullに戻りactualMsは保持", ...);
it("同じstatusなら何も変わらない", ...);
// normalizeDoing
it("doing2件は計測中の最新1件だけ残り他はtodayへ(actualMs加算)", ...);
it("doingSinceが全てnullならupdatedAt最新を残す", ...);
// hydrateTask: 旧形式{id,text,status:"doing",priority,steps,createdAt,updatedAt}に既定値補完
// elapsedMs: doingSinceが未来でも負にならない(=actualMsのまま)
// planActual: today2件(見積30/null)+doing1件+昨日done1件+今日done1件 → planMin/actualMs/対象選別を検算
// formatElapsed(59_000)="0:59", (3_661_000)="1:01:01" / formatMin(90)="1時間30分", (60)="1時間"
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `npx vitest run src/shared`
Expected: FAIL（flow.ts 不在・STATUSES 不一致）

- [ ] **Step 4: `types.ts` の拡張と `flow.ts` を実装**

types.ts: STATUSES/STATUS_LABEL/Task/ESTIMATE_CHIPS。nextStatus/prevStatus は配列ベースのため無変更で4段に追従。

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run src/shared`
Expected: PASS（types.test の4段連鎖含む）

- [ ] **Step 6: Commit** — `feat: 4段ステータスとタイマー純粋関数(shared/flow)`

### Task 2: D1 マイグレーションと worker 拡張

**Files:**
- Create: `migrations/0002_hidane_flow.sql`
- Modify: `src/worker/db.ts`（TaskRow / rowToTask / insertTaskStmt / updateTask）
- Modify: `src/worker/index.ts:10-27`（taskInput / taskPatch）

**Interfaces:**
- Consumes: Task 新フィールド（Task 1）
- Produces: API が新フィールドを保存・返却する。`PATCH /api/tasks/:id` は `estimateMin / actualMs / doingSince / completedAt` を受ける

- [ ] **Step 1: 0002_hidane_flow.sql を書く**

SQLite は CHECK を ALTER できないためテーブル再作成方式:
`tasks_new` を新スキーマ（status CHECK に 'today','doing' 含む4値 + `estimate_min INTEGER` / `actual_ms INTEGER NOT NULL DEFAULT 0` / `doing_since INTEGER` / `completed_at INTEGER`）で作成 → `INSERT INTO tasks_new ... SELECT`（**status は `CASE WHEN status='doing' THEN 'today' ELSE status END`**、新列は既定値）→ `DROP TABLE tasks` → `RENAME` → `idx_tasks_user_status` を貼り直す。

- [ ] **Step 2: ローカル適用で検証**

Run: `npm run db:migrate:local`
Expected: 0002 が適用され、エラーなし

- [ ] **Step 3: db.ts / index.ts に新フィールドを通す**

- TaskRow に `estimate_min: number | null; actual_ms: number; doing_since: number | null; completed_at: number | null`、rowToTask / insertTaskStmt / updateTask の sets に対応列を追加（patch 対象: `estimateMin, actualMs, doingSince, completedAt`）
- zod: taskInput に `estimateMin: z.number().int().min(1).max(1440).nullable().default(null), actualMs: z.number().int().min(0).default(0), doingSince: z.number().int().nullable().default(null), completedAt: z.number().int().nullable().default(null)`、taskPatch にも同型を partial で追加。`toTask` も新フィールドを運ぶ

- [ ] **Step 4: 検証とコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 全て PASS → Commit `feat: D1に予実フィールドを追加(0002)・APIを拡張`

### Task 3: store — 遷移副作用・1件制約・読み込み正規化

**Files:**
- Modify: `src/client/store.ts`

**Interfaces:**
- Consumes: `applyStatus / normalizeDoing / hydrateTask`（Task 1）
- Produces: `updateTask(id, patch)` の patch 型が新フィールドを含む。status を含む patch は applyStatus を通り、doing へ入れる時は他の doing を today へ押し出して remote にも PATCH する

- [ ] **Step 1: 実装**

1. `loadLocal`: 各タスクを `hydrateTask` で補完（null は捨てる）
2. `updateTask`: patch.status があれば `applyStatus(task, patch.status, Date.now())` の結果と patch をマージして保存・PATCH 送信（送る patch にタイマー系フィールドを含める）。next が doing のとき、他の doing タスクを `applyStatus(other,"today",now)` して保存し、それぞれ remote PATCH
3. `boot`: ローカル読み込み直後・サーバー listTasks / importTasks の結果に `normalizeDoing` を適用。demoted があればログイン時は remote PATCH で反映
4. `addTask` の新規 Task に新フィールドの既定値を入れる
5. 削除 Undo（removeTask 内の復元）は復元後に `normalizeDoing` を通す

- [ ] **Step 2: 検証とコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS（ロジック本体は Task 1 の単体テストが担保）→ Commit `feat: storeに遷移副作用と今から1件制約を統合`

### Task 4: シート・タブ・カードの拡張

**Files:**
- Modify: `src/client/components/TaskSheet.tsx`（ステータス4分割は STATUSES 参照のため自動。優先度段の直後に見積もり段を追加）
- Modify: `src/client/components/StatusTabs.tsx`（タブを `TAB_STATUSES = ["inbox","today","done"]` に。today の件数バッジは today+doing の合計）
- Modify: `src/client/components/TaskCard.tsx`（メタ行に予実、doing への前進レイヤーを violet-200/70 に）
- Modify: `e2e/app.spec.ts`（既存「フリックでステータスを進める / 戻す」を4段連鎖に書き換え）

**Interfaces:**
- Consumes: `ESTIMATE_CHIPS`、`formatMin`、`elapsedMs`、store.updateTask（Task 3）
- Produces: data-testid: `estimate-15/30/60/90`（チップ）、`estimate-input`（数値入力）。カードメタの予実表示

- [ ] **Step 1: E2E を先に書き換え・追加（失敗を確認）**

- 既存フリックテスト → `メモ→今日→今から→完了` と逆連鎖、`done` 右・`inbox` 左で跳ね返り、30px 無視
- 追加: シートで `estimate-30` を押す→カードに「30分」/もう一度で解除。`estimate-input` に `45` → 「45分」、`0` や `2000` は反映されない

Run: `npm run test:e2e`　Expected: 対象テストが FAIL

- [ ] **Step 2: 実装**

- シート見積もり段: チップは優先度と同じ作法（選択中をもう一度押すと null）。数値入力は blur/Enter で確定、1〜1440 以外は無視
- カードメタ（`TaskCard.tsx:140-157` の行）: estimateMin があれば `formatMin` チップ、elapsedMs≥60秒 なら `実 n分`。done カードは `見積30分 → 実45分` 形式
- StatusTabs: counts を `{inbox, today(+doing), done}` に

- [ ] **Step 3: 検証とコミット**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:e2e`
Expected: 全て PASS → Commit `feat: 見積もり入力・3タブ化・カード予実表示`

### Task 5: 「▶ 今から」固定カードと予実サマリー行

**Files:**
- Create: `src/client/components/NowCard.tsx`
- Create: `src/client/components/PlanSummary.tsx`
- Create: `src/client/useTick.ts`
- Modify: `src/client/App.tsx:36-37`（StatusTabs の下に `<NowCard />`、`<PlanSummary />` を挿入）

**Interfaces:**
- Consumes: `elapsedMs / formatElapsed / formatMin / planActual`（Task 1）、store.flick / openSheet
- Produces:
  - `useTick(enabled: boolean): number` — enabled の間 1秒ごとに更新される `Date.now()`
  - NowCard: doing タスクがある時だけ表示。data-testid `now-card` / 経過表示 `now-elapsed`。右フリック=done・左フリック=today（TaskCard と同じ判定値 88px/550px/s・同じせり出しレイヤー構成）。タップでシート。`.glass-strong` + アクセントリング、▶ + 本文1行省略 + 経過時間（見積もりがあれば `/ 30分` 併記、経過 > 見積もりで経過時間を rose 系に）
  - PlanSummary: `filter==="today"` かつ planActual.empty でない時だけ表示。data-testid `plan-summary`。`計画 1時間30分 ・ 実績 42分` + 計画比の細いプログレスバー（上限100%）

- [ ] **Step 1: E2E を先に追加（失敗を確認）**

- 今日のタスクを右フリック→ `now-card` が現れ、1.5秒待つと `now-elapsed` の表示が変わる
- 2件目を doing へ→ 固定カードが2件目になり、1件目は今日タブに戻っている（常に1件）
- `now-card` を右フリック→ done になり固定カードが消える。リロードしても done カードに実績が残る
- doing のままリロード→ `now-card` が残り経過が継続
- 今日タブ: today 2件（見積30/null）+ doing 1件で `plan-summary` の数字を検算。メモタブでは非表示

Run: `npm run test:e2e`　Expected: 追加分 FAIL

- [ ] **Step 2: 実装**（useTick → NowCard → PlanSummary → App 配線）

- [ ] **Step 3: 検証とコミット**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:e2e`
Expected: 全て PASS → Commit `feat: 今から固定カード(自動計測表示)と予実サマリー`

### Task 6: 仕上げの E2E — 削除Undo・ゲスト同期・回帰

**Files:**
- Modify: `e2e/app.spec.ts`

**Interfaces:**
- Consumes: これまでの全 testid・`devLogin / flick` ヘルパー（既存）

- [ ] **Step 1: 追加 E2E を書く**

- doing 中のタスクをシートから削除→ `now-card` が消える→トーストの「元に戻す」→ doing に復帰し `now-card` が戻る
- ログイン（devLogin）後: ゲストで付けた見積もり・実績（フリックで数秒 doing に置く）が取り込み後も保持され、リロード（サーバー正）でも残る
- 既存の全テスト（起動フォーカス・IME・追加・シート・削除 Undo・401）が通ることを確認

- [ ] **Step 2: 全スイートを実行**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:e2e`
Expected: 全て PASS

- [ ] **Step 3: Commit** — `test: hidane-flowのE2E(削除Undo・ゲスト同期)`

### Task 7: SPEC.md の更新

**Files:**
- Modify: `docs/SPEC.md`（1章データモデル・遷移図、2章画面構成、11章受け入れテストを4段連鎖+予実に合わせて更新。0章・10章の原則とパラメータは不変）

- [ ] **Step 1: SPEC.md を現仕様に更新**（設計書 docs/superpowers/specs/2026-11-04-… と矛盾しないこと）

- [ ] **Step 2: 最終ゲートと Commit**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:e2e`
Expected: 全て PASS → Commit `docs: SPECをhidane-flow仕様に更新`

---

## リリース（計画外・ユーザー確認後）

main へのマージ＝GitHub Actions で本番デプロイ＋ `wrangler d1 migrations apply DB --remote`（0002 は一方通行）。**実行前に必ずユーザーに確認する**。適用前に `wrangler d1 export` でバックアップを取る。
