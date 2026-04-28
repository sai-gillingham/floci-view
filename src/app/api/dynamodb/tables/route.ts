import { NextResponse } from "next/server";
import { dynamodbClient } from "@/lib/aws-clients";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { getErrorMessage } from "@/types/dynamodb";

export async function GET() {
  try {
    const result = await dynamodbClient.send(new ListTablesCommand({}));
    return NextResponse.json({ tableNames: result.TableNames ?? [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unknown error") }, { status: 500 });
  }
}

