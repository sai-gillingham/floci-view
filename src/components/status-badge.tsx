export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "var(--success)",
    running: "var(--success)",
    starting: "var(--warning)",
    error: "var(--error)",
    disabled: "var(--text-secondary)",
  };
  const color = colors[status] ?? colors.disabled;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {status}
    </span>
  );
}
