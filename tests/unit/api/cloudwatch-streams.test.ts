import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { NextRequest } from "next/server";

const fsMock = { readFile: mock(async () => "") };
mock.module("fs", () => ({
  promises: fsMock,
  default: { promises: fsMock },
}));

const { GET } = await import("@/app/api/cloudwatch/streams/route");
const cwl = mockClient(CloudWatchLogsClient);

const buildRequest = (qs: Record<string, string>) => {
  const url = new URL("http://test/api/cloudwatch/streams");
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new NextRequest(url);
};

describe("GET /api/cloudwatch/streams", () => {
  beforeEach(() => {
    cwl.reset();
    fsMock.readFile.mockReset();
  });

  it("returns 400 when logGroupName is missing", async () => {
    const res = await GET(buildRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns the SDK result on the happy path", async () => {
    cwl.on(DescribeLogStreamsCommand).resolves({
      logStreams: [{ logStreamName: "s1", lastEventTimestamp: 100 }],
    });
    const res = await GET(buildRequest({ logGroupName: "g" }));
    const body = await res.json();
    expect(body.streams).toHaveLength(1);
    expect(body._fallback).toBeUndefined();
  });

  it("filters fallback streams by logGroupName and sorts descending", async () => {
    cwl.on(DescribeLogStreamsCommand).rejects(new Error("InternalServerError"));
    fsMock.readFile.mockResolvedValueOnce(
      JSON.stringify({
        a: {
          logStreamName: "older",
          logGroupName: "g",
          createdTime: 1,
          firstEventTime: 1,
          lastEventTime: 50,
          lastIngestionTime: 60,
        },
        b: {
          logStreamName: "newer",
          logGroupName: "g",
          createdTime: 1,
          firstEventTime: 1,
          lastEventTime: 200,
          lastIngestionTime: 210,
        },
        c: {
          logStreamName: "other-group",
          logGroupName: "different",
          createdTime: 1,
          firstEventTime: 1,
          lastEventTime: 999,
          lastIngestionTime: 999,
        },
      }),
    );
    const res = await GET(buildRequest({ logGroupName: "g" }));
    const body = await res.json();
    expect(body._fallback).toBe(true);
    expect(body.streams.map((s: { logStreamName: string }) => s.logStreamName)).toEqual([
      "newer",
      "older",
    ]);
    expect(body.streams[0].arn).toContain("arn:aws:logs:us-east-1");
  });

  it("returns empty when fallback file is unreadable", async () => {
    cwl.on(DescribeLogStreamsCommand).rejects(new Error("InternalServerError"));
    fsMock.readFile.mockRejectedValueOnce(new Error("ENOENT"));
    const res = await GET(buildRequest({ logGroupName: "g" }));
    const body = await res.json();
    expect(body._fallback).toBe(true);
    expect(body.streams).toEqual([]);
  });
});
