"use client";

import { useState } from "react";
import { Plus, Loader2, X, Play, Trash2, ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CustomTool {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string> | null;
  bodyTemplate: string | null;
  responseMapping: string | null;
  enabled: boolean;
}

interface CustomToolsTabProps {
  agentId: string;
}

const TEMPLATES = [
  {
    id: "weather",
    name: "Weather API Lookup",
    description: "Look up current weather conditions for a city when the user asks about weather.",
    method: "GET",
    url: "https://api.openweathermap.org/data/2.5/weather?q={{city}}&appid={{API_KEY}}&units=metric",
    headers: {},
    bodyTemplate: "",
    responseMapping: "main.temp",
  },
  {
    id: "crm",
    name: "CRM Contact Search",
    description: "Search for a contact in the CRM when the user asks about a customer or client.",
    method: "GET",
    url: "https://api.example-crm.com/v1/contacts?search={{query}}",
    headers: { Authorization: "Bearer {{CRM_API_KEY}}" },
    bodyTemplate: "",
    responseMapping: "data[0].name",
  },
];

const METHODS = ["GET", "POST", "PUT", "DELETE"];

export function CustomToolsTab({ agentId }: CustomToolsTabProps) {
  const [tools, setTools] = useState<CustomTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomTool | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMethod, setFormMethod] = useState("GET");
  const [formUrl, setFormUrl] = useState("");
  const [formHeaders, setFormHeaders] = useState<{ key: string; value: string }[]>([]);
  const [formBodyTemplate, setFormBodyTemplate] = useState("");
  const [formResponseMapping, setFormResponseMapping] = useState("");

  // Test state
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ toolId: string; data: unknown; error?: string } | null>(null);

  // Load tools on mount
  useState(() => {
    fetch(`/api/agents/${agentId}/custom-tools`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTools(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormMethod("GET");
    setFormUrl("");
    setFormHeaders([]);
    setFormBodyTemplate("");
    setFormResponseMapping("");
    setEditingTool(null);
    setShowForm(false);
  }

  function openEdit(tool: CustomTool) {
    setFormName(tool.name);
    setFormDescription(tool.description);
    setFormMethod(tool.method);
    setFormUrl(tool.url);
    setFormHeaders(
      tool.headers
        ? Object.entries(tool.headers).map(([key, value]) => ({ key, value }))
        : []
    );
    setFormBodyTemplate(tool.bodyTemplate || "");
    setFormResponseMapping(tool.responseMapping || "");
    setEditingTool(tool);
    setShowForm(true);
  }

  function applyTemplate(template: typeof TEMPLATES[0]) {
    setFormName(template.name);
    setFormDescription(template.description);
    setFormMethod(template.method);
    setFormUrl(template.url);
    setFormHeaders(
      Object.entries(template.headers).map(([key, value]) => ({ key, value }))
    );
    setFormBodyTemplate(template.bodyTemplate);
    setFormResponseMapping(template.responseMapping);
    setShowForm(true);
  }

  async function saveTool() {
    if (!formName.trim() || !formDescription.trim() || !formUrl.trim()) return;
    setSaving(true);

    const headersObj: Record<string, string> = {};
    for (const h of formHeaders) {
      if (h.key.trim()) headersObj[h.key.trim()] = h.value;
    }

    try {
      const res = await fetch(`/api/agents/${agentId}/custom-tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTool?.id || undefined,
          name: formName.trim(),
          description: formDescription.trim(),
          method: formMethod,
          url: formUrl.trim(),
          headers: Object.keys(headersObj).length > 0 ? headersObj : null,
          bodyTemplate: formBodyTemplate.trim() || null,
          responseMapping: formResponseMapping.trim() || null,
        }),
      });

      if (res.ok) {
        const tool = await res.json();
        setTools((prev) => {
          const idx = prev.findIndex((t) => t.id === tool.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = tool;
            return copy;
          }
          return [...prev, tool];
        });
        resetForm();
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSaving(false);
    }
  }

  async function deleteTool(toolId: string) {
    setDeleting(toolId);
    try {
      const res = await fetch(`/api/agents/${agentId}/custom-tools`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId }),
      });
      if (res.ok) {
        setTools((prev) => prev.filter((t) => t.id !== toolId));
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setDeleting(null);
    }
  }

  async function toggleTool(tool: CustomTool) {
    try {
      const res = await fetch(`/api/agents/${agentId}/custom-tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          method: tool.method,
          url: tool.url,
          headers: tool.headers,
          bodyTemplate: tool.bodyTemplate,
          responseMapping: tool.responseMapping,
          enabled: !tool.enabled,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTools((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        );
      }
    } catch {
      // Stille Fehlerbehandlung
    }
  }

  async function testTool(tool: CustomTool) {
    setTestingTool(tool.id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/custom-tools/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: tool.method,
          url: tool.url,
          headers: tool.headers,
          body: tool.bodyTemplate ? tool.bodyTemplate : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ toolId: tool.id, data });
      } else {
        setTestResult({ toolId: tool.id, data: null, error: data.error || "Request failed" });
      }
    } catch (err) {
      setTestResult({
        toolId: tool.id,
        data: null,
        error: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTestingTool(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define custom HTTP tools that Claude can call during conversations.
        </p>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Tool
        </Button>
      </div>

      {/* Templates */}
      {tools.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Start with a template
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-purple-500/30 hover:bg-purple-500/5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-sm font-medium text-foreground">{t.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tool List */}
      {tools.map((tool) => (
        <div
          key={tool.id}
          className={cn(
            "rounded-xl border bg-card transition-colors",
            tool.enabled ? "border-purple-500/30" : "border-border"
          )}
        >
          <div className="flex items-center justify-between p-4">
            <div
              className="flex flex-1 cursor-pointer items-center gap-3"
              onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                <Wrench className="h-4 w-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {tool.name}
                  </p>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {tool.method}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {tool.description}
                </p>
              </div>
              {expandedTool === tool.id ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="ml-3 flex items-center gap-2">
              <button
                onClick={() => toggleTool(tool)}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-colors",
                  tool.enabled ? "bg-purple-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                    tool.enabled && "translate-x-5"
                  )}
                />
              </button>
            </div>
          </div>

          {/* Expanded Details */}
          {expandedTool === tool.id && (
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
              <div className="rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Endpoint
                </p>
                <p className="font-mono text-xs text-foreground break-all">
                  {tool.method} {tool.url}
                </p>
              </div>

              {tool.headers && Object.keys(tool.headers).length > 0 && (
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Headers
                  </p>
                  {Object.entries(tool.headers).map(([k, v]) => (
                    <p key={k} className="font-mono text-xs text-foreground">
                      {k}: {v}
                    </p>
                  ))}
                </div>
              )}

              {tool.bodyTemplate && (
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Body Template
                  </p>
                  <pre className="font-mono text-xs text-foreground whitespace-pre-wrap">{tool.bodyTemplate}</pre>
                </div>
              )}

              {tool.responseMapping && (
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Response Mapping
                  </p>
                  <p className="font-mono text-xs text-foreground">{tool.responseMapping}</p>
                </div>
              )}

              {/* Test Result */}
              {testResult && testResult.toolId === tool.id && (
                <div className={cn(
                  "rounded-lg px-3 py-2 font-mono text-xs",
                  testResult.error ? "bg-red-500/10 border border-red-500/30" : "bg-green-500/10 border border-green-500/30"
                )}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {testResult.error ? "Error" : "Test Result"}
                  </p>
                  <pre className={cn(
                    "max-h-40 overflow-auto whitespace-pre-wrap",
                    testResult.error ? "text-red-400" : "text-green-400"
                  )}>
                    {testResult.error || JSON.stringify(testResult.data, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testTool(tool)}
                  disabled={testingTool === tool.id}
                >
                  {testingTool === tool.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(tool)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteTool(tool.id)}
                  disabled={deleting === tool.id}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-400"
                >
                  {deleting === tool.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-[#0C0A09] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">
                {editingTool ? "Edit Tool" : "Add Custom Tool"}
              </h3>
              <button
                onClick={resetForm}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Templates in form */}
            {!editingTool && !formName && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Quick Start Templates</p>
                <div className="flex gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="rounded-lg border border-border bg-card/50 px-3 py-2 text-xs font-medium text-foreground hover:border-purple-500/30 hover:bg-purple-500/5 transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Tool Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Tool Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Weather Lookup"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Will be converted to snake_case for Claude (e.g. weather_lookup)
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Tell Claude when to use this tool..."
                  rows={2}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Method + URL */}
              <div className="flex gap-3">
                <div className="w-32">
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Method
                  </label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://api.example.com/v1/resource?q={{query}}"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono text-xs"
                  />
                </div>
              </div>

              {/* Headers */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Headers
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <button
                    onClick={() => setFormHeaders([...formHeaders, { key: "", value: "" }])}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    + Add Header
                  </button>
                </div>
                {formHeaders.map((h, i) => (
                  <div key={i} className="mb-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={h.key}
                      onChange={(e) => {
                        const copy = [...formHeaders];
                        copy[i].key = e.target.value;
                        setFormHeaders(copy);
                      }}
                      placeholder="Header name"
                      className="w-40 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <input
                      type="text"
                      value={h.value}
                      onChange={(e) => {
                        const copy = [...formHeaders];
                        copy[i].value = e.target.value;
                        setFormHeaders(copy);
                      }}
                      placeholder="Value"
                      className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={() => setFormHeaders(formHeaders.filter((_, j) => j !== i))}
                      className="rounded p-1 text-muted-foreground hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Body Template */}
              {formMethod !== "GET" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Request Body Template
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(JSON with {"{{variable}}"} placeholders)</span>
                  </label>
                  <textarea
                    value={formBodyTemplate}
                    onChange={(e) => setFormBodyTemplate(e.target.value)}
                    placeholder={'{\n  "query": "{{search_term}}",\n  "limit": 10\n}'}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              )}

              {/* Response Mapping */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Response Mapping
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(optional — JSON path to extract)</span>
                </label>
                <input
                  type="text"
                  value={formResponseMapping}
                  onChange={(e) => setFormResponseMapping(e.target.value)}
                  placeholder="data.results[0].name"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveTool}
                disabled={saving || !formName.trim() || !formDescription.trim() || !formUrl.trim()}
              >
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {editingTool ? "Update" : "Create"} Tool
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
