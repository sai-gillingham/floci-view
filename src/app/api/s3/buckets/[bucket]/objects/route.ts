import { NextRequest, NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  encodeCopySource,
  errorResponse,
  metadataFromUnknown,
  readJsonBody,
  stringFromUnknown,
} from "../../../helpers";

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

async function bodyToUint8Array(body: unknown) {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  if (isTransformableBody(body)) {
    if (body.transformToByteArray) return body.transformToByteArray();
    if (body.transformToString) return new TextEncoder().encode(await body.transformToString());
  }

  if (isAsyncIterableBody(body)) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }

    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return bytes;
  }

  return new Uint8Array();
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

function parseMetadataJson(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return {};

  try {
    return metadataFromUnknown(JSON.parse(value));
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { bucket } = await params;
  const key = request.nextUrl.searchParams.get("key") ?? "";

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  try {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await bodyToUint8Array(result.Body);

    if (request.nextUrl.searchParams.get("download") === "1") {
      const headers = new Headers();
      headers.set("content-type", result.ContentType ?? "application/octet-stream");
      headers.set("content-length", String(bytes.byteLength));
      headers.set("content-disposition", `attachment; filename="${downloadNameForKey(key)}"`);

      const responseBody = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(responseBody).set(bytes);

      return new NextResponse(responseBody, { headers });
    }

    const textContent = isTextContent(result.ContentType);
    const body = textContent
      ? new TextDecoder().decode(bytes)
      : Buffer.from(bytes).toString("base64");

    return NextResponse.json({
      object: {
        Key: key,
        ContentType: result.ContentType,
        ContentLength: result.ContentLength ?? bytes.byteLength,
        LastModified: result.LastModified,
        ETag: result.ETag,
        Metadata: result.Metadata ?? {},
        Body: body,
        BodyEncoding: textContent ? "text" : "base64",
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
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { bucket } = await params;
  const body = await readJsonBody<{
    key?: unknown;
    metadata?: unknown;
    contentType?: unknown;
    cacheControl?: unknown;
    contentDisposition?: unknown;
  }>(request);
  const key = stringFromUnknown(body.key);

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  try {
    const existing = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

    await s3Client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: encodeCopySource(bucket, key),
        MetadataDirective: "REPLACE",
        Metadata: metadataFromUnknown(body.metadata),
        ContentType: stringFromUnknown(body.contentType) || existing.ContentType,
        CacheControl: stringFromUnknown(body.cacheControl) || existing.CacheControl,
        ContentDisposition: stringFromUnknown(body.contentDisposition) || existing.ContentDisposition,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { bucket } = await params;
  let key = request.nextUrl.searchParams.get("key") ?? "";

  if (!key) {
    const body = await readJsonBody<{ key?: unknown }>(request);
    key = stringFromUnknown(body.key);
  }

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
