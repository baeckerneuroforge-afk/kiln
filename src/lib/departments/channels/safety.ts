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
