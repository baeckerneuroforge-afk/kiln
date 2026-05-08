import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { createCustomerSupportDepartment } from "@/lib/departments/templates/customer-support-template";

export async function POST(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const department = await createCustomerSupportDepartment({
      scope,
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
    });

    return Response.json(department, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create template" },
      { status: 500 }
    );
  }
}
