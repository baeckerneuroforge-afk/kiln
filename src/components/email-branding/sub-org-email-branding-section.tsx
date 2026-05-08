"use client";

import { useEffect, useState } from "react";
import { Eye, Loader2, Mail, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { PreviewModal } from "./preview-modal";
import type { EmailBrandOverride } from "@/lib/email/types";

interface Props {
  relationshipId: string;
  readOnly?: boolean;
}

interface OverrideState {
  enabled: boolean;
  brandName: string;
  logoUrl: string;
  brandColor: string;
  fromAddress: string;
  fromName: string;
  replyTo: string;
  footerHtml: string;
  supportLink: string;
}

const EMPTY: OverrideState = {
  enabled: false,
  brandName: "",
  logoUrl: "",
  brandColor: "",
  fromAddress: "",
  fromName: "",
  replyTo: "",
  footerHtml: "",
  supportLink: "",
};

export function SubOrgEmailBrandingSection({
  relationshipId,
  readOnly = false,
}: Props) {
  const { toast } = useToast();
  const [state, setState] = useState<OverrideState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/email-branding/sub-org/${relationshipId}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          toast(body.error || "Failed to load", "error");
          return;
        }
        setState(fromApi(body));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relationshipId, toast]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/email-branding/sub-org/${relationshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPatchPayload(state)),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Save failed", "error");
        return;
      }
      toast("Email branding override saved");
      setState(fromApi(body));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch(`/api/email-branding/sub-org/${relationshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      if (!res.ok) {
        const body = await res.json();
        toast(body.error || "Clear failed", "error");
        return;
      }
      setState(EMPTY);
      toast("Override cleared — agency-level branding will be used");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl bg-card" />;
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      <header>
        <h3 className="flex items-center gap-2 font-medium text-foreground">
          <Mail className="h-4 w-4 text-kiln-orange" />
          Email branding override
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Override agency-level email branding for this customer only.
          When disabled, emails sent in this sub-org&apos;s context use the
          parent agency&apos;s branding.
        </p>
      </header>

      <label className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <span className="text-xs text-foreground">
          Use custom branding for this customer
        </span>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) =>
            setState((s) => ({ ...s, enabled: e.target.checked }))
          }
          disabled={readOnly}
          className="h-4 w-4 accent-kiln-orange"
        />
      </label>

      {state.enabled ? (
        <>
          <Field
            label="Brand name"
            value={state.brandName}
            onChange={(v) => setState((s) => ({ ...s, brandName: v }))}
            placeholder="Customer-facing brand"
            disabled={readOnly}
          />
          <Field
            label="Logo URL"
            value={state.logoUrl}
            onChange={(v) => setState((s) => ({ ...s, logoUrl: v }))}
            placeholder="https://..."
            type="url"
            disabled={readOnly}
          />
          <Field
            label="Brand color"
            value={state.brandColor}
            onChange={(v) => setState((s) => ({ ...s, brandColor: v }))}
            placeholder="#F97316"
            disabled={readOnly}
          />
          <Field
            label="From address"
            value={state.fromAddress}
            onChange={(v) => setState((s) => ({ ...s, fromAddress: v }))}
            placeholder="support@customer-domain.com"
            type="email"
            disabled={readOnly}
          />
          <Field
            label="From name"
            value={state.fromName}
            onChange={(v) => setState((s) => ({ ...s, fromName: v }))}
            placeholder="Customer Support"
            disabled={readOnly}
          />
          <Field
            label="Reply-to"
            value={state.replyTo}
            onChange={(v) => setState((s) => ({ ...s, replyTo: v }))}
            placeholder="hello@customer-domain.com"
            type="email"
            disabled={readOnly}
          />
          <Field
            label="Support link"
            value={state.supportLink}
            onChange={(v) => setState((s) => ({ ...s, supportLink: v }))}
            placeholder="https://customer-domain.com/help"
            type="url"
            disabled={readOnly}
          />
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Footer HTML
            </label>
            <textarea
              value={state.footerHtml}
              onChange={(e) =>
                setState((s) => ({ ...s, footerHtml: e.target.value }))
              }
              rows={3}
              disabled={readOnly}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-kiln-orange/40 focus:outline-none disabled:opacity-60"
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => setPreviewOpen(true)}
          type="button"
        >
          <Eye className="mr-1.5 h-4 w-4" />
          Preview
        </Button>
        {!readOnly && state.enabled ? (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save override
          </Button>
        ) : null}
        {!readOnly && state.enabled ? (
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={saving}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
        ) : null}
      </div>

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        subOrgId={relationshipId}
      />
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "url";
  disabled?: boolean;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: FieldProps) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange/40 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}

function fromApi(body: { enabled: boolean; override: EmailBrandOverride | null }): OverrideState {
  const o = body.override || {};
  return {
    enabled: body.enabled === true,
    brandName: o.brandName ?? "",
    logoUrl: o.logoUrl ?? "",
    brandColor: o.brandColor ?? "",
    fromAddress: o.fromAddress ?? "",
    fromName: o.fromName ?? "",
    replyTo: o.replyTo ?? "",
    footerHtml: o.footerHtml ?? "",
    supportLink: o.supportLink ?? "",
  };
}

function toPatchPayload(state: OverrideState) {
  return {
    brandName: blankToNull(state.brandName),
    logoUrl: blankToNull(state.logoUrl),
    brandColor: blankToNull(state.brandColor),
    fromAddress: blankToNull(state.fromAddress),
    fromName: blankToNull(state.fromName),
    replyTo: blankToNull(state.replyTo),
    footerHtml: blankToNull(state.footerHtml),
    supportLink: blankToNull(state.supportLink),
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
