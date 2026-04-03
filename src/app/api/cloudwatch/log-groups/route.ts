import { NextResponse } from "next/server";
import { cloudwatchLogsClient } from "@/lib/aws-clients";
import { DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";

export async function GET() {
  try {
    const result = await cloudwatchLogsClient.send(new DescribeLogGroupsCommand({}));
    return NextResponse.json({ logGroups: result.logGroups ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
