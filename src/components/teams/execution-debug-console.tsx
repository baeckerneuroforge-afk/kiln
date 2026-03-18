"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  Braces,
  Clock,
  Download,
  FileSearch,
  GitBranch,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ReplayStep,
  TeamExecutionReplayResponse,
} from "@/lib/team-execution-replay-types";

interface ExecutionDebugConsoleProps {
  teamId: string;
  executionId: string | null;
  open: boolean;
  onClose: () => void;
}

type DebugTab =
  | "prompt"
  | "input"
  | "output"
  | "structured"
  | "routing"
  | "tokens"
  | "diff";

const debugTabs: { id: DebugTab; label: string }[] = [
  { id: "prompt", label: "System Prompt" },
  { id: "input", label: "Input" },
  { id: "output", label: "Output" },
  { id: "structured", label: "Structured Data" },
  { id: "routing", label: "Routing" },
  { id: "tokens", label: "Tokens" },
  { id: "diff", label: "Diff" },
];

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

function getSearchableText(step: ReplayStep) {
  return [
    step.memberName,
    step.taskTitle,
    step.prompt.fullPrompt,
    formatJson(step.input),
    step.output || "",
    formatJson(step.structuredOutput),
    step.error || "",
    step.strategy,
    step.fallbackEvent || "",
    step.routing.decision,
    step.routing.condition || "",
    step.routing.comparison || "",
  ]
    .join("\n")
    .toLowerCase();
}

