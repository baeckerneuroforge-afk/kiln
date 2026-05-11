// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModuleCard, type ModuleConfigSummary } from "@/components/sub-orgs/modules/ModuleCard";

afterEach(() => cleanup());

const baseInitial: ModuleConfigSummary = {
  moduleName: "ai",
  mode: "pool",
  isActive: false,
  hasCredentials: false,
  credentialsOwner: null,
};

function renderCard(overrides: Partial<ModuleConfigSummary> = {}, onSaved = vi.fn()) {
  const initial: ModuleConfigSummary = { ...baseInitial, ...overrides };
  render(
    <ModuleCard
      subAccountId="rel_1"
      initial={initial}
      poolPriceEur={29}
      onSaved={onSaved}
    />,
  );
  return { onSaved };
}

describe("ModuleCard rendering", () => {
  it("renders module label + description + pool price in header", () => {
    renderCard({ isActive: true });
    expect(screen.getByText(/AI Module/i)).toBeInTheDocument();
    expect(screen.getByText(/LLM-gestützte/i)).toBeInTheDocument();
    // Pool price renders in two places: header badge and the Pool radio
    // option's hint. We only assert presence (>= 1 match).
    expect(screen.getAllByText("29 EUR/Monat").length).toBeGreaterThanOrEqual(1);
  });

  it("collapses credential form when inactive", () => {
    renderCard({ isActive: false });
    expect(screen.queryByText(/Anthropic API Key/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Modul ist deaktiviert/i)).toBeInTheDocument();
  });

  it("shows the three mode radios when active", () => {
    renderCard({ isActive: true });
    expect(screen.getByText(/Pool \(KILN-managed\)/i)).toBeInTheDocument();
    expect(screen.getByText(/BYOK Agency/i)).toBeInTheDocument();
    expect(screen.getByText(/BYOK Customer/i)).toBeInTheDocument();
  });

  it("hides credential form when mode is pool", () => {
    renderCard({ isActive: true, mode: "pool" });
    expect(screen.queryByLabelText(/Anthropic API Key/i)).not.toBeInTheDocument();
  });

  it("shows AI credential inputs when BYOK Agency selected", () => {
    renderCard({ isActive: true, mode: "byok_agency" });
    expect(screen.getByLabelText(/Anthropic API Key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/OpenAI API Key/i)).toBeInTheDocument();
  });

  it("shows Twilio credential inputs for SMS module in BYOK mode", () => {
    renderCard({ moduleName: "sms", isActive: true, mode: "byok_agency" });
    expect(screen.getByLabelText(/Twilio Account SID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Auth Token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Telefonnummer/i)).toBeInTheDocument();
  });

  it("adds customer-email input only in byok_customer mode", () => {
    renderCard({ isActive: true, mode: "byok_customer" });
    expect(screen.getByLabelText(/Customer-Email/i)).toBeInTheDocument();
  });
});

describe("ModuleCard cost-badge", () => {
  it("shows 0 EUR · inaktiv when not active", () => {
    renderCard({ isActive: false });
    expect(screen.getByText("0 EUR · inaktiv")).toBeInTheDocument();
  });

  it("shows pool price when active+pool", () => {
    renderCard({ isActive: true, mode: "pool" });
    expect(screen.getAllByText("29 EUR/Monat").length).toBeGreaterThanOrEqual(1);
  });

  it("shows 0 EUR · BYOK when active+byok_agency", () => {
    renderCard({ isActive: true, mode: "byok_agency" });
    expect(screen.getByText("0 EUR · BYOK")).toBeInTheDocument();
  });
});

describe("ModuleCard validation on save", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks save and shows error when BYOK form is empty", async () => {
    renderCard({ isActive: true, mode: "byok_agency" });
    const fetchSpy = vi.spyOn(global, "fetch");
    // Save is initially disabled (no dirty state) — force-dirty by editing one input
    const anthropicInput = screen.getByLabelText(/Anthropic API Key/i);
    fireEvent.change(anthropicInput, { target: { value: "wrong-prefix" } });
    const save = screen.getByRole("button", { name: /Speichern/i });
    fireEvent.click(save);
    await waitFor(() => {
      expect(screen.getByText(/sk-ant-/)).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to configure endpoint with valid BYOK credentials", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: "smc_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { onSaved } = renderCard({ isActive: true, mode: "byok_agency" });
    fireEvent.change(screen.getByLabelText(/Anthropic API Key/i), {
      target: { value: "sk-ant-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/i }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toContain("/api/agency/sub-orgs/rel_1/modules/ai/configure");
    const init = call[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.mode).toBe("byok_agency");
    expect(body.credentials.anthropicKey).toBe("sk-ant-test");
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ moduleName: "ai", mode: "byok_agency", isActive: true }),
      );
    });
  });

  it("requires a customer email when mode is byok_customer", async () => {
    renderCard({ isActive: true, mode: "byok_customer" });
    const fetchSpy = vi.spyOn(global, "fetch");
    fireEvent.change(screen.getByLabelText(/Anthropic API Key/i), {
      target: { value: "sk-ant-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/i }));
    await waitFor(() => {
      expect(screen.getByText(/credentialsOwner muss eine gültige Email/i)).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces server error in the UI when POST fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } }),
    );
    renderCard({ isActive: true, mode: "byok_agency" });
    fireEvent.change(screen.getByLabelText(/Anthropic API Key/i), {
      target: { value: "sk-ant-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/i }));
    await waitFor(() => {
      expect(screen.getByText(/Fehler: boom/i)).toBeInTheDocument();
    });
  });
});
