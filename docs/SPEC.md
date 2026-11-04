# flicktasks 仕様書(移植用)

他のタスク管理アプリへ「中身の仕様」を移植するための文書。技術スタックに依存しない振る舞いを中心に書き、
参考実装としてこのリポジトリのファイルを併記する。参考実装: https://github.com/taichinakamura-sudo/flicktasks

---

## 0. 設計原則(優先順)

1. **開いた瞬間にメモできる**。ログイン、オンボーディング、説明文、確認ダイアログをその前に置かない。
2. **ステータス操作は 1 ジェスチャー**(フリック)。メニューやボタンを探させない。
3. **ローカル先行・サーバー後追い**。すべての操作は即座に画面に反映し、同期は裏で行う。失敗は通知だけ。
4. **文言は機能ラベルのみ**。キャッチコピー、歓迎文、空状態の説明文は置かない。
5. **動きで状態を伝える**。追加・退場・切替・確定はすべてアニメーションする。ただし `prefers-reduced-motion` を尊重する。

---

## 1. データモデル

```ts
type Status = "inbox" | "today" | "doing" | "done"; // 表示名: メモ / 今日 / 今から / 完了
type Priority = "low" | "mid" | "high"; // 表示名: 低 / 中 / 高
type Step = { text: string; done: boolean };

type Task = {
  id: string; // クライアント生成の UUID(楽観的追加とゲスト取り込みで同じ id を使うため)
  text: string; // 1〜2000 文字。改行可
  status: Status; // 既定 "inbox"
  priority: Priority | null;
  steps: Step[]; // 最大 20。AI 整理で生成されるチェックリスト
  estimateMin: number | null; // 見積もり分(1〜1440)。null = 未設定
  actualMs: number; // 実測の累計ミリ秒。doing(今から)滞在時間の自動計測
  doingSince: number | null; // doing に入った時刻(epoch ms)。doing 以外では null
  completedAt: number | null; // done に入った時刻。done 以外では null
  createdAt: number; // epoch ms。一覧は createdAt 降順(新しいものが上)
  updatedAt: number;
};

type User = { id: string; email: string; name: string | null; picture: string | null };
```

参考: `src/shared/types.ts`, `migrations/0001_init.sql`, `migrations/0002_hidane_flow.sql`

### ステータス遷移

```
inbox  --右-->  today  --右-->  doing  --右-->  done
inbox  <--左--  today  <--左--  doing  <--左--  done
```

- 端(`done` で右、`inbox` で左)では何も起きず、カードはスプリングで元位置へ戻る。
- **doing(今から)は常に最大 1 件**(1 点集中)。別のタスクを doing にすると、既存の doing は自動で today に戻る。
  読み込み時(ローカル / サーバー / 取り込み)にも正規化する(計測中の最新 1 件を残す)。
- **実績時間は手入力しない**。doing に入った時刻を `doingSince` に記録し、出るときに
  `actualMs += now - doingSince` と加算する(`applyStatus`)。done に入ると `completedAt` が立ち、
  左フリックで戻すと null に戻る(actualMs は保持)。
- 削除はフリックではなく詳細シートから行う(誤操作防止)。削除は常に「元に戻す」付き。

参考: `nextStatus` / `prevStatus` in `src/shared/types.ts`, `applyStatus` / `normalizeDoing` in `src/shared/flow.ts`

---

## 2. 画面構成(モバイル 1 画面)

上から順に:

1. **ヘッダー**: 左にアプリ名(小さく)、右にログインボタン(未ログイン: Google アイコン+「ログイン」)またはアバター(ログイン済み)。アバタータップでメニュー(名前・メール・ログアウト)。
2. **コンポーザー**(メモ入力): 1 行の自動伸長テキストエリア、プレースホルダは「メモ」のみ。右に円形の追加ボタン。
3. **ステータスタブ**: 「メモ / 今日 / 完了」の 3 分割セグメント(doing はタブにせず固定カードが受け持つ)。
   各タブに件数バッジ(今日 = today + doing)。選択インジケータはタブ間をスライド移動する。
4. **「▶ 今から」固定カード**: doing のタスクがあるときだけ、どのタブでも表示。経過時間を 1 秒ごとに
   ライブ表示(`m:ss`、1 時間以上は `h:mm:ss`)し、見積もりがあれば `/ 30分` を併記、超過で経過時間がローズ色。
   右フリック=完了 / 左フリック=今日に戻す / タップ=詳細シート。`.glass-strong` + 紫のリング。
