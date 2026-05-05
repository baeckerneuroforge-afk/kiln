"use client";

/**
 * Agency → Branding page.
 *
 * Form-based editor for the agency's white-label branding. Sub-orgs of
 * this agency render the configured logo + name in their sidebar
 * automatically (read via GET /api/agency/branding from the sub-org
 * context, where the endpoint returns the parent's branding with
 * isInherited: true).
 *
 * Logo is a URL field for now — a proper file uploader (S3/Supabase
 * storage) lands in a follow-up. The agencyName falls back to the org's
 * Clerk name when null.
 */
import { useEffect, useState } from "react";
import { Loader2, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { CustomDomainSection } from "@/components/agency/custom-domain-section";

type Branding = {
  logoUrl: string | null;
  primaryColor: string | null;
  showAgencyLogo: boolean;
  agencyName: string | null;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function AgencyBrandingPage() {
  const { toast } = useToast();

  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [showAgencyLogo, setShowAgencyLogo] = useState(true);
  const [agencyName, setAgencyName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInherited, setIsInherited] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/agency/branding");
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || "Failed to load branding");
          return;
        }
        setIsInherited(Boolean(body.isInherited));
        const b: Branding | null = body.branding;
        if (b) {
          setLogoUrl(b.logoUrl ?? "");
          setPrimaryColor(b.primaryColor ?? "");
          setShowAgencyLogo(b.showAgencyLogo);
          setAgencyName(b.agencyName ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    if (primaryColor && !HEX_RE.test(primaryColor)) {
      toast("Primary color must be a 6-digit hex like #F97316", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/agency/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: logoUrl.trim() || null,
          primaryColor: primaryColor.trim() || null,
          showAgencyLogo,
          agencyName: agencyName.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Save failed", "error");
        return;
      }
      toast("Branding saved");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-32 animate-pulse rounded-xl bg-card" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Palette className="h-5 w-5 text-kiln-orange" />
          Branding
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the logo and accent color your client workspaces see in
          their sidebar.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isInherited && (
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-400">
          You&apos;re viewing branding inherited from your parent agency.
          Switch to the agency org to edit.
        </div>
      )}

      <div className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Agency name
          </label>
          <input
            type="text"
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            placeholder="Acme Agency"
            disabled={isInherited}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange/40 focus:outline-none disabled:opacity-60"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Shown next to the logo in client workspace sidebars.
          </p>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Logo URL
          </label>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://your-cdn.com/logo.svg"
            disabled={isInherited}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange/40 focus:outline-none disabled:opacity-60"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Recommended: SVG or PNG, max 256px wide. A proper uploader is
            coming in a follow-up.
          </p>
          {logoUrl && (
            <div className="mt-3 flex h-16 w-fit items-center justify-center rounded-lg border border-border bg-background px-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo preview"
                className="max-h-12 max-w-[200px] object-contain"
              />
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Primary color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#F97316"
              disabled={isInherited}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-kiln-orange/40 focus:outline-none disabled:opacity-60"
            />
            <div
              className="h-9 w-9 rounded-lg border border-border"
              style={{
                backgroundColor: HEX_RE.test(primaryColor)
                  ? primaryColor
                  : "transparent",
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Hex format (e.g. <code>#F97316</code>). Leave blank to use KILN
            default.
          </p>
        </div>

        <label className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <span className="text-xs text-foreground">
            Show agency logo in client workspaces
            <span className="ml-1.5 text-muted-foreground">
              (replaces the KILN brand mark in their sidebar)
            </span>
          </span>
          <input
            type="checkbox"
            checked={showAgencyLogo}
            onChange={(e) => setShowAgencyLogo(e.target.checked)}
            disabled={isInherited}
            className="h-4 w-4 accent-kiln-orange"
          />
        </label>

        {!isInherited && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Save branding
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <CustomDomainSection isInherited={isInherited} />
      </div>
    </div>
  );
}
