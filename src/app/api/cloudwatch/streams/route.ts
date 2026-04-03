import { NextRequest, NextResponse } from "next/server";
import { cloudwatchLogsClient } from "@/lib/aws-clients";
import { DescribeLogStreamsCommand, LogStream } from "@aws-sdk/client-cloudwatch-logs";
import { promises as fs } from "fs";
import path from "path";

interface FlociLogStream {
  logStreamName: string;
  logGroupName: string;
  createdTime: number;
  firstEventTime: number | null;
  lastEventTime: number | null;
  lastIngestionTime: number | null;
}

async function readFlociStreamsFromFile(logGroupName: string): Promise<LogStream[]> {
  const flociDataPath = process.env.FLOCI_DATA_PATH || "/floci-data";
  const filePath = path.join(flociDataPath, "cwlogs-streams.json");

  try {
    const data = await fs.readFile(filePath, "utf-8");
    const streams: Record<string, FlociLogStream> = JSON.parse(data);

    return Object.values(streams)
      .filter((s) => s.logGroupName === logGroupName)
      .map((s) => ({
        logStreamName: s.logStreamName,
        creationTime: s.createdTime,
        firstEventTimestamp: s.firstEventTime ?? undefined,
        lastEventTimestamp: s.lastEventTime ?? undefined,
        lastIngestionTime: s.lastIngestionTime ?? undefined,
        arn: `arn:aws:logs:${process.env.AWS_REGION || "us-east-1"}:000000000000:log-group:${logGroupName}:log-stream:${s.logStreamName}`,
        storedBytes: 0,
      }))
      .sort((a, b) => (b.lastEventTimestamp ?? 0) - (a.lastEventTimestamp ?? 0));
  } catch {
    return [];
  }
}

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
    // Workaround for floci bug: DescribeLogStreams returns InternalServerError
    // Fall back to reading from floci's data file directly
    const streams = await readFlociStreamsFromFile(logGroupName);
    return NextResponse.json({ streams, _fallback: true });
  }
}
