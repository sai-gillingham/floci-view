import { NextResponse } from "next/server";

export class MalformedJsonBodyError extends Error {
  constructor(cause?: unknown) {
    super("Malformed JSON body", { cause });
    this.name = "MalformedJsonBodyError";
  }
}

export function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  const text = await request.text();
  const trimmed = text.trim();
  if (!trimmed) return {} as T;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new MalformedJsonBodyError(cause);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {} as T;

  return parsed as T;
}

export function metadataFromUnknown(value: unknown) {
  const metadata: Record<string, string> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) return metadata;

  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim().toLowerCase();
    if (!key || rawValue === undefined || rawValue === null) continue;

    const metadataValue = String(rawValue).trim();
    if (metadataValue) metadata[key] = metadataValue;
  }

  return metadata;
}

export function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeFolderPrefix(value: string) {
  const prefix = value.trim().replace(/^\/+/, "");
  if (!prefix) return "";

  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

export function encodeCopySource(bucket: string, key: string) {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");

  return `${encodedBucket}/${encodedKey}`;
}

export function chunkArray<T>(items: T[], chunkSize: number) {
  const floored = Math.floor(chunkSize);
  const size = Number.isFinite(chunkSize) && floored >= 1 ? floored : 1;
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
