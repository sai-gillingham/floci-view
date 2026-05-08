import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { ListQueuesCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GET } from "@/app/api/status/route";

const s3 = mockClient(S3Client);
const sqs = mockClient(SQSClient);
const cwl = mockClient(CloudWatchLogsClient);
const cognito = mockClient(CognitoIdentityProviderClient);

describe("GET /api/status", () => {
  beforeEach(() => {
    s3.reset();
    sqs.reset();
    cwl.reset();
    cognito.reset();
  });

  it("returns four service entries with counts when all probes succeed", async () => {
    s3.on(ListBucketsCommand).resolves({ Buckets: [{ Name: "a" }, { Name: "b" }] });
    sqs.on(ListQueuesCommand).resolves({ QueueUrls: ["q"] });
    cwl.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: "/x" }, { logGroupName: "/y" }, { logGroupName: "/z" }],
    });
    cognito.on(ListUserPoolsCommand).resolves({ UserPools: [] });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services).toHaveLength(4);

    const byName = Object.fromEntries(
      body.services.map((s: { service: string }) => [s.service, s]),
    );
    expect(byName.S3).toMatchObject({ status: "available", count: 2, label: "buckets" });
    expect(byName.SQS).toMatchObject({ status: "available", count: 1, label: "queues" });
    expect(byName.CloudWatch).toMatchObject({
      status: "available",
      count: 3,
      label: "log groups",
    });
    expect(byName.Cognito).toMatchObject({
      status: "available",
      count: 0,
      label: "user pools",
    });
  });

  it("isolates a single failure to its own service", async () => {
    s3.on(ListBucketsCommand).resolves({ Buckets: [] });
    sqs.on(ListQueuesCommand).rejects(new Error("sqs down"));
    cwl.on(DescribeLogGroupsCommand).resolves({ logGroups: [] });
    cognito.on(ListUserPoolsCommand).resolves({ UserPools: [] });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const sqsEntry = body.services.find((s: { service: string }) => s.service === "SQS");
    const s3Entry = body.services.find((s: { service: string }) => s.service === "S3");
    expect(sqsEntry).toMatchObject({ status: "error", count: 0, label: "queues" });
    expect(s3Entry).toMatchObject({ status: "available", count: 0 });
  });

  it("preserves order: S3, SQS, CloudWatch, Cognito", async () => {
    s3.on(ListBucketsCommand).resolves({});
    sqs.on(ListQueuesCommand).resolves({});
    cwl.on(DescribeLogGroupsCommand).resolves({});
    cognito.on(ListUserPoolsCommand).resolves({});
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services.map((s: { service: string }) => s.service)).toEqual([
      "S3",
      "SQS",
      "CloudWatch",
      "Cognito",
    ]);
  });
});
