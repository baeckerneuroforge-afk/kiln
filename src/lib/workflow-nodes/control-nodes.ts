/**
 * Control Node Executors
 * Steuern den Ablauf: Approval Gates, Wait Webhook, Sub-Workflows, Merge.
 */

import type { ExpressionContext } from "@/lib/workflow-expressions";
import { resolveExpression } from "@/lib/workflow-expressions";

export interface ControlNodeResult {
  /** Wie die Execution fortfahren soll */
  action: "continue" | "pause" | "skip";
  /** Daten für den Kontext */
  contextDelta: Record<string, unknown>;
  /** Warum pausiert? */
  pauseReason?: string;
  /** Metadaten */
  meta?: Record<string, unknown>;
}

/* ── Approval Gate ── */

export function executeApprovalGate(
  config: Record<string, unknown>,
  context: ExpressionContext
): ControlNodeResult {
  const approverEmail = resolveExpression(
    String(config.approverEmail || ""),
    context
  );
  const timeoutMinutes = Number(config.timeoutMinutes) || 60;
  const message = config.approvalMessage
    ? resolveExpression(String(config.approvalMessage), context)
    : undefined;

  if (!approverEmail) {
    return {
      action: "skip",
      contextDelta: {},
      meta: { reason: "Keine Approver-E-Mail konfiguriert" },
    };
  }

  // Die Execution wird pausiert. Der Aufrufer (workflow-runtime) muss
  // die Approval-Logik über team-approval-runtime.ts abwickeln.
  return {
    action: "pause",
    contextDelta: {},
    pauseReason: `Warte auf Approval von ${approverEmail}`,
    meta: {
      approverEmail,
      timeoutMinutes,
      message,
    },
  };
}

/* ── Wait for Webhook ── */

export function executeWaitWebhook(
  config: Record<string, unknown>,
): ControlNodeResult {
  const timeoutMinutes = Number(config.timeoutMinutes) || 1440;
  const resumeKey = String(config.resumeKey || "");

  // Die Execution wird pausiert bis ein externer Webhook sie resumed.
  return {
    action: "pause",
    contextDelta: {},
    pauseReason: `Warte auf externen Webhook${resumeKey ? ` (Key: ${resumeKey})` : ""}`,
    meta: {
      timeoutMinutes,
      resumeKey,
    },
  };
}

/* ── Sub-Workflow ── */

export function executeSubWorkflow(
  config: Record<string, unknown>,
  context: ExpressionContext
): ControlNodeResult {
  const workflowId = resolveExpression(
    String(config.workflowId || ""),
    context
  );
  const mode = String(config.mode || "sync"); // sync | async

  if (!workflowId) {
    return {
      action: "skip",
      contextDelta: {},
      meta: { reason: "Keine Workflow-ID konfiguriert" },
    };
  }

  if (mode === "async") {
    // Async: Sub-Workflow wird gestartet, Execution geht weiter
    return {
      action: "continue",
      contextDelta: {
        _subWorkflow: {
          workflowId,
          mode: "async",
          triggeredAt: new Date().toISOString(),
        },
      },
      meta: { workflowId, mode },
    };
  }

  // Sync: Execution pausiert bis Sub-Workflow fertig
  return {
    action: "pause",
    contextDelta: {
      _subWorkflow: {
        workflowId,
        mode: "sync",
        triggeredAt: new Date().toISOString(),
      },
    },
    pauseReason: `Warte auf Sub-Workflow ${workflowId}`,
    meta: { workflowId, mode },
  };
}

/* ── Merge ── */

export function executeMergeNode(
  config: Record<string, unknown>,
  _context: ExpressionContext,
  branchesCompleted: number,
  branchesExpected: number
): ControlNodeResult {
  const strategy = String(config.strategy || "wait_all");

  if (strategy === "wait_all") {
    if (branchesCompleted >= branchesExpected) {
      return {
        action: "continue",
        contextDelta: {
          _merge: {
            strategy,
            branchesCompleted,
            branchesExpected,
            mergedAt: new Date().toISOString(),
          },
        },
        meta: { strategy, branchesCompleted, branchesExpected },
      };
    }

    return {
      action: "pause",
      contextDelta: {},
      pauseReason: `Warte auf ${branchesExpected - branchesCompleted} weitere Branches`,
      meta: { strategy, branchesCompleted, branchesExpected },
    };
  }

  if (strategy === "wait_any") {
    if (branchesCompleted >= 1) {
      return {
        action: "continue",
        contextDelta: {
          _merge: {
            strategy,
            branchesCompleted,
            mergedAt: new Date().toISOString(),
          },
        },
        meta: { strategy, branchesCompleted },
      };
    }

    return {
      action: "pause",
      contextDelta: {},
      pauseReason: "Warte auf mindestens einen Branch",
      meta: { strategy, branchesCompleted, branchesExpected },
    };
  }

  // Default: continue
  return {
    action: "continue",
    contextDelta: {},
    meta: { strategy },
  };
}

/* ── Dispatcher ── */

export function executeControlNode(
  nodeType: string,
  config: Record<string, unknown>,
  context: ExpressionContext,
  extra?: { branchesCompleted?: number; branchesExpected?: number }
): ControlNodeResult {
  switch (nodeType) {
    case "approval_gate":
      return executeApprovalGate(config, context);
    case "wait_webhook":
      return executeWaitWebhook(config);
    case "sub_workflow":
      return executeSubWorkflow(config, context);
    case "merge":
      return executeMergeNode(
        config,
        context,
        extra?.branchesCompleted ?? 0,
        extra?.branchesExpected ?? 1
      );
    default:
      throw new Error(`Unbekannter Control-Node-Typ: ${nodeType}`);
  }
}
