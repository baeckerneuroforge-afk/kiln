"use client";

/**
 * Sprint 19.7.4 — Integrations-page tabs (client component).
 *
 *   1. API Keys      — Add/list/delete provider keys (encrypted at rest)
 *   2. OAuth         — Connect status per provider (deep callback work
 *                      is staged for Sprint 19.7.5; this tab shows
 *                      what's planned + lets the agency-tier Module
 *                      Settings keep doing its job today).
 *   3. Module Settings — link back to /dashboard/agency/sub-orgs/[id]/modules
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  KeyRound,
  Cable,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Loader2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

interface ApiKeyEntry {
  id: string;
  provider: "ANTHROPIC" | "OPENAI" | "GOOGLE" | "AZURE_OPENAI" | "OTHER";
  label: string;
  preview: string;
  createdAt: string;
}

const PROVIDER_LABELS: Record<ApiKeyEntry["provider"], string> = {
  ANTHROPIC: "Anthropic",
  OPENAI: "OpenAI",
  GOOGLE: "Google",
  AZURE_OPENAI: "Azure OpenAI",
  OTHER: "Other",
};

const OAUTH_PROVIDERS: Array<{
  id: string;
  name: string;
  blurb: string;
}> = [
  { id: "gmail", name: "Gmail", blurb: "Send + receive emails for agents." },
  { id: "google-calendar", name: "Google Calendar", blurb: "Booking + reminders." },
  { id: "slack", name: "Slack", blurb: "Channel updates + notifications." },
  { id: "hubspot", name: "HubSpot", blurb: "Sync leads + contacts." },
  { id: "notion", name: "Notion", blurb: "Pull docs into Knowledge." },
];

type Tab = "api-keys" | "oauth" | "modules";

interface Props {
  subOrgId: string;
  agencyOrgPath: string;
  canManage: boolean;
}

export function IntegrationsTabs({ subOrgId, agencyOrgPath, canManage }: Props) {
  const [tab, setTab] = useState<Tab>("api-keys");
  return (
    <div>
      <nav className="mb-6 inline-flex rounded-lg border border-border bg-card/40 p-1" data-testid="integrations-tabs">
        {(
          [
            { id: "api-keys", label: "API Keys", icon: KeyRound },
            { id: "oauth", label: "OAuth", icon: Cable },
            { id: "modules", label: "Module Settings", icon: SettingsIcon },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              data-testid={`integrations-tab-${id}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </nav>

      {tab === "api-keys" && <ApiKeysTab subOrgId={subOrgId} canManage={canManage} />}
      {tab === "oauth" && <OAuthTab canManage={canManage} />}
      {tab === "modules" && <ModulesTab agencyOrgPath={agencyOrgPath} />}
    </div>
  );
}

function ApiKeysTab({ subOrgId, canManage }: { subOrgId: string; canManage: boolean }) {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<ApiKeyEntry["provider"]>("ANTHROPIC");
  const [label, setLabel] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sub-orgs/${subOrgId}/api-keys`);
      if (!res.ok) {
        setError("Konnte API-Keys nicht laden.");
        return;
      }
      const data = await res.json();
      setKeys(data.keys ?? []);
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subOrgId]);

  async function handleAdd() {
    if (!label.trim() || !keyValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-orgs/${subOrgId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, label: label.trim(), key: keyValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Konnte Key nicht speichern.");
        return;
      }
      setAdding(false);
      setLabel("");
      setKeyValue("");
      setError(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(keyId: string) {
    const res = await fetch(`/api/sub-orgs/${subOrgId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Konnte Key nicht löschen.");
      return;
    }
    await load();
  }

  return (
    <div data-testid="integrations-api-keys-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          BYO LLM-Provider-Keys. Werden AES-256-GCM verschlüsselt gespeichert und
          niemals im Klartext zurückgegeben.
        </p>
        {canManage ? (
          <Button onClick={() => setAdding((v) => !v)} variant={adding ? "outline" : "default"}>
            <Plus className="mr-1 h-4 w-4" /> {adding ? "Abbrechen" : "API Key hinzufügen"}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Nur Lesen
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {adding && canManage && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4" data-testid="integrations-api-keys-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Provider</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ApiKeyEntry["provider"])}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {(Object.keys(PROVIDER_LABELS) as Array<ApiKeyEntry["provider"]>).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Production"
                maxLength={80}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Key</span>
              <input
                type="password"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
                data-testid="integrations-api-keys-input-key"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdding(false)}>Abbrechen</Button>
            <Button onClick={handleAdd} disabled={saving || !label.trim() || !keyValue.trim()}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lädt…
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center" data-testid="integrations-api-keys-empty">
          <KeyRound className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Noch keine API-Keys.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canManage
              ? "Füge deinen ersten Provider-Key hinzu."
              : "Kontaktiere deine Agency, um Keys zu hinterlegen."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="integrations-api-keys-list">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {PROVIDER_LABELS[k.provider]} · {k.label}
                </p>
                <p className="mt-0.5 text-xs font-mono text-muted-foreground">{k.preview}</p>
              </div>
              {canManage && (
                <button
                  onClick={() => handleDelete(k.id)}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`Delete ${k.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OAuthTab({ canManage }: { canManage: boolean }) {
  return (
    <div data-testid="integrations-oauth-panel">
      <p className="mb-4 text-sm text-muted-foreground">
        OAuth-Konnektoren pro Sub-Org. Verbindungen werden separat verwaltet —
        eine Agency kann z.B. unterschiedliche Slack-Workspaces pro Sub-Org
        anbinden. Connect-Flow + tiefe Callback-Verknüpfung kommen in Sprint 19.7.5.
      </p>
      <div className="space-y-2">
        {OAUTH_PROVIDERS.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            data-testid={`integrations-oauth-row-${p.id}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{p.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.blurb}</p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs",
                canManage
                  ? "border-border bg-card/40 text-muted-foreground"
                  : "border-border bg-muted/40 text-muted-foreground/70",
              )}
            >
              {canManage ? "Coming in 19.7.5" : (<><Lock className="h-3 w-3" /> Nur Lesen</>)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModulesTab({ agencyOrgPath }: { agencyOrgPath: string }) {
  return (
    <div data-testid="integrations-modules-panel" className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
      <SettingsIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">
        Module Settings (AI / SMS / Voice / WhatsApp).
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Konfiguration läuft heute über die Agency-Seite. Wir konsolidieren sie
        in Sprint 19.7.5 in diese Page.
      </p>
      <div className="mt-4 flex justify-center">
        <Link href={agencyOrgPath} className={buttonVariants({ variant: "outline" })} data-testid="integrations-modules-link">
          Im Agency-Backend verwalten
        </Link>
      </div>
    </div>
  );
}
