import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cloudwatch/events/route";

const cwl = mockClient(CloudWatchLogsClient);

const buildRequest = (qs: Record<string, string>) => {
  const url = new URL("http://test/api/cloudwatch/events");
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new NextRequest(url);
};

describe("GET /api/cloudwatch/events", () => {
  beforeEach(() => {
    cwl.reset();
  });

  it("returns 400 when logGroupName is missing", async () => {
    const res = await GET(buildRequest({ logStreamName: "s" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when logStreamName is missing", async () => {
    const res = await GET(buildRequest({ logGroupName: "g" }));
    expect(res.status).toBe(400);
  });

  it("returns the events on success", async () => {
    cwl.on(GetLogEventsCommand).resolves({
      events: [{ timestamp: 1, message: "hello" }],
    });
    const res = await GET(buildRequest({ logGroupName: "g", logStreamName: "s" }));
    const body = await res.json();
    expect(body.events).toHaveLength(1);
  });

  it("returns 500 on SDK error", async () => {
    cwl.on(GetLogEventsCommand).rejects(new Error("kaboom"));
    const res = await GET(buildRequest({ logGroupName: "g", logStreamName: "s" }));
    expect(res.status).toBe(500);
  });
});