5. **予実サマリー行**(今日タブのみ・対象 0 件なら非表示): `計画 ○分 ・ 実績 ○分` + 計画比のプログレスバー。
   対象 = today/doing 全件 + その日(端末ローカルタイム)に完了した done。
6. **タスク一覧**: 選択中ステータスのカードを縦並び。空なら薄い点線の円を 1 つ置くだけ(文言なし)。
   カードのメタ行に見積もり(`30分`)と実績(`実 12分`、1 分以上のとき)。done カードは `見積30分 → 実45分`。
7. **詳細シート**(カードタップで下から出るボトムシート)。
8. **トースト**(画面下中央のピル)。

最大幅 560px で中央寄せ。セーフエリア(`env(safe-area-inset-*)`)を考慮する。

参考: `src/client/App.tsx`, `src/client/components/NowCard.tsx`, `PlanSummary.tsx`

---

## 3. 「開いた瞬間メモ」の仕様

- 起動直後にコンポーザーへフォーカスする(`autoFocus` + マウント時 `focus({ preventScroll: true })`)。
- **スケルトン表示中も入力を受け付ける**: スケルトンは `pointer-events: none` のオーバーレイで、実 UI はその下で既にマウント済み。打った文字は失われない。
- **どこにもフォーカスがない状態でキーを打ったらコンポーザーへ流す**: `document` の `keydown` で、修飾キーなし・`key.length === 1`・`activeElement` が body のときにフォーカスする。文字はそのまま入力される。
- **Enter で追加、Shift+Enter で改行**。**IME 変換中(`isComposing`)の Enter は無視**(日本語入力で必須)。
- 空白のみは追加しない。追加後は入力を空にし、フォーカスを維持し、追加ボタンが跳ねる(scale 1 → 1.25 → 1、90° 回転)。
- 追加されたタスクは `inbox` に入り、タブも `inbox` に切り替わる。

参考: `src/client/components/Composer.tsx`

---

## 4. フリック(ステータス変更)の仕様

- カードは横方向のみドラッグ可(`dragDirectionLock`、`touch-action: pan-y` で縦スクロールと共存)。
- ドラッグ量に応じてカードの背後から次の状態のレイヤーがせり出す:
  - 右ドラッグ: 左側に「次の状態へ」のレイヤー(今日へ=空色 / 今からへ=紫 / 完了へ=緑のガラス)。
  - 左ドラッグ: 右側に「前の状態へ戻す」のレイヤー(琥珀色のガラス)。
  - レイヤーの不透明度は 0 → 40px で 0.4 → 88px で 1.0。ラベルは scale 0.7 → 1.1。カード自体は最大 ±2.5° 傾く。
- **フリック判定**(ドラッグ終了時): `|offset.x| > 88px` または `|velocity.x| > 550px/s`。
- 判定成立: ステータス変更 → カードはフリック方向へ飛んで退場(x ±480px、opacity 0、scale 0.9、320ms)。残りのカードは `layout` アニメーションで詰まる。件数バッジが更新される。
- 判定不成立: スプリング(stiffness 500 / damping 34)で原点へ戻る。
- **ドラッグ直後の pointerup をタップ扱いにしない**(ドラッグ開始でフラグを立て、終了 50ms 後に下ろす)。

参考: `src/client/components/TaskCard.tsx`, `src/client/components/TaskList.tsx`

---

## 5. 詳細シート

- 下からスプリングで出る(stiffness 380 / damping 36)。背景は暗転+軽いぼかし。背景タップ、×ボタン、下方向へ 120px 以上または 600px/s 以上のドラッグで閉じる。
- 内容(上から):
  1. 本文テキストエリア(blur で保存。空なら元に戻す)
  2. ステータス 4 分割 メモ/今日/今から/完了(インジケータがスライド)
  3. 優先度チップ 低/中/高(同じものをもう一度押すと解除)
  4. 見積もりチップ 15/30/60/90 + 数値入力(分、1〜1440 のみ受理。同じチップをもう一度押すと解除)
  5. ステップのチェックリスト(存在する場合)。チェックは丸が緑に塗りつぶされ、チェックマークがスプリングで出る。取り消し線。
  6. AI 提案カード(「AIで整理」の結果。タイトル・番号付き手順・優先度・「適用」「閉じる」)
  7. アクション行: 「AIで整理」(処理中はアイコンが回転し「整理中…」)、削除(赤)、閉じる
- カード側にはステップの進捗(緑のバー + `done/total`)を表示する。

