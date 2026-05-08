import { expect, test } from "@playwright/test";

test.describe("Dashboard", () => {
  test("shows the four service cards with status badges", async ({ page }) => {
    await page.goto("/");

    for (const service of ["S3", "SQS", "CloudWatch", "Cognito"]) {
      await expect(page.getByRole("heading", { name: service })).toBeVisible();
    }

    await expect(page.getByRole("link", { name: /S3/ })).toHaveAttribute("href", "/s3");
    await expect(page.getByRole("link", { name: /SQS/ })).toHaveAttribute("href", "/sqs");
    await expect(page.getByRole("link", { name: /CloudWatch/ })).toHaveAttribute(
      "href",
      "/cloudwatch",
    );
    await expect(page.getByRole("link", { name: /Cognito/ })).toHaveAttribute(
      "href",
      "/cognito",
    );
  });
});
