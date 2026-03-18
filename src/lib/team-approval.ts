export type ApprovalTimeoutAction =
  | "auto_approve"
  | "auto_reject"
  | "skip";

export type ApprovalGateConfig = {
  approverEmail: string;
  approvalMessage: string;
  timeoutHours: number;
  timeoutAction: ApprovalTimeoutAction;
  fallbackMemberId?: string | null;
};

const DEFAULT_APPROVAL_MESSAGE =
  "A human approval is required before this team can continue.";

export function normalizeApprovalGateConfig(
  input: unknown,
  fallbackEmail?: string | null
): ApprovalGateConfig {
  const record =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const approverEmail =
    typeof record.approverEmail === "string" && record.approverEmail.trim()
      ? record.approverEmail.trim()
      : fallbackEmail?.trim() || "";

  return {
    approverEmail,
    approvalMessage:
      typeof record.approvalMessage === "string" && record.approvalMessage.trim()
        ? record.approvalMessage.trim()
        : DEFAULT_APPROVAL_MESSAGE,
    timeoutHours:
      typeof record.timeoutHours === "number" &&
      Number.isFinite(record.timeoutHours) &&
      record.timeoutHours > 0
        ? Math.max(1, Math.round(record.timeoutHours))
        : 24,
    timeoutAction:
      record.timeoutAction === "auto_approve" ||
      record.timeoutAction === "auto_reject"
        ? record.timeoutAction
        : "skip",
    fallbackMemberId:
      typeof record.fallbackMemberId === "string" && record.fallbackMemberId.trim()
        ? record.fallbackMemberId.trim()
        : null,
  };
}

export function getApprovalDeadline(
  requestedAt: Date,
  config: ApprovalGateConfig
) {
  return new Date(requestedAt.getTime() + config.timeoutHours * 60 * 60 * 1000);
}

export function isApprovalTimedOut(
  requestedAt: Date,
  config: ApprovalGateConfig,
  now = new Date()
) {
  return now.getTime() >= getApprovalDeadline(requestedAt, config).getTime();
}
