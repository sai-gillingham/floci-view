"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AddItemDialog } from "@/components/dynamodb/AddItemDialog";
import { UnsavedChangesDialog } from "@/components/dynamodb/UnsavedChangesDialog";
import { DynamoOverview } from "@/components/dynamodb/DynamoOverview";
import { DynamoItems } from "@/components/dynamodb/DynamoItems";
import { DynamoTableList } from "@/components/dynamodb/DynamoTableList";
import { EditItemDialog } from "@/components/dynamodb/EditItemDialog";
import { PrimaryKeyEditWarningDialog } from "@/components/dynamodb/PrimaryKeyEditWarningDialog";
import { ConfirmDialog } from "@/components/dynamodb/ConfirmDialog";
import type { TableDescription } from "@aws-sdk/client-dynamodb";
import type { DynamoItem, DynamoKey, JsonPrimitive, JsonValue } from "@/types/dynamodb";
import { getErrorMessage } from "@/types/dynamodb";

type DynamoTable = TableDescription;

type Item = DynamoItem;

type CellType = "S" | "N" | "BOOL" | "NULL" | "JSON";

function detectType(v: unknown): CellType {
  if (v === null) return "NULL";
  if (typeof v === "string") return "S";
  if (typeof v === "number") return "N";
  if (typeof v === "boolean") return "BOOL";
  return "JSON";
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  const rec = obj as Record<string, unknown>;
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

function cellToEditor(v: unknown): { type: CellType; value: string } {
  const type = detectType(v);
  if (type === "S") return { type, value: typeof v === "string" ? v : "" };
  if (type === "N") return { type, value: typeof v === "number" && Number.isFinite(v) ? String(v) : "" };
  if (type === "BOOL") return { type, value: v === true ? "true" : "false" };
  if (type === "NULL") return { type, value: "null" };
  return { type: "JSON", value: JSON.stringify(v ?? null) };
}

function cellToEditorWithHint(v: unknown, hint?: CellType | null): { type: CellType; value: string } {
  if (v === undefined && hint) {
    if (hint === "S") return { type: "S", value: "" };
    if (hint === "N") return { type: "N", value: "0" };
    if (hint === "BOOL") return { type: "BOOL", value: "false" };
    if (hint === "NULL") return { type: "NULL", value: "null" };
    return { type: "JSON", value: "{}" };
  }
  return cellToEditor(v);
}

function editorToValue(type: CellType, value: string): JsonValue {
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
    throw new Error("Invalid boolean (use true/false)");
  }
  if (type === "NULL") return null;
  // JSON
  return JSON.parse(value);
}

