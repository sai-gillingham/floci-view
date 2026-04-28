import { AlertTriangle } from "lucide-react";

export function PrimaryKeyEditWarningDialog(props: {
  open: boolean;
  dontShowAgainChecked: boolean;
  onDontShowAgainCheckedChange: (checked: boolean) => void;
  onCancel: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
}) {
  const { open, dontShowAgainChecked, onDontShowAgainCheckedChange, onCancel, onContinue } = props;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-pk-sk-dialog>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg rounded-lg border"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: "var(--warning)" }} />
            <div>
              <div className="text-lg font-semibold">Editing the primary key will create a new item</div>
              <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                DynamoDB cannot update PK/SK. Saving will write a new item (PutItem) and delete the old one (DeleteItem).
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={dontShowAgainChecked}
              onChange={(e) => onDontShowAgainCheckedChange(e.target.checked)}
            />
            Don’t show again
          </label>
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

