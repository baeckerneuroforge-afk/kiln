"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pause,
  Play,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisualTeamEditor } from "@/components/teams/visual-team-editor";
import { cn } from "@/lib/utils";
import type {
  ReplayStep,
  ReplayTaskStatus,
  TeamExecutionReplayResponse,
} from "@/lib/team-execution-replay-types";

interface ExecutionReplayProps {
  teamId: string;
  executionId: string | null;
  open: boolean;
  onClose: () => void;
}

type ReplayPhaseType = "start" | "finish";

interface ReplayPhase {
  id: string;
  stepIndex: number;
  type: ReplayPhaseType;
  label: string;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs < 1000) return durationMs === 0 ? "0s" : "n/a";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatJson(value: unknown) {
  if (value == null) return "No data";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function toExecutionStatus(status: ReplayTaskStatus) {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "FAILED":
    case "REJECTED":
      return "failed";
    case "SKIPPED":
      return "skipped";
    case "AWAITING_APPROVAL":
      return "awaiting_approval";
    case "RUNNING":
      return "running";
    case "PENDING":
    default:
      return "pending";
  }
}

function getStrategyLabel(strategy: ReplayStep["strategy"]) {
  switch (strategy) {
    case "fallback_agent":
      return "Fallback agent";
    case "fallback_model":
      return "Fallback model";
    case "primary":
    default:
      return "Primary";
  }
}

function getNodeTypeLabel(nodeType: string): string {
  const labels: Record<string, string> = {
    trigger_webhook: "Webhook Trigger",
    trigger_schedule: "Schedule Trigger",
    trigger_lead: "Lead Trigger",
    trigger_chat: "Chat Trigger",
    trigger_manual: "Manual Trigger",
    if_condition: "IF Condition",
    switch: "Switch",
    filter: "Filter",
    http_request: "HTTP Request",
    send_email: "Send Email",
    send_slack: "Slack Message",
    delay: "Delay",
    set_variable: "Set Variable",
    approval_gate: "Approval Gate",
    wait_webhook: "Wait Webhook",
    sub_workflow: "Sub-Workflow",
    merge: "Merge",
    agent: "AI Agent",
  };
  return labels[nodeType] || nodeType;
}

function getNodeCategoryColor(nodeType: string): string {
  if (nodeType.startsWith("trigger_")) return "text-violet-300";
  if (["if_condition", "switch", "filter"].includes(nodeType)) return "text-amber-300";
  if (["http_request", "send_email", "send_slack"].includes(nodeType)) return "text-blue-300";
  if (["delay", "set_variable"].includes(nodeType)) return "text-cyan-300";
  if (["approval_gate", "wait_webhook", "sub_workflow", "merge"].includes(nodeType)) return "text-pink-300";
  return "text-orange-300";
}

function buildReplayPhases(steps: ReplayStep[]): ReplayPhase[] {
  return steps.flatMap((step, stepIndex) => {
    const isWorkflow = step.nodeType && step.nodeType !== "agent";
    const name = isWorkflow ? getNodeTypeLabel(step.nodeType!) : step.memberName;
    return [
      {
        id: `${step.id}:start`,
        stepIndex,
        type: "start",
        label: `${name} started${isWorkflow ? "" : ` ${step.taskTitle}`}`,
      },
      {
        id: `${step.id}:finish`,
        stepIndex,
        type: "finish",
        label: `${name} ${step.status.toLowerCase().replace(/_/g, " ")}`,
      },
    ];
  });
}

function buildExecutionStateMap(
  data: TeamExecutionReplayResponse,
  phases: ReplayPhase[],
  currentPhaseIndex: number
) {
  const statusMap = new Map<
    string,
    "pending" | "running" | "completed" | "failed" | "skipped" | "awaiting_approval"
  >();

  data.team.members.forEach((member) => {
    statusMap.set(member.id, "pending");
  });

  const currentPhase = phases[currentPhaseIndex];
  if (!currentPhase) {
    return Array.from(statusMap.entries()).map(([memberId, status]) => ({
      memberId,
      status,
    }));
  }

  phases.forEach((phase, phaseIndex) => {
    if (phaseIndex > currentPhaseIndex) return;
    const step = data.steps[phase.stepIndex];
    if (!step.memberId) return;

    if (phase.type === "start") {
      statusMap.set(step.memberId, "running");
      return;
    }

    statusMap.set(step.memberId, toExecutionStatus(step.status));
  });

  if (currentPhase.type === "start") {
    const step = data.steps[currentPhase.stepIndex];
    if (step.memberId) {
      statusMap.set(step.memberId, "running");
    }
  }

  return Array.from(statusMap.entries()).map(([memberId, status]) => ({
    memberId,
    status,
  }));
}

