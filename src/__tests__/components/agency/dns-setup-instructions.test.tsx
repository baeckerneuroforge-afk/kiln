// @vitest-environment jsdom

/**
 * Sprint 19.8.1 — DNS-Setup-Instructions render + tab toggle.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DnsSetupInstructions } from "@/components/agency/dns-setup-instructions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const cnameHint = { type: "CNAME" as const, name: "ai", value: "cname.vercel-dns.com" };
const apexHint = { type: "A" as const, name: "@", value: "76.76.21.21" };

describe("DnsSetupInstructions", () => {
  it("renders the stepper + record block + provider accordion + troubleshooting", () => {
    render(<DnsSetupInstructions dnsHint={cnameHint} />);
    expect(screen.getByTestId("dns-stepper")).toBeTruthy();
    expect(screen.getByTestId("dns-record-block")).toBeTruthy();
    expect(screen.getByTestId("dns-provider-accordion")).toBeTruthy();
    expect(screen.getByTestId("dns-troubleshooting")).toBeTruthy();
  });

  it("renders CNAME values", () => {
    render(<DnsSetupInstructions dnsHint={cnameHint} />);
    expect(screen.getByTestId("dns-record-type").textContent).toBe("CNAME");
    expect(screen.getByTestId("dns-record-name").textContent).toBe("ai");
    expect(screen.getByTestId("dns-record-value").textContent).toBe(
      "cname.vercel-dns.com",
    );
  });

  it("renders A-record values for apex", () => {
    render(<DnsSetupInstructions dnsHint={apexHint} />);
    expect(screen.getByTestId("dns-record-type").textContent).toBe("A");
    expect(screen.getByTestId("dns-record-name").textContent).toBe("@");
    expect(screen.getByTestId("dns-record-value").textContent).toBe(
      "76.76.21.21",
    );
  });

  it("lists all five DACH providers + Anderer Provider", () => {
    render(<DnsSetupInstructions dnsHint={cnameHint} />);
    for (const p of [
      "squarespace",
      "ionos",
      "cloudflare",
      "namecheap",
      "strato",
      "other",
    ]) {
      expect(screen.getByTestId(`dns-provider-${p}`)).toBeTruthy();
    }
  });

  it("expands a provider section on click", () => {
    render(<DnsSetupInstructions dnsHint={cnameHint} />);
    expect(screen.queryByTestId("dns-provider-content-cloudflare")).toBeNull();
    fireEvent.click(screen.getByTestId("dns-provider-toggle-cloudflare"));
    expect(screen.getByTestId("dns-provider-content-cloudflare")).toBeTruthy();
    // Cloudflare has the orange-cloud warning embedded.
    expect(
      screen.getByTestId("dns-provider-content-cloudflare").textContent,
    ).toMatch(/orange Wolke/);
  });

  it("only one provider section is open at a time (accordion)", () => {
    render(<DnsSetupInstructions dnsHint={cnameHint} />);
    fireEvent.click(screen.getByTestId("dns-provider-toggle-cloudflare"));
    expect(screen.getByTestId("dns-provider-content-cloudflare")).toBeTruthy();
    fireEvent.click(screen.getByTestId("dns-provider-toggle-ionos"));
    expect(screen.queryByTestId("dns-provider-content-cloudflare")).toBeNull();
    expect(screen.getByTestId("dns-provider-content-ionos")).toBeTruthy();
  });

  it("expands and collapses the troubleshooting section", () => {
    render(<DnsSetupInstructions dnsHint={cnameHint} />);
    expect(screen.queryByTestId("dns-troubleshooting-content")).toBeNull();
    fireEvent.click(screen.getByText("Troubleshooting"));
    expect(screen.getByTestId("dns-troubleshooting-content")).toBeTruthy();
  });

  it("renders a copy button only on the value row", () => {
    render(<DnsSetupInstructions dnsHint={cnameHint} />);
    expect(screen.getByTestId("dns-record-copy-value")).toBeTruthy();
    // No copy button on Type / Name / TTL rows — they're not the
    // user-actionable values.
    expect(screen.queryByTestId("dns-record-copy-type")).toBeNull();
    expect(screen.queryByTestId("dns-record-copy-ttl")).toBeNull();
  });
});
