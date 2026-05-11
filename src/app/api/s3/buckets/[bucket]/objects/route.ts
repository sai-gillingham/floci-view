import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  encodeCopySource,
  errorResponse,
  MalformedJsonBodyError,
  metadataFromUnknown,
  readJsonBody,
  stringFromUnknown,
} from "@/app/api/s3/helpers";

interface RouteContext {
  params: Promise<{ bucket: string }>;
}

interface AsyncIterableBody {
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array | string>;
}

interface TransformableBody {
  transformToByteArray?: () => Promise<Uint8Array>;
  transformToString?: () => Promise<string>;
}

function isAsyncIterableBody(body: unknown): body is AsyncIterableBody {
  return Boolean(
    body &&
      typeof body === "object" &&
      Symbol.asyncIterator in body &&
      typeof (body as AsyncIterableBody)[Symbol.asyncIterator] === "function",
  );
}

function isTransformableBody(body: unknown): body is TransformableBody {
  return Boolean(
    body &&
      typeof body === "object" &&
      ("transformToByteArray" in body || "transformToString" in body),
  );
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value);
}

const PREVIEW_MAX_BYTES = 512 * 1024;

function parseContentRangeTotal(contentRange?: string) {
  if (!contentRange) return undefined;
  const m = contentRange.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : undefined;
}

function concatUint8Chunks(chunks: Uint8Array[], total: number) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Reads at most `max` bytes — avoids buffering unbounded S3 payloads for previews. */
async function readAtMostBytes(body: unknown, max: number) {
  if (!body) return { bytes: new Uint8Array(), streamTruncated: false };

  if (typeof body === "string") {
    const encoded = new TextEncoder().encode(body);
    return encoded.byteLength > max
      ? { bytes: encoded.slice(0, max), streamTruncated: true }
      : { bytes: encoded, streamTruncated: false };
  }
  if (body instanceof Uint8Array) {
    return body.byteLength > max
      ? { bytes: body.slice(0, max), streamTruncated: true }
      : { bytes: body, streamTruncated: false };
  }
  if (body instanceof ArrayBuffer) {
    const u8 = new Uint8Array(body);
    return u8.byteLength > max
      ? { bytes: u8.slice(0, max), streamTruncated: true }
      : { bytes: u8, streamTruncated: false };
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    const slice = body.size > max ? body.slice(0, max) : body;
    const buf = await slice.arrayBuffer();
    const u8 = new Uint8Array(buf);
    return { bytes: u8, streamTruncated: body.size > u8.byteLength };
  }

  if (isTransformableBody(body)) {
    if (body.transformToByteArray) {
      const full = await body.transformToByteArray();
      return full.byteLength > max
        ? { bytes: full.slice(0, max), streamTruncated: true }
        : { bytes: full, streamTruncated: false };
    }
    if (body.transformToString) {
      const encoded = new TextEncoder().encode(await body.transformToString());
      return encoded.byteLength > max
        ? { bytes: encoded.slice(0, max), streamTruncated: true }
        : { bytes: encoded, streamTruncated: false };
    }
  }

  if (isAsyncIterableBody(body)) {
    const chunks: Uint8Array[] = [];
    let total = 0;

    for await (const part of body) {
      const u8 = typeof part === "string" ? new TextEncoder().encode(part) : part;
      const remaining = max - total;
      if (remaining <= 0) {
        return { bytes: concatUint8Chunks(chunks, total), streamTruncated: true };
      }
      if (u8.byteLength <= remaining) {
        chunks.push(u8);
        total += u8.byteLength;
      } else {
        chunks.push(u8.slice(0, remaining));
        total += remaining;
        return { bytes: concatUint8Chunks(chunks, total), streamTruncated: true };
      }
    }

    return { bytes: concatUint8Chunks(chunks, total), streamTruncated: false };
  }

  return { bytes: new Uint8Array(), streamTruncated: false };
}

function asyncIterableToReadableStream(body: AsyncIterableBody): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      const chunk = typeof value === "string" ? new TextEncoder().encode(value) : value;
      controller.enqueue(chunk);
    },
  });
}

/** Streams S3 output to the response without buffering the full object in this handler. */
function s3BodyToResponseBody(body: unknown): BodyInit {
  if (body == null) return new Uint8Array(0);
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) return body;

  if (Readable.isReadable(body)) {
    return Readable.toWeb(body as Readable);
  }

  if (isAsyncIterableBody(body)) {
    return asyncIterableToReadableStream(body);
  }

  if (isTransformableBody(body)) {
    if (body.transformToByteArray) {
      return new ReadableStream({
        async start(controller) {
          const u8 = await body.transformToByteArray!();
          controller.enqueue(u8);
          controller.close();
        },
      });
    }
    if (body.transformToString) {
      return new ReadableStream({
        async start(controller) {
          const t = await body.transformToString!();
          controller.enqueue(new TextEncoder().encode(t));
          controller.close();
        },
      });
    }
  }

  return new Uint8Array(0);
}

function isTextContent(contentType?: string) {
  if (!contentType) return true;

  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("xml") ||
    normalized.includes("yaml") ||
    normalized.includes("csv") ||
    normalized.includes("javascript")
  );
}

