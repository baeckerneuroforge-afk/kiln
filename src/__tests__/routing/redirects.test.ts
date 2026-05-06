/**
 * Smoke tests for the legacy → canonical workflow redirects.
 *
 * Each redirect stub is a tiny server component that calls `redirect()`
 * from next/navigation. We mock `redirect` to throw a tagged sentinel so
 * we can capture the destination URL without Next.js's actual redirect
 * machinery. Pin the destinations so a refactor can't silently
 * re-introduce 404s by editing the wrong path.
 *
 * Covered:
 *   /dashboard/workflows           → /dashboard/teams
 *   /dashboard/workflows/templates → /dashboard/teams/new
 *   /dashboard/flows               → /dashboard/teams
 */
import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    // Mimic the runtime behavior — redirect() throws. Tests catch the
    // throw and assert the captured URL.
    const err = new Error(`__REDIRECT__ ${url}`);
    (err as Error & { __redirectUrl?: string }).__redirectUrl = url;
    throw err;
  })
);

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

function captureRedirect(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    const url = (err as { __redirectUrl?: string }).__redirectUrl;
    if (url) return url;
    throw err;
  }
  throw new Error("Expected redirect, got nothing");
}

describe("workflow routing redirects", () => {
  it("/dashboard/workflows → /dashboard/teams", async () => {
    const { default: WorkflowsRedirect } = await import(
      "@/app/dashboard/workflows/page"
    );
    expect(captureRedirect(WorkflowsRedirect)).toBe("/dashboard/teams");
  });

  it("/dashboard/workflows/templates → /dashboard/teams/new", async () => {
    const { default: WorkflowsTemplatesRedirect } = await import(
      "@/app/dashboard/workflows/templates/page"
    );
    expect(captureRedirect(WorkflowsTemplatesRedirect)).toBe(
      "/dashboard/teams/new"
    );
  });

  it("/dashboard/flows → /dashboard/teams", async () => {
    const { default: FlowsPage } = await import(
      "@/app/dashboard/flows/page"
    );
    expect(captureRedirect(FlowsPage)).toBe("/dashboard/teams");
  });
});
