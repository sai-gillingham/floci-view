import { NextRequest, NextResponse } from "next/server";
import { cloudwatchLogsClient } from "@/lib/aws-clients";
import {
  FilterLogEventsCommand,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return Math.min(parsed, MAX_LIMIT);
}

function parseEpochMillis(value: string | null) {
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;

  return parsed;
}

export async function GET(request: NextRequest) {
  const logGroupName = request.nextUrl.searchParams.get("logGroupName");
  const logStreamName = request.nextUrl.searchParams.get("logStreamName");
  const filterPattern = request.nextUrl.searchParams.get("filterPattern")?.trim() ?? "";
  const startTime = parseEpochMillis(request.nextUrl.searchParams.get("startTime"));
  const endTime = parseEpochMillis(request.nextUrl.searchParams.get("endTime"));
  const limit = parsePositiveInteger(request.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT);
  const nextToken = request.nextUrl.searchParams.get("nextToken")?.trim() || undefined;

  if (!logGroupName || !logStreamName) {
    return NextResponse.json({ error: "logGroupName and logStreamName are required" }, { status: 400 });
  }

  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
  }

  try {
    if (filterPattern) {
      const result = await cloudwatchLogsClient.send(
        new FilterLogEventsCommand({
          logGroupName,
          logStreamNames: [logStreamName],
          filterPattern,
          startTime,
          endTime,
          limit,
          nextToken,
        })
      );
      return NextResponse.json({
        events: result.events ?? [],
        nextToken: result.nextToken,
        hasNext: Boolean(result.nextToken),
      });
    }

    const result = await cloudwatchLogsClient.send(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        startTime,
        endTime,
        limit,
        nextToken,
        startFromHead: true,
      })
    );
    const events = result.events ?? [];
    const hasNext = Boolean(result.nextForwardToken) && (nextToken ? result.nextForwardToken !== nextToken : events.length > 0);

    return NextResponse.json({
      events,
      nextToken: hasNext ? result.nextForwardToken : undefined,
      nextForwardToken: result.nextForwardToken,
      nextBackwardToken: result.nextBackwardToken,
      hasNext,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
