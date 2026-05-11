import { NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { errorResponse, readJsonBody, stringFromUnknown } from "../helpers";

export async function GET() {
  try {
    const result = await s3Client.send(new ListBucketsCommand({}));
    return NextResponse.json({ buckets: result.Buckets ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody<{ name?: unknown }>(request);
  const name = stringFromUnknown(body.name);

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: name }));
    return NextResponse.json({ ok: true, bucket: { Name: name } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
