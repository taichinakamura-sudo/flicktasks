import { expect, test } from "@playwright/test";
import { addMemo, devLogin, flick, openApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  // 各テストをゲスト・空の状態から始める
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.request.post("/auth/logout");
});

test("開いた瞬間: 全画面スケルトンが出て、消えた直後にメモ欄へフォーカスされている", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("skeleton")).toBeVisible();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("composer")).toBeFocused();
  await expect(page.getByTestId("composer")).toHaveAttribute("placeholder", "メモ");
});

test("スケルトン表示中に打ち始めた文字もメモ欄に入る", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("skeleton")).toBeVisible();
  await page.keyboard.type("すぐ書く");
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("composer")).toHaveValue("すぐ書く");
});

test("Enter でメモを追加し、リロード後もローカルに残る", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "牛乳を買う");
  await addMemo(page, "企画書のドラフト");
  await expect(page.getByTestId("composer")).toHaveValue("");
  await expect(page.getByTestId("composer")).toBeFocused();
  await expect(page.getByTestId("count-inbox")).toHaveText("2");
  // 新しいものが上
  await expect(page.getByTestId("task-text").first()).toHaveText("企画書のドラフト");

  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("task-card")).toHaveCount(2);
  await expect(page.getByTestId("count-inbox")).toHaveText("2");
});

test("空のメモは追加されない / IME 変換中の Enter では送信されない", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("composer").press("Enter");
  await page.getByTestId("composer").fill("   ");
  await page.getByTestId("composer").press("Enter");
  await expect(page.getByTestId("task-card")).toHaveCount(0);

  await page.getByTestId("composer").fill("へんかんちゅう");
  await page.getByTestId("composer").evaluate((el) => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true }),
    );
  });
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await expect(page.getByTestId("composer")).toHaveValue("へんかんちゅう");
});

test("どこにもフォーカスがない状態でキーを打つとメモ欄に流れる", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("composer").blur();
  await expect(page.getByTestId("composer")).not.toBeFocused();
  await page.keyboard.type("abc");
  await expect(page.getByTestId("composer")).toBeFocused();
  await expect(page.getByTestId("composer")).toHaveValue("abc");
});

test("フリックでステータスを進める / 戻す(メモ⇄今日)", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "フリックするタスク");
  const card = () => page.getByTestId("task-card").filter({ hasText: "フリックするタスク" });

  // 右フリック: メモ → 今日
  await flick(card(), 1);
  await expect(page.getByTestId("count-inbox")).toHaveText("0");
  await expect(page.getByTestId("count-today")).toHaveText("1");
  await expect(card()).toHaveCount(0);

  await page.getByTestId("tab-today").click();
  await expect(card()).toBeVisible();
  await expect(card()).toHaveAttribute("data-status", "today");

  // 左フリック: 今日 → メモ
  await flick(card(), -1);
  await expect(page.getByTestId("count-inbox")).toHaveText("1");
  await expect(page.getByTestId("count-today")).toHaveText("0");

  // メモで左フリックしても何も起きない(跳ね返る)
  await page.getByTestId("tab-inbox").click();
  await flick(card(), -1);
  await expect(page.getByTestId("count-inbox")).toHaveText("1");
  await expect(card()).toBeVisible();

  // 短いドラッグはフリックとみなさない
  await flick(card(), 1, 30);
  await expect(page.getByTestId("count-inbox")).toHaveText("1");
});

test("シートで見積もりを設定・解除できる", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "見積もりタスク");
  const card = () => page.getByTestId("task-card").filter({ hasText: "見積もりタスク" });

  await card().click();
  await page.getByTestId("estimate-30").click();
  await expect(page.getByTestId("estimate-30")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sheet-close").click();
  await expect(card()).toContainText("30分");

  // 同じチップをもう一度押すと解除
  await card().click();
  await page.getByTestId("estimate-30").click();
  await expect(page.getByTestId("estimate-30")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("sheet-close").click();
  await expect(card()).not.toContainText("30分");

  // 数値入力(1〜1440のみ受理)
  await card().click();
  await page.getByTestId("estimate-input").fill("45");
  await page.getByTestId("estimate-input").press("Enter");
  await page.getByTestId("sheet-close").click();
  await expect(card()).toContainText("45分");

  await card().click();
  await page.getByTestId("estimate-input").fill("0");
  await page.getByTestId("estimate-input").press("Enter");
  await page.getByTestId("estimate-input").fill("2000");
  await page.getByTestId("estimate-input").press("Enter");
  await page.getByTestId("sheet-close").click();
  await expect(card()).toContainText("45分");
});