function downloadNameForKey(key: string) {
  const name = key.split("/").filter(Boolean).pop() ?? "download";
  return name.replace(/"/g, "");
}

function expiresForCopy(bodyExpires: unknown, existing: HeadObjectCommandOutput) {
  const raw = stringFromUnknown(bodyExpires);
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (existing.Expires) return existing.Expires;
  if (existing.ExpiresString) {
    const parsed = new Date(existing.ExpiresString);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function parseMetadataJson(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Malformed metadata JSON");
  }

  return metadataFromUnknown(parsed);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { bucket } = await params;
  const key = request.nextUrl.searchParams.get("key") ?? "";

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  try {
    if (request.nextUrl.searchParams.get("download") === "1") {
      const result = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const headers = new Headers();
      headers.set("content-type", result.ContentType ?? "application/octet-stream");
      if (result.ContentLength != null) {
        headers.set("content-length", String(result.ContentLength));
      }
      headers.set("content-disposition", `attachment; filename="${downloadNameForKey(key)}"`);

      return new NextResponse(s3BodyToResponseBody(result.Body), { headers });
    }

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=0-${PREVIEW_MAX_BYTES - 1}`,
      }),
    );

    const { bytes, streamTruncated } = await readAtMostBytes(result.Body, PREVIEW_MAX_BYTES);
    const rangeTotal = parseContentRangeTotal(result.ContentRange);
    const fullObjectLength = rangeTotal ?? (!streamTruncated ? bytes.byteLength : undefined);
    const contentLengthForJson = fullObjectLength ?? bytes.byteLength;
    const truncated =
      streamTruncated || (rangeTotal != null && bytes.byteLength < rangeTotal);

    const textContent = isTextContent(result.ContentType);
    const body = textContent
      ? new TextDecoder().decode(bytes)
      : Buffer.from(bytes).toString("base64");

    return NextResponse.json({
      object: {
        Key: key,
        ContentType: result.ContentType,
        ContentLength: contentLengthForJson,
        LastModified: result.LastModified,
        ETag: result.ETag,
        Metadata: result.Metadata ?? {},
        Body: body,
        BodyEncoding: textContent ? "text" : "base64",
        Truncated: truncated,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { bucket } = await params;
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const keyValue = stringFromUnknown(formData.get("key"));
      const fileName = isFileLike(file) ? file.name : "";
      const key = keyValue || fileName;

      if (!key) {
        return NextResponse.json({ error: "key is required" }, { status: 400 });
      }

      if (!isFileLike(file)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: new Uint8Array(await file.arrayBuffer()),
          ContentType: stringFromUnknown(formData.get("contentType")) || file.type || undefined,
          Metadata: parseMetadataJson(formData.get("metadata")),
        }),
      );

      return NextResponse.json({ ok: true, object: { Key: key } }, { status: 201 });
    }

    const body = await readJsonBody<{
      key?: unknown;
      content?: unknown;
      contentType?: unknown;
      metadata?: unknown;
    }>(request);
    const key = stringFromUnknown(body.key);

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: stringFromUnknown(body.content),
        ContentType: stringFromUnknown(body.contentType) || undefined,
        Metadata: metadataFromUnknown(body.metadata),
      }),
    );

    return NextResponse.json({ ok: true, object: { Key: key } }, { status: 201 });
  } catch (error) {
    if (error instanceof MalformedJsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Malformed metadata JSON") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { bucket } = await params;

  try {
    const body = await readJsonBody<{
      key?: unknown;
      metadata?: unknown;
      contentType?: unknown;
      cacheControl?: unknown;
      contentDisposition?: unknown;
      contentEncoding?: unknown;
      contentLanguage?: unknown;
      expires?: unknown;
      websiteRedirectLocation?: unknown;
    }>(request);
    const key = stringFromUnknown(body.key);

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const existing = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

    const mergedMetadata = {
      ...(existing.Metadata ?? {}),
      ...metadataFromUnknown(body.metadata),
    };

    await s3Client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: encodeCopySource(bucket, key),
        MetadataDirective: "REPLACE",
        Metadata: mergedMetadata,
        ContentType: stringFromUnknown(body.contentType) || existing.ContentType,
        CacheControl: stringFromUnknown(body.cacheControl) || existing.CacheControl,
        ContentDisposition: stringFromUnknown(body.contentDisposition) || existing.ContentDisposition,
        ContentEncoding: stringFromUnknown(body.contentEncoding) || existing.ContentEncoding,
        ContentLanguage: stringFromUnknown(body.contentLanguage) || existing.ContentLanguage,
        Expires: expiresForCopy(body.expires, existing),
        WebsiteRedirectLocation:
          stringFromUnknown(body.websiteRedirectLocation) || existing.WebsiteRedirectLocation,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MalformedJsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { bucket } = await params;
  let key = request.nextUrl.searchParams.get("key") ?? "";

  try {
    if (!key) {
      const body = await readJsonBody<{ key?: unknown }>(request);
      key = stringFromUnknown(body.key);
    }

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MalformedJsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}
