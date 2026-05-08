/**
 * GET /api/email-branding/from-address-status?address=support@hephaistos.de
 *
 * Asks Resend whether the domain part of the From-address is verified.
 * The settings UI uses this to surface a "Domain not verified" warning
 * but never blocks save — emails fall back to the platform's noreply
 * address when the configured one is rejected at send time.
 *
 * Returns:
 *   { ok: true, domain: "hephaistos.de", verified: true }
 *   { ok: true, domain: "hephaistos.de", verified: false, reason: "not_found" | "pending" | ... }
 *   { ok: false, error: "missing_resend_api_key" } — caller treats as unknown.
 */
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

interface ResendDomainListItem {
  id: string;
  name: string;
  status: string; // "verified" | "pending" | "not_started" | "failure"
}

interface ResendDomainListResponse {
  data?: ResendDomainListItem[];
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  if (!address) {
    return Response.json({ error: "address is required" }, { status: 400 });
  }

  const at = address.indexOf("@");
  if (at < 0) {
    return Response.json(
      { error: "address must include a domain" },
      { status: 400 }
    );
  }

  const domain = address.slice(at + 1).toLowerCase();
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, domain, error: "missing_resend_api_key" },
      { status: 200 }
    );
  }

  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json(
        {
          ok: false,
          domain,
          error: `resend_${response.status}`,
        },
        { status: 200 }
      );
    }

    const json = (await response.json()) as ResendDomainListResponse;
    const match = (json.data || []).find(
      (item) => item.name.toLowerCase() === domain
    );

    if (!match) {
      return Response.json({
        ok: true,
        domain,
        verified: false,
        reason: "not_found",
      });
    }

    return Response.json({
      ok: true,
      domain,
      verified: match.status === "verified",
      reason: match.status,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        domain,
        error: err instanceof Error ? err.message : "fetch_failed",
      },
      { status: 200 }
    );
  }
}
