import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  const cases: Array<[string, string]> = [
    ["available", "var(--success)"],
    ["running", "var(--success)"],
    ["starting", "var(--warning)"],
    ["error", "var(--error)"],
    ["disabled", "var(--text-secondary)"],
  ];

  it.each(cases)("renders %s with the right colour", (status, color) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
    const dot = container.querySelector("span > span") as HTMLElement;
    expect(dot.style.background).toContain(color);
  });

  it("falls back to the disabled colour for an unknown status", () => {
    const { container } = render(<StatusBadge status="weird" />);
    const dot = container.querySelector("span > span") as HTMLElement;
    expect(dot.style.background).toContain("var(--text-secondary)");
  });
});
