"use client";

/**
 * Embed Configurator
 * Konfiguriert Embed-Komponenten mit Live-Vorschau, Code-Generierung und Token-Verwaltung.
 * Plan-gated: false = Upgrade-Prompt, "chat_only" = nur Chat, "all" = alle Komponenten
 */

import { useState, useEffect, useCallback } from "react";
import type { EmbedComponentType } from "@/lib/embeds/embed-manager";

/* ── Types ── */

interface EmbedToken {
  id: string;
  agentId: string;
  token: string;
  label: string | null;
  allowedComponents: string[] | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface EmbedConfiguratorProps {
  agentId: string;
  planLevel: false | "chat_only" | "all";
}

const COMPONENT_TYPES: {
  type: EmbedComponentType;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    type: "chat",
    label: "Chat Widget",
    description: "Interaktiver Chat direkt auf deiner Seite",
    icon: "💬",
  },
  {
    type: "price_table",
    label: "Preistabelle",
    description: "Dynamische Preis-Vergleichstabelle",
    icon: "📊",
  },
  {
    type: "diff_timeline",
    label: "Diff Timeline",
    description: "Änderungsverlauf als Timeline",
    icon: "📋",
  },
  {
    type: "agent_status",
    label: "Agent Status",
    description: "Live-Status deines Agents",
    icon: "🟢",
  },
  {
    type: "knowledge_search",
    label: "Wissenssuche",
    description: "Durchsuchbare Wissensdatenbank",
    icon: "🔍",
  },
  {
    type: "report_viewer",
    label: "Report Viewer",
    description: "Letzter Agent-Report mit Download",
    icon: "📄",
  },
];

/* ── Component ── */

