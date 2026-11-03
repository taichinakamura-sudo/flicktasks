import { expect, type Locator, type Page } from "@playwright/test";

export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("skeleton")).toBeHidden({ timeout: 10_000 });
}

export async function addMemo(page: Page, text: string) {
  const composer = page.getByTestId("composer");
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByTestId("task-card").filter({ hasText: text })).toBeVisible();
}

/** カードを水平方向にフリック(pointer events で motion の drag を駆動) */
export async function flick(card: Locator, dir: 1 | -1, distance = 220) {
  const box = await card.boundingBox();
  if (!box) throw new Error("card not visible");
  const page = card.page();
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (dir * distance * i) / steps, y0, { steps: 1 });
  }
  await page.mouse.up();
}

export async function devLogin(page: Page, reset = true) {
  const res = await page.request.post("/auth/dev-login", { data: { reset } });
  expect(res.ok()).toBeTruthy();
}
