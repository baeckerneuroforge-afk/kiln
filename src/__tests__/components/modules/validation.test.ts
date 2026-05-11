import { describe, expect, it } from "vitest";
import {
  validateAICredentials,
  validateCredentialsOwner,
  validateModuleDraft,
  validateTwilioCredentials,
} from "@/components/sub-orgs/modules/validation";

describe("validateAICredentials", () => {
  it("requires at least one key", () => {
    const result = validateAICredentials({});
    expect(result.ok).toBe(false);
    expect(result.errors.anthropicKey).toMatch(/Mindestens ein Schlüssel/);
  });

  it("accepts a valid anthropic key only", () => {
    expect(validateAICredentials({ anthropicKey: "sk-ant-test" }).ok).toBe(true);
  });

  it("rejects an anthropic key with wrong prefix", () => {
    const result = validateAICredentials({ anthropicKey: "wrong-prefix" });
    expect(result.ok).toBe(false);
    expect(result.errors.anthropicKey).toMatch(/sk-ant-/);
  });

  it("accepts a valid openai key", () => {
    expect(validateAICredentials({ openaiKey: "sk-test-123" }).ok).toBe(true);
  });

  it("rejects an openai key with wrong prefix", () => {
    const result = validateAICredentials({ openaiKey: "no-prefix" });
    expect(result.ok).toBe(false);
    expect(result.errors.openaiKey).toMatch(/sk-/);
  });

  it("trims whitespace before validating", () => {
    expect(validateAICredentials({ anthropicKey: "  sk-ant-x  " }).ok).toBe(true);
  });
});

describe("validateTwilioCredentials", () => {
  it("requires account SID and auth token", () => {
    const result = validateTwilioCredentials({});
    expect(result.ok).toBe(false);
    expect(result.errors.accountSid).toBeTruthy();
    expect(result.errors.authToken).toBeTruthy();
  });

  it("validates SID format (AC + hex)", () => {
    const result = validateTwilioCredentials({ accountSid: "BAD123", authToken: "tok" });
    expect(result.ok).toBe(false);
    expect(result.errors.accountSid).toMatch(/AC \+ Hex/);
  });

  it("accepts a valid AC-prefixed SID", () => {
    expect(
      validateTwilioCredentials({ accountSid: "AC1234abcd", authToken: "tok" }).ok,
    ).toBe(true);
  });

  it("rejects non-E.164 phone numbers", () => {
    const result = validateTwilioCredentials({
      accountSid: "AC1234abcd",
      authToken: "tok",
      phoneNumber: "0301234567",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.phoneNumber).toMatch(/E.164/);
  });

  it("accepts a valid E.164 phone number", () => {
    expect(
      validateTwilioCredentials({
        accountSid: "AC1234abcd",
        authToken: "tok",
        phoneNumber: "+49301234567",
      }).ok,
    ).toBe(true);
  });

  it("requires phone number when option is set", () => {
    const result = validateTwilioCredentials(
      { accountSid: "AC1234abcd", authToken: "tok" },
      { requirePhoneNumber: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.phoneNumber).toBeTruthy();
  });
});

describe("validateCredentialsOwner", () => {
  it("rejects empty / non-email values", () => {
    expect(validateCredentialsOwner("")).toMatch(/Email/);
    expect(validateCredentialsOwner("not-email")).toMatch(/Email/);
    expect(validateCredentialsOwner(null)).toMatch(/Email/);
  });

  it("accepts valid emails", () => {
    expect(validateCredentialsOwner("user@example.com")).toBeNull();
  });
});

describe("validateModuleDraft integration", () => {
  it("pool mode skips all credential validation", () => {
    expect(
      validateModuleDraft({ moduleName: "ai", mode: "pool", credentials: null, credentialsOwner: null }).ok,
    ).toBe(true);
  });

  it("byok_agency requires credentials but not owner", () => {
    expect(
      validateModuleDraft({
        moduleName: "ai",
        mode: "byok_agency",
        credentials: { anthropicKey: "sk-ant-x" },
        credentialsOwner: null,
      }).ok,
    ).toBe(true);
  });

  it("byok_customer requires both credentials and owner email", () => {
    const result = validateModuleDraft({
      moduleName: "ai",
      mode: "byok_customer",
      credentials: { anthropicKey: "sk-ant-x" },
      credentialsOwner: "not-an-email",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.credentialsOwner).toBeTruthy();
  });

  it("twilio module validates Twilio credentials shape", () => {
    const result = validateModuleDraft({
      moduleName: "sms",
      mode: "byok_agency",
      credentials: { accountSid: "BAD", authToken: "" },
      credentialsOwner: null,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.accountSid).toBeTruthy();
    expect(result.errors.authToken).toBeTruthy();
  });
});