export function EmbedConfigurator({
  agentId,
  planLevel,
}: EmbedConfiguratorProps) {
  const [selectedComponent, setSelectedComponent] =
    useState<EmbedComponentType | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("dark");
  const [width, setWidth] = useState("100%");
  const [height, setHeight] = useState("500px");
  const [showBranding, setShowBranding] = useState(true);
  const [copied, setCopied] = useState<"embed" | "iframe" | null>(null);

  // Token-Verwaltung
  const [tokens, setTokens] = useState<EmbedToken[]>([]);
  const [selectedToken, setSelectedToken] = useState("");
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const res = await fetch("/api/embed/token");
      if (res.ok) {
        const data = await res.json();
        const agentTokens = (data.tokens as EmbedToken[]).filter(
          (t) => t.agentId === agentId && t.isActive
        );
        setTokens(agentTokens);
        if (agentTokens.length > 0 && !selectedToken) {
          setSelectedToken(agentTokens[0].token);
        }
      }
    } catch {
      // Fehler ignorieren
    } finally {
      setLoadingTokens(false);
    }
  }, [agentId, selectedToken]);

  useEffect(() => {
    if (planLevel !== false) {
      loadTokens();
    }
  }, [planLevel, loadTokens]);

  async function createToken() {
    setCreatingToken(true);
    try {
      const res = await fetch("/api/embed/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          label: newTokenLabel || "Embed Token",
        }),
      });
      if (res.ok) {
        setNewTokenLabel("");
        await loadTokens();
      }
    } catch {
      // Fehler ignorieren
    } finally {
      setCreatingToken(false);
    }
  }

  async function revokeToken(tokenId: string) {
    try {
      await fetch("/api/embed/token", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });
      await loadTokens();
    } catch {
      // Fehler ignorieren
    }
  }

  function copyToClipboard(text: string, type: "embed" | "iframe") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  // Embed-Code generieren
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://kilnbase.com";

  const embedCode =
    selectedComponent && selectedToken
      ? `<script src="${baseUrl}/embed/loader.js" data-agent-id="${agentId}" data-component="${selectedComponent}" data-theme="${theme}" data-token="${selectedToken}" data-width="${width}" data-height="${height}" data-branding="${showBranding}"></script>`
      : "";

  const iframeCode =
    selectedComponent && selectedToken
      ? `<iframe src="${baseUrl}/embed/components/${agentId}/${selectedComponent}?token=${selectedToken}&theme=${theme}&branding=${showBranding}" width="${width}" height="${height}" style="border:none;border-radius:12px" allow="clipboard-write" loading="lazy" title="KILN ${selectedComponent}"></iframe>`
      : "";

  const previewUrl =
    selectedComponent && selectedToken
      ? `${baseUrl}/embed/components/${agentId}/${selectedComponent}?token=${selectedToken}&theme=${theme}&branding=${showBranding}`
      : "";

  // Upgrade-Prompt wenn Plan Embeds nicht erlaubt
  if (planLevel === false) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10">
          <svg
            className="h-6 w-6 text-orange-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">
          Embed-Komponenten freischalten
        </h3>
        <p className="mt-2 text-sm text-white/60">
          Upgrade deinen Plan, um Agent-Komponenten auf externen Websites
          einzubetten.
        </p>
        <a
          href="/settings/billing"
          className="mt-4 inline-flex items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
        >
          Plan upgraden
        </a>
      </div>
    );
  }

  const availableComponents =
    planLevel === "chat_only"
      ? COMPONENT_TYPES.filter((c) => c.type === "chat")
      : COMPONENT_TYPES;

  const lockedComponents =
    planLevel === "chat_only"
      ? COMPONENT_TYPES.filter((c) => c.type !== "chat")
      : [];

  return (
    <div className="space-y-6">
      {/* Komponenten-Auswahl */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-white/80">
          Komponente wählen
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {availableComponents.map((comp) => (
            <button
              key={comp.type}
              onClick={() => setSelectedComponent(comp.type)}
              className={`rounded-lg border p-3 text-left transition-all ${
                selectedComponent === comp.type
                  ? "border-orange-500 bg-orange-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <span className="text-xl">{comp.icon}</span>
              <p className="mt-1.5 text-sm font-medium text-white">
                {comp.label}
              </p>
              <p className="mt-0.5 text-xs text-white/50">
                {comp.description}
              </p>
            </button>
          ))}

          {/* Gesperrte Komponenten (nur bei chat_only) */}
          {lockedComponents.map((comp) => (
            <div
              key={comp.type}
              className="relative rounded-lg border border-white/5 bg-white/[0.02] p-3 opacity-50"
            >
              <span className="text-xl grayscale">{comp.icon}</span>
              <p className="mt-1.5 text-sm font-medium text-white/60">
                {comp.label}
              </p>
              <p className="mt-0.5 text-xs text-white/30">
                Pro-Plan erforderlich
              </p>
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
                <svg
                  className="h-5 w-5 text-white/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Konfiguration */}
      {selectedComponent && (
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-medium text-white/80">Konfiguration</h3>

          {/* Theme */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Theme</label>
            <div className="flex gap-2">
              {(["dark", "light", "auto"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === t
                      ? "bg-orange-500 text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {t === "dark" ? "Dunkel" : t === "light" ? "Hell" : "Auto"}
                </button>
              ))}
            </div>
          </div>

          {/* Abmessungen */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-white/50">
                Breite
              </label>
              <input
                type="text"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-orange-500/50"
                placeholder="100%"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-white/50">
                Höhe
              </label>
              <input
                type="text"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-orange-500/50"
                placeholder="500px"
              />
            </div>
          </div>

          {/* Branding Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-white/50">
              &quot;Powered by KILN&quot; anzeigen
            </label>
            <button
              onClick={() => setShowBranding(!showBranding)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                showBranding ? "bg-orange-500" : "bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  showBranding ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Token-Verwaltung */}
      <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-medium text-white/80">Embed-Tokens</h3>

        {/* Token erstellen */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newTokenLabel}
            onChange={(e) => setNewTokenLabel(e.target.value)}
            placeholder="Token-Label (optional)"
            className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-orange-500/50"
          />
          <button
            onClick={createToken}
            disabled={creatingToken}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
          >
            {creatingToken ? "Erstelle..." : "Token erstellen"}
          </button>
        </div>

        {/* Token-Liste */}
        {loadingTokens ? (
          <p className="text-xs text-white/40">Lade Tokens...</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-white/40">
            Noch keine Tokens vorhanden. Erstelle ein Token, um den Embed-Code
            zu generieren.
          </p>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between rounded-md border p-2.5 ${
                  selectedToken === t.token
                    ? "border-orange-500/50 bg-orange-500/5"
                    : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <button
                  onClick={() => setSelectedToken(t.token)}
                  className="flex-1 text-left"
                >
                  <p className="text-xs font-medium text-white">
                    {t.label || "Embed Token"}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-white/30">
                    {t.token.slice(0, 16)}...
                  </p>
                </button>
                <button
                  onClick={() => revokeToken(t.id)}
                  className="ml-2 rounded p-1 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Token widerrufen"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Embed-Code Ausgabe */}
      {selectedComponent && selectedToken && (
        <div className="space-y-4">
          {/* HTML Embed Code */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-medium text-white/60">
                HTML Embed Code
              </h4>
              <button
                onClick={() => copyToClipboard(embedCode, "embed")}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white"
              >
                {copied === "embed" ? (
                  <>
                    <svg
                      className="h-3.5 w-3.5 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Kopiert
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Kopieren
                  </>
                )}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-black/30 p-3 font-mono text-xs text-white/70">
              {embedCode}
            </pre>
          </div>

          {/* iframe Code */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-medium text-white/60">
                iframe Code
              </h4>
              <button
                onClick={() => copyToClipboard(iframeCode, "iframe")}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white"
              >
                {copied === "iframe" ? (
                  <>
                    <svg
                      className="h-3.5 w-3.5 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Kopiert
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Kopieren
                  </>
                )}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-black/30 p-3 font-mono text-xs text-white/70">
              {iframeCode}
            </pre>
          </div>

          {/* Live-Vorschau */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h4 className="mb-3 text-xs font-medium text-white/60">
              Live-Vorschau
            </h4>
            <div
              className="overflow-hidden rounded-lg border border-white/10"
              style={{ height: "300px" }}
            >
              <iframe
                src={previewUrl}
                className="h-full w-full border-none"
                title="Embed-Vorschau"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
