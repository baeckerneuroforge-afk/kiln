"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Globe, Search, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Code, Zap, Copy,
  ExternalLink, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface ApiEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
}

interface TestResult {
  endpoint: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

interface DiscoveryDetail {
  id: string;
  serviceName: string;
  docsUrl?: string;
  status: string;
  apiSpec?: {
    serviceName: string;
    baseUrl: string;
    auth: { type: string; headerName?: string };
    endpoints: ApiEndpoint[];
  };
  generatedCode?: string;
  toolDefinitions?: unknown[];
  testResults?: TestResult[];
  isActivated: boolean;
  errorMessage?: string;
}

interface ApiDiscovererProps {
  agentId: string;
}

/* ── Common Services Autocomplete ── */

const COMMON_SERVICES = [
  "Airtable", "Asana", "Calendly", "ClickUp", "Contentful",
  "Discord", "Dropbox", "Figma", "GitHub", "GitLab",
  "HubSpot", "Intercom", "Jira", "Linear", "Mailchimp",
  "Monday.com", "Notion", "Pipedrive", "Salesforce", "SendGrid",
  "Shopify", "Slack", "Stripe", "Trello", "Twilio",
  "Typeform", "Webflow", "Zendesk", "Zoom",
];

/* ── Status Config ── */

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  SEARCHING: { label: "Suche Dokumentation...", color: "text-blue-400" },
  READING_DOCS: { label: "Lese Dokumentation...", color: "text-purple-400" },
  GENERATING: { label: "Generiere Integration...", color: "text-orange-400" },
  TESTING: { label: "Teste Verbindung...", color: "text-cyan-400" },
  COMPLETED: { label: "Bereit!", color: "text-emerald-400" },
  FAILED: { label: "Fehlgeschlagen", color: "text-red-400" },
};

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400 bg-emerald-500/10",
  POST: "text-blue-400 bg-blue-500/10",
  PUT: "text-amber-400 bg-amber-500/10",
  PATCH: "text-orange-400 bg-orange-500/10",
  DELETE: "text-red-400 bg-red-500/10",
};

/* ── Component ── */

