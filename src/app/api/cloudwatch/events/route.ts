import { NextRequest, NextResponse } from "next/server";
import { cloudwatchLogsClient } from "@/lib/aws-clients";
import { GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";

export async function GET(request: NextRequest) {
  const logGroupName = request.nextUrl.searchParams.get("logGroupName");
  const logStreamName = request.nextUrl.searchParams.get("logStreamName");

  if (!logGroupName || !logStreamName) {
    return NextResponse.json({ error: "logGroupName and logStreamName are required" }, { status: 400 });
  }

  try {
    const result = await cloudwatchLogsClient.send(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        startFromHead: false,
      })
    );
    return NextResponse.json({ events: result.events ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