test("今から: 固定カードが現れ自動計測が進み、常に1件に保たれる", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "タスクA");
  await addMemo(page, "タスクB");
  const cardA = () => page.getByTestId("task-card").filter({ hasText: "タスクA" });
  const cardB = () => page.getByTestId("task-card").filter({ hasText: "タスクB" });

  // A: メモ→今日→今から
  await flick(cardA(), 1);
  await page.getByTestId("tab-today").click();
  await flick(cardA(), 1);
  const nowCard = page.getByTestId("now-card");
  await expect(nowCard).toBeVisible();
  await expect(nowCard).toContainText("タスクA");

  // 経過時間が進む
  const t1 = await page.getByTestId("now-elapsed").textContent();
  await page.waitForTimeout(1600);
  const t2 = await page.getByTestId("now-elapsed").textContent();
  expect(t2).not.toBe(t1);

  // Bを今日→今からへ: Aは今日に戻り、固定カードはBになる(常に1件)
  await page.getByTestId("tab-inbox").click();
  await flick(cardB(), 1);
  await page.getByTestId("tab-today").click();
  await flick(cardB(), 1);
  await expect(nowCard).toContainText("タスクB");
  await expect(cardA()).toBeVisible();
  await expect(cardA()).toHaveAttribute("data-status", "today");

  // 固定カードを右フリックで完了 → カードが消え、実績が残る
  await flick(nowCard, 1);
  await expect(nowCard).toBeHidden();
  await page.getByTestId("tab-done").click();
  await expect(cardB()).toHaveAttribute("data-status", "done");

  // 完了カードで右フリックしても何も起きない(跳ね返る)
  await flick(cardB(), 1);
  await expect(cardB()).toBeVisible();
  await expect(cardB()).toHaveAttribute("data-status", "done");

  // リロードしても実績(actualMs)が残っている
  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("flicktasks:v1") ?? "{}") as {
        tasks: { text: string; status: string; actualMs: number }[];
      },
  );
  const b = stored.tasks.find((t) => t.text === "タスクB");
  expect(b?.status).toBe("done");
  expect(b?.actualMs ?? 0).toBeGreaterThan(0);
});

test("今からのままリロードしても計測が継続する", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "継続タスク");
  const card = () => page.getByTestId("task-card").filter({ hasText: "継続タスク" });
  await flick(card(), 1);
  await page.getByTestId("tab-today").click();
  await flick(card(), 1);
  await expect(page.getByTestId("now-card")).toBeVisible();

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("now-card")).toBeVisible();
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("flicktasks:v1") ?? "{}") as {
        tasks: { text: string; doingSince: number | null }[];
      },
  );
  expect(stored.tasks.find((t) => t.text === "継続タスク")?.doingSince).not.toBeNull();
  // 計測が0からやり直しになっていない
  await expect(page.getByTestId("now-elapsed")).not.toHaveText(/^0:00/);
});

test("日付をまたぐと予実サマリーが昨日の完了を引きずらない", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T23:57:00") });
  await openApp(page);
  await addMemo(page, "深夜タスク");
  const card = () => page.getByTestId("task-card").filter({ hasText: "深夜タスク" });

  await card().click();
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.getByTestId("estimate-30").click();
  await expect(page.getByTestId("estimate-30")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sheet-close").click();
  await expect(page.getByTestId("sheet")).toBeHidden();

  // 今日→今から→完了(completedAtは23:57頃)
  await flick(card(), 1);
  await page.getByTestId("tab-today").click();
  await expect(page.getByTestId("plan-summary")).toContainText("計画 30分");
  await flick(card(), 1);
  await expect(page.getByTestId("now-card")).toBeVisible();
  await flick(page.getByTestId("now-card"), 1);
  await expect(page.getByTestId("now-card")).toBeHidden();
  // 今日完了した分はサマリーに含まれ続ける
  await expect(page.getByTestId("plan-summary")).toContainText("計画 30分");

  // 日付をまたぐ → 昨日の完了は対象外になり、today/doingも無いのでサマリーごと消える
  await page.clock.fastForward("05:00");
  await expect(page.getByTestId("plan-summary")).toHaveCount(0);
});

test("今から中のタスクを削除→元に戻すと今からに復帰する", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "削除テスト");
  const card = () => page.getByTestId("task-card").filter({ hasText: "削除テスト" });
  await flick(card(), 1);
  await page.getByTestId("tab-today").click();
  await flick(card(), 1);
  const nowCard = page.getByTestId("now-card");
  await expect(nowCard).toBeVisible();

  await nowCard.click();
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.getByTestId("delete").click();
  await expect(nowCard).toBeHidden();
  await expect(page.getByTestId("toast")).toContainText("削除しました");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(nowCard).toBeVisible();
  await expect(nowCard).toContainText("削除テスト");
});

test("ゲストの見積もり・実績がログイン取り込み後も保たれる", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "同期タスク");
  const card = () => page.getByTestId("task-card").filter({ hasText: "同期タスク" });

  await card().click();
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.getByTestId("estimate-15").click();
  await expect(page.getByTestId("estimate-15")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sheet-close").click();
  await expect(page.getByTestId("sheet")).toBeHidden();

  // 今日→今からで1秒以上計測→今日へ戻して実績を確定
  await flick(card(), 1);
  await page.getByTestId("tab-today").click();
  await flick(card(), 1);
  await expect(page.getByTestId("now-card")).toBeVisible();
  await page.waitForTimeout(1200);
  await flick(page.getByTestId("now-card"), -1);
  await expect(page.getByTestId("now-card")).toBeHidden();

  await devLogin(page);
  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });

  // ローカルを消してもサーバーから見積もり・実績つきで復元される
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  await page.getByTestId("tab-today").click();
  await expect(card()).toContainText("15分");
  const res = await page.request.get("/api/tasks");
  const { tasks } = (await res.json()) as {
    tasks: { text: string; estimateMin: number | null; actualMs: number }[];
  };
  const t = tasks.find((x) => x.text === "同期タスク");
  expect(t?.estimateMin).toBe(15);
  expect(t?.actualMs ?? 0).toBeGreaterThan(1000);
});

