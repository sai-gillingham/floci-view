import { expect, test } from "@playwright/test";

test.describe("CloudWatch page", () => {
  test("renders without error and the log-groups API returns 200", async ({ page }) => {
    const apiResponse = page.waitForResponse(
      (res) => res.url().includes("/api/cloudwatch/log-groups") && res.request().method() === "GET",
    );
    await page.goto("/cloudwatch");
    const res = await apiResponse;
    expect(res.status()).toBe(200);

    await expect(page.getByRole("heading", { name: /CloudWatch/i })).toBeVisible();
  });
});
