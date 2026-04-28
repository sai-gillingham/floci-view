import { AlertTriangle } from "lucide-react";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
}) {
  const {
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onCancel,
    onConfirm,
  } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-confirm-dialog>
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        className="relative w-full max-w-lg rounded-lg border"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 w-8 h-8 rounded-md border flex items-center justify-center"
              style={{ borderColor: "var(--border)", background: "var(--bg-tertiary)" }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: "var(--warning)" }} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold">{title}</div>
              {description && (
                <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  {description}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

