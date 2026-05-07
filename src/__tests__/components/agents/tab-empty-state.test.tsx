// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bot, Plug, Webhook } from "lucide-react";

import { TabEmptyState } from "@/components/agents/tab-empty-state";

afterEach(() => {
  cleanup();
});

describe("TabEmptyState", () => {
  it("renders icon, title, and description", () => {
    render(
      <TabEmptyState
        icon={Bot}
        title="No agents yet"
        description="Create the first one to get started."
      />,
    );
    expect(screen.getByTestId("tab-empty-state")).toBeInTheDocument();
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create the first one to get started."),
    ).toBeInTheDocument();
  });

  it("renders an action button when onClick is provided", () => {
    const onClick = vi.fn();
    render(
      <TabEmptyState
        icon={Plug}
        title="No connections"
        action={{ label: "Connect", onClick }}
      />,
    );
    const btn = screen.getByRole("button", { name: /connect/i });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an anchor when href is provided instead of onClick", () => {
    render(
      <TabEmptyState
        icon={Webhook}
        title="No webhooks"
        action={{ label: "Open hub", href: "/hub" }}
      />,
    );
    const link = screen.getByRole("link", { name: /open hub/i });
    expect(link).toHaveAttribute("href", "/hub");
  });

  it("applies tone-specific colors via class names", () => {
    const { container, rerender } = render(
      <TabEmptyState icon={Bot} title="x" tone="orange" />,
    );
    const orange = container.querySelector("div.rounded-2xl");
    expect(orange?.className).toMatch(/bg-kiln-orange\/10/);

    rerender(<TabEmptyState icon={Bot} title="x" tone="blue" />);
    const blue = container.querySelector("div.rounded-2xl");
    expect(blue?.className).toMatch(/bg-kiln-blue\/10/);

    rerender(<TabEmptyState icon={Bot} title="x" tone="violet" />);
    const violet = container.querySelector("div.rounded-2xl");
    expect(violet?.className).toMatch(/bg-violet-500\/10/);
  });

  it("renders the optional hint line under the description", () => {
    render(
      <TabEmptyState
        icon={Bot}
        title="t"
        description="d"
        hint="Try adjusting your filters"
      />,
    );
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
  });
});
