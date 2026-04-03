import { NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bucket: string }> }
) {
  try {
    const { bucket } = await params;
    const url = new URL(_request.url);
    const prefix = url.searchParams.get("prefix") ?? "";
    const result = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/" })
    );
    return NextResponse.json({
      objects: result.Contents ?? [],
      prefixes: result.CommonPrefixes ?? [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
