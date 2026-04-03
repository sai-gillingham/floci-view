import { NextResponse } from "next/server";
import { cloudwatchLogsClient } from "@/lib/aws-clients";
import { DescribeLogGroupsCommand, LogGroup } from "@aws-sdk/client-cloudwatch-logs";
import { promises as fs } from "fs";
import path from "path";

interface FlociLogGroup {
  logGroupName: string;
  createdTime: number;
  retentionInDays: number | null;
  tags: Record<string, string>;
}

async function readFlociLogGroupsFromFile(): Promise<LogGroup[]> {
  const flociDataPath = process.env.FLOCI_DATA_PATH || "/floci-data";
  const filePath = path.join(flociDataPath, "cwlogs-groups.json");

  try {
    const data = await fs.readFile(filePath, "utf-8");
    const groups: Record<string, FlociLogGroup> = JSON.parse(data);

    return Object.values(groups).map((g) => ({
      logGroupName: g.logGroupName,
      creationTime: g.createdTime,
      retentionInDays: g.retentionInDays ?? undefined,
      arn: `arn:aws:logs:${process.env.AWS_REGION || "us-east-1"}:000000000000:log-group:${g.logGroupName}`,
      storedBytes: 0,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const result = await cloudwatchLogsClient.send(new DescribeLogGroupsCommand({}));
    return NextResponse.json({ logGroups: result.logGroups ?? [] });
  } catch (err: any) {
    // Workaround for floci bug: DescribeLogGroups returns InternalServerError
    // Fall back to reading from floci's data file directly
    const logGroups = await readFlociLogGroupsFromFile();
    return NextResponse.json({ logGroups, _fallback: true });
  }
}