export function ApiDiscoverer({ agentId }: ApiDiscovererProps) {
  const [serviceName, setServiceName] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryId, setDiscoveryId] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryDetail | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [activating, setActivating] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Autocomplete
  useEffect(() => {
    if (serviceName.length < 2) {
      setSuggestions([]);
      return;
    }
    const filtered = COMMON_SERVICES.filter((s) =>
      s.toLowerCase().includes(serviceName.toLowerCase())
    ).slice(0, 5);
    setSuggestions(filtered);
  }, [serviceName]);

  // Polling für Discovery-Status
  useEffect(() => {
    if (!discoveryId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/discover-api/${discoveryId}`);
        if (res.ok) {
          const data = await res.json() as DiscoveryDetail;
          setDiscovery(data);
          if (data.status === "COMPLETED" || data.status === "FAILED") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {
        // Weiter pollen
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [discoveryId, agentId]);

  const handleDiscover = useCallback(async () => {
    if (!serviceName.trim()) return;
    setDiscovering(true);
    setSuggestions([]);

    try {
      const res = await fetch(`/api/agents/${agentId}/discover-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: serviceName.trim(),
          docsUrl: docsUrl.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Fehler");
        return;
      }

      const data = await res.json() as { discoveryId: string };
      setDiscoveryId(data.discoveryId);
    } catch {
      alert("Fehler beim Starten der Discovery");
    } finally {
      setDiscovering(false);
    }
  }, [agentId, serviceName, docsUrl, apiKey]);

  const handleActivate = async () => {
    if (!discoveryId) return;
    setActivating(true);

    try {
      const res = await fetch(`/api/agents/${agentId}/discover-api/${discoveryId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });

      if (res.ok) {
        setDiscovery((prev) => prev ? { ...prev, isActivated: true } : null);
      }
    } catch {
      // Error handling
    } finally {
      setActivating(false);
    }
  };

  const copyCode = () => {
    if (discovery?.generatedCode) {
      navigator.clipboard.writeText(discovery.generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusConfig = discovery ? STATUS_CONFIG[discovery.status] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Globe className="h-4 w-4 text-cyan-400" />
          API Discovery
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Nenne einen Service. Der Agent liest die API-Docs, baut eine Integration und testet sie.
        </p>
      </div>

      {/* Input */}
      {!discoveryId && (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleDiscover(); }}
              placeholder="z.B. Airtable, HubSpot, Shopify..."
              className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-cyan-500/60 transition-colors placeholder:text-muted-foreground"
            />
            {/* Autocomplete */}
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg overflow-hidden z-10 shadow-xl">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setServiceName(s); setSuggestions([]); }}
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Advanced Options */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Erweiterte Optionen
          </button>

          {showAdvanced && (
            <div className="space-y-2 pl-4 border-l border-border">
              <div>
                <label className="text-[10px] text-muted-foreground">API-Dokumentation URL (optional)</label>
                <input
                  type="url"
                  value={docsUrl}
                  onChange={(e) => setDocsUrl(e.target.value)}
                  placeholder="https://docs.service.com/api"
                  className="w-full bg-card border border-border rounded-lg text-xs text-foreground px-3 py-2 outline-none focus:border-cyan-500/60 transition-colors placeholder:text-muted-foreground mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Shield className="h-2.5 w-2.5" />
                  API-Key (optional — für Live-Test)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-card border border-border rounded-lg text-xs text-foreground px-3 py-2 outline-none focus:border-cyan-500/60 transition-colors placeholder:text-muted-foreground mt-1"
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleDiscover}
            disabled={!serviceName.trim() || discovering}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-9"
          >
            {discovering ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="mr-1.5 h-3.5 w-3.5" />
            )}
            API entdecken
          </Button>
        </div>
      )}

      {/* Discovery Status */}
      {discovery && statusConfig && discovery.status !== "COMPLETED" && discovery.status !== "FAILED" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <Loader2 className={cn("h-5 w-5 animate-spin", statusConfig.color)} />
            <div>
              <p className={cn("text-sm font-medium", statusConfig.color)}>{statusConfig.label}</p>
              {discovery.docsUrl && (
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <ExternalLink className="h-2.5 w-2.5" />
                  {discovery.docsUrl}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {discovery?.status === "FAILED" && (
        <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle className="h-4 w-4" />
            {discovery.errorMessage || "Discovery fehlgeschlagen"}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setDiscoveryId(null); setDiscovery(null); }}
            className="mt-2 text-xs text-muted-foreground"
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Results */}
      {discovery?.status === "COMPLETED" && discovery.apiSpec && (
        <div className="space-y-4">
          {/* API Info */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">{discovery.apiSpec.serviceName}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">{discovery.apiSpec.baseUrl}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {discovery.apiSpec.endpoints.length} Endpoints · Auth: {discovery.apiSpec.auth.type}
            </p>
          </div>

          {/* Endpoints */}
          <div className="space-y-1">
            {discovery.apiSpec.endpoints.map((ep, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <span className={cn(
                  "text-[9px] font-bold rounded px-1.5 py-0.5",
                  METHOD_COLORS[ep.method] || "text-muted-foreground bg-muted/10"
                )}>
                  {ep.method}
                </span>
                <span className="text-xs text-foreground font-mono flex-1 truncate">{ep.path}</span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{ep.description}</span>
              </div>
            ))}
          </div>

          {/* Test Results */}
          {discovery.testResults && discovery.testResults.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Test-Ergebnisse</p>
              <div className="space-y-1">
                {discovery.testResults.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {t.success ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                    <span className="text-muted-foreground font-mono">{t.endpoint}</span>
                    {t.statusCode && <span className="text-muted-foreground">{t.statusCode}</span>}
                    {t.error && <span className="text-red-400 text-[10px]">{t.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Code Preview Toggle */}
          {discovery.generatedCode && (
            <div>
              <button
                onClick={() => setShowCode(!showCode)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Code className="h-3.5 w-3.5" />
                {showCode ? "Code ausblenden" : "Generierten Code anzeigen"}
                {showCode ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>

              {showCode && (
                <div className="mt-2 relative">
                  <pre className="rounded-xl bg-card border border-border p-4 overflow-x-auto text-[11px] text-muted-foreground font-mono max-h-[400px]">
                    {discovery.generatedCode}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyCode}
                    className="absolute top-2 right-2 h-7 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!discovery.isActivated ? (
              <Button
                onClick={handleActivate}
                disabled={activating}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-9"
              >
                {activating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                )}
                Als Agent-Tools aktivieren
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Tools sind aktiv — dein Agent kann diese API jetzt nutzen</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
