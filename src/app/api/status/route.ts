import { NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import { sqsClient } from "@/lib/aws-clients";
import { cloudwatchLogsClient } from "@/lib/aws-clients";
import { cognitoClient } from "@/lib/aws-clients";
import { dynamodbClient } from "@/lib/aws-clients";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { ListQueuesCommand } from "@aws-sdk/client-sqs";
import { DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ListUserPoolsCommand } from "@aws-sdk/client-cognito-identity-provider";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";

export async function GET() {
  const probes = await Promise.allSettled([
    s3Client.send(new ListBucketsCommand({})).then((r) => ({
      service: "S3",
      status: "available" as const,
      count: r.Buckets?.length ?? 0,
      label: "buckets",
    })),
    sqsClient.send(new ListQueuesCommand({})).then((r) => ({
      service: "SQS",
      status: "available" as const,
      count: r.QueueUrls?.length ?? 0,
      label: "queues",
    })),
    cloudwatchLogsClient.send(new DescribeLogGroupsCommand({})).then((r) => ({
      service: "CloudWatch",
      status: "available" as const,
      count: r.logGroups?.length ?? 0,
      label: "log groups",
    })),
    cognitoClient.send(new ListUserPoolsCommand({ MaxResults: 60 })).then((r) => ({
      service: "Cognito",
      status: "available" as const,
      count: r.UserPools?.length ?? 0,
      label: "user pools",
    })),
    dynamodbClient.send(new ListTablesCommand({})).then((r) => ({
      service: "DynamoDB",
      status: "available" as const,
      count: r.TableNames?.length ?? 0,
      label: "tables",
    })),
  ]);

  const services = probes.map((result, i) => {
    const names = ["S3", "SQS", "CloudWatch", "Cognito", "DynamoDB"];
    const labels = ["buckets", "queues", "log groups", "user pools", "tables"];
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      service: names[i],
      status: "error" as const,
      count: 0,
      label: labels[i],
    };
  });

  return NextResponse.json({ services });
}
