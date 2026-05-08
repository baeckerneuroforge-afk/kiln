// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandingForm } from "@/components/onboarding/branding-form";
import { ChannelConfigCard } from "@/components/onboarding/channel-config-card";
import { IndustryPicker } from "@/components/onboarding/industry-picker";
import { KbUrlScraper } from "@/components/onboarding/kb-url-scraper";
import { ReviewSummary } from "@/components/onboarding/review-summary";
import { TemplateCard } from "@/components/onboarding/template-card";

afterEach(cleanup);

describe("onboarding UI components", () => {
  it("industry picker selects an industry", () => {
    const onChange = vi.fn();
    render(<IndustryPicker value="dental" onChange={onChange} />);
    fireEvent.click(screen.getByText("KFZ"));
    expect(onChange).toHaveBeenCalledWith("kfz");
  });

  it("template card toggles inclusion", () => {
    const onToggle = vi.fn();
    render(
      <TemplateCard
        template={{ id: "termin", name: "Termin-Anfrage Department", description: "Appointments", workerCount: 3, selected: true }}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByText("Termin-Anfrage Department"));
    expect(onToggle).toHaveBeenCalledWith("termin");
  });

  it("URL scraper adds and edits urls", () => {
    const onChange = vi.fn();
    render(<KbUrlScraper urls={[""]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("https://kunde.de/faq"), { target: { value: "https://x.test" } });
    expect(onChange).toHaveBeenCalledWith(["https://x.test"]);
  });

  it("channel config card toggles enabled state", () => {
    const onChange = vi.fn();
    render(<ChannelConfigCard title="Email" description="Email channel" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("branding form edits brand color", () => {
    const onChange = vi.fn();
    render(<BrandingForm value={{ brandColor: "#F97316" }} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("#F97316"), { target: { value: "#123456" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ brandColor: "#123456" }));
  });

  it("review summary calculates selected departments and channels", () => {
    render(
      <ReviewSummary
        basics={{ customerName: "Acme", industry: "dental", contactEmail: "owner@acme.de" }}
        templates={[
          { templateId: "a", departmentName: "A", selected: true },
          { templateId: "b", departmentName: "B", selected: false },
        ]}
        channels={{ email: { enabled: true }, webchat: { enabled: true } }}
        kbCount={4}
        workerCount={3}
      />
    );
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("Email, Web Chat")).toBeTruthy();
  });
});
