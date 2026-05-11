import type { CellType } from "@/components/dynamodb/TypeComboBox";
import type { DynamoItem, JsonValue } from "@/types/dynamodb";

export function detectType(v: unknown): CellType {
  if (v === null) return "NULL";
  if (typeof v === "string") return "S";
  if (typeof v === "number") return "N";
  if (typeof v === "boolean") return "BOOL";
  return "JSON";
}

export function cellToEditor(v: unknown): { type: CellType; value: string } {
  const type = detectType(v);
  if (type === "S") return { type, value: typeof v === "string" ? v : "" };
  if (type === "N") return { type, value: typeof v === "number" && Number.isFinite(v) ? String(v) : "" };
  if (type === "BOOL") return { type, value: v === true ? "true" : "false" };
  if (type === "NULL") return { type: "NULL", value: "null" };
  return { type: "JSON", value: JSON.stringify(v ?? null) };
}

export function editorToValue(type: CellType, value: string): JsonValue {
  if (type === "S") return value;
  if (type === "N") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("Invalid number");
    return n;
  }
  if (type === "BOOL") {
    if (value === "null") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error("Invalid boolean (use true/false/null)");
  }
  if (type === "NULL") return null;
  return JSON.parse(value);
}

export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function populateFormFromItem(
  obj: DynamoItem,
  keyNames: string[],
  keyDraftInit: Record<string, { type: CellType; value: string }>
): {
  keyDraft: Record<string, { type: CellType; value: string }>;
  attrs: Array<{ name: string; type: CellType; value: string }>;
} {
  const nextKeys: Record<string, { type: CellType; value: string }> = {};
  for (const k of keyNames) nextKeys[k] = cellToEditor(obj?.[k]);
  const nextAttrs: Array<{ name: string; type: CellType; value: string }> = [];
  for (const [name, value] of Object.entries(obj ?? {})) {
    if (keyNames.includes(name)) continue;
    const ed = cellToEditor(value);
    nextAttrs.push({ name, type: ed.type, value: ed.value });
  }
  return { keyDraft: { ...keyDraftInit, ...nextKeys }, attrs: nextAttrs };
}