test("今日タブに予実サマリーが出る(計画と実績)", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "見積もりあり");
  await page.getByTestId("task-card").filter({ hasText: "見積もりあり" }).click();
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.getByTestId("estimate-30").click();
  await expect(page.getByTestId("estimate-30")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sheet-close").click();
  await expect(page.getByTestId("sheet")).toBeHidden();
  await flick(page.getByTestId("task-card").filter({ hasText: "見積もりあり" }), 1);

  await addMemo(page, "見積もりなし");
  await flick(page.getByTestId("task-card").filter({ hasText: "見積もりなし" }), 1);

  // メモタブでは出ない
  await expect(page.getByTestId("plan-summary")).toHaveCount(0);
  await page.getByTestId("tab-today").click();
  const summary = page.getByTestId("plan-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("計画 30分");
  await expect(summary).toContainText("実績 0分");
});

test("タップで詳細シート: 編集・優先度・削除と元に戻す", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "編集するタスク");
  await page.getByTestId("task-card").first().click();
  const sheet = page.getByTestId("sheet");
  await expect(sheet).toBeVisible();

  await page.getByTestId("sheet-text").fill("編集済みタスク");
  await page.getByTestId("priority-high").click();
  await expect(page.getByTestId("priority-high")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sheet-status-today").click();
  await page.getByTestId("sheet-close").click();
  await expect(sheet).toBeHidden();

  await page.getByTestId("tab-today").click();
  await expect(page.getByTestId("task-text").first()).toHaveText("編集済みタスク");
  await expect(page.getByRole("img", { name: "優先度 高" })).toBeVisible();

  await page.getByTestId("task-card").first().click();
  await page.getByTestId("delete").click();
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText("削除しました");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.getByTestId("task-text").first()).toHaveText("編集済みタスク");
});

test("ログイン後に AI で整理 → 提案を適用 → チェックリストを進める", async ({ page }) => {
  await devLogin(page);
  await openApp(page);
  await expect(page.getByTestId("avatar")).toBeVisible();
  await addMemo(page, "企画書を仕上げる\n構成を決める\n下書きを書く\nレビュー依頼 至急");
  await page.getByTestId("task-card").first().click();
  await page.getByTestId("refine").click();

  const suggestion = page.getByTestId("suggestion");
  await expect(suggestion).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("suggestion-title")).toHaveText("企画書を仕上げる");
  await expect(suggestion).toContainText("優先度 高");
  await page.getByTestId("suggestion-apply").click();

  const steps = page.getByTestId("step");
  await expect(steps).toHaveCount(3);
  await steps.nth(0).click();
  await expect(steps.nth(0)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sheet-close").click();
  await expect(page.getByTestId("task-card").first()).toContainText("1/3");
  await expect(page.getByTestId("task-text").first()).toHaveText("企画書を仕上げる");

  // サーバーにも反映されている
  const res = await page.request.get("/api/tasks");
  const { tasks } = (await res.json()) as { tasks: { text: string; steps: { done: boolean }[] }[] };
  expect(tasks[0].text).toBe("企画書を仕上げる");
  expect(tasks[0].steps.filter((s) => s.done)).toHaveLength(1);
});

test("ゲストのメモはログイン時にサーバーへ取り込まれ、ログアウトで手元から消える", async ({ page }) => {
  await openApp(page);
  await addMemo(page, "ゲストのメモ");
  await expect(page.getByTestId("login")).toBeVisible();

  await devLogin(page);
  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("avatar")).toBeVisible();
  await expect(page.getByTestId("task-card").filter({ hasText: "ゲストのメモ" })).toBeVisible();

  // ローカルを消してもサーバーから復元される
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("task-card").filter({ hasText: "ゲストのメモ" })).toBeVisible();

  await page.getByTestId("avatar").click();
  await expect(page.getByTestId("user-name")).toHaveText("Dev User");
  await page.getByTestId("logout").click();
  await expect(page.getByTestId("login")).toBeVisible();
  await expect(page.getByTestId("task-card")).toHaveCount(0);

  const me = await (await page.request.get("/api/me")).json();
  expect(me.user).toBeNull();
});

test("API: 未ログインではタスク API が 401、Google ログインの入口はリダイレクト設定を要求する", async ({
  page,
}) => {
  const res = await page.request.get("/api/tasks");
  expect(res.status()).toBe(401);
  const login = await page.request.get("/auth/google", { maxRedirects: 0 });
  // テスト環境では GOOGLE_CLIENT_ID 未設定 → 500 で明示的に失敗する(無言で壊れない)
  expect(login.status()).toBe(500);
});
