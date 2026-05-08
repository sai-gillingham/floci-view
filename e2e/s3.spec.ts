import { CreateBucketCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { expect, test } from "@playwright/test";
import { flociS3 } from "./fixtures/floci";

const BUCKET = `e2e-${Date.now().toString(36)}`;

test.describe("S3 page", () => {
  test.beforeAll(async () => {
    await flociS3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  });

  test.afterAll(async () => {
    try {
      await flociS3.send(new DeleteBucketCommand({ Bucket: BUCKET }));
    } catch {
      // best effort
    }
  });

  test("lists buckets seeded into Floci", async ({ page }) => {
    await page.goto("/s3");
    await expect(page.getByText(BUCKET, { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});
