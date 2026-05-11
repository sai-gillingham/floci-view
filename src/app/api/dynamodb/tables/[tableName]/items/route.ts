import { NextResponse } from "next/server";
import { dynamodbClient } from "@/lib/aws-clients";
import { DeleteItemCommand, PutItemCommand, ScanCommand, UpdateItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoItem, DynamoKey } from "@/types/dynamodb";
import { getErrorMessage } from "@/types/dynamodb";

function decodeCursor(cursor?: string | null): Record<string, AttributeValue> | undefined {
  if (!cursor) return undefined;
  try {
    const json = Buffer.from(cursor, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, AttributeValue>;
  } catch {
    return undefined;
  }
}

function encodeCursor(key?: Record<string, AttributeValue>): string | null {
  if (!key) return null;
  try {
    return Buffer.from(JSON.stringify(key), "utf8").toString("base64");
  } catch {
    return null;
  }
}

function buildUpdateExpression(args: { set?: Record<string, unknown>; remove?: string[] }) {
  const set = args.set ?? {};
  const remove = args.remove ?? [];

  const ExpressionAttributeNames: Record<string, string> = {};
  const ExpressionAttributeValues: Record<string, AttributeValue> = {};
  const setExprs: string[] = [];
  const removeExprs: string[] = [];

  let idx = 0;
  for (const [attr, value] of Object.entries(set)) {
    const nameKey = `#n${idx}`;
    const valueKey = `:v${idx}`;
    idx += 1;
    ExpressionAttributeNames[nameKey] = attr;
    ExpressionAttributeValues[valueKey] = marshall({ v: value }, { removeUndefinedValues: true }).v;
    setExprs.push(`${nameKey} = ${valueKey}`);
  }

  for (const attr of remove) {
    const nameKey = `#n${idx}`;
    idx += 1;
    ExpressionAttributeNames[nameKey] = attr;
    removeExprs.push(`${nameKey}`);
  }

  const parts: string[] = [];
  if (setExprs.length) parts.push(`SET ${setExprs.join(", ")}`);
  if (removeExprs.length) parts.push(`REMOVE ${removeExprs.join(", ")}`);

  return {
    UpdateExpression: parts.join(" "),
    ExpressionAttributeNames: Object.keys(ExpressionAttributeNames).length ? ExpressionAttributeNames : undefined,
    ExpressionAttributeValues: Object.keys(ExpressionAttributeValues).length ? ExpressionAttributeValues : undefined,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ tableName: string }> }) {
  try {
    const url = new URL(req.url);
    const { tableName: raw } = await params;
    const tableName = decodeURIComponent(raw);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "25")));
    const cursor = url.searchParams.get("cursor");
    const exclusiveStartKey = decodeCursor(cursor);

    const result = await dynamodbClient.send(
      new ScanCommand({
        TableName: tableName,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    const items = (result.Items ?? []).map((it) => unmarshall(it) as DynamoItem);
    const lastEvaluatedKey = result.LastEvaluatedKey ?? undefined;
    const nextCursor = encodeCursor(lastEvaluatedKey);

    return NextResponse.json({
      items,
      nextCursor,
      scannedCount: result.ScannedCount ?? 0,
      count: result.Count ?? items.length,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unknown error") }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ tableName: string }> }) {
  try {
    const { tableName: raw } = await params;
    const tableName = decodeURIComponent(raw);
    const body = await req.json();
    const item = body?.item as DynamoItem | undefined;
    if (!item || typeof item !== "object") {
      return NextResponse.json({ error: "item is required" }, { status: 400 });
    }

    await dynamodbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unknown error") }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ tableName: string }> }) {
  try {
    const { tableName: raw } = await params;
    const tableName = decodeURIComponent(raw);
    const body = await req.json();
    const key = body?.key as DynamoKey | undefined;
    if (!key || typeof key !== "object") {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    await dynamodbClient.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: marshall(key, { removeUndefinedValues: true }),
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unknown error") }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tableName: string }> }) {
  try {
    const { tableName: raw } = await params;
    const tableName = decodeURIComponent(raw);
    const body = await req.json();
    const key = body?.key as DynamoKey | undefined;
    const set = body?.set as Record<string, unknown> | undefined;
    const remove = body?.remove as string[] | undefined;

    if (!key || typeof key !== "object") {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    if ((!set || typeof set !== "object") && (!Array.isArray(remove) || remove.length === 0)) {
      return NextResponse.json({ error: "set or remove is required" }, { status: 400 });
    }

    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } = buildUpdateExpression({
      set: set ?? undefined,
      remove: Array.isArray(remove) ? remove : undefined,
    });

    if (!UpdateExpression) {
      return NextResponse.json({ error: "empty update" }, { status: 400 });
    }

    const result = await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall(key, { removeUndefinedValues: true }),
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const attributes = result.Attributes ? (unmarshall(result.Attributes) as DynamoItem) : null;
    return NextResponse.json({ ok: true, attributes });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unknown error") }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ tableName: string }> }) {
  try {
    const { tableName: raw } = await params;
    const tableName = decodeURIComponent(raw);
    const body = await req.json();
    const oldKey = body?.oldKey as DynamoKey | undefined;
    const newItem = body?.newItem as DynamoItem | undefined;

    if (!oldKey || typeof oldKey !== "object") {
      return NextResponse.json({ error: "oldKey is required" }, { status: 400 });
    }
    if (!newItem || typeof newItem !== "object") {
      return NextResponse.json({ error: "newItem is required" }, { status: 400 });
    }

    // Put first, then delete old key. This can leave duplicates if delete fails.
    await dynamodbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(newItem, { removeUndefinedValues: true }),
      })
    );

    await dynamodbClient.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: marshall(oldKey, { removeUndefinedValues: true }),
      })
    );

    return NextResponse.json({ ok: true, mode: "deletePut" });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Unknown error") }, { status: 500 });
  }
}

