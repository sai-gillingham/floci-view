import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

const fsMock = { readFile: mock(async () => "") };
mock.module("fs", () => ({
  promises: fsMock,
  default: { promises: fsMock },
}));

const { GET } = await import("@/app/api/cloudwatch/log-groups/route");
const cwl = mockClient(CloudWatchLogsClient);

describe("GET /api/cloudwatch/log-groups", () => {
  beforeEach(() => {
    cwl.reset();
    fsMock.readFile.mockReset();
  });

  it("returns the SDK result on the happy path", async () => {
    cwl.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: "/aws/lambda/foo", creationTime: 1 }],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.logGroups).toHaveLength(1);
    expect(body._fallback).toBeUndefined();
  });

  it("falls back to file when the SDK throws", async () => {
    cwl.on(DescribeLogGroupsCommand).rejects(new Error("InternalServerError"));
    fsMock.readFile.mockResolvedValueOnce(
      JSON.stringify({
        "/aws/lambda/foo": {
          logGroupName: "/aws/lambda/foo",
          createdTime: 1700000000000,
          retentionInDays: 14,
          tags: {},
        },
      }),
    );
    const res = await GET();
    const body = await res.json();
    expect(body._fallback).toBe(true);
    expect(body.logGroups[0].logGroupName).toBe("/aws/lambda/foo");
    expect(body.logGroups[0].arn).toContain("arn:aws:logs:us-east-1");
    expect(body.logGroups[0].creationTime).toBe(1700000000000);
  });

  it("returns an empty array when the fallback file is unreadable", async () => {
    cwl.on(DescribeLogGroupsCommand).rejects(new Error("InternalServerError"));
    fsMock.readFile.mockRejectedValueOnce(new Error("ENOENT"));
    const res = await GET();
    const body = await res.json();
    expect(body._fallback).toBe(true);
    expect(body.logGroups).toEqual([]);
  });

  it("preserves null retentionInDays as undefined", async () => {
    cwl.on(DescribeLogGroupsCommand).rejects(new Error("InternalServerError"));
    fsMock.readFile.mockResolvedValueOnce(
      JSON.stringify({
        "/aws/lambda/foo": {
          logGroupName: "/aws/lambda/foo",
          createdTime: 1,
          retentionInDays: null,
          tags: {},
        },
      }),
    );
    const res = await GET();
    const body = await res.json();
    expect(body.logGroups[0].retentionInDays).toBeUndefined();
  });
});
