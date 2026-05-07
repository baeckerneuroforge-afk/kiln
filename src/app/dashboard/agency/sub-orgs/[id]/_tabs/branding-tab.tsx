"use client";

/**
 * Branding tab — read/write logo + primary color + agency-logo flag,
 * plus a read-only view of the custom-domain status. Domain
 * configuration itself still lives behind the standard
 * /dashboard/agency/branding flow because it requires the agency owner
 * to be active in that org (Vercel API + DNS propagation).
 *
 * Live preview shows what the sub-org's workspace shell will look like
 * for end users with the chosen color and logo applied.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Globe,
  Image as ImageIcon,
  Loader2,
  Palette,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

type Branding = {
  logoUrl: string | null;
  primaryColor: string | null;
  showAgencyLogo: boolean;
  agencyName: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  domainVerifiedAt: string | null;
};

interface BrandingTabProps {
  subOrgId: string;
  childOrgId: string;
  readOnly: boolean;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HTTPS_URL_RE = /^https:\/\/[^\s<>"]+$/;

export function BrandingTab({
  subOrgId,
  childOrgId,
  readOnly,
}: BrandingTabProps) {
  const { toast } = useToast();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [showAgencyLogo, setShowAgencyLogo] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/agency/sub-orgs/${subOrgId}/branding`);
    if (res.ok) {
      const body = (await res.json()) as Branding;
      setBranding(body);
      setLogoUrl(body.logoUrl || "");
      setPrimaryColor(body.primaryColor || "");
      setShowAgencyLogo(body.showAgencyLogo);
    }
    setLoading(false);
  }, [subOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (logoUrl && !HTTPS_URL_RE.test(logoUrl)) {
      toast("Logo URL must be a valid https://… URL", "error");
      return;
    }
    if (primaryColor && !HEX_RE.test(primaryColor)) {
      toast("Primary color must be a 6-digit hex like #F97316", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/agency/sub-orgs/${subOrgId}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          primaryColor: primaryColor || null,
          showAgencyLogo,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Save failed", "error");
        return;
      }
      setBranding(body);
      toast("Branding updated");
    } finally {
      setSaving(false);
    }
  };

  const copyOnboardingLink = async () => {
    try {
      const url = `${window.location.origin}/onboarding/${childOrgId}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1200);
    } catch {
      toast("Could not copy to clipboard", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card/60">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Final-render values for the preview — fall back to defaults so the
  // preview is meaningful even before the operator has saved anything.
  const previewColor = primaryColor && HEX_RE.test(primaryColor)
    ? primaryColor
    : "#F97316";
  const previewLogo = logoUrl && HTTPS_URL_RE.test(logoUrl) ? logoUrl : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]" data-testid="branding-tab">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ImageIcon className="h-4 w-4" />
            Logo & color
          </h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Logo URL
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                disabled={readOnly}
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none disabled:opacity-50"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                PNG or SVG, https URL. Square or wide formats both work.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Primary color
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="color"
                  value={
                    primaryColor && HEX_RE.test(primaryColor)
                      ? primaryColor
                      : "#F97316"
                  }
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  disabled={readOnly}
                  className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent disabled:opacity-50"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#F97316"
                  disabled={readOnly}
                  className="w-32 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-kiln-orange focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={showAgencyLogo}
                onChange={(e) => setShowAgencyLogo(e.target.checked)}
                disabled={readOnly}
                className="h-3.5 w-3.5 rounded border-border accent-kiln-orange"
              />
              <span>Show &quot;Powered by KILN&quot; in client&apos;s workspace</span>
            </label>
          </div>

          {!readOnly && (
            <div className="mt-5 flex justify-end">
              <Button onClick={save} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3 w-3" />
                )}
                Save branding
              </Button>
            </div>
          )}
        </div>

        {/* Custom domain status */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Globe className="h-4 w-4" />
            Custom domain
          </h3>
          {branding?.customDomain ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-foreground">
                {branding.customDomain}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  branding.domainVerified
                    ? "bg-green-500/15 text-green-400"
                    : "bg-amber-500/15 text-amber-400",
                )}
              >
                {branding.domainVerified ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </>
                ) : (
                  "Pending"
                )}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No custom domain configured. Use the standard branding flow to
              add one.
            </p>
          )}
          <Link
            href="/dashboard/agency/branding"
            className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage custom domains →
          </Link>
        </div>

        {/* Onboarding link helper */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Send to client
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Public onboarding URL — share this link to invite the end user
            into the workspace.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {typeof window !== "undefined"
                ? `${window.location.origin}/onboarding/${childOrgId}`
                : `/onboarding/${childOrgId}`}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={copyOnboardingLink}
              className="gap-1.5"
            >
              {linkCopied ? (
                <CheckCircle2 className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {linkCopied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Palette className="h-3.5 w-3.5" />
          Live preview
        </h3>
        <div
          className="mt-3 overflow-hidden rounded-lg border border-border"
          style={{ background: "hsl(var(--background))" }}
        >
          <div
            className="flex items-center gap-2 border-b border-border px-3 py-2"
            style={{ backgroundColor: previewColor + "15" }}
          >
            {previewLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewLogo}
                alt="logo"
                className="h-6 w-auto"
              />
            ) : (
              <div
                className="h-6 w-6 rounded"
                style={{ backgroundColor: previewColor }}
              />
            )}
            <span className="text-xs font-medium text-foreground">
              {branding?.agencyName || "Workspace"}
            </span>
          </div>
          <div className="p-4 text-xs">
            <div
              className="inline-block rounded-md px-3 py-1.5 text-white text-[11px] font-medium"
              style={{ backgroundColor: previewColor }}
            >
              Primary action
            </div>
            <p className="mt-3 text-muted-foreground">
              Buttons, links, and accents pick up the primary color across the
              client&apos;s sign-in, dashboard, and chat embed.
            </p>
            {showAgencyLogo && (
              <p className="mt-4 text-[10px] text-muted-foreground/70">
                Powered by KILN
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
