"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

const TEMPLATES = [
  { value: "welcome", label: "Welcome" },
  { value: "password-reset", label: "Password Reset" },
  { value: "invoice", label: "Invoice" },
  { value: "approval-needed", label: "Approval Needed" },
  { value: "monthly-report", label: "Monthly Report" },
  { value: "department-digest", label: "Department Digest" },
] as const;

type TemplateName = (typeof TEMPLATES)[number]["value"];

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  subOrgId?: string | null;
}

interface RenderedPreview {
  subject: string;
  html: string;
  text: string;
}

export function PreviewModal({ open, onClose, subOrgId }: PreviewModalProps) {
  const [template, setTemplate] = useState<TemplateName>("welcome");
  const [rendered, setRendered] = useState<RenderedPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/email-branding/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template, subOrgId: subOrgId || undefined }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error || "Preview failed");
          return;
        }
        setRendered(body.rendered);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, template, subOrgId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="font-serif text-lg text-foreground">Email preview</h2>
            <p className="text-xs text-muted-foreground">
              Renders with your current branding settings.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-border px-5 py-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Template
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value as TemplateName)}
            className="ml-3 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-kiln-orange/40 focus:outline-none"
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Rendering preview…
            </div>
          ) : error ? (
            <div className="p-5 text-sm text-red-400">{error}</div>
          ) : rendered ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-border bg-muted/30 px-5 py-2 text-xs">
                <div className="text-muted-foreground">Subject:</div>
                <div className="text-sm text-foreground">{rendered.subject}</div>
              </div>
              <iframe
                title="Email preview"
                srcDoc={rendered.html}
                className="flex-1 border-0 bg-white"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
