import { expect, test } from "@playwright/test";

test.describe("Dashboard", () => {
  test("shows the four service cards with links to their service pages", async ({ page }) => {
    const apiResponse = page.waitForResponse(
      (res) => res.url().includes("/api/status") && res.request().method() === "GET",
    );
    await page.goto("/");
    await apiResponse;

    const main = page.getByRole("main");

    for (const service of ["S3", "SQS", "CloudWatch", "Cognito"]) {
      await expect(main.getByRole("link", { name: new RegExp(service) })).toBeVisible();
    }

    await expect(main.getByRole("link", { name: /S3/ })).toHaveAttribute("href", "/s3");
    await expect(main.getByRole("link", { name: /SQS/ })).toHaveAttribute("href", "/sqs");
    await expect(main.getByRole("link", { name: /CloudWatch/ })).toHaveAttribute(
      "href",
      "/cloudwatch",
    );
    await expect(main.getByRole("link", { name: /Cognito/ })).toHaveAttribute(
      "href",
      "/cognito",
    );
  });
});
