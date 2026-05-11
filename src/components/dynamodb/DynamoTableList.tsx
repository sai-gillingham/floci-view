import { Database, RefreshCw } from "lucide-react";

export function DynamoTableList(props: {
  tables: string[];
  loadingTables: boolean;
  selectedTable: string | null;
  onSelectTable: (tableName: string) => void;
  onReloadTables: () => void | Promise<void>;
}) {
  const { tables, loadingTables, selectedTable, onSelectTable, onReloadTables } = props;

  return (
    <div className="w-72 border-r overflow-y-auto p-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase" style={{ color: "var(--text-secondary)" }}>
          Tables ({tables.length})
        </div>
        <button
          onClick={onReloadTables}
          className="flex items-center gap-2 px-2 py-1 rounded-md text-xs border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          title="Reload"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reload
        </button>
      </div>

      {loadingTables && (
        <div className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>
          Loading...
        </div>
      )}

      {tables.map((t) => (
        <button
          key={t}
          onClick={() => onSelectTable(t)}
          className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 mb-1 transition-colors"
          style={{
            background: selectedTable === t ? "var(--bg-tertiary)" : "transparent",
            color: selectedTable === t ? "var(--text-primary)" : "var(--text-secondary)",
          }}
        >
          <Database className="w-4 h-4 shrink-0" />
          <span className="truncate">{t}</span>
        </button>
      ))}

      {!loadingTables && tables.length === 0 && (
        <p className="text-sm px-3" style={{ color: "var(--text-secondary)" }}>
          No tables found
        </p>
      )}
    </div>
  );
}

