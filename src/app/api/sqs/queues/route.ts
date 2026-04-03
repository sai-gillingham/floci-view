import { NextResponse } from "next/server";
import { sqsClient } from "@/lib/aws-clients";
import { ListQueuesCommand } from "@aws-sdk/client-sqs";

export async function GET() {
  try {
    const result = await sqsClient.send(new ListQueuesCommand({}));
    return NextResponse.json({ queues: result.QueueUrls ?? [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
