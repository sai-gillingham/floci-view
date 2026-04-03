import { NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import { ListBucketsCommand } from "@aws-sdk/client-s3";

export async function GET() {
  try {
    const result = await s3Client.send(new ListBucketsCommand({}));
    return NextResponse.json({ buckets: result.Buckets ?? [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
