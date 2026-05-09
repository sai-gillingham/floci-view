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

  test("filters groups, streams, events, dates, limits, and message truncation", async ({ page }) => {
    const longErrorMessage = `ERROR failed to charge customer ${"x".repeat(120)} tail-marker`;
    let eventsRequestUrl: URL | undefined;
    let deleteStreamRequestUrl: URL | undefined;
    let streamDeleted = false;

    await page.route("**/api/cloudwatch/log-groups", async (route) => {
      await route.fulfill({
        json: {
          logGroups: [
            {
              logGroupName: "/aws/lambda/orders-prod",
              storedBytes: 2048,
              retentionInDays: 7,
            },
            {
              logGroupName: "/aws/lambda/payments-dev",
              storedBytes: 512,
            },
          ],
        },
      });
    });

    await page.route("**/api/cloudwatch/streams?**", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteStreamRequestUrl = new URL(route.request().url());
        streamDeleted = true;
        await route.fulfill({ json: { ok: true } });
        return;
      }

      await route.fulfill({
        json: {
          streams: streamDeleted
            ? []
            : [
                {
                  logStreamName: "2026/05/08/prod-stream",
                  lastEventTimestamp: Date.parse("2026-05-08T07:30:00.000Z"),
                  storedBytes: 1024,
                },
                {
                  logStreamName: "2026/05/08/debug-stream",
                  lastEventTimestamp: Date.parse("2026-05-08T07:00:00.000Z"),
                  storedBytes: 128,
                },
              ],
        },
      });
    });

    await page.route("**/api/cloudwatch/events?**", async (route) => {
      eventsRequestUrl = new URL(route.request().url());
      const isFiltered = eventsRequestUrl.searchParams.get("filterPattern") === "ERROR";
      const isSecondPage = eventsRequestUrl.searchParams.get("nextToken") === "page-2";
      await route.fulfill({
        json: {
          events: isFiltered
            ? [{ eventId: "2", timestamp: Date.parse("2026-05-08T07:31:00.000Z"), message: longErrorMessage }]
            : isSecondPage
              ? [{ eventId: "3", timestamp: Date.parse("2026-05-08T07:32:00.000Z"), message: "WARN second page" }]
              : [
                  { eventId: "1", timestamp: Date.parse("2026-05-08T07:30:00.000Z"), message: "INFO started" },
                  { eventId: "2", timestamp: Date.parse("2026-05-08T07:31:00.000Z"), message: longErrorMessage },
                ],
          nextToken: isFiltered || isSecondPage ? undefined : "page-2",
        },
      });
    });

    await page.goto("/cloudwatch");

    await page.getByLabel("Filter log groups").fill("orders");
    await expect(page.getByRole("button", { name: /orders-prod/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /payments-dev/ })).toBeHidden();

    await page.getByRole("button", { name: /orders-prod/ }).click();
    await page.getByLabel("Filter log streams").fill("prod");
    await expect(page.getByText("2026/05/08/prod-stream")).toBeVisible();
    await expect(page.getByText("2026/05/08/debug-stream")).toBeHidden();

    await page.getByText("2026/05/08/prod-stream").click();
    await expect(page.getByText("INFO started")).toBeVisible();
    await expect(page.getByText("Page size: 100 events")).toBeVisible();

    const nextPageRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/cloudwatch/events" && url.searchParams.get("nextToken") === "page-2";
    });
    await expect(page.getByRole("button", { name: "Next 100" })).toBeEnabled();
    await page.getByRole("button", { name: "Next 100" }).click();
    const nextPageUrl = new URL((await nextPageRequest).url());
    expect(nextPageUrl.searchParams.get("limit")).toBe("100");
    await expect(page.getByText("WARN second page")).toBeVisible();

    const previousPageRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/cloudwatch/events" && !url.searchParams.has("nextToken");
    });
    await page.getByRole("button", { name: "Previous 100" }).click();
    await previousPageRequest;
    await expect(page.getByText("INFO started")).toBeVisible();

    await page.getByLabel("Filter pattern").fill("ERROR");
    await page.getByLabel("Time range").selectOption("custom");
    await page.getByLabel("Start date and time").fill("2026-05-08T16:00");
    await page.getByLabel("End date and time").fill("2026-05-08T17:00");

    const filteredEventsRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/cloudwatch/events" && url.searchParams.get("filterPattern") === "ERROR";
    });
    await page.getByRole("button", { name: /Apply/ }).click();
    const filteredRequestUrl = new URL((await filteredEventsRequest).url());

    expect(filteredRequestUrl.searchParams.get("filterPattern")).toBe("ERROR");
    expect(filteredRequestUrl.searchParams.get("limit")).toBe("100");
    expect(filteredRequestUrl.searchParams.get("startTime")).not.toBeNull();
    expect(filteredRequestUrl.searchParams.get("endTime")).not.toBeNull();
    await expect(page.getByText("INFO started")).toBeHidden();
    await expect(page.getByText(/ERROR failed to charge customer/)).toBeVisible();

    await page.getByLabel("Truncate message length").fill("50");
    await expect(page.locator("tbody").last()).not.toContainText("tail-marker");

    await page.getByLabel("Truncate messages").uncheck();
    await expect(page.locator("tbody").last()).toContainText("tail-marker");

    page.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain("all archived events");
      await dialog.accept();
    });
    const deleteStreamRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/cloudwatch/streams" && request.method() === "DELETE";
    });
    await page.getByRole("button", { name: "Delete stream" }).click();
    await deleteStreamRequest;

    expect(deleteStreamRequestUrl?.searchParams.get("logGroupName")).toBe("/aws/lambda/orders-prod");
    expect(deleteStreamRequestUrl?.searchParams.get("logStreamName")).toBe("2026/05/08/prod-stream");
    await expect(page.getByText("No streams found")).toBeVisible();
  });
});
