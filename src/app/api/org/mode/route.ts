import { NextResponse } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { getOrgModeDetails } from "@/lib/org-mode";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const details = await getOrgModeDetails(orgId);
    return NextResponse.json(details);
  } catch (error) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "Unauthenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[org/mode] Failed to resolve org mode", error);
    return NextResponse.json({ error: "Failed to resolve org mode" }, { status: 500 });
  }
}