参考: `src/client/components/TaskSheet.tsx`

---

## 6. ゲスト → ログイン同期

状態: `tasks[]` と `ownerId: string | null`(`null` = ゲスト)。`localStorage` に常時保存。

起動時(`boot`):

1. ローカルを読み、即座に表示する(ゲストでもログイン済みでも)。
2. `GET /api/me` でユーザーを確認(タイムアウト 5s。失敗はゲスト扱い)。
3. ログイン済みなら:
   - `ownerId === null` かつローカルにタスクあり → `POST /api/tasks/import` で**一括取り込み**(`INSERT OR IGNORE`、id はそのまま)。
   - それ以外 → `GET /api/tasks` でサーバーを正とする。
   - 通信失敗時は、同じユーザーのキャッシュならそのまま使う。
   - `ownerId = user.id`。
4. 未ログインなのに `ownerId !== null`(セッション切れ)→ ローカルを空にする(他人のデータを残さない)。
5. スケルトンは最低 450ms 表示してからフェードアウト(ぼかし 6px + scale 1.015、450ms)。

操作時: 常にローカルを先に更新し、ログイン済みなら API を fire-and-forget。失敗時はトースト「同期に失敗しました」のみ(ローカル状態は維持 = オフラインでも使える)。
ログアウト: セッション破棄後、`tasks = []`, `ownerId = null`。

参考: `src/client/store.ts`

---

## 7. AI 整理(Workers AI)

- 入力: タスク本文(最大 2000 文字)。
- 出力(JSON Schema で強制): `{ title: string(≤30字), steps: string[](≤5, 動詞始まり), priority: "low"|"mid"|"high" }`
- モデル: `@cf/meta/llama-3.1-8b-instruct`、`temperature 0.2`、`max_tokens 400`。
- 出力は必ず正規化する(`normalizeRefinement`): 文字列なら最初の `{...}` を抜き出して parse、title が空なら本文 1 行目、steps は文字列のみ・空除去・80 字・5 件まで、priority 不正は `mid`。
- **適用**: `text = title`, `steps = steps.map(s => ({text: s, done: false}))`, `priority = priority`。トーストに「元に戻す」(適用前の text/steps/priority を復元)。
- 失敗時: 503 → トースト「AIを利用できませんでした」。
- ローカル/CI では AI バインディングを外し、`MOCK_AI=1` で決定的モック(1 行目をタイトル、残りを手順、緊急語で high)を返す。

システムプロンプト(日本語)は `src/worker/ai.ts` を参照。

---

## 8. 認証(Google のみ)

- OAuth 2.0 認可コードフロー + PKCE(S256)。scope: `openid email profile`、`prompt=select_account`。
- `state` と `code_verifier` は HMAC 署名付き HttpOnly Cookie(10 分)に保存。
- コールバックで `id_token` の `iss`(`https://accounts.google.com` or `accounts.google.com`)、`aud`、`exp`、`email_verified` を検証。
- セッション: 32 バイトのランダムトークンを HttpOnly / SameSite=Lax / Secure Cookie(30 日)に入れ、DB には **SHA-256 ハッシュ**だけを保存。
- 開発・E2E 専用に `POST /auth/dev-login`(`DEV_LOGIN=1` のときだけ有効。`{reset:true}` でそのユーザーのタスクを全削除)。

参考: `src/worker/auth.ts`, `src/worker/crypto.ts`

---

## 9. API

| Method | Path                                    | Body / 備考                                                                                               |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET    | `/api/me`                               | → `{ user: User \| null }`                                                                                |
| GET    | `/api/tasks`                            | → `{ tasks: Task[] }`(createdAt 降順)                                                                     |
| POST   | `/api/tasks`                            | `Task`(id 任意)→ 201 `{ task }`                                                                           |
| POST   | `/api/tasks/import`                     | `{ tasks: Task[] }`(≤500)→ `{ tasks }`(取り込み後の全件)                                                  |
| PATCH  | `/api/tasks/:id`                        | `Partial<{text,status,priority,steps,estimateMin,actualMs,doingSince,completedAt}>`(空は 400)→ `{ task }` |
| DELETE | `/api/tasks/:id`                        | → `{ ok: true }` / 404                                                                                    |
| POST   | `/api/ai/refine`                        | `{ text }` → `{ refinement }` / 503                                                                       |
| GET    | `/auth/google`, `/auth/google/callback` | リダイレクト                                                                                              |
| POST   | `/auth/logout`                          |                                                                                                           |

