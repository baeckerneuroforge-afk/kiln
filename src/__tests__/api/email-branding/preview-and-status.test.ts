import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findUnique: vi.fn().mockResolvedValue(null) },
  orgBranding: { findUnique: vi.fn().mockResolvedValue(null) },
}));
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

import { POST as previewPost } from "@/app/api/email-branding/preview/route";
import { GET as statusGet } from "@/app/api/email-branding/from-address-status/route";

describe("POST /api/email-branding/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_x" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValue(null);
    mockPrisma.orgBranding.findUnique.mockResolvedValue(null);
  });

  it("rejects unknown templates with 400", async () => {
    const res = await previewPost(
      new Request("https://x.test/api/email-branding/preview", {
        method: "POST",
        body: JSON.stringify({ template: "unknown" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("renders welcome with KILN defaults when no branding configured", async () => {
    const res = await previewPost(
      new Request("https://x.test/api/email-branding/preview", {
        method: "POST",
        body: JSON.stringify({ template: "welcome" }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rendered.subject).toBe("Welcome to KILN");
    expect(body.rendered.html).toContain("KILN");
  });

  it("renders all 6 templates without crashing", async () => {
    const templates = [
      "welcome",
      "password-reset",
      "invoice",
      "approval-needed",
      "monthly-report",
      "department-digest",
    ];
    for (const template of templates) {
      const res = await previewPost(
        new Request("https://x.test/api/email-branding/preview", {
          method: "POST",
          body: JSON.stringify({ template }),
        })
      );
      expect(res.status, `${template} should render`).toBe(200);
      const body = await res.json();
      expect(body.rendered.html.length).toBeGreaterThan(50);
    }
  });
});

describe("GET /api/email-branding/from-address-status", () => {
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_x" });
    process.env.RESEND_API_KEY = "re_test";
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  });

  it("returns missing_resend_api_key when env not set", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await statusGet(
      new Request(
        "https://x.test/api/email-branding/from-address-status?address=hello@example.com"
      )
    );
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("missing_resend_api_key");
  });

  it("returns verified when Resend lists the domain as verified", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "d_1", name: "hephaistos.de", status: "verified" }],
        }),
        { status: 200 }
      )
    );
    const res = await statusGet(
      new Request(
        "https://x.test/api/email-branding/from-address-status?address=support@hephaistos.de"
      )
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(true);
    expect(body.domain).toBe("hephaistos.de");
  });

  it("returns not_found when domain isn't in Resend's list", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    const res = await statusGet(
      new Request(
        "https://x.test/api/email-branding/from-address-status?address=support@hephaistos.de"
      )
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(false);
    expect(body.reason).toBe("not_found");
  });

  it("rejects invalid address with 400", async () => {
    const res = await statusGet(
      new Request(
        "https://x.test/api/email-branding/from-address-status?address=not-an-email"
      )
    );
    expect(res.status).toBe(400);
  });
});
