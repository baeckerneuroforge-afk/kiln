"use client";

/**
 * Sprint 19.8.1 — DNS-Record-Setup-Anleitung.
 *
 * The DACH-priority providers (Squarespace, IONOS, Cloudflare,
 * Namecheap, Strato) get explicit step-by-step copy. Everyone else
 * lands on a generic fallback with a link to their provider docs.
 *
 * The component renders three sub-components:
 *   1. A stepper showing "Login → CNAME → Verify"
 *   2. A copyable record block (CNAME or A depending on the hostname)
 *   3. A provider-tabs accordion with per-provider walkthroughs
 *   4. A troubleshooting section covering the typical DACH issue:
 *      Cloudflare's orange-cloud proxy mode being active.
 *
 * Pure presentational — no fetch, no state mutation. Parent owns the
 * dnsHint shape.
 */
import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DnsHint {
  type: "CNAME" | "A";
  name: string;
  value: string;
}

type ProviderKey =
  | "squarespace"
  | "ionos"
  | "cloudflare"
  | "namecheap"
  | "strato"
  | "other";

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  squarespace: "Squarespace",
  ionos: "IONOS",
  cloudflare: "Cloudflare",
  namecheap: "Namecheap",
  strato: "Strato",
  other: "Anderer Provider",
};

export function DnsSetupInstructions({ dnsHint }: { dnsHint: DnsHint }) {
  return (
    <div className="space-y-6" data-testid="dns-setup-instructions">
      <Stepper />
      <RecordBlock dnsHint={dnsHint} />
      <ProviderAccordion dnsHint={dnsHint} />
      <Troubleshooting />
    </div>
  );
}

