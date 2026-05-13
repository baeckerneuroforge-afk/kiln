// @vitest-environment jsdom

/**
 * Sprint 19.7.6.1 — InviteSubOrgMemberModal.
 *
 * Covers the form's three concerns: input validation, POST shape,
 * and error rendering. The deeper Clerk-invite path lives in the
 * existing 19.7.1 endpoint tests; this file only exercises the UI
 * adapter.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { InviteSubOrgMemberModal } from "@/components/sub-org/invite-sub-org-member-modal";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderModal({
  onClose = vi.fn(),
  onInvited = vi.fn(),
} = {}) {
  render(
    <InviteSubOrgMemberModal
      subOrgId="sub_abc"
      onClose={onClose}
      onInvited={onInvited}
    />,
  );
  return { onClose, onInvited };
}

describe("InviteSubOrgMemberModal", () => {
  it("renders dialog with email + role + permission-set fields", () => {
    renderModal();
    expect(screen.getByTestId("sub-org-memberships-invite-modal")).toBeTruthy();
    expect(screen.getByTestId("sub-org-memberships-invite-email")).toBeTruthy();
    expect(screen.getByTestId("sub-org-memberships-invite-roles")).toBeTruthy();
    expect(screen.getByTestId("sub-org-memberships-invite-permission-set")).toBeTruthy();
  });

  it("shows an inline error and does not POST when email is invalid", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    renderModal();

    const emailInput = screen.getByTestId(
      "sub-org-memberships-invite-email",
    ) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "no-at-sign" } });
    fireEvent.submit(emailInput.closest("form")!);

    await waitFor(() =>
      expect(screen.getByTestId("sub-org-memberships-invite-error")).toBeTruthy(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to /api/agency/sub-orgs/[id]/invite with chosen role + permissionSet", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "accepted" }),
    });
    const { onInvited } = renderModal();

    const emailInput = screen.getByTestId(
      "sub-org-memberships-invite-email",
    ) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "hello@kunde.de" } });

    // Switch role to ADMIN
    const adminRadio = screen.getByRole("radio", { name: /Admin/ });
    fireEvent.click(adminRadio);

    // Switch permission-set to FULL_ACCESS
    const permSelect = screen.getByTestId(
      "sub-org-memberships-invite-permission-set",
    ) as HTMLSelectElement;
    fireEvent.change(permSelect, { target: { value: "FULL_ACCESS" } });

    await act(async () => {
      fireEvent.submit(emailInput.closest("form")!);
    });

    await waitFor(() => expect(onInvited).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agency/sub-orgs/sub_abc/invite",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "hello@kunde.de",
          role: "ADMIN",
          permissionSet: "FULL_ACCESS",
        }),
      }),
    );
  });

  it("surfaces the server's error message when POST fails", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "valid email required" }),
    });
    const { onInvited } = renderModal();

    const emailInput = screen.getByTestId(
      "sub-org-memberships-invite-email",
    ) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "x@y.de" } });

    await act(async () => {
      fireEvent.submit(emailInput.closest("form")!);
    });

    await waitFor(() =>
      expect(screen.getByTestId("sub-org-memberships-invite-error").textContent).toContain(
        "valid email required",
      ),
    );
    expect(onInvited).not.toHaveBeenCalled();
  });

  it("calls onClose when the X button is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Schließen/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
