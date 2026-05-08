import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/page-header";

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="My Page" />);
    expect(screen.getByRole("heading", { name: "My Page" })).toBeInTheDocument();
  });

  it("omits the description when not supplied", () => {
    render(<PageHeader title="No description" />);
    expect(screen.queryByText(/./, { selector: "p" })).not.toBeInTheDocument();
  });

  it("renders the description when supplied", () => {
    render(<PageHeader title="With description" description="Hello there" />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <PageHeader title="With children">
        <button type="button">Refresh</button>
      </PageHeader>,
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
