"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { X, ArrowRight, Code2, Link2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type WorkflowNodeType, getNodeDefinition } from "@/lib/workflow-node-types";

/* ========== Field definitions per node type ========== */

/** Known output fields for each node type */
const OUTPUT_FIELDS: Partial<Record<WorkflowNodeType, string[]>> = {
  agent: ["output", "summary", "structuredData", "tokensUsed", "cost"],
  trigger_webhook: ["body", "headers", "method", "url", "timestamp"],
  trigger_schedule: ["input", "scheduledAt", "timezone"],
  trigger_lead: ["lead.name", "lead.email", "lead.phone", "lead.source", "lead.score", "lead.agentId"],
  trigger_chat: ["chat.agentId", "chat.visitorId", "chat.url", "chat.timestamp"],
  trigger_manual: ["input"],
  if_condition: ["result", "matched"],
  switch: ["result", "matchedCase"],
  filter: ["data"],
  transform: ["result", "transformedFields"],
  http_request: ["statusCode", "body", "headers", "duration"],
  send_email: ["success", "messageId"],
  send_slack: ["success", "timestamp"],
  delay: ["resumedAt"],
  set_variable: ["variables"],
  approval_gate: ["approved", "approverEmail", "approvedAt"],
  wait_form: ["form", "submittedAt", "formTitle"],
  wait_webhook: ["webhook", "receivedAt", "payload"],
  sub_workflow: ["result", "status", "executionId"],
  merge: ["branches", "completedCount"],
};

/** Known input fields (based on config shape) */
const INPUT_FIELDS: Partial<Record<WorkflowNodeType, string[]>> = {
  agent: ["goal", "context", "input"],
  if_condition: ["data"],
  switch: ["data"],
  filter: ["data"],
  transform: ["data"],
  http_request: ["url", "body", "headers"],
  send_email: ["to", "subject", "body"],
  send_slack: ["channel", "message"],
  delay: ["duration"],
  set_variable: ["key", "value"],
  approval_gate: ["message", "approverEmail"],
  sub_workflow: ["input", "workflowId"],
  merge: ["data"],
};

export interface FieldMapping {
  source: string;  // e.g. "output.score"
  target: string;  // e.g. "input.leadScore"
  expression?: string; // optional expression override
}

interface DataMapperProps {
  /** The edge being configured */
  edgeId: string | null;
  sourceNodeId: string;
  targetNodeId: string;
  sourceNodeType: WorkflowNodeType;
  targetNodeType: WorkflowNodeType;
  sourceLabel: string;
  targetLabel: string;
  /** Current field mappings on this edge */
  mappings: FieldMapping[];
  /** Custom output fields from source's outputSchema */
  sourceSchemaFields?: string[];
  onSave: (edgeId: string, mappings: FieldMapping[]) => void;
  onClose: () => void;
}

/* ========== SVG Connection Line ========== */

function ConnectionLine({
  x1, y1, x2, y2, onClick,
}: {
  x1: number; y1: number; x2: number; y2: number; onClick: () => void;
}) {
  const midX = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  return (
    <g className="group cursor-pointer" onClick={onClick}>
      {/* Fat invisible hit area */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
      {/* Visible line */}
      <path
        d={d}
        fill="none"
        stroke="#F97316"
        strokeWidth={2}
        strokeOpacity={0.6}
        className="group-hover:stroke-red-400 transition-colors"
      />
      {/* Delete indicator on hover */}
      <circle
        cx={midX} cy={(y1 + y2) / 2}
        r={6}
        fill="#18181B"
        stroke="#EF4444"
        strokeWidth={1.5}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <text
        x={midX} y={(y1 + y2) / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fill="#EF4444"
        className="opacity-0 group-hover:opacity-100 transition-opacity select-none"
      >
        ×
      </text>
    </g>
  );
}

/* ========== Drag-and-drop Connection Line (in progress) ========== */

function DragLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const midX = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      stroke="#F97316"
      strokeWidth={2}
      strokeDasharray="6 4"
      strokeOpacity={0.8}
    />
  );
}

/* ========== Main Component ========== */

