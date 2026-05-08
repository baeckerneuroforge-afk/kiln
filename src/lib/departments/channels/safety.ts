import crypto from "crypto";

export function isDepartmentAutoSendBlocked(): boolean {
  const value = process.env.DEPARTMENT_BLOCK_AUTO_SEND;
  if (value === "false") return false;
  if (value === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function getInboundAllowlist(): string[] {
  return (process.env.DEPARTMENT_INBOUND_ALLOWLIST || "")
    .split(",")
    .map((entry) => normalizeIdentity(entry))
    .filter(Boolean);
}

export function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^\d+]/g, (char) => {
    return /[a-z@._+-]/i.test(char) ? char : "";
  });
}

export function isInboundAllowed(sender: string): boolean {
  const allowlist = getInboundAllowlist();
  if (allowlist.length === 0) return true;
  return allowlist.includes(normalizeIdentity(sender));
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const actualBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export interface InboundEmailAuthInput {
  rawBody: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  customSecret: string | null;
}

export type InboundEmailAuthResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_headers" | "invalid_signature" | "timestamp_skew" };

export function verifyInboundEmailAuth(
  input: InboundEmailAuthInput
): InboundEmailAuthResult {
  const customExpected = process.env.DEPARTMENT_EMAIL_INBOUND_SECRET;
  if (customExpected) {
    if (!input.customSecret) return { ok: false, reason: "missing_headers" };
    const a = Buffer.from(input.customSecret);
    const b = Buffer.from(customExpected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true };
  }

  const svixSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!svixSecret) {
    // No verification configured — allow (existing behavior, backward-compatible).
    return { ok: true };
  }

  if (!input.svixId || !input.svixTimestamp || !input.svixSignature) {
    return { ok: false, reason: "missing_headers" };
  }

  const skewSeconds = Math.abs(
    Math.floor(Date.now() / 1000) - parseInt(input.svixTimestamp, 10)
  );
  if (Number.isNaN(skewSeconds) || skewSeconds > 300) {
    return { ok: false, reason: "timestamp_skew" };
  }

  const secretBytes = svixSecret.startsWith("whsec_")
    ? Buffer.from(svixSecret.slice("whsec_".length), "base64")
    : Buffer.from(svixSecret, "utf8");

  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.rawBody}`;
  const expectedHmac = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  const provided = input.svixSignature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice("v1,".length));

  for (const candidate of provided) {
    const aBuf = Buffer.from(candidate);
    const bBuf = Buffer.from(expectedHmac);
    if (aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "invalid_signature" };
}

export function isWithinWhatsapp24HourWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() <= 24 * 60 * 60 * 1000;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
