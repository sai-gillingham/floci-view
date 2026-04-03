export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="border-b px-6 py-4 flex items-center justify-between"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && (
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
