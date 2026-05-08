"use client";

import { useEffect, useState } from "react";
import { Eye, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { PreviewModal } from "./preview-modal";

export interface EmailBrandingFormState {
  emailFromAddress: string;
  emailFromName: string;
  emailReplyTo: string;
  emailFooterHtml: string;
  emailSupportLink: string;
}

const EMPTY_STATE: EmailBrandingFormState = {
  emailFromAddress: "",
  emailFromName: "",
  emailReplyTo: "",
  emailFooterHtml: "",
  emailSupportLink: "",
};

interface EmailBrandingFormProps {
  /** Title rendered above the form. */
  title: string;
  /** Optional helper text under the title. */
  description?: string;
  /** Endpoint to GET/PATCH branding values. */
  endpoint: string;
  /** When true, the preview pulls the sub-org override too. */
  subOrgId?: string;
  /** Read-only (sub-org viewer). */
  disabled?: boolean;
}

export function EmailBrandingForm({
  title,
  description,
  endpoint,
  subOrgId,
  disabled = false,
}: EmailBrandingFormProps) {
  const { toast } = useToast();
  const [state, setState] = useState<EmailBrandingFormState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(
    null
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(endpoint);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          toast(body.error || "Failed to load", "error");
          return;
        }
        setState({
          emailFromAddress: body.emailFromAddress ?? "",
          emailFromName: body.emailFromName ?? "",
          emailReplyTo: body.emailReplyTo ?? "",
          emailFooterHtml: body.emailFooterHtml ?? "",
          emailSupportLink: body.emailSupportLink ?? "",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, toast]);

  useEffect(() => {
    const address = state.emailFromAddress.trim();
    if (!address.includes("@")) {
      setVerificationStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/email-branding/from-address-status?address=${encodeURIComponent(address)}`
        );
        const body = await res.json();
        if (cancelled) return;
        if (!body.ok) {
          setVerificationStatus("unknown");
          return;
        }
        setVerificationStatus(
          body.verified ? "verified" : body.reason || "not_verified"
        );
      } catch {
        if (!cancelled) setVerificationStatus("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.emailFromAddress]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPatchPayload(state)),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Save failed", "error");
        return;
      }
      toast("Email branding saved");
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
        <h2 className="font-serif text-xl text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>

      <Field
        label="From address"
        helper="Must be verified in Resend. Falls back to KILN's noreply when invalid."
        value={state.emailFromAddress}
        onChange={(v) => setState((s) => ({ ...s, emailFromAddress: v }))}
        placeholder="support@your-domain.com"
        type="email"
        disabled={disabled}
      />
      {state.emailFromAddress && verificationStatus ? (
        <p
          className={
            verificationStatus === "verified"
              ? "text-xs text-emerald-400"
              : "text-xs text-amber-400"
          }
        >
          Resend status:{" "}
          <strong>{verificationStatus}</strong>
          {verificationStatus !== "verified" && verificationStatus !== "unknown" ? (
            <>
              {" "}— add this domain in your Resend dashboard before sending.
            </>
          ) : null}
        </p>
      ) : null}

      <Field
        label="From name"
        value={state.emailFromName}
        onChange={(v) => setState((s) => ({ ...s, emailFromName: v }))}
        placeholder="Acme Support"
        disabled={disabled}
      />

      <Field
        label="Reply-to (optional)"
        value={state.emailReplyTo}
        onChange={(v) => setState((s) => ({ ...s, emailReplyTo: v }))}
        placeholder="hello@your-domain.com"
        type="email"
        disabled={disabled}
      />

      <Field
        label="Support link (optional)"
        helper="https URL shown in the email footer."
        value={state.emailSupportLink}
        onChange={(v) => setState((s) => ({ ...s, emailSupportLink: v }))}
        placeholder="https://your-domain.com/support"
        type="url"
        disabled={disabled}
      />

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Footer HTML
        </label>
        <textarea
          value={state.emailFooterHtml}
          onChange={(e) =>
            setState((s) => ({ ...s, emailFooterHtml: e.target.value }))
          }
          placeholder="© Your Brand 2026 · 1 Hauptstraße, 35390 Gießen"
          disabled={disabled}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-kiln-orange/40 focus:outline-none disabled:opacity-60"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          HTML allowed. Used at the bottom of every transactional email.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => setPreviewOpen(true)}
          type="button"
        >
          <Eye className="mr-1.5 h-4 w-4" />
          Preview
        </Button>
        {!disabled ? (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save
          </Button>
        ) : null}
      </div>

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        subOrgId={subOrgId ?? null}
      />
    </div>
  );
}

interface FieldProps {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "url";
  disabled?: boolean;
}

function Field({
  label,
  helper,
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
      {helper ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function toPatchPayload(state: EmailBrandingFormState) {
  return {
    emailFromAddress: nullIfBlank(state.emailFromAddress),
    emailFromName: nullIfBlank(state.emailFromName),
    emailReplyTo: nullIfBlank(state.emailReplyTo),
    emailFooterHtml: nullIfBlank(state.emailFooterHtml),
    emailSupportLink: nullIfBlank(state.emailSupportLink),
  };
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
