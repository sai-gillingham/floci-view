import { Save, X } from "lucide-react";

export function UnsavedChangesDialog(props: {
  open: boolean;
  title?: string;
  description?: string;
  onBack: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
}) {
  const {
    open,
    title = "You have unsaved changes",
    description = "Do you want to save them? Discard will drop your changes.",
    onBack,
    onSave,
    onDiscard,
  } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-unsaved-dialog>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg rounded-lg border"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {description}
          </div>
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Back
          </button>
          <button
            onClick={onDiscard}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <X className="w-3.5 h-3.5" /> Discard
          </button>
          <button
            onClick={onSave}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

