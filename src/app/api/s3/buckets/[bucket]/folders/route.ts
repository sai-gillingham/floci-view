import { NextRequest, NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  chunkArray,
  encodeCopySource,
  errorResponse,
  MalformedJsonBodyError,
  normalizeFolderPrefix,
  readJsonBody,
  stringFromUnknown,
} from "@/app/api/s3/helpers";

interface RouteContext {
  params: Promise<{ bucket: string }>;
}

async function listKeys(bucket: string, prefix: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    keys.push(...(result.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])));
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function deleteKeys(bucket: string, keys: string[]) {
  for (const keysChunk of chunkArray(keys, 1000)) {
    const response = await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keysChunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );

    const failures = response.Errors ?? [];
    if (failures.length > 0) {
      const detail = failures
        .map((entry) => {
          const key = entry.Key ?? "(unknown key)";
          const code = entry.Code ?? "Unknown";
          const message = entry.Message ?? "";
          return `${key}: ${code}${message ? ` (${message})` : ""}`;
        })
        .join("; ");
      throw new Error(`S3 DeleteObjects partial failure for bucket "${bucket}": ${detail}`);
    }
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { bucket } = await params;

  try {
    const body = await readJsonBody<{
      action?: unknown;
      prefix?: unknown;
      sourcePrefix?: unknown;
      targetPrefix?: unknown;
    }>(request);
    const action = stringFromUnknown(body.action);

    if (action === "create") {
      const prefix = normalizeFolderPrefix(stringFromUnknown(body.prefix));

      if (!prefix) {
        return NextResponse.json({ error: "prefix is required" }, { status: 400 });
      }

      await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: prefix, Body: "" }));
      return NextResponse.json({ ok: true, folder: { Prefix: prefix } }, { status: 201 });
    }

    if (action === "move") {
      const sourcePrefix = normalizeFolderPrefix(stringFromUnknown(body.sourcePrefix));
      const targetPrefix = normalizeFolderPrefix(stringFromUnknown(body.targetPrefix));

      if (!sourcePrefix || !targetPrefix) {
        return NextResponse.json({ error: "sourcePrefix and targetPrefix are required" }, { status: 400 });
      }

      if (sourcePrefix === targetPrefix) {
        return NextResponse.json({ error: "sourcePrefix and targetPrefix must differ" }, { status: 400 });
      }

      if (targetPrefix.startsWith(sourcePrefix)) {
        return NextResponse.json({ error: "targetPrefix cannot be inside sourcePrefix" }, { status: 400 });
      }

      const keys = await listKeys(bucket, sourcePrefix);

      for (const key of keys) {
        const targetKey = `${targetPrefix}${key.slice(sourcePrefix.length)}`;
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: targetKey,
            CopySource: encodeCopySource(bucket, key),
            MetadataDirective: "COPY",
          }),
        );
      }

      if (keys.length > 0) {
        await deleteKeys(bucket, keys);
      }

      return NextResponse.json({
        ok: true,
        moved: keys.length,
        sourcePrefix,
        targetPrefix,
      });
    }

    return NextResponse.json({ error: "unsupported folder action" }, { status: 400 });
  } catch (error) {
    if (error instanceof MalformedJsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { bucket } = await params;
  const prefix = normalizeFolderPrefix(request.nextUrl.searchParams.get("prefix") ?? "");

  if (!prefix) {
    return NextResponse.json({ error: "prefix is required" }, { status: 400 });
  }

  try {
    const keys = await listKeys(bucket, prefix);

    if (keys.length > 0) {
      await deleteKeys(bucket, keys);
    }

    return NextResponse.json({ ok: true, deleted: keys.length, prefix });
  } catch (error) {
    return errorResponse(error);
  }
}
