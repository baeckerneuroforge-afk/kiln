import { waitUntil } from "@vercel/functions";
import { NextRequest } from "next/server";
import {
  approveApprovalByToken,
  resolveTimedOutApprovalIfNeeded,
} from "@/lib/services/team-approval-runtime";
import { loadApprovalExecutionByToken } from "@/lib/services/team-runtime";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function renderApprovalPage(params: {
  token: string;
  teamId: string;
  executionId: string;
  teamName: string;
  goal: string | null;
  status: string;
  approvalStatus: string;
  approverEmail: string;
  requestedAt: Date;
  previousDecision: string;
  nextStep: string;
  context: Record<string, unknown>;
  decision?: string | null;
}) {
  const contextJson = JSON.stringify(params.context, null, 2);
  const isPending =
    params.status === "AWAITING_APPROVAL" &&
    params.approvalStatus === "PENDING";
  const preferredDecision =
    params.decision === "reject" ? "reject" : "approve";

  return new Response(
    `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>KILN Approval</title>
          <style>
            body { margin:0; background:#0a0a0a; color:#fafaf9; font-family:Inter,system-ui,sans-serif; }
            .wrap { max-width:860px; margin:0 auto; padding:48px 20px 80px; }
            .card { background:#18181b; border:1px solid rgba(255,255,255,.08); border-radius:20px; padding:24px; box-shadow:0 24px 80px rgba(0,0,0,.35); }
            .eyebrow { letter-spacing:.14em; text-transform:uppercase; font-size:12px; color:#a1a1aa; }
            h1 { margin:12px 0 8px; font-size:34px; line-height:1.1; }
            p { color:#d4d4d8; line-height:1.6; }
            .meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
            .badge { border:1px solid rgba(255,255,255,.1); border-radius:999px; padding:6px 10px; font-size:12px; color:#e4e4e7; }
            .grid { display:grid; gap:18px; margin-top:22px; }
            @media (min-width: 900px) { .grid { grid-template-columns:1.1fr .9fr; } }
            .panel { border:1px solid rgba(255,255,255,.08); border-radius:16px; background:#111114; padding:18px; }
            .panel h2 { margin:0 0 10px; font-size:14px; letter-spacing:.08em; text-transform:uppercase; color:#a1a1aa; }
            pre { background:#09090b; border:1px solid rgba(255,255,255,.06); border-radius:14px; padding:14px; overflow:auto; color:#e4e4e7; white-space:pre-wrap; }
            form { margin-top:16px; }
            textarea { width:100%; min-height:110px; border-radius:14px; border:1px solid rgba(255,255,255,.1); background:#09090b; color:#fafaf9; padding:12px 14px; resize:vertical; }
            .actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; }
            button { border:0; border-radius:999px; padding:12px 18px; font-weight:600; cursor:pointer; }
            .approve { background:${preferredDecision === "approve" ? "#16a34a" : "#15803d"}; color:#fff; }
            .reject { background:${preferredDecision === "reject" ? "#dc2626" : "#991b1b"}; color:#fff; }
            .disabled { opacity:.65; pointer-events:none; }
            .status { margin-top:18px; padding:14px 16px; border-radius:16px; background:rgba(249,115,22,.12); border:1px solid rgba(249,115,22,.24); }
            a { color:#fb923c; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="card">
              <div class="eyebrow">KILN Approval Gate</div>
              <h1>${escapeHtml(params.teamName)}</h1>
              <p>${escapeHtml(
                params.goal || "A running team execution needs a human decision before it can continue."
              )}</p>
              <div class="meta">
                <span class="badge">Execution ${escapeHtml(params.executionId.slice(0, 8))}</span>
                <span class="badge">Execution Status: ${escapeHtml(params.status)}</span>
                <span class="badge">Approval Status: ${escapeHtml(params.approvalStatus)}</span>
                <span class="badge">Approver: ${escapeHtml(params.approverEmail)}</span>
                <span class="badge">Requested: ${escapeHtml(params.requestedAt.toLocaleString())}</span>
              </div>

              <div class="grid">
                <div class="panel">
                  <h2>Execution Summary So Far</h2>
                  <p><strong>Previous decision:</strong> ${escapeHtml(params.previousDecision)}</p>
                  <p><strong>What happens next:</strong> ${escapeHtml(params.nextStep)}</p>
                  <pre>${escapeHtml(contextJson)}</pre>
                </div>

                <div class="panel">
                  <h2>Approve or Reject</h2>
                  ${
                    isPending
                      ? `
                        <form method="POST" action="/api/teams/${params.teamId}/executions/${params.executionId}/approve?token=${encodeURIComponent(params.token)}">
                          <input type="hidden" name="token" value="${escapeHtml(params.token)}" />
                          <div class="actions">
                            <button class="approve" type="submit">Approve and Resume</button>
                          </div>
                        </form>

                        <form method="POST" action="/api/teams/${params.teamId}/executions/${params.executionId}/reject?token=${encodeURIComponent(params.token)}">
                          <input type="hidden" name="token" value="${escapeHtml(params.token)}" />
                          <label for="note" style="display:block;margin-top:18px;margin-bottom:8px;color:#d4d4d8;font-size:14px;">Optional rejection note</label>
                          <textarea id="note" name="note" placeholder="Explain why this execution should stop or what needs to change."></textarea>
                          <div class="actions">
                            <button class="reject" type="submit">Reject Execution</button>
                          </div>
                        </form>
                      `
                      : `
                        <div class="status">
                          This approval request is no longer pending. You can close this tab.
                        </div>
                      `
                  }
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; execId: string } }
) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Token is required." }, { status: 400 });
  }

  const timeoutResult = await resolveTimedOutApprovalIfNeeded(
    params.id,
    params.execId,
    token
  );
  if (timeoutResult?.resumePromise) {
    waitUntil(
      timeoutResult.resumePromise.catch((error) => {
        console.error("Approval timeout resume failed:", error);
      })
    );
  }

  const loaded =
    timeoutResult?.loaded ||
    (await loadApprovalExecutionByToken(params.id, params.execId, token));
  if (!loaded) {
    return Response.json({ error: "Approval request not found." }, { status: 404 });
  }

  const latestCompletedLog = [...loaded.execution.logs]
    .filter((log) => log.status === "COMPLETED" && typeof log.output === "string")
    .sort((a, b) => b.taskIndex - a.taskIndex || b.attempt - a.attempt)[0];
  const nextPlannedTask =
    Array.isArray(loaded.execution.taskPlan)
      ? (loaded.execution.taskPlan as Array<Record<string, unknown>>)
          .find((task) => typeof task.taskIndex === "number" && task.taskIndex > loaded.approvalRequest.taskIndex)
      : null;

  return renderApprovalPage({
    token,
    teamId: params.id,
    executionId: params.execId,
    teamName: loaded.team.name,
    goal: loaded.execution.goal || loaded.team.goal || null,
    status: loaded.execution.status,
    approvalStatus: loaded.approvalRequest.status,
    approverEmail: loaded.approvalRequest.approverEmail,
    requestedAt: loaded.approvalRequest.requestedAt,
    previousDecision: latestCompletedLog?.output || "No previous decision recorded yet.",
    nextStep:
      nextPlannedTask && typeof nextPlannedTask.title === "string"
        ? `${nextPlannedTask.title} will run next once the gate is cleared.`
        : "No downstream task is scheduled after this gate.",
    context:
      loaded.execution.executionContext && typeof loaded.execution.executionContext === "object"
        ? (loaded.execution.executionContext as Record<string, unknown>)
        : {},
    decision: request.nextUrl.searchParams.get("decision"),
  });
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

  const result = await approveApprovalByToken({
    teamId: params.id,
    executionId: params.execId,
    token: payload.token,
    note: payload.note,
  });

  if (result.resumePromise) {
    waitUntil(
      result.resumePromise.catch((error) => {
        console.error("Approval resume failed:", error);
      })
    );
  }

  if (payload.isForm) {
    return Response.redirect(
      new URL(
        `/api/teams/${params.id}/executions/${params.execId}/approve?token=${encodeURIComponent(payload.token)}`,
        request.url
      )
    );
  }

  return Response.json({
    executionId: result.executionId,
    status: result.status,
  });
}