export function DataMapper({
  edgeId,
  sourceNodeType,
  targetNodeType,
  sourceLabel,
  targetLabel,
  mappings: initialMappings,
  sourceSchemaFields,
  onSave,
  onClose,
}: DataMapperProps) {
  const [mappings, setMappings] = useState<FieldMapping[]>(initialMappings);
  const [expressionMappings, setExpressionMappings] = useState<FieldMapping[]>([]);
  const [dragging, setDragging] = useState<{ field: string; dotRect: DOMRect } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const sourceDotsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const targetDotsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);

  const isOpen = !!edgeId;

  // Reset when edge changes
  useEffect(() => {
    const directMappings = initialMappings.filter((m) => !m.expression);
    const exprMappings = initialMappings.filter((m) => !!m.expression);
    setMappings(directMappings);
    setExpressionMappings(exprMappings);
  }, [edgeId, initialMappings]);

  const sourceFields = useMemo(() => {
    const base = OUTPUT_FIELDS[sourceNodeType] || ["output"];
    if (sourceSchemaFields?.length) {
      return [...base, ...sourceSchemaFields.map((f) => `structuredData.${f}`)];
    }
    return base;
  }, [sourceNodeType, sourceSchemaFields]);

  const targetFields = useMemo(() => {
    return INPUT_FIELDS[targetNodeType] || ["input"];
  }, [targetNodeType]);

  const sourceDef = getNodeDefinition(sourceNodeType);
  const targetDef = getNodeDefinition(targetNodeType);

  // Berechne SVG-Koordinaten für Connection Lines
  const getConnectionCoords = useCallback(() => {
    if (!containerRef.current) return [];
    const containerRect = containerRef.current.getBoundingClientRect();
    return mappings.map((m) => {
      const sourceDot = sourceDotsRef.current.get(m.source);
      const targetDot = targetDotsRef.current.get(m.target);
      if (!sourceDot || !targetDot) return null;
      const sRect = sourceDot.getBoundingClientRect();
      const tRect = targetDot.getBoundingClientRect();
      return {
        x1: sRect.left + sRect.width / 2 - containerRect.left,
        y1: sRect.top + sRect.height / 2 - containerRect.top,
        x2: tRect.left + tRect.width / 2 - containerRect.left,
        y2: tRect.top + tRect.height / 2 - containerRect.top,
        source: m.source,
        target: m.target,
      };
    }).filter(Boolean) as { x1: number; y1: number; x2: number; y2: number; source: string; target: string }[];
  }, [mappings]);

  const [connectionCoords, setConnectionCoords] = useState<ReturnType<typeof getConnectionCoords>>([]);

  // Recalculate connections after render
  useEffect(() => {
    const timer = setTimeout(() => {
      setConnectionCoords(getConnectionCoords());
    }, 50);
    return () => clearTimeout(timer);
  }, [mappings, isOpen, getConnectionCoords]);

  // Drag handlers
  const handleDragStart = useCallback((field: string, dotEl: HTMLDivElement) => {
    const rect = dotEl.getBoundingClientRect();
    setDragging({ field, dotRect: rect });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    if (!dragging) return;
    if (hoveredTarget) {
      // Prüfe ob Mapping schon existiert
      const exists = mappings.some((m) => m.source === dragging.field && m.target === hoveredTarget);
      if (!exists) {
        setMappings((prev) => [...prev, { source: dragging.field, target: hoveredTarget }]);
      }
    }
    setDragging(null);
    setHoveredTarget(null);
  }, [dragging, hoveredTarget, mappings]);

  const removeMapping = useCallback((source: string, target: string) => {
    setMappings((prev) => prev.filter((m) => !(m.source === source && m.target === target)));
  }, []);

  // Connected fields
  const connectedSources = useMemo(() => new Set(mappings.map((m) => m.source)), [mappings]);
  const connectedTargets = useMemo(() => new Set(mappings.map((m) => m.target)), [mappings]);

  // Auto-map: verbinde gleiche Feldnamen
  const handleAutoMap = useCallback(() => {
    const newMappings: FieldMapping[] = [];
    for (const sf of sourceFields) {
      for (const tf of targetFields) {
        // Verbinde wenn gleicher Name (nach letztem Punkt)
        const sName = sf.includes(".") ? sf.split(".").pop() : sf;
        const tName = tf.includes(".") ? tf.split(".").pop() : tf;
        if (sName && tName && sName.toLowerCase() === tName.toLowerCase()) {
          if (!newMappings.some((m) => m.source === sf || m.target === tf)) {
            newMappings.push({ source: sf, target: tf });
          }
        }
      }
    }
    if (newMappings.length > 0) {
      setMappings(newMappings);
    }
  }, [sourceFields, targetFields]);

  // Expression mapping handlers
  const addExpressionMapping = useCallback(() => {
    setExpressionMappings((prev) => [...prev, { source: "", target: targetFields[0] || "", expression: "" }]);
  }, [targetFields]);

  const updateExpressionMapping = useCallback((i: number, patch: Partial<FieldMapping>) => {
    setExpressionMappings((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }, []);

  const removeExpressionMapping = useCallback((i: number) => {
    setExpressionMappings((prev) => prev.filter((_, j) => j !== i));
  }, []);

  const handleSave = useCallback(() => {
    if (!edgeId) return;
    const allMappings = [
      ...mappings.filter((m) => m.source && m.target),
      ...expressionMappings.filter((m) => m.expression && m.target),
    ];
    onSave(edgeId, allMappings);
  }, [edgeId, mappings, expressionMappings, onSave]);

  // Drag line Koordinaten
  const dragLineCoords = useMemo(() => {
    if (!dragging || !containerRef.current) return null;
    const containerRect = containerRef.current.getBoundingClientRect();
    return {
      x1: dragging.dotRect.left + dragging.dotRect.width / 2 - containerRect.left,
      y1: dragging.dotRect.top + dragging.dotRect.height / 2 - containerRect.top,
      x2: mousePos.x,
      y2: mousePos.y,
    };
  }, [dragging, mousePos]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/40 transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[520px] z-30 bg-zinc-900 border-l border-border shadow-2xl transform transition-transform duration-200 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Data Mapping</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Source → Target header */}
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sourceDef?.color || "#F97316" }}>
                Source
              </p>
              <p className="text-xs font-medium text-zinc-200 truncate">{sourceLabel}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-600 shrink-0" />
            <div className="flex-1 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: targetDef?.color || "#F97316" }}>
                Target
              </p>
              <p className="text-xs font-medium text-zinc-200 truncate">{targetLabel}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoMap}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-orange-400 hover:text-orange-300 transition-colors rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-1.5"
            >
              <Wand2 className="h-3 w-3" />
              Auto-Map
            </button>
            <span className="text-[10px] text-zinc-600">
              {mappings.length + expressionMappings.length} mapping{mappings.length + expressionMappings.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Visual field mapper */}
          <div
            ref={containerRef}
            className="relative rounded-xl border border-zinc-700/50 bg-zinc-950/50 p-4"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* SVG overlay for connection lines */}
            <svg
              ref={svgRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              style={{ overflow: "visible" }}
            >
              {connectionCoords.map((c, i) => (
                <ConnectionLine
                  key={`${c.source}-${c.target}-${i}`}
                  x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
                  onClick={() => removeMapping(c.source, c.target)}
                />
              ))}
              {dragging && dragLineCoords && (
                <DragLine
                  x1={dragLineCoords.x1} y1={dragLineCoords.y1}
                  x2={dragLineCoords.x2} y2={dragLineCoords.y2}
                />
              )}
            </svg>

            <div className="grid grid-cols-2 gap-8">
              {/* Source fields (left) */}
              <div className="space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-wider mb-2" style={{ color: sourceDef?.color || "#F97316" }}>
                  Output Fields
                </p>
                {sourceFields.map((field) => {
                  const isConnected = connectedSources.has(field);
                  return (
                    <div
                      key={field}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-2.5 py-1.5 transition-all group",
                        isConnected
                          ? "border-orange-500/30 bg-orange-500/5"
                          : "border-zinc-700/40 bg-zinc-800/30 hover:border-zinc-600"
                      )}
                    >
                      <span className={cn(
                        "text-[11px] font-mono truncate",
                        isConnected ? "text-orange-300" : "text-zinc-400"
                      )}>
                        {field}
                      </span>
                      <div
                        ref={(el) => { if (el) sourceDotsRef.current.set(field, el); }}
                        className={cn(
                          "h-3 w-3 rounded-full border-2 shrink-0 ml-2 cursor-grab active:cursor-grabbing transition-all relative z-20",
                          isConnected
                            ? "bg-orange-500 border-orange-400 shadow-[0_0_6px_rgba(249,115,22,0.4)]"
                            : "bg-zinc-700 border-zinc-600 hover:bg-green-500 hover:border-green-400 group-hover:shadow-[0_0_4px_rgba(34,197,94,0.3)]"
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const el = e.currentTarget;
                          handleDragStart(field, el);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Target fields (right) */}
              <div className="space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-wider mb-2" style={{ color: targetDef?.color || "#F97316" }}>
                  Input Fields
                </p>
                {targetFields.map((field) => {
                  const isConnected = connectedTargets.has(field);
                  const isHovered = hoveredTarget === field;
                  return (
                    <div
                      key={field}
                      className={cn(
                        "flex items-center rounded-lg border px-2.5 py-1.5 transition-all group",
                        isConnected
                          ? "border-blue-500/30 bg-blue-500/5"
                          : isHovered
                            ? "border-green-500/50 bg-green-500/10"
                            : "border-zinc-700/40 bg-zinc-800/30 hover:border-zinc-600"
                      )}
                      onMouseEnter={() => { if (dragging) setHoveredTarget(field); }}
                      onMouseLeave={() => setHoveredTarget(null)}
                    >
                      <div
                        ref={(el) => { if (el) targetDotsRef.current.set(field, el); }}
                        className={cn(
                          "h-3 w-3 rounded-full border-2 shrink-0 mr-2 transition-all relative z-20",
                          isConnected
                            ? "bg-blue-500 border-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.4)]"
                            : isHovered
                              ? "bg-green-500 border-green-400 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                              : "bg-zinc-700 border-zinc-600"
                        )}
                      />
                      <span className={cn(
                        "text-[11px] font-mono truncate",
                        isConnected ? "text-blue-300" : "text-zinc-400"
                      )}>
                        {field}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {mappings.length === 0 && expressionMappings.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Link2 className="h-5 w-5 text-zinc-700 mx-auto mb-1" />
                  <p className="text-[10px] text-zinc-600">Drag from source to target to connect</p>
                </div>
              </div>
            )}
          </div>

          {/* Validation */}
          {mappings.some((m) => !m.source || !m.target) && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-[10px] text-amber-400">Some mappings have empty fields and will be removed on save.</p>
            </div>
          )}

          {/* Expression mappings */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Code2 className="h-3 w-3 text-violet-400" />
                Expression Mappings
              </label>
            </div>

            {expressionMappings.map((em, i) => (
              <div key={i} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5 space-y-1.5">
                <input
                  value={em.expression || ""}
                  onChange={(e) => updateExpressionMapping(i, { expression: e.target.value })}
                  placeholder='{{ source.output | upper }}'
                  className="w-full bg-zinc-800 border border-violet-500/30 rounded-lg text-[11px] font-mono text-zinc-100 px-2.5 py-1.5 outline-none focus:border-violet-500/60 placeholder:text-zinc-600"
                />
                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3 text-violet-400" />
                  <select
                    value={em.target}
                    onChange={(e) => updateExpressionMapping(i, { target: e.target.value })}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2 py-1.5 outline-none focus:border-violet-500/60"
                  >
                    <option value="">Select target...</option>
                    {targetFields.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeExpressionMapping(i)}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={addExpressionMapping}
              className="inline-flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
            >
              <Code2 className="h-3 w-3" />
              Add expression mapping
            </button>
          </div>

          {/* Info */}
          <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/20 p-3">
            <p className="text-[10px] text-zinc-500">
              Drag from green dots to blue dots to create field connections.
              Click a connection line to remove it.
              Use expression mappings for data transformations with {`{{ }}`} syntax.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save Mappings
          </Button>
        </div>
      </div>
    </>
  );
}
