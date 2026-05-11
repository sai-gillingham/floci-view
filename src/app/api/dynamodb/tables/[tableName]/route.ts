import { NextResponse } from "next/server";
import { dynamodbClient } from "@/lib/aws-clients";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { getErrorMessage } from "@/types/dynamodb";

export async function GET(_: Request, { params }: { params: Promise<{ tableName: string }> }) {
  try {
    const { tableName: raw } = await params;
    const tableName = decodeURIComponent(raw);
    const result = await dynamodbClient.send(new DescribeTableCommand({ TableName: tableName }));
    return NextResponse.json({ table: result.Table });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unknown error") }, { status: 500 });
  }
}

