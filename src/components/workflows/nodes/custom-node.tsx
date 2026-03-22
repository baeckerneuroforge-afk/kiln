"use client";

/**
 * Custom Node — Generische Workflow-Node-Komponente
 * Rendert jeden Custom Node basierend auf seiner Definition.
 */

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CustomNodeDefinitionJSON, NodeConfigField, NodePort } from "@/lib/nodes-sdk/node-sdk-types";

/* ── Types ── */

/** Vereinfachte Props: Definition + Config + onChange */
interface CustomNodeSimpleProps {
  customNodeDefinition: CustomNodeDefinitionJSON;
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

interface CustomNodeProps {
  nodeId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  inputs: NodePort[];
  outputs: NodePort[];
  config: NodeConfigField[];
  configValues: Record<string, unknown>;
  onConfigChange: (name: string, value: unknown) => void;
  isSelected?: boolean;
}

/**
 * Wrapper-Komponente die eine CustomNodeDefinition direkt akzeptiert.
 * Fuer einfache Integration in Workflow-Builder.
 */
export function CustomNodeFromDefinition({ customNodeDefinition, config, onConfigChange }: CustomNodeSimpleProps) {
  const def = customNodeDefinition;
  return (
    <CustomNodeComponent
      nodeId={def.id}
      name={def.name}
      description={def.description}
      icon={def.icon}
      color={def.color}
      inputs={def.inputs}
      outputs={def.outputs}
      config={def.config}
      configValues={config}
      onConfigChange={(name, value) => onConfigChange({ ...config, [name]: value })}
      isSelected={true}
    />
  );
}

/* ── Port Badge ── */

function PortBadge({ port, direction }: { port: NodePort; direction: "in" | "out" }) {
  const colors: Record<string, string> = {
    string: "bg-blue-500/20 text-blue-400",
    number: "bg-green-500/20 text-green-400",
    json: "bg-purple-500/20 text-purple-400",
    boolean: "bg-yellow-500/20 text-yellow-400",
    array: "bg-pink-500/20 text-pink-400",
    any: "bg-stone-500/20 text-stone-400",
  };

  return (
    <div className={`flex items-center gap-1.5 ${direction === "in" ? "" : "flex-row-reverse"}`}>
      <div
        className={`w-2.5 h-2.5 rounded-full border-2 ${direction === "in" ? "border-blue-400" : "border-green-400"}`}
      />
      <span className="text-xs text-stone-400">{port.name}</span>
      <span className={`text-[10px] px-1 rounded ${colors[port.type] || colors.any}`}>
        {port.type}
      </span>
    </div>
  );
}

/* ── Config Field Renderer ── */

function ConfigFieldRenderer({
  field,
  value,
  onChange,
}: {
  field: NodeConfigField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  switch (field.type) {
    case "text":
    case "password":
      return (
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">{field.label}</Label>
          <Input
            type={field.type === "password" ? "password" : "text"}
            value={String(value || field.default || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.description}
            className="h-7 text-xs bg-stone-900 border-stone-700"
          />
        </div>
      );
    case "number":
      return (
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">{field.label}</Label>
          <Input
            type="number"
            value={String(value ?? field.default ?? "")}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-7 text-xs bg-stone-900 border-stone-700"
          />
        </div>
      );
    case "textarea":
      return (
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">{field.label}</Label>
          <Textarea
            value={String(value || field.default || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.description}
            className="text-xs bg-stone-900 border-stone-700 min-h-[60px]"
          />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1">
          <Label className="text-xs text-stone-400">{field.label}</Label>
          <Select value={String(value || field.default || "")} onValueChange={onChange}>
            <SelectTrigger className="h-7 text-xs bg-stone-900 border-stone-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "toggle":
      return (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-stone-400">{field.label}</Label>
          <Switch
            checked={Boolean(value ?? field.default)}
            onCheckedChange={onChange}
          />
        </div>
      );
    default:
      return null;
  }
}

/* ── Main Component ── */

export function CustomNodeComponent({
  name,
  description,
  icon,
  color,
  inputs,
  outputs,
  config,
  configValues,
  onConfigChange,
  isSelected,
}: CustomNodeProps) {
  return (
    <div
      className={`
        rounded-xl border bg-stone-950/90 backdrop-blur-sm
        min-w-[220px] max-w-[280px] transition-shadow
        ${isSelected ? "ring-2 ring-orange-500 shadow-lg shadow-orange-500/20" : "shadow-md"}
      `}
      style={{ borderColor: color }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: `${color}15` }}
      >
        <span className="text-lg">{icon || "🧩"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-100 truncate">{name}</p>
          <p className="text-[10px] text-stone-400 truncate">{description}</p>
        </div>
        <Badge variant="outline" className="text-[9px] border-stone-600 text-stone-400 shrink-0">
          Community
        </Badge>
      </div>

      {/* Ports */}
      <div className="px-3 py-2 flex gap-4">
        {/* Inputs */}
        {inputs.length > 0 && (
          <div className="space-y-1 flex-1">
            {inputs.map((port) => (
              <PortBadge key={port.name} port={port} direction="in" />
            ))}
          </div>
        )}
        {/* Outputs */}
        {outputs.length > 0 && (
          <div className="space-y-1 flex-1">
            {outputs.map((port) => (
              <PortBadge key={port.name} port={port} direction="out" />
            ))}
          </div>
        )}
      </div>

      {/* Config Panel (nur wenn selektiert) */}
      {isSelected && config.length > 0 && (
        <div className="border-t border-stone-800 px-3 py-2 space-y-2">
          <p className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">Konfiguration</p>
          {config.map((field) => (
            <ConfigFieldRenderer
              key={field.name}
              field={field}
              value={configValues[field.name]}
              onChange={(val) => onConfigChange(field.name, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
