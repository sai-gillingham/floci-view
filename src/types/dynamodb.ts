export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };

// Unmarshalled DynamoDB item as plain JS values.
export type DynamoItem = Record<string, JsonValue | undefined>;

// Primary key object (PK/SK). We keep this practical: primitive-only.
export type DynamoKey = Record<string, JsonPrimitive>;

export function getErrorMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

