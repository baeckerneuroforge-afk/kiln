// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import { EmailBrandingForm } from "@/components/email-branding/email-branding-form";

const originalFetch = global.fetch;

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const urlString =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    for (const key of Object.keys(handlers)) {
      if (urlString.includes(key)) {
        return handlers[key]();
      }
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as unknown as typeof global.fetch;
}

describe("EmailBrandingForm", () => {
  it("loads existing values into the form on mount", async () => {
    mockFetch({
      "/api/email-branding/agency": () =>
        new Response(
          JSON.stringify({
            emailFromAddress: "support@example.com",
            emailFromName: "Acme Support",
            emailReplyTo: null,
            emailFooterHtml: null,
            emailSupportLink: null,
          }),
          { status: 200 }
        ),
      "/api/email-branding/from-address-status": () =>
        new Response(
          JSON.stringify({ ok: true, verified: true, domain: "example.com" }),
          { status: 200 }
        ),
    });

    render(
      <EmailBrandingForm
        title="Agency-level email"
        endpoint="/api/email-branding/agency"
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("support@example.com")).toBeTruthy();
    });
    expect(screen.getByDisplayValue("Acme Support")).toBeTruthy();
  });

  it("renders 'Save' and 'Preview' actions for editable forms", async () => {
    mockFetch({
      "/api/email-branding/agency": () =>
        new Response(
          JSON.stringify({
            emailFromAddress: null,
            emailFromName: null,
            emailReplyTo: null,
            emailFooterHtml: null,
            emailSupportLink: null,
          }),
          { status: 200 }
        ),
    });

    render(
      <EmailBrandingForm
        title="Agency-level email"
        endpoint="/api/email-branding/agency"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeTruthy();
    });
    expect(screen.getByText("Preview")).toBeTruthy();
  });
});