function getDebugNodeTypeLabel(nodeType: string): string {
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

function getStatusStyles(status: ReplayStep["status"]) {
  switch (status) {
    case "COMPLETED":
      return "border-green-500/25 bg-green-500/10 text-green-300";
    case "FAILED":
    case "REJECTED":
      return "border-red-500/25 bg-red-500/10 text-red-300";
    case "AWAITING_APPROVAL":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    case "RUNNING":
      return "border-blue-500/25 bg-blue-500/10 text-blue-300";
    case "SKIPPED":
      return "border-zinc-700 bg-zinc-900 text-zinc-400";
    default:
      return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }
}

function buildSharedMemoryChanges(step: ReplayStep) {
  return Object.entries(step.sharedContextDelta).map(([key, after]) => {
    const hasBefore = Object.prototype.hasOwnProperty.call(step.sharedContextBefore, key);
    return {
      key,
      before: hasBefore ? step.sharedContextBefore[key] : undefined,
      after,
      type: hasBefore ? "updated" : "added",
    };
  });
}

export function ExecutionDebugConsole({
  teamId,
  executionId,
  open,
  onClose,
}: ExecutionDebugConsoleProps) {
  const [data, setData] = useState<TeamExecutionReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DebugTab>("prompt");

  useEffect(() => {
    if (!open || !executionId) return;

    let cancelled = false;

    async function loadDebugData() {
      setLoading(true);
      setError(null);
      setActiveTab("prompt");
      setSelectedStepId(null);

      try {
        const response = await fetch(
          `/api/teams/${teamId}/executions/${executionId}/replay`
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load execution debug data");
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load execution debug data"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDebugData();

    return () => {
      cancelled = true;
    };
  }, [executionId, open, teamId]);

  const filteredSteps = useMemo(() => {
    if (!data?.steps) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return data.steps;
    return data.steps.filter((step) => getSearchableText(step).includes(needle));
  }, [data?.steps, search]);

  useEffect(() => {
    if (!open) return;
    if (!filteredSteps.length) {
      setSelectedStepId(null);
      return;
    }

    const stillVisible = filteredSteps.some((step) => step.id === selectedStepId);
    if (!selectedStepId || !stillVisible) {
      setSelectedStepId(filteredSteps[0].id);
    }
  }, [filteredSteps, open, selectedStepId]);

  const selectedStep =
    filteredSteps.find((step) => step.id === selectedStepId) ||
    data?.steps.find((step) => step.id === selectedStepId) ||
    filteredSteps[0] ||
    data?.steps[0] ||
    null;

  const selectedIndex = useMemo(() => {
    if (!data?.steps || !selectedStep) return -1;
    return data.steps.findIndex((step) => step.id === selectedStep.id);
  }, [data?.steps, selectedStep]);

  const previousStep =
    selectedIndex > 0 && data?.steps ? data.steps[selectedIndex - 1] : null;

  const previousOutput =
    selectedStep?.previousOutputs[selectedStep.previousOutputs.length - 1]?.output ||
    previousStep?.output ||
    "";

  const sharedMemoryChanges = selectedStep
    ? buildSharedMemoryChanges(selectedStep)
    : [];

  function exportDebugData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.team.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-execution-${data.execution.id.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
              Execution Debug Console
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-100">
              {data?.team.name || "Workflow execution"}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Inspect prompts, routing, transformations, and failure detail step by step.
            </p>
            {data?.execution.trigger === "scheduled" ? (
              <p className="mt-2 text-xs text-violet-300">Scheduled execution</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={exportDebugData}
              disabled={!data}
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Clock className="mr-3 h-5 w-5 animate-pulse text-orange-400" />
            <span className="text-sm text-zinc-400">Loading debug data…</span>
          </div>
        ) : error ? (
          <div className="m-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        ) : !data || !selectedStep ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            No debug data available.
          </div>
        ) : (
          <div className="grid flex-1 gap-4 overflow-hidden p-6 xl:grid-cols-[340px,1fr]">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/70">
              <div className="border-b border-white/10 px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                  Search & Steps
                </p>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search prompts, outputs, errors..."
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none transition-colors focus:border-orange-500/40"
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {filteredSteps.length} matching steps
                </p>
              </div>

              <div className="h-[min(70vh,760px)] overflow-auto p-4">
                {filteredSteps.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center text-zinc-500">
                    <FileSearch className="h-8 w-8 text-zinc-700" />
                    <p className="mt-3 text-sm text-zinc-400">
                      No steps match your search.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredSteps.map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setSelectedStepId(step.id)}
                        className={cn(
                          "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                          selectedStep.id === step.id
                            ? "border-orange-500/40 bg-orange-500/10"
                            : "border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 hover:bg-zinc-900"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-100">
                              {step.nodeType && step.nodeType !== "agent" ? step.taskTitle : step.memberName}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {step.nodeType && step.nodeType !== "agent"
                                ? getDebugNodeTypeLabel(step.nodeType)
                                : `Task ${step.taskIndex + 1} · Attempt ${step.attempt}`}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                              getStatusStyles(step.status)
                            )}
                          >
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs text-zinc-400">
                          {step.taskTitle}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-500">
                          <span>{formatDuration(step.metrics.responseTimeMs)}</span>
                          {step.nodeType && step.nodeType !== "agent" ? (
                            <span className="text-zinc-400">{getDebugNodeTypeLabel(step.nodeType)}</span>
                          ) : (
                            <>
                              <span>{step.metrics.model || "Unknown model"}</span>
                              <span>{getStrategyLabel(step.strategy)}</span>
                            </>
                          )}
                          {step.error ? (
                            <span className="text-red-300">Error captured</span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/70">
              <div className="border-b border-white/10 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                      getStatusStyles(selectedStep.status)
                    )}
                  >
                    {selectedStep.status}
                  </span>
                  <span className="text-sm text-zinc-300">
                    {selectedStep.nodeType && selectedStep.nodeType !== "agent"
                      ? getDebugNodeTypeLabel(selectedStep.nodeType)
                      : `${selectedStep.memberName} · Task ${selectedStep.taskIndex + 1}`}
                  </span>
                  {(!selectedStep.nodeType || selectedStep.nodeType === "agent") && (
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
                      {getStrategyLabel(selectedStep.strategy)}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(selectedStep.startedAt)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-zinc-400">
                  {selectedStep.taskTitle}
                </p>
                {selectedStep.fallbackEvent ? (
                  <p className="mt-2 text-xs text-amber-300">
                    {selectedStep.fallbackEvent}
                  </p>
                ) : null}
              </div>

              <div className="border-b border-white/10 px-5 py-3">
                <div className="flex flex-wrap gap-2">
                  {debugTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        activeTab === tab.id
                          ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[min(70vh,760px)] overflow-auto p-5">
                {selectedStep.error ? (
                  <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
                    <div className="flex items-center gap-2 text-red-300">
                      <AlertCircle className="h-4 w-4" />
                      <p className="text-sm font-medium">Execution Error</p>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-red-100">
                      {selectedStep.error}
                    </pre>
                    {selectedStep.commonFixSuggestions.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {selectedStep.commonFixSuggestions.map((suggestion) => (
                          <div
                            key={suggestion}
                            className="rounded-xl border border-red-500/20 bg-black/20 px-3 py-2 text-xs text-red-100"
                          >
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === "prompt" ? (
                  selectedStep.nodeType && selectedStep.nodeType !== "agent" ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Node Configuration
                        </p>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                          {formatJson(selectedStep.structuredOutput?.config || selectedStep.input)}
                        </pre>
                      </div>
                      {selectedStep.nodeType === "http_request" && (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                              HTTP Request
                            </p>
                            <div className="mt-3 space-y-2 text-xs text-zinc-200">
                              <p><span className="text-zinc-500">Method:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.method || "GET")}</p>
                              <p><span className="text-zinc-500">URL:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.url || "—")}</p>
                              {!!(selectedStep.structuredOutput as Record<string, unknown>)?.headers && (
                                <>
                                  <p className="text-zinc-500">Headers:</p>
                                  <pre className="whitespace-pre-wrap break-words text-zinc-300">
                                    {formatJson((selectedStep.structuredOutput as Record<string, unknown>).headers)}
                                  </pre>
                                </>
                              )}
                              {!!(selectedStep.structuredOutput as Record<string, unknown>)?.body && (
                                <>
                                  <p className="text-zinc-500">Body:</p>
                                  <pre className="whitespace-pre-wrap break-words text-zinc-300">
                                    {formatJson((selectedStep.structuredOutput as Record<string, unknown>).body)}
                                  </pre>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                              HTTP Response
                            </p>
                            <div className="mt-3 space-y-2 text-xs text-zinc-200">
                              <p><span className="text-zinc-500">Status:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.statusCode || "—")}</p>
                              <pre className="mt-2 whitespace-pre-wrap break-words text-zinc-300">
                                {formatJson((selectedStep.structuredOutput as Record<string, unknown>)?.response || selectedStep.output)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedStep.nodeType === "send_email" && (
                        <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            Email Details
                          </p>
                          <div className="mt-3 space-y-2 text-xs text-zinc-200">
                            <p><span className="text-zinc-500">To:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.to || "—")}</p>
                            <p><span className="text-zinc-500">Subject:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.subject || "—")}</p>
                            <p><span className="text-zinc-500">Status:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.deliveryStatus || selectedStep.status)}</p>
                            {!!(selectedStep.structuredOutput as Record<string, unknown>)?.body && (
                              <>
                                <p className="mt-2 text-zinc-500">Body:</p>
                                <pre className="mt-1 whitespace-pre-wrap break-words text-zinc-300">
                                  {String((selectedStep.structuredOutput as Record<string, unknown>).body)}
                                </pre>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedStep.nodeType === "if_condition" && (
                        <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            Condition Evaluation
                          </p>
                          <div className="mt-3 space-y-2 text-xs text-zinc-200">
                            <p><span className="text-zinc-500">Expression:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.expression || "—")}</p>
                            <p><span className="text-zinc-500">Left Value:</span> {formatJson((selectedStep.structuredOutput as Record<string, unknown>)?.leftValue)}</p>
                            <p><span className="text-zinc-500">Operator:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.operator || "—")}</p>
                            <p><span className="text-zinc-500">Right Value:</span> {formatJson((selectedStep.structuredOutput as Record<string, unknown>)?.rightValue)}</p>
                            <p className="mt-2">
                              <span className="text-zinc-500">Result:</span>{" "}
                              <span className={(selectedStep.structuredOutput as Record<string, unknown>)?.result ? "text-green-300" : "text-red-300"}>
                                {String((selectedStep.structuredOutput as Record<string, unknown>)?.result ?? "—")} → {(selectedStep.structuredOutput as Record<string, unknown>)?.result ? "True path" : "False path"}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                      {selectedStep.nodeType === "set_variable" && (
                        <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            Variable Assignment
                          </p>
                          <div className="mt-3 space-y-1 text-xs text-zinc-200">
                            {selectedStep.structuredOutput && typeof selectedStep.structuredOutput === "object"
                              ? Object.entries(selectedStep.structuredOutput as Record<string, unknown>).map(([k, v]) => (
                                  <p key={k}>
                                    <span className="font-mono text-orange-300">{k}</span>
                                    <span className="text-zinc-500"> = </span>
                                    <span className="text-zinc-200">{formatJson(v)}</span>
                                  </p>
                                ))
                              : <p>{formatJson(selectedStep.structuredOutput)}</p>}
                          </div>
                        </div>
                      )}
                      {selectedStep.nodeType === "delay" && (
                        <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            Delay Info
                          </p>
                          <div className="mt-3 text-xs text-zinc-200">
                            <p><span className="text-zinc-500">Duration:</span> {String((selectedStep.structuredOutput as Record<string, unknown>)?.duration || selectedStep.output || "—")}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          System Prompt
                        </p>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                          {selectedStep.prompt.system}
                        </pre>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          User Input
                        </p>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                          {selectedStep.prompt.user}
                        </pre>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Included Knowledge
                        </p>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                          {selectedStep.prompt.knowledgeContext.length > 0
                            ? selectedStep.prompt.knowledgeContext.join("\n\n---\n\n")
                            : "No RAG context injected"}
                        </pre>
                      </div>
                    </div>
                  )
                ) : null}

                {activeTab === "input" ? (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                      {selectedStep.nodeType && selectedStep.nodeType !== "agent"
                        ? `${getDebugNodeTypeLabel(selectedStep.nodeType)} Input`
                        : "Agent Input"}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                      {formatJson(selectedStep.input)}
                    </pre>
                  </div>
                ) : null}

                {activeTab === "output" ? (
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                      {selectedStep.nodeType && selectedStep.nodeType !== "agent"
                        ? `${getDebugNodeTypeLabel(selectedStep.nodeType)} Output`
                        : "Raw Model Output"}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                      {selectedStep.output || "No output recorded"}
                    </pre>
                    {selectedStep.nodeType && selectedStep.nodeType !== "agent" && selectedStep.structuredOutput && (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Structured Result
                        </p>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                          {formatJson(selectedStep.structuredOutput)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : null}

                {activeTab === "structured" ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                      <div className="flex items-center gap-2">
                        <Braces className="h-4 w-4 text-violet-300" />
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Structured Data
                        </p>
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                        {formatJson(selectedStep.structuredOutput)}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        Shared Memory After This Step
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                        {formatJson(selectedStep.sharedContextAfter)}
                      </pre>
                    </div>
                  </div>
                ) : null}

                {activeTab === "routing" ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        Runtime Strategy
                      </p>
                      <p className="mt-3 text-sm text-zinc-100">
                        {getStrategyLabel(selectedStep.strategy)}
                      </p>
                      {selectedStep.fallbackEvent ? (
                        <p className="mt-2 text-xs text-amber-300">
                          {selectedStep.fallbackEvent}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-orange-300" />
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Routing Decision
                        </p>
                      </div>
                      <p className="mt-3 text-sm text-zinc-100">
                        {selectedStep.routing.decision}
                      </p>
                      {selectedStep.routing.condition ? (
                        <p className="mt-3 text-xs text-zinc-400">
                          Condition: {selectedStep.routing.condition}
                        </p>
                      ) : null}
                      {selectedStep.routing.comparison ? (
                        <p className="mt-1 text-xs text-amber-300">
                          {selectedStep.routing.comparison}
                        </p>
                      ) : null}
                    </div>
                    {selectedStep.approvalRequest ? (
                      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/80">
                          Approval Gate
                        </p>
                        <p className="mt-3 text-sm text-amber-100">
                          {selectedStep.approvalRequest.status} ·{" "}
                          {selectedStep.approvalRequest.approverEmail}
                        </p>
                        <p className="mt-2 text-xs text-amber-100/80">
                          Requested {formatDateTime(selectedStep.approvalRequest.requestedAt)}
                        </p>
                        {selectedStep.approvalRequest.respondedAt ? (
                          <p className="mt-1 text-xs text-amber-100/80">
                            Responded {formatDateTime(selectedStep.approvalRequest.respondedAt)} by{" "}
                            {selectedStep.approvalRequest.respondedBy ||
                              selectedStep.approvalRequest.approverEmail}
                          </p>
                        ) : null}
                        {selectedStep.approvalRequest.note ? (
                          <p className="mt-3 text-xs text-amber-100">
                            Note: {selectedStep.approvalRequest.note}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === "tokens" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {(selectedStep.nodeType && selectedStep.nodeType !== "agent"
                      ? [
                          {
                            label: "Node Type",
                            value: getDebugNodeTypeLabel(selectedStep.nodeType),
                          },
                          {
                            label: "Execution Time",
                            value: formatDuration(selectedStep.metrics.responseTimeMs),
                          },
                          {
                            label: "Status",
                            value: selectedStep.status,
                          },
                          {
                            label: "Completed",
                            value: formatDateTime(
                              selectedStep.completedAt || selectedStep.startedAt
                            ),
                          },
                        ]
                      : [
                          {
                            label: "Model",
                            value: selectedStep.metrics.model || "Unknown model",
                          },
                          {
                            label: "Response Time",
                            value: formatDuration(selectedStep.metrics.responseTimeMs),
                          },
                          {
                            label: "Input Tokens",
                            value: String(selectedStep.metrics.tokensIn),
                          },
                          {
                            label: "Output Tokens",
                            value: String(selectedStep.metrics.tokensOut),
                          },
                          {
                            label: "Estimated Cost",
                            value:
                              typeof selectedStep.metrics.estimatedCost === "number"
                                ? `$${selectedStep.metrics.estimatedCost.toFixed(6)}`
                                : "n/a",
                          },
                          {
                            label: "Completed",
                            value: formatDateTime(
                              selectedStep.completedAt || selectedStep.startedAt
                            ),
                          },
                        ]
                    ).map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4"
                      >
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          {item.label}
                        </p>
                        <p className="mt-3 text-sm text-zinc-100">{item.value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeTab === "diff" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="h-4 w-4 text-zinc-400" />
                          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            Previous Step Output
                          </p>
                        </div>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                          {previousOutput || "No previous output available"}
                        </pre>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="h-4 w-4 text-zinc-400" />
                          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                            Current Step Input
                          </p>
                        </div>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-zinc-200">
                          {formatJson(selectedStep.input)}
                        </pre>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        Shared Memory Transformations
                      </p>
                      {sharedMemoryChanges.length === 0 ? (
                        <p className="mt-3 text-sm text-zinc-500">
                          No new fields were added or updated during this step.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {sharedMemoryChanges.map((change) => (
                            <div
                              key={change.key}
                              className={cn(
                                "rounded-2xl border px-4 py-3",
                                change.type === "added"
                                  ? "border-green-500/25 bg-green-500/10"
                                  : "border-amber-500/25 bg-amber-500/10"
                              )}
                            >
                              <p className="text-sm font-medium text-zinc-100">
                                {change.key}
                              </p>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                                {change.type === "added" ? "Added" : "Updated"}
                              </p>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                                    Before
                                  </p>
                                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-300">
                                    {change.type === "added"
                                      ? "Field did not exist"
                                      : formatJson(change.before)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                                    After
                                  </p>
                                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-100">
                                    {formatJson(change.after)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
