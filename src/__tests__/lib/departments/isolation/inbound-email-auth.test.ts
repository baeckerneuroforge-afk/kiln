import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { verifyInboundEmailAuth } from "@/lib/departments/channels/safety";

describe("verifyInboundEmailAuth", () => {
  const SECRET = "whsec_" + Buffer.from("test-secret-bytes-128").toString("base64");

  beforeEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.DEPARTMENT_EMAIL_INBOUND_SECRET;
  });

  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.DEPARTMENT_EMAIL_INBOUND_SECRET;
  });

  it("allows when no secret is configured (backward-compatible)", () => {
    const result = verifyInboundEmailAuth({
      rawBody: "{}",
      svixId: null,
      svixTimestamp: null,
      svixSignature: null,
      customSecret: null,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when DEPARTMENT_EMAIL_INBOUND_SECRET is set and customSecret missing", () => {
    process.env.DEPARTMENT_EMAIL_INBOUND_SECRET = "expected";
    const result = verifyInboundEmailAuth({
      rawBody: "{}",
      svixId: null,
      svixTimestamp: null,
      svixSignature: null,
      customSecret: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_headers");
  });

  it("rejects when DEPARTMENT_EMAIL_INBOUND_SECRET is set and customSecret wrong", () => {
    process.env.DEPARTMENT_EMAIL_INBOUND_SECRET = "expected";
    const result = verifyInboundEmailAuth({
      rawBody: "{}",
      svixId: null,
      svixTimestamp: null,
      svixSignature: null,
      customSecret: "wrong",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("accepts custom secret match", () => {
    process.env.DEPARTMENT_EMAIL_INBOUND_SECRET = "expected";
    const result = verifyInboundEmailAuth({
      rawBody: "{}",
      svixId: null,
      svixTimestamp: null,
      svixSignature: null,
      customSecret: "expected",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects Svix signed payloads with stale timestamp (>5min skew)", () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const result = verifyInboundEmailAuth({
      rawBody: "{}",
      svixId: "msg_1",
      svixTimestamp: oldTimestamp,
      svixSignature: "v1,bogus",
      customSecret: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timestamp_skew");
  });

  it("accepts Svix signed payload with valid HMAC", () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"hello":"world"}';
    const secretBytes = Buffer.from(SECRET.slice("whsec_".length), "base64");
    const expectedSig =
      "v1," +
      crypto
        .createHmac("sha256", secretBytes)
        .update(`${id}.${timestamp}.${body}`)
        .digest("base64");

    const result = verifyInboundEmailAuth({
      rawBody: body,
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: expectedSig,
      customSecret: null,
    });
    expect(result.ok).toBe(true);
  });
});
