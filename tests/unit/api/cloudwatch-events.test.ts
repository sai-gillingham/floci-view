import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
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

  it("returns 400 when startTime is after endTime", async () => {
    const res = await GET(buildRequest({ logGroupName: "g", logStreamName: "s", startTime: "20", endTime: "10" }));
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

  it("passes date range, pagination token, and capped limit to GetLogEvents", async () => {
    cwl.on(GetLogEventsCommand).resolves({
      events: [{ timestamp: 15, message: "within range" }],
      nextForwardToken: "token-2",
      nextBackwardToken: "back-token",
    });
    const res = await GET(
      buildRequest({
        logGroupName: "g",
        logStreamName: "s",
        startTime: "10",
        endTime: "20",
        limit: "500",
        nextToken: "token-1",
      }),
    );
    const body = await res.json();
    const command = cwl.commandCalls(GetLogEventsCommand)[0].args[0];

    expect(body.events).toHaveLength(1);
    expect(body.nextToken).toBe("token-2");
    expect(command.input).toMatchObject({
      logGroupName: "g",
      logStreamName: "s",
      startTime: 10,
      endTime: 20,
      limit: 100,
      nextToken: "token-1",
      startFromHead: true,
    });
  });

  it("uses FilterLogEvents when a filter pattern is supplied", async () => {
    cwl.on(FilterLogEventsCommand).resolves({
      events: [{ timestamp: 15, message: "ERROR failed" }],
      nextToken: "filter-token-2",
    });
    const res = await GET(
      buildRequest({
        logGroupName: "g",
        logStreamName: "s",
        filterPattern: "ERROR",
        startTime: "10",
        endTime: "20",
        limit: "250",
        nextToken: "filter-token-1",
      }),
    );
    const body = await res.json();
    const command = cwl.commandCalls(FilterLogEventsCommand)[0].args[0];

    expect(body.events).toHaveLength(1);
    expect(body.nextToken).toBe("filter-token-2");
    expect(command.input).toMatchObject({
      logGroupName: "g",
      logStreamNames: ["s"],
      filterPattern: "ERROR",
      startTime: 10,
      endTime: 20,
      limit: 100,
      nextToken: "filter-token-1",
    });
  });

  it("returns 500 on SDK error", async () => {
    cwl.on(GetLogEventsCommand).rejects(new Error("kaboom"));
    const res = await GET(buildRequest({ logGroupName: "g", logStreamName: "s" }));
    expect(res.status).toBe(500);
  });
});
