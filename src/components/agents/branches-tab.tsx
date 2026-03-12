"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Branch {
  name: string;
  keywords: string[];
  promptSnippet: string;
  enabled: boolean;
}

const BRANCH_COLORS = [
  "border-blue-500/40 bg-blue-500/5",
  "border-purple-500/40 bg-purple-500/5",
  "border-green-500/40 bg-green-500/5",
  "border-pink-500/40 bg-pink-500/5",
  "border-yellow-500/40 bg-yellow-500/5",
  "border-cyan-500/40 bg-cyan-500/5",
  "border-red-500/40 bg-red-500/5",
  "border-indigo-500/40 bg-indigo-500/5",
];

const BADGE_COLORS = [
  "bg-blue-500/10 text-blue-400",
  "bg-purple-500/10 text-purple-400",
  "bg-green-500/10 text-green-400",
  "bg-pink-500/10 text-pink-400",
  "bg-yellow-500/10 text-yellow-400",
  "bg-cyan-500/10 text-cyan-400",
  "bg-red-500/10 text-red-400",
  "bg-indigo-500/10 text-indigo-400",
];

const DEFAULT_TEMPLATES: Branch[] = [
  {
    name: "Pricing Questions",
    keywords: ["price", "cost", "budget", "pricing", "how much", "expensive", "cheap", "plan", "subscription"],
    promptSnippet: "Present pricing tiers clearly with specific numbers. Highlight the value proposition of each tier. If the user seems hesitant about cost, emphasize ROI and what they get. Always offer to connect them with sales for custom pricing.",
    enabled: true,
  },
  {
    name: "Booking Requests",
    keywords: ["book", "appointment", "schedule", "meeting", "call", "demo", "consultation"],
    promptSnippet: "Guide the user toward booking an appointment. Be proactive about suggesting available times. Make the booking process feel easy and low-commitment. Emphasize what they'll get from the meeting.",
    enabled: true,
  },
  {
    name: "Technical Questions",
    keywords: ["API", "integrate", "code", "developer", "SDK", "webhook", "technical", "documentation"],
    promptSnippet: "Provide technical details with precision. Use code examples where helpful. Link to documentation when available. If the question is beyond your knowledge, offer to connect them with the technical team.",
    enabled: true,
  },
];

interface BranchesTabProps {
  branches: Branch[];
  onChange: (branches: Branch[]) => void;
}

export function BranchesTab({ branches, onChange }: BranchesTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formSnippet, setFormSnippet] = useState("");

  function resetForm() {
    setFormName("");
    setFormKeywords("");
    setFormSnippet("");
    setShowAddForm(false);
    setEditingIndex(null);
  }

  function handleAdd() {
    if (!formName.trim() || !formKeywords.trim() || !formSnippet.trim()) return;

    const keywords = formKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    const newBranch: Branch = {
      name: formName.trim(),
      keywords,
      promptSnippet: formSnippet.trim(),
      enabled: true,
    };

    if (editingIndex !== null) {
      const updated = [...branches];
      updated[editingIndex] = { ...newBranch, enabled: branches[editingIndex].enabled };
      onChange(updated);
    } else {
      onChange([...branches, newBranch]);
    }
    resetForm();
  }

  function startEdit(index: number) {
    const b = branches[index];
    setFormName(b.name);
    setFormKeywords(b.keywords.join(", "));
    setFormSnippet(b.promptSnippet);
    setEditingIndex(index);
    setShowAddForm(true);
  }

  function deleteBranch(index: number) {
    onChange(branches.filter((_, i) => i !== index));
  }

  function toggleBranch(index: number) {
    const updated = [...branches];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onChange(updated);
  }

  function loadTemplates() {
    // Only add templates that don't already exist by name
    const existingNames = new Set(branches.map((b) => b.name));
    const newBranches = DEFAULT_TEMPLATES.filter((t) => !existingNames.has(t.name));
    if (newBranches.length > 0) {
      onChange([...branches, ...newBranches]);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-kiln-orange" />
            Prompt Branches
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Inject conditional instructions into the system prompt based on keyword matches in the user&apos;s message.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {branches.length === 0 && (
            <Button size="sm" variant="outline" onClick={loadTemplates}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Load Templates
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Branch
          </Button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="rounded-xl border border-kiln-orange/30 bg-kiln-orange/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              {editingIndex !== null ? "Edit Branch" : "New Branch"}
            </h4>
            <button
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Branch Name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Pricing Questions"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Trigger Keywords (comma-separated)
            </label>
            <input
              type="text"
              value={formKeywords}
              onChange={(e) => setFormKeywords(e.target.value)}
              placeholder="e.g. price, cost, budget, how much"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Case-insensitive. If any keyword appears in the user&apos;s message, this branch activates.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Prompt Snippet
            </label>
            <textarea
              value={formSnippet}
              onChange={(e) => setFormSnippet(e.target.value)}
              placeholder="Instructions that will be appended to the system prompt when this branch matches..."
              rows={4}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!formName.trim() || !formKeywords.trim() || !formSnippet.trim()}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {editingIndex !== null ? "Save Changes" : "Add Branch"}
            </Button>
          </div>
        </div>
      )}

      {/* Branch List */}
      {branches.length > 0 ? (
        <div className="space-y-3">
          {branches.map((branch, index) => {
            const colorIdx = index % BRANCH_COLORS.length;
            return (
              <div
                key={`${branch.name}-${index}`}
                className={`rounded-xl border p-4 transition-all ${
                  branch.enabled
                    ? BRANCH_COLORS[colorIdx]
                    : "border-border/50 bg-muted/10 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        {branch.name}
                      </h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        branch.enabled
                          ? BADGE_COLORS[colorIdx]
                          : "bg-muted/30 text-muted-foreground"
                      }`}>
                        {branch.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {branch.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-full border border-border/50 bg-card/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                      {branch.promptSnippet}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    <button
                      onClick={() => toggleBranch(index)}
                      className={`rounded-lg p-1.5 transition-colors ${
                        branch.enabled
                          ? "text-green-500 hover:bg-green-500/10"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      title={branch.enabled ? "Disable" : "Enable"}
                    >
                      <div className={`h-3 w-3 rounded-full border-2 ${
                        branch.enabled
                          ? "border-green-500 bg-green-500"
                          : "border-muted-foreground"
                      }`} />
                    </button>
                    <button
                      onClick={() => startEdit(index)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteBranch(index)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No branches yet. Add branches to dynamically adjust your agent&apos;s behavior based on what the user is asking about.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={loadTemplates}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Start with Templates
          </Button>
        </div>
      )}

      {/* Info */}
      {branches.length > 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card/30 p-3">
          <p className="text-[10px] text-muted-foreground">
            When a user&apos;s message contains any of a branch&apos;s keywords, the prompt snippet is appended to the system prompt.
            Multiple branches can match simultaneously. Branches are checked case-insensitively as whole words.
          </p>
        </div>
      )}
    </div>
  );
}
