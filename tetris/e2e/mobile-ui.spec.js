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
  await expect(page.getByRole("link", { name: "Play Block Battle", exact: true })).toHaveAttribute("href", "./tetris_mobile.html");
});