export default function DynamoDBPage() {
  const SKIP_PK_SK_WARN_STORAGE_KEY = "floci.dynamodb.pkSkEdit.skipWarn";
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableInfo, setTableInfo] = useState<DynamoTable | null>(null);
  const [tab, setTab] = useState<"overview" | "items">("items");

  const [items, setItems] = useState<Item[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [limit, setLimit] = useState(50);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);

  const [editCell, setEditCell] = useState<null | { rowKey: string; item: Item; attr: string; draft: { type: CellType; value: string } }>(
    null
  );
  const [editCellWasUnset, setEditCellWasUnset] = useState(false);
  const [editCellOriginalWasUndefined, setEditCellOriginalWasUndefined] = useState(false);
  const [editCellTouched, setEditCellTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editDialogItem, setEditDialogItem] = useState<Item | null>(null);
  const [editDialogFocusAttr, setEditDialogFocusAttr] = useState<string | null>(null);

  const [selectedKeySigs, setSelectedKeySigs] = useState<Set<string>>(new Set());
  const [selectedKeysBySig, setSelectedKeysBySig] = useState<Record<string, DynamoKey>>({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    | null
    | { type: "switchCell"; item: Item; rowKey: string; attr: string }
    | { type: "endCell" }
  >(null);
  const [focusReturn, setFocusReturn] = useState<null | { key: string; part: "value" | "type" }>(null);

  const [pkSkWarnOpen, setPkSkWarnOpen] = useState(false);
  const [pkSkDontShowAgain, setPkSkDontShowAgain] = useState(false);
  const [pkSkSkipWarn, setPkSkSkipWarn] = useState(false);
  const [pkSkWarnPending, setPkSkWarnPending] = useState<null | { item: Item; rowKey: string; attr: string }>(null);

  const keyNames = useMemo(() => {
    const ks = tableInfo?.KeySchema ?? [];
    const out: string[] = [];
    for (const k of ks) {
      if (k?.AttributeName) out.push(k.AttributeName);
    }
    return out;
  }, [tableInfo]);

  const currentColumns = useMemo(() => {
    const cols = new Set<string>();
    for (const it of items) {
      Object.keys(it ?? {}).forEach((k) => cols.add(k));
    }
    // keys first, then rest
    const rest = Array.from(cols).filter((c) => !keyNames.includes(c)).sort();
    return [...keyNames, ...rest];
  }, [items, keyNames]);

  const fetchTables = useCallback(async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const res = await fetch("/api/dynamodb/tables");
      const data = await res.json();
      setTables(data.tableNames ?? []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load tables"));
    } finally {
      setLoadingTables(false);
    }
  }, []);

  const fetchTableInfo = useCallback(async (tableName: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(tableName)}`);
      const data = await res.json();
      setTableInfo(data.table ?? null);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load table info"));
    }
  }, []);

  const fetchItems = useCallback(
    async (tableName: string, opts?: { cursor?: string | null }) => {
      setLoadingItems(true);
      setError(null);
      try {
        const q = new URLSearchParams();
        q.set("limit", String(limit));
        if (opts?.cursor) q.set("cursor", opts.cursor);
        const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(tableName)}/items?${q.toString()}`);
        const data = await res.json();
        setItems(data.items ?? []);
        setCursor(data.nextCursor ?? null);
      } catch (e: unknown) {
        setError(getErrorMessage(e, "Failed to load items"));
      } finally {
        setLoadingItems(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    void fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SKIP_PK_SK_WARN_STORAGE_KEY);
      setPkSkSkipWarn(v === "1");
    } catch { }
  }, []);

  useEffect(() => {
    if (!selectedTable) return;
    setTableInfo(null);
    setItems([]);
    setTab("items");
    setCursor(null);
    setCursorStack([null]);
    setCursorIndex(0);
    setEditCell(null);
    setEditCellWasUnset(false);
    setEditCellOriginalWasUndefined(false);
    setEditCellTouched(false);
    setSelectedKeySigs(new Set());
    setSelectedKeysBySig({});
    void fetchTableInfo(selectedTable);
    void fetchItems(selectedTable, { cursor: null });
  }, [fetchItems, fetchTableInfo, selectedTable]);

  const rowKeyForItem = (it: Item, idx: number) => {
    if (keyNames.length) {
      return stableStringify(
        keyNames.reduce<Record<string, JsonValue | undefined>>((acc, k) => {
          acc[k] = it?.[k];
          return acc;
        }, {})
      );
    }
    // key schema が取れない/空の時でも React key が重複しないようにする
    return `${stableStringify(it)}:${idx}`;
  };

  // add-item dialog state is managed in a separate component

  const cancelEditCell = useCallback(() => {
    setEditCell(null);
    setEditCellWasUnset(false);
    setEditCellOriginalWasUndefined(false);
    setEditCellTouched(false);
  }, []);

  const columnTypeHint = (attr: string): CellType | null => {
    for (const it of items) {
      const v = it?.[attr];
      if (v !== undefined) return detectType(v);
    }
    return null;
  };

  const hasUnsavedCell = useCallback(() => {
    if (!editCell) return false;
    // If the cell was originally unset and the user didn't touch anything, treat as no-op.
    if (editCellOriginalWasUndefined && !editCellTouched) return false;
    if (editCellWasUnset) return editCell.item?.[editCell.attr] !== undefined;
    try {
      const nextValue = editorToValue(editCell.draft.type, editCell.draft.value);
      const before = editCell.item?.[editCell.attr];
      return JSON.stringify(nextValue) !== JSON.stringify(before);
    } catch {
      return true;
    }
  }, [editCell, editCellOriginalWasUndefined, editCellTouched, editCellWasUnset]);

  const saveEditCell = async () => {
    if (!selectedTable) return;
    if (!editCell) return;
    setError(null);
    try {
      const key: DynamoKey = {};
      for (const k of keyNames) key[k] = editCell.item?.[k] as JsonPrimitive;

      const set: Record<string, JsonValue> = {};
      const remove: string[] = [];

      if (keyNames.includes(editCell.attr)) {
        // PK/SK edit: DynamoDB cannot update keys. Implement as PutItem(new) + DeleteItem(old).
        const oldKey = key;
        const nextKeyValue = editorToValue(editCell.draft.type, editCell.draft.value);
        const beforeKeyValue = editCell.item?.[editCell.attr];
        // If key value didn't actually change, treat as no-op (otherwise PUT then DELETE would delete the item).
        if (JSON.stringify(nextKeyValue) === JSON.stringify(beforeKeyValue)) {
          cancelEditCell();
          return;
        }
        const newItem = { ...(editCell.item ?? {}), [editCell.attr]: nextKeyValue };

        const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(selectedTable)}/items`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ oldKey, newItem }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to update item");
      } else {
        if (editCellWasUnset) {
          remove.push(editCell.attr);
        } else {
          set[editCell.attr] = editorToValue(editCell.draft.type, editCell.draft.value);
        }

        const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(selectedTable)}/items`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, set, remove }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to update item");
      }

      await fetchItems(selectedTable, { cursor: cursorStack[cursorIndex] ?? null });
      cancelEditCell();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to save"));
    }
  };

  const requestEditCell = async (it: Item, rowKey: string, attr: string) => {
    if (keyNames.includes(attr) && !pkSkSkipWarn) {
      setPkSkWarnPending({ item: it, rowKey, attr });
      setPkSkDontShowAgain(false);
      setPkSkWarnOpen(true);
      return;
    }
    if (!editCell) {
      const originalUndefined = it?.[attr] === undefined;
      setEditCell({ rowKey, item: it, attr, draft: cellToEditorWithHint(it?.[attr], columnTypeHint(attr)) });
      setEditCellWasUnset(false);
      setEditCellOriginalWasUndefined(originalUndefined);
      setEditCellTouched(false);
      return;
    }
    if (editCell.rowKey === rowKey && editCell.attr === attr) return;

    if (!hasUnsavedCell()) {
      const originalUndefined = it?.[attr] === undefined;
      setEditCell({ rowKey, item: it, attr, draft: cellToEditorWithHint(it?.[attr], columnTypeHint(attr)) });
      setEditCellWasUnset(false);
      setEditCellOriginalWasUndefined(originalUndefined);
      setEditCellTouched(false);
      return;
    }

    setPendingAction({ type: "switchCell", item: it, rowKey, attr });
    if (editCell) {
      const active = document.activeElement as HTMLElement | null;
      const key = `${editCell.rowKey}::${editCell.attr}`;
      const partAttr = active?.getAttribute?.("data-inline-edit-focus-part");
      const part = partAttr === "value" ? "value" : "type";
      setFocusReturn({ key, part });
    }
    setConfirmOpen(true);
  };

  const requestEndEditCell = useCallback(async () => {
    if (!editCell) return;
    if (!hasUnsavedCell()) {
      cancelEditCell();
      return;
    }
    setPendingAction({ type: "endCell" });
    if (editCell) {
      const active = document.activeElement as HTMLElement | null;
      const key = `${editCell.rowKey}::${editCell.attr}`;
      const partAttr = active?.getAttribute?.("data-inline-edit-focus-part");
      const part = partAttr === "value" ? "value" : "type";
      setFocusReturn({ key, part });
    }
    setConfirmOpen(true);
  }, [cancelEditCell, editCell, hasUnsavedCell]);

  useEffect(() => {
    if (!editCell) return;

    const isClickOnScrollbar = (e: MouseEvent) => {
      const path = e.composedPath?.() ?? [];
      for (const p of path) {
        if (!(p instanceof HTMLElement)) continue;
        const el = p;
        const rect = el.getBoundingClientRect();
        if (!rect || !Number.isFinite(rect.left)) continue;

        // vertical scrollbar region
        if (el.scrollHeight > el.clientHeight) {
          if (e.clientX >= rect.left + el.clientWidth && e.clientX <= rect.right) return true;
        }
        // horizontal scrollbar region
        if (el.scrollWidth > el.clientWidth) {
          if (e.clientY >= rect.top + el.clientHeight && e.clientY <= rect.bottom) return true;
        }
      }
      return false;
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // スクロールバー操作は編集終了扱いにしない
      if (isClickOnScrollbar(e)) return;
      // Inline editor操作は除外（クリックで編集終了しない）
      if (target.closest("[data-inline-edit-cell]")) return;
      // ダイアログ操作は除外
      if (
        target.closest("[data-unsaved-dialog]") ||
        target.closest("[data-dynamodb-item-dialog]") ||
        target.closest("[data-confirm-dialog]") ||
        target.closest("[data-pk-sk-dialog]")
      )
        return;
      void requestEndEditCell();
    };

    const onWindowBlur = () => {
      void requestEndEditCell();
    };

    document.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [editCell, requestEndEditCell]);

  // When starting inline edit, focus the value control.
  const editCellRowKey = editCell?.rowKey;
  const editCellAttr = editCell?.attr;
  useEffect(() => {
    if (!editCellRowKey || !editCellAttr) return;
    if (confirmOpen) return;
    const key = `${editCellRowKey}::${editCellAttr}`;
    requestAnimationFrame(() => {
      const valueSel = `[data-inline-edit-focus-key="${CSS.escape(key)}"][data-inline-edit-focus-part="value"]`;
      const el = document.querySelector(valueSel) as HTMLElement | null;
      el?.focus?.();
      if (el instanceof HTMLInputElement) {
        // If it's a plain text input, select all for quick overwrite.
        try {
          el.select();
        } catch { }
      }
    });
  }, [confirmOpen, editCellAttr, editCellRowKey]);

  const addNewItem = async () => {
    if (!selectedTable) return;
    setError(null);
    setIsAddOpen(true);
  };

  const nextPage = async () => {
    if (!selectedTable) return;
    if (!cursor) return;
    const nextIndex = cursorIndex + 1;
    const nextStack = cursorStack.slice(0, nextIndex);
    nextStack.push(cursor);
    setCursorStack(nextStack);
    setCursorIndex(nextIndex);
    cancelEditCell();
    setSelectedKeySigs(new Set());
    setSelectedKeysBySig({});
    await fetchItems(selectedTable, { cursor });
  };

  const prevPage = async () => {
    if (!selectedTable) return;
    if (cursorIndex === 0) return;
    const nextIndex = cursorIndex - 1;
    setCursorIndex(nextIndex);
    cancelEditCell();
    setSelectedKeySigs(new Set());
    setSelectedKeysBySig({});
    await fetchItems(selectedTable, { cursor: cursorStack[nextIndex] ?? null });
  };

  const keySigForItem = (it: Item) =>
    stableStringify(
      keyNames.reduce<Record<string, JsonValue | undefined>>((acc, k) => {
        acc[k] = it?.[k];
        return acc;
      }, {})
    );

  const toggleSelectItem = (it: Item, checked: boolean) => {
    if (keyNames.length === 0) return;
    const keyObj = keyNames.reduce<Record<string, JsonPrimitive>>((acc, k) => {
      acc[k] = it?.[k] as JsonPrimitive;
      return acc;
    }, {});
    const sig = stableStringify(keyObj);
    setSelectedKeySigs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sig);
      else next.delete(sig);
      return next;
    });
    setSelectedKeysBySig((prev) => {
      const next = { ...prev };
      if (checked) next[sig] = keyObj;
      else delete next[sig];
      return next;
    });
  };

  const toggleSelectAllOnPage = (checked: boolean) => {
    if (keyNames.length === 0) return;
    if (!checked) {
      setSelectedKeySigs(new Set());
      setSelectedKeysBySig({});
      return;
    }
    const bySig: Record<string, DynamoKey> = {};
    const sigs = new Set<string>();
    for (const it of items) {
      const keyObj = keyNames.reduce<Record<string, JsonPrimitive>>((acc, k) => {
        acc[k] = it?.[k] as JsonPrimitive;
        return acc;
      }, {});
      const sig = stableStringify(keyObj);
      sigs.add(sig);
      bySig[sig] = keyObj;
    }
    setSelectedKeySigs(sigs);
    setSelectedKeysBySig(bySig);
  };

  const deleteSelected = async () => {
    if (!selectedTable) return;
    const sigs = Array.from(selectedKeySigs);
    if (sigs.length === 0) return;
    setError(null);
    try {
      const results = await Promise.allSettled(
        sigs.map(async (sig) => {
          const key = selectedKeysBySig[sig];
          const res = await fetch(`/api/dynamodb/tables/${encodeURIComponent(selectedTable)}/items`, {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Failed to delete item");
        })
      );
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (rejected) throw rejected.reason;
      await fetchItems(selectedTable, { cursor: cursorStack[cursorIndex] ?? null });
      setSelectedKeySigs(new Set());
      setSelectedKeysBySig({});
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to delete selected items"));
    }
  };

  const requestDeleteSelected = () => {
    if (selectedKeySigs.size === 0 || keyNames.length === 0) return;
    setDeleteConfirmOpen(true);
  };

  return (
    <div>
      <PageHeader title="DynamoDB" description="Tables and Items (LocalStack / Floci)">
        <div className="flex items-center gap-2">
          {selectedTable && (
            <>
            </>
          )}
        </div>
      </PageHeader>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={`Delete selected items (${selectedKeySigs.size})?`}
        description="This will permanently delete the selected items. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          setDeleteConfirmOpen(false);
          await deleteSelected();
        }}
      />

      <div className="flex h-[calc(100vh-73px)]">
        <DynamoTableList
          tables={tables}
          loadingTables={loadingTables}
          selectedTable={selectedTable}
          onSelectTable={setSelectedTable}
          onReloadTables={fetchTables}
        />

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedTable && (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--text-secondary)" }}>
              Select a table
            </div>
          )}

          {selectedTable && (
            <>
              <AddItemDialog
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                tableName={selectedTable}
                keyNames={keyNames}
                attributeNames={currentColumns.filter((c) => !keyNames.includes(c))}
                onCreated={() => fetchItems(selectedTable, { cursor: cursorStack[cursorIndex] ?? null })}
              />
              <EditItemDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                tableName={selectedTable}
                keyNames={keyNames}
                item={editDialogItem}
                focusAttr={editDialogFocusAttr}
                onUpdated={() => fetchItems(selectedTable, { cursor: cursorStack[cursorIndex] ?? null })}
              />
              <div data-unsaved-dialog>
                <UnsavedChangesDialog
                  open={confirmOpen}
                  onBack={() => {
                    setConfirmOpen(false);
                    setPendingAction(null);
                    const fr = focusReturn;
                    setFocusReturn(null);
                    if (!fr) return;
                    // wait for dialog to unmount
                    requestAnimationFrame(() => {
                      const valueSel = `[data-inline-edit-focus-key="${CSS.escape(fr.key)}"][data-inline-edit-focus-part="value"]`;
                      const typeSel = `[data-inline-edit-focus-key="${CSS.escape(fr.key)}"][data-inline-edit-focus-part="type"]`;
                      const preferred = fr.part === "value" ? valueSel : typeSel;
                      const fallback = fr.part === "value" ? typeSel : valueSel;
                      const el =
                        (document.querySelector(preferred) as HTMLElement | null) ??
                        (document.querySelector(fallback) as HTMLElement | null);
                      el?.focus?.();
                    });
                  }}
                  onDiscard={async () => {
                    setConfirmOpen(false);
                    const next = pendingAction;
                    setPendingAction(null);
                    setFocusReturn(null);
                    cancelEditCell();
                    if (next?.type === "switchCell") {
                      setEditCell({
                        rowKey: next.rowKey,
                        item: next.item,
                        attr: next.attr,
                        draft: cellToEditorWithHint(next.item?.[next.attr], columnTypeHint(next.attr)),
                      });
                      setEditCellWasUnset(false);
                      setEditCellOriginalWasUndefined(next.item?.[next.attr] === undefined);
                      setEditCellTouched(false);
                    }
                  }}
                  onSave={async () => {
                    setConfirmOpen(false);
                    const next = pendingAction;
                    setPendingAction(null);
                    setFocusReturn(null);
                    await saveEditCell();
                    // 保存成功時は saveEditCell が cancelEditCell する
                    if (next?.type === "switchCell") {
                      setEditCell({
                        rowKey: next.rowKey,
                        item: next.item,
                        attr: next.attr,
                        draft: cellToEditorWithHint(next.item?.[next.attr], columnTypeHint(next.attr)),
                      });
                      setEditCellWasUnset(false);
                      setEditCellOriginalWasUndefined(next.item?.[next.attr] === undefined);
                      setEditCellTouched(false);
                    }
                  }}
                />
              </div>
              <PrimaryKeyEditWarningDialog
                open={pkSkWarnOpen}
                dontShowAgainChecked={pkSkDontShowAgain}
                onDontShowAgainCheckedChange={setPkSkDontShowAgain}
                onCancel={() => {
                  setPkSkWarnOpen(false);
                  setPkSkWarnPending(null);
                }}
                onContinue={() => {
                  const pending = pkSkWarnPending;
                  setPkSkWarnOpen(false);
                  setPkSkWarnPending(null);
                  if (pkSkDontShowAgain) {
                    try {
                      localStorage.setItem(SKIP_PK_SK_WARN_STORAGE_KEY, "1");
                      setPkSkSkipWarn(true);
                    } catch { }
                  }
                  if (!pending) return;
                  setEditCell({
                    rowKey: pending.rowKey,
                    item: pending.item,
                    attr: pending.attr,
                    draft: cellToEditorWithHint(pending.item?.[pending.attr], columnTypeHint(pending.attr)),
                  });
                  setEditCellWasUnset(false);
                  setEditCellOriginalWasUndefined(pending.item?.[pending.attr] === undefined);
                  setEditCellTouched(false);
                }}
              />

              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setTab("items")}
                  className="px-3 py-1.5 rounded-md text-sm border"
                  style={{
                    borderColor: "var(--border)",
                    background: tab === "items" ? "var(--bg-tertiary)" : "transparent",
                    color: tab === "items" ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  Items
                </button>
                <button
                  onClick={() => setTab("overview")}
                  className="px-3 py-1.5 rounded-md text-sm border"
                  style={{
                    borderColor: "var(--border)",
                    background: tab === "overview" ? "var(--bg-tertiary)" : "transparent",
                    color: tab === "overview" ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  Overview
                </button>
              </div>

              {tab === "overview" && (
                <DynamoOverview tableInfo={tableInfo} keyNames={keyNames} />
              )}

              {tab === "items" && (
                <DynamoItems
                  items={items}
                  loadingItems={loadingItems}
                  error={error}
                  currentColumns={currentColumns}
                  keyNames={keyNames}
                  cursor={cursor}
                  cursorIndex={cursorIndex}
                  selectedKeySigs={selectedKeySigs}
                  onToggleSelectAllOnPage={toggleSelectAllOnPage}
                  onToggleSelectItem={toggleSelectItem}
                  keySigForItem={keySigForItem}
                  editCell={editCell ? { rowKey: editCell.rowKey, attr: editCell.attr, draft: editCell.draft } : null}
                  canSaveEditCell={hasUnsavedCell()}
                  onAddItem={addNewItem}
                  onDeleteSelected={requestDeleteSelected}
                  onRefreshItems={() => fetchItems(selectedTable, { cursor: cursorStack[cursorIndex] ?? null })}
                  limit={limit}
                  onChangeLimit={(next) => setLimit(next)}
                  onPrevPage={prevPage}
                  onNextPage={nextPage}
                  onOpenEditDialog={(it) => {
                    setEditDialogItem(it);
                    setEditDialogFocusAttr(null);
                    setIsEditOpen(true);
                  }}
                  onRequestEditCell={requestEditCell}
                  onUpdateEditCellDraft={(patch) => {
                    setEditCell((prev) => (prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev));
                    setEditCellWasUnset(false);
                    setEditCellTouched(true);
                  }}
                  onUnsetEditCell={() => {
                    setEditCellWasUnset(true);
                    setEditCellTouched(true);
                    // Make it obvious in UI that value is being cleared/unset
                    setEditCell((prev) =>
                      prev
                        ? {
                          ...prev,
                          draft: {
                            ...prev.draft,
                            value: "",
                          },
                        }
                        : prev
                    );
                  }}
                  onSaveEditCell={saveEditCell}
                  onCancelEditCell={cancelEditCell}
                  rowKeyForItem={rowKeyForItem}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

