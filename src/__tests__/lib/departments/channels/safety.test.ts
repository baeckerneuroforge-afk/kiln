import { describe, expect, it, beforeEach } from "vitest";
import {
  getInboundAllowlist,
  isDepartmentAutoSendBlocked,
  isInboundAllowed,
  isWithinWhatsapp24HourWindow,
  normalizeIdentity,
  stripHtml,
} from "@/lib/departments/channels/safety";

describe("department channel safety", () => {
  beforeEach(() => {
    delete process.env.DEPARTMENT_BLOCK_AUTO_SEND;
    delete process.env.DEPARTMENT_INBOUND_ALLOWLIST;
  });

  it("blocks auto-send by default outside production", () => {
    expect(isDepartmentAutoSendBlocked()).toBe(true);
  });

  it("allows send only when explicitly false", () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "false";
    expect(isDepartmentAutoSendBlocked()).toBe(false);
  });

  it("blocks send when explicitly true", () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "true";
    expect(isDepartmentAutoSendBlocked()).toBe(true);
  });

  it("parses inbound allowlist", () => {
    process.env.DEPARTMENT_INBOUND_ALLOWLIST = " test@example.com, 491701234567 ";
    expect(getInboundAllowlist()).toEqual(["test@example.com", "491701234567"]);
  });

  it("allows all inbound when allowlist is empty", () => {
    expect(isInboundAllowed("anyone@example.com")).toBe(true);
  });

  it("allows matching email sender", () => {
    process.env.DEPARTMENT_INBOUND_ALLOWLIST = "test@example.com";
    expect(isInboundAllowed(" Test@Example.com ")).toBe(true);
  });

  it("blocks non-matching email sender", () => {
    process.env.DEPARTMENT_INBOUND_ALLOWLIST = "test@example.com";
    expect(isInboundAllowed("other@example.com")).toBe(false);
  });

  it("normalizes phone numbers", () => {
    expect(normalizeIdentity("+49 170 1234567")).toBe("+491701234567");
  });

  it("detects WhatsApp 24h window", () => {
    expect(isWithinWhatsapp24HourWindow(new Date(Date.now() - 60_000))).toBe(true);
    expect(isWithinWhatsapp24HourWindow(new Date(Date.now() - 25 * 60 * 60 * 1000))).toBe(false);
  });

  it("strips html to text", () => {
    expect(stripHtml("<p>Hello<br>world</p>")).toContain("Hello\nworld");
  });
});
