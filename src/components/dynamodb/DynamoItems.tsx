"use client";

import { Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { TypeComboBox, type CellType } from "@/components/dynamodb/TypeComboBox";
import { BoolValueComboBox } from "@/components/dynamodb/BoolValueComboBox";
import type { BoolChoice } from "@/components/dynamodb/BoolValueComboBox";
import type { DynamoItem } from "@/types/dynamodb";

export function DynamoItems(props: {
  items: DynamoItem[];
  loadingItems: boolean;
  error: string | null;
  currentColumns: string[];
  keyNames: string[];
  cursor: string | null;
  cursorIndex: number;
  selectedKeySigs: Set<string>;
  onToggleSelectAllOnPage: (checked: boolean) => void;
  onToggleSelectItem: (it: DynamoItem, checked: boolean) => void;
  keySigForItem: (it: DynamoItem) => string;
  editCell: null | { rowKey: string; attr: string; draft: { type: CellType; value: string } };
  canSaveEditCell: boolean;
  onAddItem: () => void;
  onDeleteSelected: () => void | Promise<void>;
  onRefreshItems: () => void | Promise<void>;
  limit: number;
  onChangeLimit: (next: number) => void;
  onPrevPage: () => void | Promise<void>;
  onNextPage: () => void | Promise<void>;
  onOpenEditDialog: (it: DynamoItem) => void;
  onRequestEditCell: (it: DynamoItem, rowKey: string, attr: string) => void | Promise<void>;
  onUpdateEditCellDraft: (patch: Partial<{ type: CellType; value: string }>) => void;
  onUnsetEditCell: () => void;
  onSaveEditCell: () => void | Promise<void>;
  onCancelEditCell: () => void;
  rowKeyForItem: (it: DynamoItem, idx: number) => string;
}) {
  const {
    items,
    loadingItems,
    error,
    currentColumns,
    keyNames,
    cursor,
    cursorIndex,
    selectedKeySigs,
    onToggleSelectAllOnPage,
    onToggleSelectItem,
    keySigForItem,
    editCell,
    canSaveEditCell,
    onAddItem,
    onDeleteSelected,
    onRefreshItems,
    limit,
    onChangeLimit,
    onPrevPage,
    onNextPage,
    onOpenEditDialog,
    onRequestEditCell,
    onUpdateEditCellDraft,
    onUnsetEditCell,
    onSaveEditCell,
    onCancelEditCell,
    rowKeyForItem,
  } = props;

  const canSelect = keyNames.length > 0;
  const isAllSelectedOnPage = canSelect && items.length > 0 && items.every((it) => selectedKeySigs.has(keySigForItem(it)));
  const deleteSelectedCount = selectedKeySigs.size;
  const deleteSelectedDisabled = deleteSelectedCount === 0 || !canSelect;

  return (
    <>
      {error && (
        <div className="mb-3 text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)", color: "var(--error)" }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onPrevPage}
          disabled={cursorIndex === 0 || loadingItems}
          className="px-3 py-1.5 rounded-md text-sm border disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Prev
        </button>
        <button
          onClick={onNextPage}
          disabled={!cursor || loadingItems}
          className="px-3 py-1.5 rounded-md text-sm border disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Next
        </button>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Page {cursorIndex + 1}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAddItem}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <Plus className="w-3.5 h-3.5" /> Add item
          </button>
          <button
            onClick={onDeleteSelected}
            disabled={deleteSelectedDisabled}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete selected ({deleteSelectedCount})
          </button>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>Limit</span>
            <select
              value={String(limit)}
              onChange={(e) => onChangeLimit(Number(e.target.value) || 50)}
              className="floci-select w-24 px-2 py-1 rounded-md border bg-transparent"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
            </select>
          </div>
          <button
            onClick={onRefreshItems}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="table-auto w-max min-w-max text-sm">
          <thead>
            <tr style={{ background: "var(--bg-tertiary)" }}>
              <th
                className="px-3 py-2 font-medium w-12 sticky left-0 z-30 cursor-pointer align-middle"
                style={{ background: "var(--bg-tertiary)" }}
                onClick={() => {
                  if (!canSelect) return;
                  onToggleSelectAllOnPage(!isAllSelectedOnPage);
                }}
              >
                <div className="h-full flex items-center justify-center">
                  <input
                    type="checkbox"
                    disabled={!canSelect}
                    checked={canSelect && isAllSelectedOnPage}
                    onChange={(e) => onToggleSelectAllOnPage(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="floci-checkbox block"
                  />
                </div>
              </th>
              <th
                className="text-left px-3 py-2 font-medium whitespace-nowrap w-px sticky left-12 z-20"
                style={{ background: "var(--bg-tertiary)" }}
              >
                Actions
              </th>
              {currentColumns.map((c) => (
                <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                  {c}
                  {keyNames.includes(c) && (
                    <span className="ml-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      (key)
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingItems && (
              <tr>
                <td colSpan={currentColumns.length + 1} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loadingItems && items.length === 0 && (
              <tr>
                <td colSpan={currentColumns.length + 1} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                  Empty
                </td>
              </tr>
            )}

            {!loadingItems &&
              items.map((it, idx) => {
                const rowKey = rowKeyForItem(it, idx);
                const isEditingRow = editCell?.rowKey === rowKey;
                const isSelected = canSelect ? selectedKeySigs.has(keySigForItem(it)) : false;
                return (
                  <tr key={rowKey} data-rowkey={rowKey} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td
                      className="px-3 py-2 whitespace-nowrap sticky left-0 z-20 cursor-pointer align-middle"
                      style={{ background: "var(--bg-primary)" }}
                      onClick={() => {
                        if (!canSelect) return;
                        onToggleSelectItem(it, !isSelected);
                      }}
                    >
                      <div className="h-full flex items-center justify-center">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={canSelect && isSelected}
                          onChange={(e) => onToggleSelectItem(it, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          className="floci-checkbox block"
                        />
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap sticky left-12 z-10 align-middle"
                      style={{ background: "var(--bg-primary)" }}
                    >
                      <div className="min-h-[28px] flex items-center justify-start gap-2">
                        {!isEditingRow ? (
                          <button
                            onClick={() => onOpenEditDialog(it)}
                            className="px-2 py-1 rounded-md border text-xs"
                            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                          >
                            Edit
                          </button>
                        ) : (
                          <div className="h-[28px]" />
                        )}
                      </div>
                    </td>
                    {currentColumns.map((attr) => {
                      const v = it?.[attr];
                      const isEditingCell = editCell?.rowKey === rowKey && editCell?.attr === attr;
                      if (!isEditingCell) {
                        return (
                          <td
                            key={attr}
                            className="px-3 py-2 whitespace-pre-wrap break-all cursor-pointer hover:opacity-90"
                            style={{ color: v === undefined ? "var(--text-secondary)" : "var(--text-primary)" }}
                            onClick={() => {
                              onRequestEditCell(it, rowKey, attr);
                            }}
                          >
                            {v === undefined ? "-" : typeof v === "string" ? v : JSON.stringify(v)}
                          </td>
                        );
                      }

                      const ed = editCell.draft;
                      const isKeyAttr = keyNames.includes(attr);
                      const disabled = false; // values can be edited after warning
                      const focusKey = `${rowKey}::${attr}`;
                      const typeDisabled = isKeyAttr; // PK/SK type cannot be changed
                      const focusValueAttrs = {
                        "data-inline-edit-focus-key": focusKey,
                        "data-inline-edit-focus-part": "value",
                      } as const;
                      const focusTypeAttrs = {
                        "data-inline-edit-focus-key": focusKey,
                        "data-inline-edit-focus-part": "type",
                      } as const;
                      return (
                        <td key={attr} className="px-3 py-2 relative">
                          {/* Keep column layout stable; editor overlays and can extend right */}
                          <div className="opacity-0 select-none whitespace-pre-wrap break-all">
                            {v === undefined ? "-" : typeof v === "string" ? v : JSON.stringify(v)}
                          </div>
                          <div
                            className="absolute inset-y-0 left-0 flex items-center gap-2 px-3 z-20"
                            style={{ background: "var(--bg-primary)" }}
                            data-inline-edit-cell
                          >
                            {ed.type === "BOOL" ? (
                              <BoolValueComboBox
                                allowAbsent={!isKeyAttr}
                                value={((): BoolChoice => {
                                  if (ed.value === "true" || ed.value === "false") return ed.value;
                                  if (ed.value === "null") return "null";
                                  return "__absent__";
                                })()}
                                onChange={(choice) => {
                                  if (choice === "__absent__") {
                                    onUnsetEditCell();
                                    return;
                                  }
                                  if (choice === "null") {
                                    onUpdateEditCellDraft({ type: "BOOL", value: "null" });
                                    return;
                                  }
                                  onUpdateEditCellDraft({ type: "BOOL", value: choice });
                                }}
                                className="flex-1 px-2 py-1 rounded-md border bg-transparent text-xs"
                                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                                {...focusValueAttrs}
                              />
                            ) : (
                              <input
                                value={ed.value}
                                disabled={disabled}
                                onChange={(e) => onUpdateEditCellDraft({ value: e.target.value })}
                                className="min-w-[240px] px-2 py-1 rounded-md border bg-transparent text-xs"
                                style={{
                                  borderColor: "var(--border)",
                                  color: disabled ? "var(--text-secondary)" : "var(--text-primary)",
                                }}
                                data-inline-edit-focus-key={focusKey}
                                data-inline-edit-focus-part="value"
                              />
                            )}
                            <TypeComboBox
                              value={ed.type}
                              disabled={typeDisabled}
                              onChange={(value) => {
                                if (typeDisabled) return;
                                onUpdateEditCellDraft({ type: value });
                              }}
                              className="px-2 py-1 rounded-md border bg-transparent text-xs"
                              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                              // focus return target
                              {...focusTypeAttrs}
                            />
                            {!isKeyAttr && (
                              <button
                                onClick={onUnsetEditCell}
                                className="p-1 rounded-md border"
                                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                                title="Remove attribute"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={onSaveEditCell}
                              disabled={!canSaveEditCell}
                              className="flex items-center gap-1 px-2 py-1 rounded-md border text-xs disabled:opacity-50"
                              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                            >
                              <Save className="w-3.5 h-3.5" /> Save
                            </button>
                            <button
                              onClick={onCancelEditCell}
                              className="flex items-center gap-1 px-2 py-1 rounded-md border text-xs"
                              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                            >
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

