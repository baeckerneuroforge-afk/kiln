"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  Bug,
  CheckCircle2,
  Clock,
  Database,
  Filter,
  GitBranch,
  Globe,
  Hash,
  Loader2,
  Mail,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Timer,
  Variable,
  FileText,
  Shuffle,
  XCircle,
  Zap,
  Table,
  TableProperties,
  CalendarPlus,
  CalendarSearch,
  Sparkles,
  Tags,
  FileSearch,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExecutionDebugConsole } from "@/components/teams/execution-debug-console";
import { ExecutionReplay } from "@/components/teams/execution-replay";
import { ComputerUseReplay } from "@/components/workflows/computer-use-replay";
import { cn } from "@/lib/utils";

interface ApprovalInfo {
  id: string;
  token: string;
  taskIndex: number;
  status: string;
  approverEmail: string;
  requestedAt: string;
  respondedAt: string | null;
  respondedBy: string | null;
  note: string | null;
  gateMember: { id: string; role: string; name: string } | null;
}

interface ExecutionSummary {
  id: string;
  status: string;
  goal: string | null;
  trigger?: "manual" | "scheduled" | null;
  startedAt: string;
  completedAt: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  durationMs: number | null;
  sharedContextFields?: number;
  priority?: number;
  latestApproval?: Omit<ApprovalInfo, "token" | "taskIndex" | "note" | "gateMember"> | null;
}

interface ExecutionAttempt {
  id: string;
  attempt: number;
  status: string;
  strategy: "primary" | "fallback_agent" | "fallback_model";
  fallbackEvent?: string | null;
  input: unknown;
  output: string | null;
  structuredOutput?: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  agent: { id: string; name: string } | null;
}

interface ExecutionTimelineItem {
  taskIndex: number;
  taskId: string | null;
  taskTitle: string;
  priority: string;
  assignedToId: string | null;
  assignedAgentName: string | null;
  latestStatus: string;
  latestOutput: string | null;
  latestError: string | null;
  parallelGroup: string | null;
  nodeId?: string | null;
  nodeType?: string | null;
  attempts: ExecutionAttempt[];
}

interface SharedContextTimelineItem {
  key: string;
  value: unknown;
  taskIndex: number;
  taskTitle: string;
  addedAt: string | null;
  addedBy: string;
}

interface ExecutionDetail {
  execution: ExecutionSummary & {
    teamId: string;
    executionContext: Record<string, unknown>;
  };
  timeline: ExecutionTimelineItem[];
  sharedContextTimeline: SharedContextTimelineItem[];
  approvalRequests: ApprovalInfo[];
}

interface TeamExecutionsTabProps {
  teamId: string;
  focusExecutionId?: string | null;
  onRefreshTeam?: () => Promise<void> | void;
  onExecutionContextChange?: (context: Record<string, unknown>) => void;
  onOpenLogs?: (executionId: string) => void;
  onOpenProfiler?: (executionId: string) => void;
  onOpenDiff?: () => void;
}

const statusStyles: Record<string, string> = {
  RUNNING: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  AWAITING_APPROVAL: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  COMPLETED: "border-green-500/30 bg-green-500/10 text-green-300",
  PARTIAL: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-300",
  REJECTED: "border-red-500/30 bg-red-500/10 text-red-200",
  PENDING: "border-zinc-700 bg-zinc-800/80 text-zinc-300",
  SKIPPED: "border-zinc-700 bg-zinc-800/80 text-zinc-400",
  QUEUED: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
};

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs < 1000) return durationMs === 0 ? "0s" : "Running";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatDateTime(value: string | null) {
  if (!value) return "In progress";
  return new Date(value).toLocaleString();
}

function previewValue(value: unknown) {
  if (value == null) return "No input";
  const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return serialized.length > 500 ? `${serialized.slice(0, 500)}…` : serialized;
}

