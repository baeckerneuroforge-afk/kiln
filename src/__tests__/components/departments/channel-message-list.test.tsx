// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChannelMessageList } from "@/components/departments/channel-message-list";

describe("ChannelMessageList", () => {
  afterEach(() => cleanup());

  it("renders empty state", () => {
    render(<ChannelMessageList messages={[]} />);
    expect(screen.getByText(/no channel messages/i)).toBeTruthy();
  });

  it("renders email message metadata", () => {
    render(<ChannelMessageList messages={[emailMessage()]} />);
    expect(screen.getByText("EMAIL")).toBeTruthy();
    expect(screen.getByText("Subject")).toBeTruthy();
  });

  it("renders whatsapp message metadata", () => {
    render(<ChannelMessageList messages={[{ ...emailMessage(), id: "msg_2", channel: "WHATSAPP", whatsappFrom: "4917", whatsappBody: "Hi", emailSubject: null }]} />);
    expect(screen.getByText("WHATSAPP")).toBeTruthy();
  });

  it("expands full message body on click", () => {
    render(<ChannelMessageList messages={[emailMessage()]} />);
    fireEvent.click(screen.getByText("EMAIL"));
    expect(screen.getByText("Long body")).toBeTruthy();
  });
});

function emailMessage() {
  return {
    id: "msg_1",
    departmentId: "dept_1",
    backlogItemId: "item_1",
    channel: "EMAIL" as const,
    direction: "INBOUND" as const,
    emailMessageId: "email_1",
    emailFrom: "a@example.com",
    emailTo: "support@example.com",
    emailSubject: "Subject",
    emailHeaders: {},
    emailBody: "Long body",
    whatsappMessageId: null,
    whatsappFrom: null,
    whatsappTo: null,
    whatsappBody: null,
    whatsappType: null,
    whatsappMediaId: null,
    status: "RECEIVED",
    blockedReason: null,
    errorMessage: null,
    sentAt: null,
    externalId: null,
    createdAt: new Date().toISOString(),
  };
}
