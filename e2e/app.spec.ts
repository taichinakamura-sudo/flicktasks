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