function formatContextValue(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function getStrategyLabel(strategy: ExecutionAttempt["strategy"]) {
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

function getNodeTypeIcon(nodeType: string | null | undefined) {
  switch (nodeType) {
    case "trigger_webhook": return <Globe className="h-3.5 w-3.5 text-amber-400" />;
    case "trigger_schedule": return <Clock className="h-3.5 w-3.5 text-amber-400" />;
    case "trigger_lead": return <Zap className="h-3.5 w-3.5 text-amber-400" />;
    case "trigger_chat": return <Zap className="h-3.5 w-3.5 text-amber-400" />;
    case "trigger_manual": return <Play className="h-3.5 w-3.5 text-amber-400" />;
    case "if_condition": return <GitBranch className="h-3.5 w-3.5 text-purple-400" />;
    case "switch": return <GitBranch className="h-3.5 w-3.5 text-purple-400" />;
    case "filter": return <Filter className="h-3.5 w-3.5 text-purple-400" />;
    case "transform": return <Shuffle className="h-3.5 w-3.5 text-purple-400" />;
    case "http_request": return <Globe className="h-3.5 w-3.5 text-blue-400" />;
    case "send_email": return <Mail className="h-3.5 w-3.5 text-blue-400" />;
    case "send_slack": return <Hash className="h-3.5 w-3.5 text-blue-400" />;
    case "delay": return <Timer className="h-3.5 w-3.5 text-blue-400" />;
    case "set_variable": return <Variable className="h-3.5 w-3.5 text-blue-400" />;
    case "approval_gate": return <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />;
    case "wait_webhook": return <Pause className="h-3.5 w-3.5 text-cyan-400" />;
    case "wait_form": return <FileText className="h-3.5 w-3.5 text-cyan-400" />;
    case "agent": return <Bot className="h-3.5 w-3.5 text-orange-400" />;
    case "google_sheets_read": return <Table className="h-3.5 w-3.5 text-green-400" />;
    case "google_sheets_write": return <TableProperties className="h-3.5 w-3.5 text-green-400" />;
    case "gmail_send": return <Mail className="h-3.5 w-3.5 text-green-400" />;
    case "slack_send_integration": return <Hash className="h-3.5 w-3.5 text-green-400" />;
    case "calendar_create": return <CalendarPlus className="h-3.5 w-3.5 text-green-400" />;
    case "calendar_check": return <CalendarSearch className="h-3.5 w-3.5 text-green-400" />;
    case "notion_create": return <FileText className="h-3.5 w-3.5 text-green-400" />;
    case "airtable_create": return <Database className="h-3.5 w-3.5 text-green-400" />;
    case "ai_summarize": return <Sparkles className="h-3.5 w-3.5 text-pink-400" />;
    case "ai_classify": return <Tags className="h-3.5 w-3.5 text-pink-400" />;
    case "ai_extract": return <FileSearch className="h-3.5 w-3.5 text-pink-400" />;
    case "computer_use": return <Monitor className="h-3.5 w-3.5 text-pink-400" />;
    default: return null;
  }
}

function getNodeTypeLabel(nodeType: string | null | undefined): string {
  const labels: Record<string, string> = {
    trigger_webhook: "Webhook Trigger",
    trigger_schedule: "Schedule Trigger",
    trigger_lead: "Lead Trigger",
    trigger_chat: "Chat Trigger",
    trigger_manual: "Manual Trigger",
    if_condition: "IF Condition",
    switch: "Switch",
    filter: "Filter",
    transform: "Transform",
    http_request: "HTTP Request",
    send_email: "Send Email",
    send_slack: "Slack Message",
    delay: "Delay",
    set_variable: "Set Variable",
    approval_gate: "Approval Gate",
    wait_webhook: "Wait Webhook",
    wait_form: "Wait for Form",
    sub_workflow: "Sub-Workflow",
    merge: "Merge",
    agent: "AI Agent",
    google_sheets_read: "Sheets lesen",
    google_sheets_write: "Sheets schreiben",
    gmail_send: "Gmail senden",
    slack_send_integration: "Slack Nachricht",
    calendar_create: "Termin erstellen",
    calendar_check: "Verfügbarkeit",
    notion_create: "Notion Eintrag",
    airtable_create: "Airtable Eintrag",
    ai_summarize: "AI Zusammenfassung",
    ai_classify: "AI Klassifizierung",
    ai_extract: "AI Extraktion",
    computer_use: "Computer Use",
  };
  return nodeType ? labels[nodeType] || nodeType : "Task";
}

function getNodeTypeCategoryStyle(nodeType: string | null | undefined): string {
  if (!nodeType) return "border-border bg-zinc-950/30";
  if (nodeType.startsWith("trigger_")) return "border-amber-500/20 bg-amber-500/5";
  if (["if_condition", "switch", "filter", "transform"].includes(nodeType)) return "border-purple-500/20 bg-purple-500/5";
  if (["http_request", "send_email", "send_slack", "delay", "set_variable"].includes(nodeType)) return "border-blue-500/20 bg-blue-500/5";
  if (["approval_gate", "wait_webhook", "wait_form", "sub_workflow", "merge"].includes(nodeType)) return "border-cyan-500/20 bg-cyan-500/5";
  if (nodeType === "agent") return "border-orange-500/20 bg-orange-500/5";
  if (["google_sheets_read", "google_sheets_write", "gmail_send", "slack_send_integration", "calendar_create", "calendar_check", "notion_create", "airtable_create"].includes(nodeType)) return "border-green-500/20 bg-green-500/5";
  if (["ai_summarize", "ai_classify", "ai_extract", "computer_use"].includes(nodeType)) return "border-pink-500/20 bg-pink-500/5";
  return "border-border bg-zinc-950/30";
}

function formatNodeOutput(task: ExecutionTimelineItem): string {
  const { nodeType, latestOutput, latestError } = task;
  if (latestError) return latestError;
  if (!latestOutput) return "No output";

  try {
    const parsed = JSON.parse(latestOutput);
    if (nodeType === "if_condition" || nodeType === "switch" || nodeType === "filter") {
      const handle = parsed.outputHandle || parsed.result;
      const meta = parsed.meta || parsed;
      const field = meta.field || "";
      const operator = meta.operator || "";
      const value = meta.value ?? "";
      const resolved = meta.fieldResolved ?? "";
      if (handle && field) {
        return `${field} (=${JSON.stringify(resolved)}) ${operator} ${JSON.stringify(value)} → ${handle} path`;
      }
      return handle ? `→ ${handle} path` : latestOutput;
    }
    if (nodeType === "transform") {
      const meta = parsed.meta || parsed;
      const fields = meta.transformedFields || [];
      if (fields.length > 0) return `Transformed: ${fields.join(", ")}`;
      return "Transform applied";
    }
    if (nodeType === "http_request") {
      const status = parsed.status || parsed.body?.status;
      const url = parsed.url || (parsed.meta?.url);
      const method = parsed.method || (parsed.meta?.method);
      if (status || url) return `${method || "HTTP"} ${status || ""} ${url ? `from ${url}` : ""}`.trim();
    }
    if (nodeType === "send_email") {
      const to = parsed.emailSent?.to || parsed.to || parsed.meta?.to;
      const subject = parsed.emailSent?.subject || parsed.subject || parsed.meta?.subject;
      if (to) return `Email sent to ${to}${subject ? ` — "${subject}"` : ""}`;
    }
    if (nodeType === "delay") {
      const duration = parsed._lastDelay?.duration || parsed.duration || parsed.meta?.duration;
      const unit = parsed._lastDelay?.unit || parsed.unit || parsed.meta?.unit || "seconds";
      if (duration) return `Waited ${duration} ${unit}`;
    }
    if (nodeType === "set_variable") {
      const key = parsed.meta?.key || Object.keys(parsed)[0];
      const val = parsed.meta?.value ?? (key ? parsed[key] : undefined);
      if (key) return `${key} = ${JSON.stringify(val)}`;
    }
    if (nodeType?.startsWith("trigger_")) {
      const triggerType = parsed.trigger?.type || nodeType.replace("trigger_", "");
      const receivedAt = parsed.trigger?.receivedAt || parsed.trigger?.firedAt || parsed.trigger?.triggeredAt;
      return `${triggerType} received${receivedAt ? ` at ${new Date(receivedAt).toLocaleTimeString()}` : ""}`;
    }
    if (nodeType === "wait_webhook") {
      if (parsed.pauseReason) return parsed.pauseReason;
      if (parsed.payload) return `Webhook received: ${JSON.stringify(parsed.payload).slice(0, 100)}`;
      return "Waiting for webhook callback...";
    }
    if (nodeType === "wait_form") {
      if (parsed.pauseReason) return parsed.pauseReason;
      if (parsed.data) return `Form submitted: ${Object.keys(parsed.data).length} fields`;
      return "Waiting for form submission...";
    }
    if (nodeType === "approval_gate") {
      return parsed.pauseReason || `Awaiting approval`;
    }
    // Integration nodes
    if (nodeType === "google_sheets_read") {
      const rowCount = parsed.sheetsData?.rowCount ?? parsed.rowCount;
      return rowCount != null ? `${rowCount} Zeilen gelesen` : "Sheets gelesen";
    }
    if (nodeType === "google_sheets_write") {
      const count = parsed.sheetsWriteResult?.valuesWritten ?? parsed.valuesWritten;
      return count != null ? `${count} Werte geschrieben` : "Zeile geschrieben";
    }
    if (nodeType === "gmail_send") {
      const to = parsed.gmailSent?.to || parsed.to;
      return to ? `Gmail gesendet an ${to}` : "Gmail gesendet";
    }
    if (nodeType === "slack_send_integration") {
      const channel = parsed.slackSent?.channel || parsed.channel;
      return channel ? `Slack: ${channel}` : "Slack gesendet";
    }
    if (nodeType === "calendar_create") {
      const title = parsed.calendarEvent?.title || parsed.title;
      return title ? `Termin: ${title}` : "Termin erstellt";
    }
    if (nodeType === "calendar_check") {
      const count = parsed.availableSlots?.slotCount ?? parsed.slotCount;
      return count != null ? `${count} freie Slots gefunden` : "Verfügbarkeit geprüft";
    }
    if (nodeType === "notion_create") {
      return parsed.notionEntry?.url ? `Notion Seite erstellt` : "Notion Eintrag erstellt";
    }
    if (nodeType === "airtable_create") {
      return parsed.airtableRecord?.id ? `Airtable Record erstellt` : "Airtable Eintrag erstellt";
    }
    // AI Tool nodes
    if (nodeType === "ai_summarize") {
      const summary = parsed.summary || parsed[Object.keys(parsed).find(k => typeof parsed[k] === "string") || ""];
      return typeof summary === "string" ? (summary.length > 150 ? summary.slice(0, 150) + "…" : summary) : "Zusammenfassung erstellt";
    }
    if (nodeType === "ai_classify") {
      const cls = parsed.classification || parsed;
      return cls?.category ? `→ ${cls.category} (${Math.round((cls.confidence || 0) * 100)}%)` : "Klassifiziert";
    }
    if (nodeType === "ai_extract") {
      const extracted = parsed.extracted || parsed;
      const keys = Object.keys(extracted).filter(k => extracted[k] !== null);
      return keys.length > 0 ? `Extrahiert: ${keys.join(", ")}` : "Extraktion durchgeführt";
    }
    if (nodeType === "computer_use") {
      const result = parsed.computerUseResult || parsed;
      const urls = result.urlsVisited || result.urls || [];
      const summary = result.summary || "";
      const stepsCount = result.steps?.length || 0;
      const prefix = stepsCount > 0 ? `${stepsCount} Schritte, ${urls.length} Seite${urls.length !== 1 ? "n" : ""} — ` : "";
      return summary
        ? prefix + (summary.length > 120 ? summary.slice(0, 120) + "…" : summary)
        : `${prefix}${urls.length} Seite${urls.length !== 1 ? "n" : ""} besucht`;
    }
  } catch {
    // Not JSON — use raw output
  }

  return latestOutput.length > 300 ? `${latestOutput.slice(0, 300)}…` : latestOutput;
}

const PRIORITY_BADGE: Record<number, { label: string; style: string }> = {
  0: { label: "Critical", style: "border-red-500/40 bg-red-500/15 text-red-300" },
  1: { label: "High", style: "border-orange-500/40 bg-orange-500/15 text-orange-300" },
  2: { label: "Normal", style: "border-zinc-600 bg-zinc-800/80 text-zinc-400" },
  3: { label: "Low", style: "border-blue-500/40 bg-blue-500/15 text-blue-300" },
};

export function TeamExecutionsTab({
  teamId,
  focusExecutionId,
  onRefreshTeam,
  onExecutionContextChange,
  onOpenLogs,
  onOpenProfiler,
  onOpenDiff,
}: TeamExecutionsTabProps) {
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(focusExecutionId || null);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rerunningExecutionId, setRerunningExecutionId] = useState<string | null>(null);
  const [retryingTaskKey, setRetryingTaskKey] = useState<string | null>(null);
  const [approvalActionKey, setApprovalActionKey] = useState<string | null>(null);
  const [resumingExecutionId, setResumingExecutionId] = useState<string | null>(null);
  const [cancellingExecutionId, setCancellingExecutionId] = useState<string | null>(null);
  const [replayExecutionId, setReplayExecutionId] = useState<string | null>(null);
  const [debugExecutionId, setDebugExecutionId] = useState<string | null>(null);
  const [computerUseSession, setComputerUseSession] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orchestrationCount, setOrchestrationCount] = useState<number | null>(null);

  const pendingApproval = detail?.approvalRequests.find((request) => request.status === "PENDING") || null;
  const resolvedApproval = useMemo(
    () =>
      detail?.approvalRequests.find(
        (request) => request.status === "APPROVED" || request.status === "REJECTED" || request.status === "SKIPPED"
      ) || null,
    [detail?.approvalRequests]
  );

  useEffect(() => {
    if (!focusExecutionId) return;
    setSelectedExecutionId(focusExecutionId);
  }, [focusExecutionId]);

  useEffect(() => {
    onExecutionContextChange?.(detail?.execution.executionContext || {});
  }, [detail?.execution.executionContext, onExecutionContextChange]);

  useEffect(() => {
    let cancelled = false;

    async function fetchExecutions() {
      if (!cancelled) setLoadingList(true);

      try {
        const response = await fetch(`/api/teams/${teamId}/executions`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to load executions");
        }

        if (cancelled) return;
        const nextExecutions = Array.isArray(data.executions) ? data.executions : [];
        setExecutions(nextExecutions);
        setError(null);

        if (!selectedExecutionId && nextExecutions[0]?.id) {
          setSelectedExecutionId(nextExecutions[0].id);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load executions");
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }

    fetchExecutions();

    // Fetch orchestration log count for this team
    fetch(`/api/teams/${teamId}/orchestration-count`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && !cancelled) setOrchestrationCount(d.count ?? null); })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedExecutionId, teamId]);

  useEffect(() => {
    if (!selectedExecutionId) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    async function fetchDetail() {
      if (!cancelled) setLoadingDetail(true);

      try {
        const response = await fetch(`/api/teams/${teamId}/executions/${selectedExecutionId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to load execution detail");
        }
        if (!cancelled) {
          setDetail(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load execution detail");
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    }

    fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedExecutionId, teamId]);

  useEffect(() => {
    const hasLiveExecution =
      executions.some(
        (execution) =>
          execution.status === "RUNNING" || execution.status === "AWAITING_APPROVAL"
      ) ||
      detail?.execution.status === "RUNNING" ||
      detail?.execution.status === "AWAITING_APPROVAL";

    if (!hasLiveExecution) {
      return;
    }

    const interval = setInterval(async () => {
      const [listResponse, detailResponse] = await Promise.all([
        fetch(`/api/teams/${teamId}/executions`),
        selectedExecutionId
          ? fetch(`/api/teams/${teamId}/executions/${selectedExecutionId}`)
          : Promise.resolve(null),
      ]);

      if (listResponse.ok) {
        const listData = await listResponse.json();
        if (Array.isArray(listData.executions)) {
          setExecutions(listData.executions);
        }
      }

      if (detailResponse && detailResponse.ok) {
        const detailData = await detailResponse.json();
        setDetail(detailData);
      }

      await onRefreshTeam?.();
    }, 3000);

    return () => clearInterval(interval);
  }, [detail?.execution.status, executions, onRefreshTeam, selectedExecutionId, teamId]);

  async function triggerRerun(executionId: string, taskIndex?: number) {
    const retryKey = taskIndex === undefined ? executionId : `${executionId}:${taskIndex}`;
    if (taskIndex === undefined) {
      setRerunningExecutionId(executionId);
    } else {
      setRetryingTaskKey(retryKey);
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/executions/${executionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskIndex === undefined ? {} : { taskIndex }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to re-run execution");
      }

      const nextExecutionId = data.executionId as string;
      setSelectedExecutionId(nextExecutionId);
      await onRefreshTeam?.();
    } catch (rerunError) {
      setError(rerunError instanceof Error ? rerunError.message : "Failed to re-run execution");
    } finally {
      setRerunningExecutionId(null);
      setRetryingTaskKey(null);
    }
  }

  async function handleApprovalDecision(decision: "approve" | "reject") {
    if (!detail || !pendingApproval) return;

    const actionKey = `${decision}:${detail.execution.id}`;
    setApprovalActionKey(actionKey);

    try {
      const note =
        decision === "reject"
          ? window.prompt("Optional rejection note", "") || ""
          : "";
      const endpoint =
        decision === "approve"
          ? `/api/teams/${teamId}/executions/${detail.execution.id}/approve`
          : `/api/teams/${teamId}/executions/${detail.execution.id}/reject`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: pendingApproval.token,
          note,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to resolve approval request");
      }

      await onRefreshTeam?.();

      const [listResponse, detailResponse] = await Promise.all([
        fetch(`/api/teams/${teamId}/executions`),
        fetch(`/api/teams/${teamId}/executions/${detail.execution.id}`),
      ]);

      if (listResponse.ok) {
        const listData = await listResponse.json();
        if (Array.isArray(listData.executions)) {
          setExecutions(listData.executions);
        }
      }

      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        setDetail(detailData);
      }
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Failed to resolve approval request"
      );
    } finally {
      setApprovalActionKey(null);
    }
  }

  async function handleManualResume(executionId: string) {
    setResumingExecutionId(executionId);
    try {
      // Find the waiting node from timeline
      const waitingNode = detail?.timeline.find(
        (t) => (t.nodeType === "wait_webhook" || t.nodeType === "wait_form") && t.latestStatus === "PENDING"
      );
      const nodeId = waitingNode?.nodeId || "unknown";

      const res = await fetch(`/api/workflows/callback/${executionId}/${nodeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _manualResume: true, resumedAt: new Date().toISOString() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to resume workflow");
      }

      // Refresh
      setSelectedExecutionId(executionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setResumingExecutionId(null);
    }
  }

  async function handleCancelExecution(executionId: string) {
    if (!confirm("Cancel this execution? It will be marked as failed.")) return;
    setCancellingExecutionId(executionId);
    try {
      const res = await fetch(`/api/teams/${teamId}/executions/${executionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FAILED" }),
      });

      if (!res.ok) {
        throw new Error("Failed to cancel execution");
      }

      // Refresh
      setSelectedExecutionId(executionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancellingExecutionId(null);
    }
  }

  return (
    <div className="p-6 h-full overflow-auto">
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px,1fr]">
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Execution History</p>
              {onOpenDiff && (
                <button
                  onClick={onOpenDiff}
                  className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  Compare
                </button>
              )}
            </div>
            <p className="mt-2 text-2xl font-semibold text-zinc-100">{executions.length}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Operational runs with retries, approval gates, and shared memory.
            </p>
            {orchestrationCount !== null && orchestrationCount > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-400">{orchestrationCount.toLocaleString()}</span> orchestration decisions logged
              </p>
            )}
          </div>

          {loadingList ? (
            <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            </div>
          ) : executions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-card/40 p-6 text-center">
              <Clock className="mx-auto h-8 w-8 text-zinc-500" />
              <p className="mt-3 text-sm font-medium text-zinc-300">No executions yet</p>
              <p className="mt-1 text-xs text-zinc-500">Run the team once to start building execution history.</p>
            </div>
          ) : (
            executions.map((execution) => (
              <div
                key={execution.id}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 transition-colors",
                  selectedExecutionId === execution.id
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-border bg-card hover:border-zinc-600"
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedExecutionId(execution.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {execution.goal?.slice(0, 56) || "Workflow execution"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{formatDateTime(execution.startedAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {execution.trigger === "scheduled" ? (
                        <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-300">
                          Scheduled
                        </span>
                      ) : null}
                      {typeof execution.priority === "number" && execution.priority !== 2 && (
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", PRIORITY_BADGE[execution.priority]?.style || PRIORITY_BADGE[2].style)}>
                          {PRIORITY_BADGE[execution.priority]?.label || "Normal"}
                        </span>
                      )}
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", statusStyles[execution.status] || statusStyles.PENDING)}>
                        {execution.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-400">
                    <span>{execution.trigger === "scheduled" ? "Cron run" : "Manual run"}</span>
                    <span>{execution.completedTasks}/{execution.totalTasks} done</span>
                    <span>{execution.failedTasks} failed</span>
                    <span>{formatDuration(execution.durationMs)}</span>
                    {typeof execution.sharedContextFields === "number" && execution.sharedContextFields > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Database className="h-3 w-3" />
                        {execution.sharedContextFields} fields
                      </span>
                    )}
                  </div>

                  {execution.latestApproval && (
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Approval: {execution.latestApproval.status.toLowerCase()} · {execution.latestApproval.approverEmail}
                    </p>
                  )}
                </button>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReplayExecutionId(execution.id)}
                    className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Replay
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDebugExecutionId(execution.id)}
                    className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  >
                    <Bug className="mr-2 h-4 w-4" />
                    Debug
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl border border-border bg-card">
          {!selectedExecutionId ? (
            <div className="flex h-[420px] items-center justify-center text-zinc-500">
              Select an execution to inspect the timeline.
            </div>
          ) : loadingDetail ? (
            <div className="flex h-[420px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : !detail ? (
            <div className="flex h-[420px] items-center justify-center text-zinc-500">
              Execution detail unavailable.
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", statusStyles[detail.execution.status] || statusStyles.PENDING)}>
                      {detail.execution.status}
                    </span>
                    {detail.execution.trigger === "scheduled" ? (
                      <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-300">
                        Scheduled
                      </span>
                    ) : null}
                    <p className="text-sm font-medium text-zinc-100">
                      Execution {detail.execution.id.slice(0, 8)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    {detail.execution.goal || "No goal captured for this execution."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>{detail.execution.trigger === "scheduled" ? "Triggered by cron schedule" : "Triggered manually"}</span>
                    <span>Started {formatDateTime(detail.execution.startedAt)}</span>
                    <span>Duration {formatDuration(detail.execution.durationMs)}</span>
                    <span>{detail.execution.completedTasks}/{detail.execution.totalTasks} completed</span>
                    <span>{detail.execution.failedTasks} failed</span>
                  </div>
                  {resolvedApproval && resolvedApproval.respondedAt && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {resolvedApproval.status === "APPROVED" ? "Approved" : resolvedApproval.status === "SKIPPED" ? "Skipped" : "Rejected"} by {resolvedApproval.respondedBy || resolvedApproval.approverEmail} at {formatDateTime(resolvedApproval.respondedAt)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReplayExecutionId(detail.execution.id)}
                    className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Replay
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDebugExecutionId(detail.execution.id)}
                    className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  >
                    <Bug className="mr-2 h-4 w-4" />
                    Debug
                  </Button>
                  {onOpenLogs && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenLogs(detail.execution.id)}
                      className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                    >
                      <Database className="mr-2 h-4 w-4" />
                      Logs
                    </Button>
                  )}
                  {onOpenProfiler && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenProfiler(detail.execution.id)}
                      className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                    >
                      <Timer className="mr-2 h-4 w-4" />
                      Profile
                    </Button>
                  )}
                  {pendingApproval && detail.execution.status === "AWAITING_APPROVAL" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprovalDecision("approve")}
                        disabled={approvalActionKey === `approve:${detail.execution.id}`}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {approvalActionKey === `approve:${detail.execution.id}` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApprovalDecision("reject")}
                        disabled={approvalActionKey === `reject:${detail.execution.id}`}
                        className="border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                      >
                        {approvalActionKey === `reject:${detail.execution.id}` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="mr-2 h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </>
                  )}
                  {detail.execution.status === "AWAITING_APPROVAL" && !pendingApproval && (
                    <>
                      {/* Wait state indicator — for webhook/form waits without approval */}
                      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
                        <Pause className="h-3.5 w-3.5 text-amber-300 animate-pulse" />
                        <span className="text-xs text-amber-300">Waiting for external input...</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleManualResume(detail.execution.id)}
                        disabled={resumingExecutionId === detail.execution.id}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white"
                      >
                        {resumingExecutionId === detail.execution.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        Resume Manually
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelExecution(detail.execution.id)}
                        disabled={cancellingExecutionId === detail.execution.id}
                        className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                      >
                        {cancellingExecutionId === detail.execution.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="mr-2 h-4 w-4" />
                        )}
                        Cancel
                      </Button>
                    </>
                  )}

                  {detail.execution.failedTasks > 0 && detail.execution.status !== "RUNNING" && detail.execution.status !== "AWAITING_APPROVAL" && (
                    <Button
                      size="sm"
                      onClick={() => triggerRerun(detail.execution.id)}
                      disabled={rerunningExecutionId === detail.execution.id}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {rerunningExecutionId === detail.execution.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Re-run Failed Tasks
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4 overflow-auto p-5">
                <div className="rounded-xl border border-border bg-zinc-950/40 p-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-amber-300" />
                    <p className="text-sm font-semibold text-zinc-100">Workflow Knowledge</p>
                  </div>
                  {Object.keys(detail.execution.executionContext || {}).length === 0 ? (
                    <p className="mt-3 text-sm text-zinc-500">No shared context fields have been captured yet.</p>
                  ) : (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Current Context</p>
                        <div className="mt-3 space-y-2">
                          {Object.entries(detail.execution.executionContext).map(([key, value]) => (
                            <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{key}</p>
                              <p className="mt-1 text-xs text-zinc-200 break-words">{formatContextValue(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Field Timeline</p>
                        <div className="mt-3 space-y-2">
                          {detail.sharedContextTimeline.length === 0 ? (
                            <p className="text-xs text-zinc-500">No field-level additions recorded yet.</p>
                          ) : (
                            detail.sharedContextTimeline.map((item, index) => (
                              <div
                                key={`${item.key}-${index}`}
                                className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2"
                              >
                                <p className="text-xs text-zinc-200">
                                  <span className="font-medium">{item.key}</span>: {formatContextValue(item.value)}
                                </p>
                                <p className="mt-1 text-[11px] text-zinc-500">
                                  Added by {item.addedBy} on task {item.taskIndex + 1} · {item.taskTitle}
                                  {item.addedAt ? ` · ${formatDateTime(item.addedAt)}` : ""}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {detail.timeline.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-zinc-500">
                    No task logs recorded for this execution.
                  </div>
                ) : (
                  (() => {
                    // Group parallel tasks for side-by-side rendering
                    const rendered = new Set<number>();
                    return detail.timeline.map((task, tIdx) => {
                      if (rendered.has(tIdx)) return null;

                      // Find parallel siblings
                      const parallelSiblings = task.parallelGroup
                        ? detail.timeline
                            .map((t, i) => ({ t, i }))
                            .filter(({ t, i }) => t.parallelGroup === task.parallelGroup && i >= tIdx)
                        : [{ t: task, i: tIdx }];

                      parallelSiblings.forEach(({ i }) => rendered.add(i));

                      if (parallelSiblings.length > 1) {
                        return (
                          <div key={`pg-${task.parallelGroup}`} className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <div className="h-px flex-1 bg-indigo-500/20" />
                              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">⚡ Parallel Branch</span>
                              <div className="h-px flex-1 bg-indigo-500/20" />
                            </div>
                            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(parallelSiblings.length, 3)}, 1fr)` }}>
                              {parallelSiblings.map(({ t: pTask }) => {
                                const pAttempt = pTask.attempts[pTask.attempts.length - 1];
                                const pFailed = pTask.latestStatus === "FAILED" || pTask.latestStatus === "REJECTED";
                                return (
                                  <div
                                    key={`${detail.execution.id}-${pTask.taskIndex}`}
                                    className={cn(
                                      "rounded-xl border p-3",
                                      pFailed ? "border-red-500/30 bg-red-500/5" : pTask.latestStatus === "COMPLETED" ? "border-green-500/20 bg-green-500/5" : "border-indigo-500/20 bg-indigo-500/5"
                                    )}
                                  >
                                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                      <span className="text-[9px] uppercase tracking-wider text-zinc-500">Task {pTask.taskIndex + 1}</span>
                                      <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase", statusStyles[pTask.latestStatus] || statusStyles.PENDING)}>{pTask.latestStatus}</span>
                                    </div>
                                    <p className="text-xs font-medium text-zinc-100 mb-1">{pTask.taskTitle}</p>
                                    <p className="text-[10px] text-zinc-500 mb-2">{pTask.assignedAgentName || "Unassigned"}</p>
                                    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
                                      <pre className={cn("whitespace-pre-wrap break-words text-[10px]", pFailed ? "text-red-300" : "text-zinc-300")}>
                                        {pFailed ? (pTask.latestError || "Error") : (pTask.latestOutput?.slice(0, 300) || "No output")}
                                        {!pFailed && pTask.latestOutput && pTask.latestOutput.length > 300 ? "…" : ""}
                                      </pre>
                                    </div>
                                    {pAttempt && (
                                      <div className="mt-1 space-y-1">
                                        <p className="text-[9px] text-zinc-500">
                                          {formatDuration(pAttempt.startedAt && pAttempt.completedAt ? new Date(pAttempt.completedAt).getTime() - new Date(pAttempt.startedAt).getTime() : null)}
                                        </p>
                                        {pAttempt.fallbackEvent ? (
                                          <p className="text-[9px] text-amber-300">{pAttempt.fallbackEvent}</p>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      return task;
                    }).map((taskOrElement, idx) => {
                      if (!taskOrElement || typeof taskOrElement !== "object" || !("taskIndex" in taskOrElement)) return taskOrElement;
                      const task = taskOrElement as ExecutionTimelineItem;
                      // Original sequential task rendering
                      void idx;
                    const latestAttempt = task.attempts[task.attempts.length - 1];
                    const isFailed = task.latestStatus === "FAILED" || task.latestStatus === "REJECTED";
                    const isAwaitingApproval = task.latestStatus === "AWAITING_APPROVAL";
                    const loopMatch = task.taskTitle.match(/^(.+?) — Revision (\d+)\/(\d+)$/);
                    const loopIteration = loopMatch ? parseInt(loopMatch[2]) : null;
                    const loopMax = loopMatch ? parseInt(loopMatch[3]) : null;
                    const displayTitle = loopMatch ? loopMatch[1] : task.taskTitle;
                    const isWorkflowNode = Boolean(task.nodeType && task.nodeType !== "agent");

                    return (
                      <div
                        key={`${detail.execution.id}-${task.nodeId || task.taskIndex}`}
                        className={cn(
                          "rounded-xl border p-4",
                          loopMatch
                            ? "border-cyan-500/20 bg-cyan-500/5"
                            : isFailed
                              ? "border-red-500/30 bg-red-500/5"
                              : isAwaitingApproval
                                ? "border-amber-500/30 bg-amber-500/5"
                                : task.latestStatus === "COMPLETED"
                                  ? isWorkflowNode
                                    ? getNodeTypeCategoryStyle(task.nodeType)
                                    : "border-green-500/20 bg-green-500/5"
                                  : "border-border bg-zinc-950/30"
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {isWorkflowNode ? (
                                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                                  {getNodeTypeIcon(task.nodeType)}
                                  {getNodeTypeLabel(task.nodeType)}
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                                  Task {task.taskIndex + 1}
                                </span>
                              )}
                              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", statusStyles[task.latestStatus] || statusStyles.PENDING)}>
                                {task.latestStatus}
                              </span>
                              {!isWorkflowNode && (
                                <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] uppercase text-zinc-300">
                                  {task.priority}
                                </span>
                              )}
                              {loopIteration !== null && loopMax !== null && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400">
                                  ↻ Loop {loopIteration}/{loopMax}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm font-medium text-zinc-100">{displayTitle}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {isWorkflowNode
                                ? getNodeTypeLabel(task.nodeType)
                                : task.assignedAgentName ? `Assigned to ${task.assignedAgentName}` : "Unassigned"}
                            </p>
                          </div>

                          {isFailed && detail.execution.status !== "RUNNING" && detail.execution.status !== "AWAITING_APPROVAL" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => triggerRerun(detail.execution.id, task.taskIndex)}
                              disabled={retryingTaskKey === `${detail.execution.id}:${task.taskIndex}`}
                              className="border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            >
                              {retryingTaskKey === `${detail.execution.id}:${task.taskIndex}` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="mr-2 h-4 w-4" />
                              )}
                              Retry Task
                            </Button>
                          )}
                        </div>

                        {isWorkflowNode ? (
                          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                              {isFailed ? "Error" : "Result"}
                            </p>
                            <pre className={cn("mt-2 whitespace-pre-wrap break-words text-xs", isFailed ? "text-red-300" : "text-zinc-300")}>
                              {isFailed ? (task.latestError || "No error") : formatNodeOutput(task)}
                            </pre>
                            {task.nodeType === "computer_use" && !isFailed && task.latestOutput && (() => {
                              try {
                                const parsed = JSON.parse(task.latestOutput!);
                                const sessionData = parsed.computerUseResult || parsed;
                                if (sessionData?.steps?.length > 0) {
                                  return (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setComputerUseSession(sessionData)}
                                      className="mt-2 border-pink-500/30 text-pink-400 hover:bg-pink-500/10 hover:text-pink-300 text-xs h-7"
                                    >
                                      <Monitor className="mr-1.5 h-3 w-3" />
                                      View Session ({sessionData.steps.length} steps)
                                    </Button>
                                  );
                                }
                              } catch { /* ignore */ }
                              return null;
                            })()}
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Input</p>
                              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-300">
                                {previewValue(latestAttempt?.input)}
                              </pre>
                            </div>
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                                {isFailed ? "Error" : "Output"}
                              </p>
                              <pre className={cn("mt-2 whitespace-pre-wrap break-words text-xs", isFailed ? "text-red-300" : "text-zinc-300")}>
                                {isFailed ? (task.latestError || "No error recorded") : (task.latestOutput || "No output recorded")}
                              </pre>
                            </div>
                          </div>
                        )}

                        {(!isWorkflowNode || task.attempts.length > 1) && <div className="mt-4 space-y-2">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{isWorkflowNode ? "Execution Log" : "Attempts"}</p>
                          {task.attempts.map((attempt) => (
                            <div
                              key={attempt.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs text-zinc-300">
                                  {attempt.status === "COMPLETED" ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                  ) : attempt.status === "FAILED" || attempt.status === "REJECTED" ? (
                                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                                  ) : attempt.status === "RUNNING" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                                  ) : attempt.status === "AWAITING_APPROVAL" ? (
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-300" />
                                  ) : (
                                    <AlertTriangle className="h-3.5 w-3.5 text-zinc-500" />
                                  )}
                                  <span>Attempt {attempt.attempt}</span>
                                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                                    {getStrategyLabel(attempt.strategy)}
                                  </span>
                                  {attempt.agent?.name && <span className="text-zinc-500">· {attempt.agent.name}</span>}
                                </div>
                                {attempt.fallbackEvent ? (
                                  <p className="text-[11px] text-amber-300">
                                    {attempt.fallbackEvent}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500">
                                <span>{attempt.status}</span>
                                <span>{formatDuration(attempt.durationMs)}</span>
                                <span>{formatDateTime(attempt.completedAt || attempt.startedAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>}
                      </div>
                    );
                  });
                  })()
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ExecutionReplay
        teamId={teamId}
        executionId={replayExecutionId}
        open={Boolean(replayExecutionId)}
        onClose={() => setReplayExecutionId(null)}
      />

      <ExecutionDebugConsole
        teamId={teamId}
        executionId={debugExecutionId}
        open={Boolean(debugExecutionId)}
        onClose={() => setDebugExecutionId(null)}
      />

      <ComputerUseReplay
        session={computerUseSession as never}
        open={!!computerUseSession}
        onClose={() => setComputerUseSession(null)}
      />
    </div>
  );
}
