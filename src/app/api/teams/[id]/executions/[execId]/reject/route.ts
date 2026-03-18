import { waitUntil } from "@vercel/functions";
import { NextRequest } from "next/server";
import {
  rejectApprovalByToken,
  resolveTimedOutApprovalIfNeeded,
} from "@/lib/services/team-approval-runtime";

async function readPayload(request: NextRequest) {
  const urlToken = request.nextUrl.searchParams.get("token");
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return {
      token: urlToken || (typeof body.token === "string" ? body.token : null),
      note: typeof body.note === "string" ? body.note : "",
      isForm: false,
    };
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData().catch(() => null);
    const token = form?.get("token");
    const note = form?.get("note");
    return {
      token: urlToken || (typeof token === "string" ? token : null),
      note: typeof note === "string" ? note : "",
      isForm: true,
    };
  }

  return {
    token: urlToken,
    note: "",
    isForm: false,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; execId: string } }
) {
  const payload = await readPayload(request);
  if (!payload.token) {
    return Response.json({ error: "Token is required." }, { status: 400 });
  }

  const timeoutResult = await resolveTimedOutApprovalIfNeeded(
    params.id,
    params.execId,
    payload.token
  );
  if (timeoutResult?.resumePromise) {
    waitUntil(
      timeoutResult.resumePromise.catch((error) => {
        console.error("Approval timeout resume failed:", error);
      })
    );
  }

  const result = await rejectApprovalByToken({
    teamId: params.id,
    executionId: params.execId,
    token: payload.token,
    note: payload.note,
  });

  if (payload.isForm) {
    return Response.redirect(
      new URL(
        `/api/teams/${params.id}/executions/${params.execId}/approve?token=${encodeURIComponent(payload.token)}`,
        request.url
      ),
      303
    );
  }

  return Response.json({
    executionId: result.executionId,
    status: result.status,
  });
}
