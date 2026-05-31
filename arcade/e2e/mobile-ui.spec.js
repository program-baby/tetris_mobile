const { test, expect } = require("@playwright/test");

async function openSoloGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem("tetrisPlayerNameV1", "TEST");
  });
  await page.goto("/tetris_mobile.html");
  await page.locator("#mode-single").click();
  await expect(page.locator("#title-screen")).not.toHaveClass(/is-open/);
}

test("mobile layout shows essential controls in one screen", async ({ page }) => {
  await openSoloGame(page);

  await expect(page).toHaveTitle(/Tetris Mobile/i);
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("#next")).toBeVisible();

  const controlIds = ["left", "rotate", "right", "soft", "hard"];
  const viewport = page.viewportSize();

  for (const id of controlIds) {
    const button = page.locator(`#${id}`);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
});

test("pause toggles to resume and reset works by holding", async ({ page }) => {
  await openSoloGame(page);

  const pauseButton = page.locator("#pause");
  const resetButton = page.locator("#restart");
  const dropButton = page.getByRole("button", { name: "DROP" });

  await expect(pauseButton).toBeVisible();
  await expect(pauseButton).toHaveText("一時停止");
  await expect(resetButton).toHaveText("リセット長押し");
  await expect(dropButton).toBeVisible();

  await pauseButton.click();
  await expect(pauseButton).toHaveText("再開");

  await resetButton.dispatchEvent("mousedown");
  await expect(resetButton).toHaveText("そのまま長押し");
  await page.waitForTimeout(750);
  await resetButton.dispatchEvent("mouseup");
  await expect(resetButton).toHaveText("リセット長押し");
});

test("portal links to the playable game", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page).toHaveTitle(/Pixel Arcade/i);
  await expect(page.getByRole("heading", { name: /Pixel Arcade/i })).toBeVisible();
  await expect(page.locator('a[href="./tetris_mobile.html"]')).toHaveText("Play");
  await expect(page.locator('a[href="./games/pixel-dirt-rush/"]')).toHaveText("Play");
  await expect(page.locator("#live-rooms")).toHaveCount(0);
});

test("block battle title opens an in-game support report modal", async ({ page }) => {
  await page.goto("/tetris_mobile.html");

  await expect(page.locator("#title-screen")).toHaveClass(/is-open/);
  await page.getByRole("button", { name: "問題報告" }).click();
  await expect(page.locator("#support-report-modal")).toHaveClass(/is-open/);
  await expect(page.locator("#support-report-input")).toBeVisible();
  await expect(page.locator("#support-report-status")).toHaveText("内容を入力して送信してください。");
});

test("pixel dirt rush starts and exposes mobile controls", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pixelDirtRush_best_course01", "32100");
  });
  await page.goto("/games/pixel-dirt-rush/");

  await expect(page).toHaveTitle(/Pixel Dirt Rush/i);
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
  await expect(page.locator("#best-label")).toHaveText("00:32.10");

  const controls = ["Back", "Front", "Jump", "Go"];
  const viewport = page.viewportSize();

  for (const name of controls) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  await page.getByRole("button", { name: "Start Race" }).click();
  await expect(page.locator("#start-screen")).not.toHaveClass(/is-open/);
  await page.getByRole("button", { name: "Go", exact: true }).dispatchEvent("pointerdown");
  await page.waitForTimeout(250);
  await expect(page.locator("#time-label")).not.toHaveText("00:00.00");

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator("#pause-screen")).toHaveClass(/is-open/);
  await expect(page.locator("#resume-button")).toBeVisible();
  const pausedTime = await page.locator("#time-label").textContent();
  await page.waitForTimeout(250);
  await expect(page.locator("#time-label")).toHaveText(pausedTime);
});
