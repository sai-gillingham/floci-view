import { beforeEach, describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";

let currentPath = "/";
mock.module("next/navigation", () => ({
  usePathname: () => currentPath,
}));

const { Sidebar } = await import("@/components/sidebar");

describe("Sidebar", () => {
  beforeEach(() => {
    currentPath = "/";
  });

  it("renders all 6 service links and category headers", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /S3/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /SQS/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Step Functions/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CloudWatch/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cognito/ })).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Messaging")).toBeInTheDocument();
    expect(screen.getByText("Orchestration")).toBeInTheDocument();
    expect(screen.getByText("Monitoring")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("highlights the link matching the current pathname", () => {
    currentPath = "/s3";
    render(<Sidebar />);
    const s3 = screen.getByRole("link", { name: /S3/ });
    const dashboard = screen.getByRole("link", { name: /Dashboard/ });
    expect(s3.style.background).toContain("var(--bg-tertiary)");
    expect(dashboard.style.background).toContain("transparent");
  });

  it("treats nested paths as still active for that service", () => {
    currentPath = "/cognito/user-pools/abc";
    render(<Sidebar />);
    const cognito = screen.getByRole("link", { name: /Cognito/ });
    expect(cognito.style.background).toContain("var(--bg-tertiary)");
  });
});
