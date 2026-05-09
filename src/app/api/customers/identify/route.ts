import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { identifyCustomer } from "@/lib/customer-memory/identifier";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const profile = await identifyCustomer({
      orgId: scope.orgId,
      email: typeof body.email === "string" ? body.email : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      name: typeof body.name === "string" ? body.name : null,
    });
    if (!profile) return Response.json({ error: "Email or phone required" }, { status: 400 });
    return Response.json(profile, { status: 200 });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/identify] failed", error);
    return Response.json({ error: "Identify failed" }, { status: 500 });
  }
}
