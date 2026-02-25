const { test, expect } = require("@playwright/test");

test("mobile layout shows essential controls in one screen", async ({ page }) => {
  await page.goto("/index.html");

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

test("pause toggles to resume and reset button remains available", async ({ page }) => {
  await page.goto("/index.html");

  const pauseButton = page.getByRole("button", { name: "Pause" });
  const resetButton = page.getByRole("button", { name: "Reset" });
  const dropButton = page.getByRole("button", { name: "DROP" });

  await expect(pauseButton).toBeVisible();
  await expect(resetButton).toBeVisible();
  await expect(dropButton).toBeVisible();

  await pauseButton.click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await resetButton.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});
