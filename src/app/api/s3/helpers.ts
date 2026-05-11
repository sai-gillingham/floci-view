import { NextResponse } from "next/server";

export function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {} as T;

    return body as T;
  } catch {
    return {} as T;
  }
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
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}
