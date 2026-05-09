import { expect, test } from "@playwright/test";

const targets = [
  { name: "S3", path: "/s3" },
  { name: "SQS", path: "/sqs" },
  { name: "CloudWatch", path: "/cloudwatch" },
  { name: "Cognito", path: "/cognito" },
];

test.describe("Sidebar navigation", () => {
  for (const target of targets) {
    test(`navigates to ${target.name}`, async ({ page }) => {
      await page.goto("/");
      const sidebar = page.getByRole("complementary").or(page.locator("aside"));
      await sidebar.getByRole("link", { name: target.name }).click();
      await expect(page).toHaveURL(target.path);
    });
  }

  test("Floci logo returns to /", async ({ page }) => {
    await page.goto("/s3");
    await page.getByRole("link", { name: /Floci/ }).first().click();
    await expect(page).toHaveURL("/");
  });
});
