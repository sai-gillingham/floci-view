import { NextRequest, NextResponse } from "next/server";
import { cloudwatchLogsClient } from "@/lib/aws-clients";
import { DescribeLogStreamsCommand } from "@aws-sdk/client-cloudwatch-logs";

export async function GET(request: NextRequest) {
  const logGroupName = request.nextUrl.searchParams.get("logGroupName");
  if (!logGroupName) {
    return NextResponse.json({ error: "logGroupName is required" }, { status: 400 });
  }

  try {
    const result = await cloudwatchLogsClient.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        orderBy: "LastEventTime",
        descending: true,
      })
    );
    return NextResponse.json({ streams: result.logStreams ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