未ログインの `/api/*` は 401。入力検証は zod(`src/worker/index.ts`)。

---

## 10. ビジュアル(Liquid Glass / 白ベース)

- 背景 `#f4f6fb`。その上に 3 つのパステルのブロブ(`#bcd3ff` `#ffd1ec` `#c9f5e4`、`blur(70px)`、opacity 0.6)を 28 秒周期でゆっくり漂わせる(transform のみ = GPU)。
- ガラス面 `.glass`:

  ```css
  background: rgba(255,255,255,.55);
  backdrop-filter: blur(22px) saturate(1.7);
  border: 1px solid rgba(255,255,255,.8);
  box-shadow: 0 12px 32px -14px rgba(30,40,80,.22), 0 1px 2px rgba(30,40,80,.06), inset 0 1px 0 rgba(255,255,255,.95);
  ```

  `::before` に 135° と 315° の白いグラデーションでスペキュラハイライト、`::after` に内側 1px の白いリング。
- 強いガラス `.glass-strong`(シート・トースト): 背景 0.78。選択インジケータ `.glass-pill`: 白 0.92 + 影。
- 角丸: カード・コンポーザー 22px、シート上部 28px、タブ・ボタンは pill。
- 文字: システムフォント。本文 16〜17px、メタ 12px、ink `#171922`、mute `#6b7280`、faint `#a3a9b8`。
- 優先度ドット: low 空色 / mid 琥珀 / high ローズ。
- スケルトン: 実 UI と同じ位置・サイズの白いブロックに 1.3 秒周期のシマー。

参考: `src/client/styles.css`, `src/client/components/Skeleton.tsx`, `Background.tsx`

### アニメーション一覧(motion のパラメータ)

| 対象                           | 値                                               |
| ------------------------------ | ------------------------------------------------ |
| カード追加                     | opacity 0→1, y -14→0, scale .96→1, spring 420/36 |
| カード退場(フリック)           | x ±480, opacity 0, scale .9, 320ms ease-out      |
| 並び替え                       | `layout`(spring 420/36)                          |
| タブ・ステータスのインジケータ | `layoutId` spring 500/38                         |
| 件数バッジ更新                 | scale .6→1                                       |
| シート                         | y 100%→0 spring 380/36                           |
| トースト                       | y 40→0 spring 420/32                             |
| チェック                       | scale 0→1 spring 600/30                          |
| 追加ボタン                     | scale [1,1.25,1], rotate [0,90,90] 450ms         |
| ボタン押下                     | whileTap scale .9〜.95                           |
| スケルトン退場                 | opacity 0, scale 1.015, blur 6px, 450ms          |

---

## 11. 受け入れテスト(E2E で検証済みの振る舞い)

1. 起動時に全画面スケルトンが出て、消えた直後にコンポーザーがフォーカスされている。
2. スケルトン表示中に打った文字がコンポーザーに入っている。
3. Enter で追加され、新しいものが上。リロード後も残る。件数バッジが正しい。
4. 空・空白のみは追加されない。IME 変換中の Enter では送信されない。
5. フォーカスがない状態でキーを打つとコンポーザーに入る。
6. 右フリックで inbox→today、左で戻る。inbox で左フリックは跳ね返る。30px の短いドラッグは無視。
7. today を右フリックすると「▶ 今から」固定カードが現れ、経過時間が進む。2 件目を今からにすると
   先のタスクは today に戻る(常に 1 件)。固定カード右フリックで done になり実績が残る。
   done で右フリックは跳ね返る。リロードしても actualMs が残る。
8. doing のままリロードしても計測が継続する(`doingSince` 復元)。
9. シートで見積もりチップを設定・解除でき、カードに `30分` が出る。数値入力は 1〜1440 のみ受理。
10. 今日タブに予実サマリーが出て、計画(見積もり合計)・実績の数字が正しい。メモタブでは出ない。
11. シートで本文・優先度・ステータスを変更できる。削除後「元に戻す」で復活。
    今から中のタスクを削除→「元に戻す」で今からに復帰する。
12. ログイン後「AIで整理」→ 提案 → 適用でステップが出る → チェックで `1/3` 表示 → サーバーにも反映。
13. ゲストのメモ(見積もり・実績つき)がログイン時にサーバーへ取り込まれ、localStorage を消しても復元される。
    ログアウトで手元から消える。
14. 未ログインの `/api/tasks` は 401。

参考: `e2e/app.spec.ts`, `e2e/helpers.ts`(フリックの再現方法)