function Stepper() {
  const steps = [
    { n: 1, label: "Login bei deinem DNS-Provider" },
    { n: 2, label: "CNAME-Record hinzufügen" },
    { n: 3, label: "Hier Verify klicken" },
  ];
  return (
    <ol
      className="flex items-center gap-3 text-xs text-muted-foreground"
      data-testid="dns-stepper"
    >
      {steps.map((s, idx) => (
        <li key={s.n} className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card font-medium text-foreground">
            {s.n}
          </span>
          <span>{s.label}</span>
          {idx < steps.length - 1 && (
            <span className="h-px w-6 bg-border" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}

function RecordBlock({ dnsHint }: { dnsHint: DnsHint }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="dns-record-block"
    >
      <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
        Diesen Record bei deinem DNS-Provider anlegen
      </p>
      <dl className="space-y-2 font-mono text-sm">
        <RecordRow label="Type" value={dnsHint.type} />
        <RecordRow label="Name" value={dnsHint.name} />
        <RecordRow label="Value" value={dnsHint.value} copyable />
        <RecordRow label="TTL" value="3600" />
      </dl>
    </div>
  );
}

function RecordRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (incognito, permissions). Silently no-op.
    }
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="w-20 text-muted-foreground">{label}</dt>
      <dd className="flex flex-1 items-center justify-between gap-2 text-foreground">
        <span data-testid={`dns-record-${label.toLowerCase()}`}>{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            className={cn(
              "flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs",
              copied ? "text-green-400" : "text-muted-foreground",
            )}
            data-testid={`dns-record-copy-${label.toLowerCase()}`}
            aria-label={`${label} kopieren`}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Kopiert" : "Kopieren"}
          </button>
        )}
      </dd>
    </div>
  );
}

function ProviderAccordion({ dnsHint }: { dnsHint: DnsHint }) {
  const [open, setOpen] = useState<ProviderKey | null>(null);
  const providers: ProviderKey[] = [
    "squarespace",
    "ionos",
    "cloudflare",
    "namecheap",
    "strato",
    "other",
  ];
  return (
    <div
      className="rounded-lg border border-border bg-card"
      data-testid="dns-provider-accordion"
    >
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">
          Wie setze ich das ein?
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Wähle deinen DNS-Provider für eine Schritt-für-Schritt-Anleitung.
        </p>
      </div>
      {providers.map((p) => {
        const isOpen = open === p;
        return (
          <div
            key={p}
            className="border-b border-border last:border-b-0"
            data-testid={`dns-provider-${p}`}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : p)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
              aria-expanded={isOpen}
              data-testid={`dns-provider-toggle-${p}`}
            >
              <span className="font-medium text-foreground">
                {PROVIDER_LABELS[p]}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {isOpen && (
              <div
                className="px-4 pb-4 text-sm text-muted-foreground"
                data-testid={`dns-provider-content-${p}`}
              >
                <ProviderContent provider={p} dnsHint={dnsHint} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProviderContent({
  provider,
  dnsHint,
}: {
  provider: ProviderKey;
  dnsHint: DnsHint;
}) {
  const steps = PROVIDER_STEPS[provider](dnsHint);
  return (
    <ol className="ml-5 list-decimal space-y-2">
      {steps.map((step, idx) => (
        <li key={idx}>
          {step.text}
          {step.warning && (
            <p className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              ⚠ {step.warning}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

interface ProviderStep {
  text: React.ReactNode;
  warning?: string;
}

const PROVIDER_STEPS: Record<
  ProviderKey,
  (dnsHint: DnsHint) => ProviderStep[]
> = {
  squarespace: () => [
    {
      text: "Squarespace-Dashboard öffnen → Settings → Domains → deine Domain wählen",
    },
    { text: "DNS Settings anklicken" },
    {
      text: "Add Record → Type CNAME, Host = der Name oben, Data = der Value oben",
    },
    { text: "Save klicken und 5–15 Minuten DNS-Propagation abwarten" },
  ],
  ionos: () => [
    { text: "IONOS-Kundencenter öffnen → Menü → Domains & SSL" },
    {
      text: "Bei deiner Domain das Drei-Punkt-Menü öffnen → DNS",
    },
    {
      text: "Record hinzufügen → Typ CNAME, Hostname = der Name, Wert = der Value, TTL 3600",
    },
    { text: "Speichern. Propagation oft <5 Minuten." },
  ],
  cloudflare: (hint) => [
    { text: "Cloudflare-Dashboard öffnen → deine Domain wählen → DNS Tab" },
    {
      text: `Add record → Type ${hint.type}, Name = ${hint.name}, Target = ${hint.value}`,
    },
    {
      text: "WICHTIG: Den Proxy-Status (orange Wolke) auf grau (DNS only) setzen, sonst schlägt SSL fehl.",
      warning:
        "Aktive orange Wolke = häufigster Fehler bei Cloudflare. Klicke darauf, sie wird grau.",
    },
    { text: "Save. Cloudflare propagiert meist sofort." },
  ],
  namecheap: (hint) => [
    { text: "Namecheap-Dashboard → Domain List → bei deiner Domain auf Manage" },
    { text: "Tab Advanced DNS → Add New Record" },
    {
      text: `Type CNAME, Host = ${hint.name}, Value = ${hint.value}, TTL Automatic`,
    },
    { text: "Save (grünes Häkchen rechts). 30 Minuten Propagation üblich." },
  ],
  strato: () => [
    { text: "Strato Kunden-Login → Domainverwaltung → deine Domain" },
    {
      text: "DNS-Verwaltung → CNAME-Records bearbeiten → neue Zeile hinzufügen",
    },
    { text: "Subdomain = der Name oben, Ziel = der Value oben" },
    { text: "Speichern. Strato-DNS kann bis zu 60 Minuten brauchen." },
  ],
  other: () => [
    {
      text: "Bei deinem DNS-Provider die DNS-Einstellungen (oft Zone Editor oder Custom Records genannt) öffnen.",
    },
    {
      text: "Einen neuen CNAME- oder A-Record gemäss der Tabelle oben anlegen.",
    },
    {
      text: (
        <span>
          Ungewiss? Suche{" "}
          <span className="font-mono text-foreground">
            [provider] CNAME setzen
          </span>{" "}
          in einer Suchmaschine, oder schreib uns kurz unter{" "}
          <a
            href="mailto:support@kilnbase.com"
            className="text-kiln-orange hover:underline"
          >
            support@kilnbase.com
          </a>
          .
        </span>
      ),
    },
  ],
};

function Troubleshooting() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-lg border border-border bg-card"
      data-testid="dns-troubleshooting"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
        aria-expanded={open}
      >
        <span className="font-medium text-foreground">Troubleshooting</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className="space-y-3 px-4 pb-4 text-sm text-muted-foreground"
          data-testid="dns-troubleshooting-content"
        >
          <div>
            <p className="font-medium text-foreground">DNS-Verify schlägt fehl</p>
            <ul className="ml-5 mt-1 list-disc space-y-1">
              <li>Hast du den Record beim richtigen Provider angelegt? Domain-Registrar und DNS-Provider sind oft verschieden.</li>
              <li>Cloudflare? Proxy auf DNS only stellen (graue Wolke).</li>
              <li>Falscher Eintrag-Typ? Sub-Domains brauchen CNAME, Apex-Domains A-Record.</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground">Wie lange dauert das?</p>
            <p className="mt-1">
              Meist 5–30 Minuten. Strato + IONOS sind manchmal länger (bis 60 Min).
              Cloudflare propagiert quasi sofort.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">DNS-Settings nicht gefunden</p>
            <p className="mt-1">
              Dein Hosting-Provider und dein DNS-Provider können verschieden sein.
              Beispiel: Domain bei IONOS, Hosting bei Strato — DNS-Einstellungen
              musst du bei IONOS machen, nicht bei Strato.
            </p>
          </div>
          <p className="pt-2">
            Wenn nichts hilft:{" "}
            <a
              href="mailto:support@kilnbase.com"
              className="inline-flex items-center gap-1 text-kiln-orange hover:underline"
            >
              support@kilnbase.com <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
