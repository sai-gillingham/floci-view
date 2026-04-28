"use client";

import type { TableDescription } from "@aws-sdk/client-dynamodb";

export function DynamoOverview(props: { tableInfo: TableDescription | null; keyNames: string[] }) {
  const { tableInfo, keyNames } = props;
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold mb-2">Table</div>
        {!tableInfo && (
          <div className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </div>
        )}
        {tableInfo && (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <div>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                Name:
              </span>{" "}
              {tableInfo.TableName}
            </div>
            <div>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                Status:
              </span>{" "}
              {tableInfo.TableStatus}
            </div>
            <div>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                Keys:
              </span>{" "}
              {keyNames.length ? keyNames.join(", ") : "-"}
            </div>
            <div>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                Items:
              </span>{" "}
              {tableInfo.ItemCount ?? "-"}
            </div>
            <div>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                Size:
              </span>{" "}
              {tableInfo.TableSizeBytes ?? "-"} bytes
            </div>
          </div>
        )}
      </div>

      {tableInfo && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold mb-2">Raw</div>
          <pre className="text-xs whitespace-pre-wrap break-all" style={{ color: "var(--text-secondary)" }}>
            {JSON.stringify(tableInfo, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

