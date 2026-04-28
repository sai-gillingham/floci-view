"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { TypeComboBox, type CellType } from "@/components/dynamodb/TypeComboBox";
import { BoolValueComboBox } from "@/components/dynamodb/BoolValueComboBox";
import { PrimaryKeyEditWarningDialog } from "@/components/dynamodb/PrimaryKeyEditWarningDialog";
import { editorToValue, populateFormFromItem, stableStringify } from "@/components/dynamodb/item-dialog-utils";
import type { DynamoItem, JsonValue } from "@/types/dynamodb";
import { getErrorMessage } from "@/types/dynamodb";

const SKIP_PK_SK_WARN_STORAGE_KEY = "floci.dynamodb.pkSkEdit.skipWarn";

export type DynamoItemDialogProps =
  | {
    variant: "add";
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tableName: string;
    keyNames: string[];
    attributeNames: string[];
    onCreated?: () => void | Promise<void>;
  }
  | {
    variant: "edit";
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tableName: string;
    keyNames: string[];
    item: DynamoItem | null;
    focusAttr?: string | null;
    onUpdated?: () => void | Promise<void>;
  };

export function DynamoItemDialog(props: DynamoItemDialogProps) {
  const isAdd = props.variant === "add";
  const { open, onOpenChange, tableName, keyNames } = props;
  const attributeNames = props.variant === "add" ? props.attributeNames : undefined;
  const addAttributeNames = useMemo(
    () => (props.variant === "add" ? attributeNames ?? [] : []),
    [props.variant, attributeNames]
  );
  const editSourceItem = props.variant === "edit" ? props.item : null;
  const editFocusAttr = props.variant === "edit" ? props.focusAttr : undefined;

  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState<string>("{}");
  const [keyDraft, setKeyDraft] = useState<Record<string, { type: CellType; value: string }>>({});
  const [attrs, setAttrs] = useState<Array<{ name: string; type: CellType; value: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pkSkSkipWarn, setPkSkSkipWarn] = useState(false);
  const [pkSkWarnOpen, setPkSkWarnOpen] = useState(false);
  const [pkSkDontShowAgain, setPkSkDontShowAgain] = useState(false);
  const pkSkDontShowAgainRef = useRef(false);
  const [pkSkEditEnabled, setPkSkEditEnabled] = useState(false);

  const keyDraftInit = useMemo(() => {
    const next: Record<string, { type: CellType; value: string }> = {};
    for (const k of keyNames) next[k] = { type: "S", value: "" };
    return next;
  }, [keyNames]);

  useEffect(() => {
    if (!open || props.variant !== "add") return;
    setMode("form");
    setJson("{}");
    setKeyDraft(keyDraftInit);
    setAttrs(
      addAttributeNames.map((name) => ({
        name,
        type: "S" as CellType,
        value: "",
      }))
    );
    setError(null);
  }, [open, props.variant, addAttributeNames, keyDraftInit]);

  useEffect(() => {
    if (!open || props.variant !== "edit") return;
    const item = editSourceItem;
    if (!item) return;
    setMode("form");
    setError(null);
    setPkSkEditEnabled(false);
    setPkSkDontShowAgain(false);
    pkSkDontShowAgainRef.current = false;
    const { keyDraft: kd, attrs: at } = populateFormFromItem(item, keyNames, keyDraftInit);
    setKeyDraft(kd);
    setAttrs(at);
    setJson(JSON.stringify(item, null, 2));
  }, [open, props.variant, editSourceItem, keyNames, keyDraftInit]);

  useEffect(() => {
    if (!isAdd) {
      try {
        const v = localStorage.getItem(SKIP_PK_SK_WARN_STORAGE_KEY);
        setPkSkSkipWarn(v === "1");
      } catch {
        /* ignore */
      }
    }
  }, [isAdd]);

  useEffect(() => {
    if (!open || props.variant !== "edit") return;
    const item = editSourceItem;
    const focusAttr = editFocusAttr;
    if (!item || !focusAttr || keyNames.includes(focusAttr)) return;
    setAttrs((prev) => prev.filter((f) => f.name === focusAttr));
    try {
      setJson(JSON.stringify(item?.[focusAttr], null, 2));
    } catch {
      /* ignore */
    }
  }, [open, props.variant, editSourceItem, editFocusAttr, keyNames]);

  const requestEnablePkSkEdit = () => {
    if (isAdd) return;
    if (pkSkSkipWarn) {
      setPkSkEditEnabled(true);
      return;
    }
    pkSkDontShowAgainRef.current = false;
    setPkSkDontShowAgain(false);
    setPkSkWarnOpen(true);
  };

  const buildItemFromForm = (): DynamoItem => {
    const out: DynamoItem = {};
    for (const k of keyNames) {
      const ed = keyDraft[k] ?? { type: "S" as CellType, value: "" };
      out[k] = editorToValue(ed.type, ed.value);
    }
    for (const f of attrs) {
      const name = f.name.trim();
      if (!name) continue;
      if (f.type === "BOOL" && f.value === "__absent__") continue;
      out[name] = editorToValue(f.type, f.value);
    }
    return out;
  };

  const switchMode = (next: "form" | "json") => {
    if (next === mode) return;
    setError(null);
    try {
      if (next === "json") {
        const obj = buildItemFromForm();
        setJson(JSON.stringify(obj, null, 2));
        setMode("json");
        return;
      }
      const parsed = JSON.parse(json) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON must be an object");
      const { keyDraft: kd, attrs: at } = populateFormFromItem(parsed as DynamoItem, keyNames, keyDraftInit);
      setKeyDraft(kd);
      setAttrs(at);
      setMode("form");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to convert"));
    }
  };

  const addField = () => setAttrs((prev) => [...prev, { name: "", type: "S", value: "" }]);
  const updateField = (idx: number, patch: Partial<{ name: string; type: CellType; value: string }>) =>
    setAttrs((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const removeField = (idx: number) => setAttrs((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (isAdd) {
        let item: DynamoItem = {};
        if (mode === "json") {
          const parsed = JSON.parse(json) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON must be an object");
          item = parsed as DynamoItem;
        } else {
          for (const k of keyNames) {
            const ed = keyDraft[k] ?? { type: "S" as CellType, value: "" };
            if (!ed.value && ed.type !== "NULL") throw new Error(`Key "${k}" is required`);
            item[k] = editorToValue(ed.type, ed.value);
          }
          for (const f of attrs) {
            const name = f.name.trim();
            if (!name) continue;
            if (keyNames.includes(name)) throw new Error(`"${name}" is a key attribute`);
            if (f.type === "BOOL" && f.value === "__absent__") continue;
            if (f.type !== "NULL" && f.value.trim() === "") continue;
            item[name] = editorToValue(f.type, f.value);
          }
        }

        const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(tableName)}/items`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ item }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to put item");

        onOpenChange(false);
        await props.onCreated?.();
      } else {
        const item = editSourceItem;
        if (!item) return;

        let nextItem: DynamoItem = {};
        if (mode === "json") {
          if (editFocusAttr && !keyNames.includes(editFocusAttr)) {
            nextItem = { ...item };
            nextItem[editFocusAttr] = JSON.parse(json) as JsonValue;
          } else {
            const parsed = JSON.parse(json) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON must be an object");
            nextItem = parsed as DynamoItem;
          }
        } else {
          nextItem = buildItemFromForm();
        }

        const oldKey: Record<string, JsonValue> = {};
        for (const k of keyNames) {
          if (!(k in item)) throw new Error(`Missing key "${k}" in original item`);
          if (!(k in nextItem)) throw new Error(`Key "${k}" is required`);
          oldKey[k] = item[k] as JsonValue;
        }

        const keysChanged = keyNames.some((k) => stableStringify(nextItem[k]) !== stableStringify(item[k]));
        if (keysChanged && !pkSkEditEnabled) {
          throw new Error("Primary key attributes cannot be changed unless you explicitly enable PK/SK editing.");
        }

        const set: Record<string, JsonValue> = {};
        const remove: string[] = [];
        const allAttrs = new Set<string>([
          ...Object.keys(item ?? {}).filter((n) => !keyNames.includes(n)),
          ...Object.keys(nextItem ?? {}).filter((n) => !keyNames.includes(n)),
        ]);
        for (const name of allAttrs) {
          const before = (item as Record<string, unknown>)?.[name];
          const after = (nextItem as Record<string, unknown>)?.[name];
          if (after === undefined) {
            if (before !== undefined) remove.push(name);
            continue;
          }
          if (stableStringify(after) !== stableStringify(before)) set[name] = after as JsonValue;
        }

        if (!keysChanged && Object.keys(set).length === 0 && remove.length === 0) {
          onOpenChange(false);
          return;
        }

        if (keysChanged) {
          const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(tableName)}/items`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ oldKey, newItem: nextItem }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Failed to update item");
        } else {
          const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(tableName)}/items`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: oldKey, set, remove }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Failed to update item");
        }

        onOpenChange(false);
        if (props.variant === "edit") await props.onUpdated?.();
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, isAdd ? "Failed to add item" : "Failed to update item"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const title = isAdd ? "Add item" : "Edit item";
  const saveLabel = isAdd ? "Create" : "Save";
  const focusAttr = editFocusAttr;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-dynamodb-item-dialog>
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div
        className="relative w-full max-w-2xl rounded-lg border"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{title}</div>
              <div className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {tableName}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => switchMode("form")}
                className="px-3 py-1.5 rounded-md text-sm border"
                style={{
                  borderColor: "var(--border)",
                  background: mode === "form" ? "var(--bg-tertiary)" : "transparent",
                  color: mode === "form" ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => switchMode("json")}
                className="px-3 py-1.5 rounded-md text-sm border"
                style={{
                  borderColor: "var(--border)",
                  background: mode === "json" ? "var(--bg-tertiary)" : "transparent",
                  color: mode === "json" ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                JSON
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {!isAdd && (
            <PrimaryKeyEditWarningDialog
              open={pkSkWarnOpen}
              dontShowAgainChecked={pkSkDontShowAgain}
              onDontShowAgainCheckedChange={(c) => {
                pkSkDontShowAgainRef.current = c;
                setPkSkDontShowAgain(c);
              }}
              onCancel={() => setPkSkWarnOpen(false)}
              onContinue={() => {
                setPkSkWarnOpen(false);
                setPkSkEditEnabled(true);
                if (pkSkDontShowAgainRef.current) {
                  try {
                    localStorage.setItem(SKIP_PK_SK_WARN_STORAGE_KEY, "1");
                    setPkSkSkipWarn(true);
                  } catch {
                    /* ignore */
                  }
                }
              }}
            />
          )}
          {error && (
            <div className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)", color: "var(--error)" }}>
              {error}
            </div>
          )}

          {mode === "json" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">
                JSON{focusAttr && !keyNames.includes(focusAttr) ? ` (value for "${focusAttr}")` : ""}
              </div>
              <textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                className="w-full min-h-[260px] px-3 py-2 rounded-md border bg-transparent text-sm font-mono"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                placeholder={isAdd ? '{"pk":"1","sk":"a","count":1}' : undefined}
              />
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {isAdd
                  ? "Only JSON objects ({}) are supported."
                  : focusAttr && !keyNames.includes(focusAttr)
                    ? "Editing a single attribute value. Key attributes cannot be changed."
                    : "Only JSON objects ({}) are supported. Key attributes cannot be changed."}
              </div>
            </div>
          )}

          {mode === "form" && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Keys</div>
                  {!isAdd && !pkSkEditEnabled && (
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Click a key field to enable PK/SK editing.
                    </div>
                  )}
                </div>
                {isAdd && keyNames.length === 0 && (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Key schema not available. You can still add fields below.
                  </div>
                )}
                {keyNames.map((k) => {
                  const ed = keyDraft[k] ?? { type: "S" as CellType, value: "" };
                  return (
                    <div key={k} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                        {k}
                      </div>
                      <div className="col-span-3">
                        <div className="relative">
                          <TypeComboBox
                            value={ed.type}
                            onChange={() => { }}
                            disabled
                            className="w-full px-2 py-1 rounded-md border bg-transparent text-sm"
                            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                          />
                          {!isAdd && !pkSkEditEnabled && (
                            <button
                              type="button"
                              className="absolute inset-0 rounded-md"
                              style={{ cursor: "pointer" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                requestEnablePkSkEdit();
                              }}
                              aria-label={`Enable primary key editing for ${k}`}
                            />
                          )}
                        </div>
                      </div>
                      <div className="col-span-5">
                        {isAdd && ed.type === "BOOL" ? (
                          <BoolValueComboBox
                            allowAbsent={false}
                            value={
                              ed.value === "true" || ed.value === "false"
                                ? (ed.value as "true" | "false")
                                : ed.value === "null"
                                  ? "null"
                                  : "null"
                            }
                            onChange={(choice) => {
                              if (choice === "null") {
                                setKeyDraft((prev) => ({ ...prev, [k]: { type: "BOOL", value: "null" } }));
                                return;
                              }
                              if (choice === "__absent__") return;
                              setKeyDraft((prev) => ({ ...prev, [k]: { type: "BOOL", value: choice } }));
                            }}
                            className="w-full px-2 py-1 rounded-md border bg-transparent text-sm"
                            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                          />
                        ) : (
                          <input
                            value={ed.value}
                            onMouseDown={() => {
                              if (!isAdd && !pkSkEditEnabled) requestEnablePkSkEdit();
                            }}
                            onChange={(e) => {
                              if (!isAdd && !pkSkEditEnabled) return;
                              setKeyDraft((prev) => ({ ...prev, [k]: { ...ed, value: e.target.value } }));
                            }}
                            className="w-full px-2 py-1 rounded-md border bg-transparent text-sm"
                            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                            placeholder="value"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Attributes</div>
                  {(isAdd || !focusAttr) && (
                    <button
                      type="button"
                      onClick={addField}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add field
                    </button>
                  )}
                </div>

                {attrs.length === 0 && (
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {isAdd ? "Optional fields can be added here." : "No attributes."}
                  </div>
                )}

                {attrs.map((f, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <input
                        value={f.name}
                        onChange={(e) => updateField(idx, { name: e.target.value })}
                        disabled={!isAdd && !!focusAttr}
                        className="w-full px-2 py-1 rounded-md border bg-transparent text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                        placeholder="attribute name"
                      />
                    </div>
                    <div className="col-span-3">
                      <TypeComboBox
                        value={f.type}
                        onChange={(value) => updateField(idx, { type: value })}
                        className="w-full px-2 py-1 rounded-md border bg-transparent text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      />
                    </div>
                    <div className="col-span-4">
                      {f.type === "BOOL" ? (
                        <BoolValueComboBox
                          allowAbsent
                          value={
                            f.value === "__absent__"
                              ? "__absent__"
                              : f.value === "true" || f.value === "false"
                                ? (f.value as "true" | "false")
                                : f.value === "null"
                                  ? "null"
                                  : "__absent__"
                          }
                          onChange={(choice) => {
                            if (choice === "__absent__") {
                              updateField(idx, { value: "__absent__" });
                              return;
                            }
                            if (choice === "null") {
                              updateField(idx, { type: "BOOL", value: "null" });
                              return;
                            }
                            updateField(idx, { type: "BOOL", value: choice });
                          }}
                          className="w-full px-2 py-1 rounded-md border bg-transparent text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                      ) : (
                        <input
                          value={f.value}
                          onChange={(e) => updateField(idx, { value: e.target.value })}
                          className="w-full px-2 py-1 rounded-md border bg-transparent text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                          placeholder={f.type === "JSON" ? '{"a":1}' : "value"}
                        />
                      )}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        className="p-2 rounded-md border"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                        title="Remove field"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <Save className="w-3.5 h-3.5" /> {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
