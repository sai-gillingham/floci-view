import { NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import { DeleteBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { errorResponse } from "../../helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bucket: string }> }
) {
  try {
    const { bucket } = await params;
    const url = new URL(_request.url);
    const prefix = url.searchParams.get("prefix") ?? "";

    // Note: Delimiter is omitted because floci does not support it.
    // We derive prefixes (folders) from the flat object list instead.
    const result = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
    );

    const allContents = result.Contents ?? [];
    const objects: typeof allContents = [];
    const prefixSet = new Set<string>();

    for (const obj of allContents) {
      const key = obj.Key ?? "";
      const rest = key.slice(prefix.length);
      const slashIndex = rest.indexOf("/");
      if (slashIndex === -1) {
        objects.push(obj);
      } else {
        prefixSet.add(prefix + rest.slice(0, slashIndex + 1));
      }
    }

    const prefixes = Array.from(prefixSet)
      .sort()
      .map((p) => ({ Prefix: p }));

    return NextResponse.json({
      objects,
      prefixes,
      isTruncated: result.IsTruncated ?? false,
      nextContinuationToken: result.NextContinuationToken,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bucket: string }> }
) {
  try {
    const { bucket } = await params;
    await s3Client.send(new DeleteBucketCommand({ Bucket: bucket }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
