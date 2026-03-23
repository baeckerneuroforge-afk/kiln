import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import dns from "dns/promises";

// DNS CNAME Verification für Custom Domain
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const { domain } = await request.json();
    if (!domain || typeof domain !== "string") {
      return Response.json({ error: "Domain is required" }, { status: 400 });
    }

    // Domain bereinigen
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim().toLowerCase();

    try {
      const records = await dns.resolveCname(cleanDomain);
      const expectedTarget = process.env.VERCEL_DOMAIN || "kilnbase.com";

      const isValid = records.some(
        (record) => record.toLowerCase() === expectedTarget.toLowerCase()
      );

      if (isValid) {
        return Response.json({
          verified: true,
          domain: cleanDomain,
          cname: records[0],
          message: "CNAME verified successfully!",
        });
      } else {
        return Response.json({
          verified: false,
          domain: cleanDomain,
          cname: records[0] || null,
          expected: expectedTarget,
          message: `CNAME points to ${records[0] || "unknown"} instead of ${expectedTarget}`,
        });
      }
    } catch {
      return Response.json({
        verified: false,
        domain: cleanDomain,
        cname: null,
        message: "No CNAME record found. Please add the DNS record and wait for propagation (can take up to 48 hours).",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