export function ExecutionReplay({
  teamId,
  executionId,
  open,
  onClose,
}: ExecutionReplayProps) {
  const [data, setData] = useState<TeamExecutionReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [speed, setSpeed] = useState<1 | 2 | 5>(1);

  useEffect(() => {
    if (!open || !executionId) return;

    let cancelled = false;

    async function loadReplay() {
      setLoading(true);
      setError(null);
      setCurrentPhaseIndex(0);
      setIsPlaying(false);

      try {
        const response = await fetch(
          `/api/teams/${teamId}/executions/${executionId}/replay`
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load execution replay");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load execution replay"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReplay();

    return () => {
      cancelled = true;
    };
  }, [executionId, open, teamId]);

  const phases = useMemo(
    () => buildReplayPhases(data?.steps || []),
    [data?.steps]
  );

  const currentPhase = phases[currentPhaseIndex] || null;
  const currentStep = currentPhase ? data?.steps[currentPhase.stepIndex] || null : null;

  const executionSteps = useMemo(() => {
    if (!data || phases.length === 0) return [];
    return buildExecutionStateMap(data, phases, currentPhaseIndex);
  }, [currentPhaseIndex, data, phases]);

  useEffect(() => {
    if (!open || !isPlaying || phases.length === 0) return;
    if (currentPhaseIndex >= phases.length - 1) {
      setIsPlaying(false);
      return;
    }

    const delay = Math.max(250, Math.round(1100 / speed));
    const timer = window.setTimeout(() => {
      setCurrentPhaseIndex((index) => {
        if (index >= phases.length - 1) {
          setIsPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentPhaseIndex, isPlaying, open, phases.length, speed]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Execution Replay
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {data?.team.name || "Workflow execution"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Step through the execution exactly as the team advanced.
            </p>
            {data?.execution.trigger === "scheduled" ? (
              <p className="mt-2 text-xs text-violet-300">Scheduled execution</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              className="border-border text-foreground hover:bg-muted"
            >
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Clock className="mr-3 h-5 w-5 animate-pulse text-orange-400" />
            <span className="text-sm text-muted-foreground">Loading replay…</span>
          </div>
        ) : error ? (
          <div className="m-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        ) : !data || !currentStep ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            No replay data available.
          </div>
        ) : (
          <>
            <div className="grid flex-1 gap-4 overflow-hidden p-6 lg:grid-cols-[1.3fr,0.95fr]">
              <div className="overflow-hidden rounded-3xl border border-border bg-background/70">
                <div className="border-b border-border px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {currentPhase?.type === "start" ? "Executing" : currentStep.status}
                    </span>
                    {(!currentStep.nodeType || currentStep.nodeType === "agent") && (
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground">
                        {getStrategyLabel(currentStep.strategy)}
                      </span>
                    )}
                    <span className="text-sm text-foreground">
                      {currentStep.nodeType && currentStep.nodeType !== "agent"
                        ? getNodeTypeLabel(currentStep.nodeType)
                        : `${currentStep.memberName} · Task ${currentStep.taskIndex + 1}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {currentPhase?.label}
                    </span>
                  </div>
                </div>
                <div className="h-[min(62vh,720px)]">
                  <VisualTeamEditor
                    teamId={teamId}
                    members={data.team.members.map((member) => ({
                      id: member.id,
                      agentId: member.agentId,
                      agent: member.agentId
                        ? {
                            id: member.agentId,
                            name: member.name,
                            slug: "",
                            llmModel: member.llmModel || undefined,
                            modelProvider: member.modelProvider || undefined,
                            mode:
                              member.mode === "APPROVAL"
                                ? "TASK"
                                : member.mode,
                          }
                        : null,
                      role: member.role,
                      level: member.level,
                      responsibilities: member.responsibilities || undefined,
                      config: member.config,
                      reportsToMemberId: member.reportsToMemberId,
                      outputSchema: member.outputSchema as never,
                      enabledActions: member.enabledActions,
                      createdAt: "",
                    }))}
                    onNodeClick={(memberId) => {
                      const targetIndex = data.steps.findIndex(
                        (step) => step.memberId === memberId
                      );
                      if (targetIndex >= 0) {
                        setCurrentPhaseIndex(targetIndex * 2);
                        setIsPlaying(false);
                      }
                    }}
                    executionSteps={executionSteps}
                    savedPositions={data.team.savedPositions}
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-border bg-background/70">
                <div className="border-b border-border px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Step Detail
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    {currentStep.nodeType && currentStep.nodeType !== "agent"
                      ? getNodeTypeLabel(currentStep.nodeType)
                      : currentStep.memberName}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentStep.taskTitle}
                  </p>
                  {currentStep.nodeType && currentStep.nodeType !== "agent" && (
                    <p className={cn("mt-1 text-xs", getNodeCategoryColor(currentStep.nodeType))}>
                      {currentStep.nodeType.startsWith("trigger_") ? "Trigger" :
                       ["if_condition", "switch", "filter"].includes(currentStep.nodeType) ? "Logic" :
                       ["http_request", "send_email", "send_slack"].includes(currentStep.nodeType) ? "Action" :
                       ["delay", "set_variable"].includes(currentStep.nodeType) ? "Utility" : "Control"}
                    </p>
                  )}
                  {currentStep.fallbackEvent ? (
                    <p className="mt-2 text-xs text-amber-300">
                      {currentStep.fallbackEvent}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-4 overflow-auto p-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-card/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Timing
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        Started {formatDateTime(currentStep.startedAt)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Duration {formatDuration(currentStep.metrics.responseTimeMs)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        {currentStep.nodeType && currentStep.nodeType !== "agent" ? "Node Info" : "Tokens & Cost"}
                      </p>
                      {currentStep.nodeType && currentStep.nodeType !== "agent" ? (
                        <>
                          <p className="mt-2 text-sm text-foreground">
                            {getNodeTypeLabel(currentStep.nodeType)}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Status: {currentStep.status}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-foreground">
                            {currentStep.metrics.tokensIn} in · {currentStep.metrics.tokensOut} out
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {currentStep.metrics.model || "Unknown model"}
                            {typeof currentStep.metrics.estimatedCost === "number"
                              ? ` · $${currentStep.metrics.estimatedCost.toFixed(6)}`
                              : ""}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Workflow node-specific detail */}
                  {currentStep.nodeType === "if_condition" && currentStep.structuredOutput && (
                    <div className={cn(
                      "rounded-2xl border p-4",
                      (currentStep.structuredOutput as Record<string, unknown>)?.result
                        ? "border-green-500/25 bg-green-500/10"
                        : "border-red-500/25 bg-red-500/10"
                    )}>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Condition Result
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {String((currentStep.structuredOutput as Record<string, unknown>)?.expression || "—")}
                      </p>
                      <p className="mt-1 text-xs text-foreground">
                        → {(currentStep.structuredOutput as Record<string, unknown>)?.result ? "True path" : "False path"}
                      </p>
                    </div>
                  )}

                  {currentStep.nodeType === "send_email" && currentStep.structuredOutput && (
                    <div className="rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Email Sent
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        To: {String((currentStep.structuredOutput as Record<string, unknown>)?.to || "—")}
                      </p>
                      <p className="mt-1 text-xs text-foreground">
                        Subject: {String((currentStep.structuredOutput as Record<string, unknown>)?.subject || "—")}
                      </p>
                    </div>
                  )}

                  {currentStep.nodeType === "delay" && (
                    <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Delay
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {currentStep.structuredOutput
                          ? String((currentStep.structuredOutput as Record<string, unknown>)?.duration || currentStep.output || "Waiting…")
                          : currentStep.output || "Waiting…"}
                      </p>
                    </div>
                  )}

                  {currentStep.nodeType === "http_request" && currentStep.structuredOutput && (
                    <div className={cn(
                      "rounded-2xl border p-4",
                      currentStep.status === "COMPLETED"
                        ? "border-green-500/25 bg-green-500/10"
                        : "border-red-500/25 bg-red-500/10"
                    )}>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        HTTP Result
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {String((currentStep.structuredOutput as Record<string, unknown>)?.method || "GET")}{" "}
                        {String((currentStep.structuredOutput as Record<string, unknown>)?.url || "—")}{" "}
                        → {String((currentStep.structuredOutput as Record<string, unknown>)?.statusCode || "—")}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-border bg-card/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Routing Decision
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {currentStep.routing.decision}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Runtime: {getStrategyLabel(currentStep.strategy)}
                    </p>
                    {currentStep.routing.condition && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Condition: {currentStep.routing.condition}
                      </p>
                    )}
                    {currentStep.routing.comparison && (
                      <p className="mt-1 text-xs text-amber-300">
                        {currentStep.routing.comparison}
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card/70 p-4">
                    <div className="flex items-center gap-2">
                      <Braces className="h-4 w-4 text-violet-300" />
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Structured Data
                      </p>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-foreground">
                      {formatJson(currentStep.structuredOutput)}
                    </pre>
                  </div>

                  <div className="rounded-2xl border border-border bg-card/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Shared Memory Delta
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-foreground">
                      {formatJson(currentStep.sharedContextDelta)}
                    </pre>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-border bg-card/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Input
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-foreground">
                        {formatJson(currentStep.input)}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Full Prompt
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-foreground">
                        {currentStep.prompt.fullPrompt}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Output
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-foreground">
                        {currentStep.output || currentStep.error || "No output recorded"}
                      </pre>
                    </div>
                  </div>

                  {currentStep.approvalRequest ? (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100/80">
                        Approval Gate
                      </p>
                      <p className="mt-3 text-sm text-amber-100">
                        {currentStep.approvalRequest.status} ·{" "}
                        {currentStep.approvalRequest.approverEmail}
                      </p>
                      <p className="mt-2 text-xs text-amber-100/80">
                        Requested {formatDateTime(currentStep.approvalRequest.requestedAt)}
                      </p>
                      {currentStep.approvalRequest.respondedAt ? (
                        <p className="mt-1 text-xs text-amber-100/80">
                          Responded{" "}
                          {formatDateTime(currentStep.approvalRequest.respondedAt)} by{" "}
                          {currentStep.approvalRequest.respondedBy ||
                            currentStep.approvalRequest.approverEmail}
                        </p>
                      ) : null}
                      {currentStep.approvalRequest.note ? (
                        <p className="mt-2 text-xs text-amber-100">
                          Note: {currentStep.approvalRequest.note}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {currentStep.status === "FAILED" || currentStep.status === "REJECTED" ? (
                    <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
                      <div className="flex items-center gap-2 text-red-300">
                        <AlertCircle className="h-4 w-4" />
                        <p className="text-sm font-medium">Failure Detail</p>
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-red-100">
                        {currentStep.error || "No error message recorded"}
                      </pre>
                      {currentStep.commonFixSuggestions.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {currentStep.commonFixSuggestions.map((suggestion) => (
                            <div
                              key={suggestion}
                              className="rounded-xl border border-red-500/20 bg-muted/60 px-3 py-2 text-xs text-red-100"
                            >
                              {suggestion}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-border bg-background/95 px-6 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentPhaseIndex((index) => Math.max(0, index - 1));
                  }}
                  className="border-border text-foreground hover:bg-muted"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Step Back
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsPlaying((value) => !value)}
                  className="bg-orange-600 text-white hover:bg-orange-700"
                >
                  {isPlaying ? (
                    <Pause className="mr-2 h-4 w-4" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {isPlaying ? "Pause" : "Play"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentPhaseIndex((index) =>
                      Math.min(phases.length - 1, index + 1)
                    );
                  }}
                  className="border-border text-foreground hover:bg-muted"
                >
                  Next Step
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>

                <div className="ml-auto flex items-center gap-2">
                  {[1, 2, 5].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSpeed(option as 1 | 2 | 5)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        speed === option
                          ? "border-orange-500 bg-orange-500/15 text-orange-300"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {option}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(phases.length - 1, 0)}
                  value={currentPhaseIndex}
                  onChange={(event) => {
                    setIsPlaying(false);
                    setCurrentPhaseIndex(Number(event.target.value));
                  }}
                  className="w-full accent-orange-500"
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Phase {Math.min(currentPhaseIndex + 1, phases.length)} of {phases.length}
                  </span>
                  <span>{currentPhase?.label}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
                  {phases.map((phase, index) => (
                    <button
                      key={phase.id}
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentPhaseIndex(index);
                      }}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-[11px] transition-colors",
                        index === currentPhaseIndex
                          ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                          : "border-border bg-card/80 text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {phase.type === "start" ? (
                          <Play className="h-3 w-3" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        <span className="font-medium">
                          {data.steps[phase.stepIndex]?.nodeType && data.steps[phase.stepIndex]?.nodeType !== "agent"
                            ? getNodeTypeLabel(data.steps[phase.stepIndex]!.nodeType!)
                            : data.steps[phase.stepIndex]?.memberName}
                        </span>
                      </div>
                      <p className="mt-1 truncate">
                        {phase.type === "start" ? "Start" : data.steps[phase.stepIndex]?.status}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
