"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";

// Typen fuer Komponentendaten
interface PriceEntry {
  anbieter: string;
  preis: string;
  verfuegbarkeit: string;
  zuletztGeprueft: string;
}

interface DiffEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
}

interface AgentStatusData {
  status: "active" | "warning" | "error";
  label: string;
  lastRun: string | null;
  nextScheduled: string | null;
}

interface KnowledgeEntry {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
}

interface ReportData {
  title: string;
  summary: string;
  createdAt: string;
  downloadUrl: string | null;
}

type ComponentData =
  | PriceEntry[]
  | DiffEntry[]
  | AgentStatusData
  | KnowledgeEntry[]
  | ReportData
  | null;

// Komponent-spezifische Render-Funktionen
function PriceTable({
  data,
  isDark,
}: {
  data: PriceEntry[];
  isDark: boolean;
}) {
  const borderColor = isDark ? "border-white/10" : "border-black/10";
  const headerBg = isDark ? "bg-white/5" : "bg-black/5";
  const textColor = isDark ? "text-white" : "text-gray-900";
  const subText = isDark ? "text-white/60" : "text-gray-500";

  return (
    <div className={`overflow-x-auto rounded-lg border ${borderColor}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={headerBg}>
            <th className={`px-4 py-3 text-left font-medium ${subText}`}>
              Anbieter
            </th>
            <th className={`px-4 py-3 text-left font-medium ${subText}`}>
              Preis
            </th>
            <th className={`px-4 py-3 text-left font-medium ${subText}`}>
              Verfügbarkeit
            </th>
            <th className={`px-4 py-3 text-left font-medium ${subText}`}>
              Zuletzt geprüft
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className={`border-t ${borderColor} ${textColor}`}
            >
              <td className="px-4 py-3 font-medium">{row.anbieter}</td>
              <td className="px-4 py-3">{row.preis}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.verfuegbarkeit === "Verfügbar"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-yellow-500/10 text-yellow-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      row.verfuegbarkeit === "Verfügbar"
                        ? "bg-green-500"
                        : "bg-yellow-500"
                    }`}
                  />
                  {row.verfuegbarkeit}
                </span>
              </td>
              <td className={`px-4 py-3 ${subText}`}>
                {row.zuletztGeprueft}
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className={`px-4 py-8 text-center ${subText}`}
              >
                Keine Daten verfügbar
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DiffTimeline({
  data,
  isDark,
}: {
  data: DiffEntry[];
  isDark: boolean;
}) {
  const textColor = isDark ? "text-white" : "text-gray-900";
  const subText = isDark ? "text-white/60" : "text-gray-500";
  const lineColor = isDark ? "bg-white/10" : "bg-black/10";

  const typeBadgeColors: Record<string, string> = {
    added: "bg-green-500/10 text-green-500",
    removed: "bg-red-500/10 text-red-500",
    changed: "bg-orange-500/10 text-orange-500",
    info: "bg-blue-500/10 text-blue-500",
  };

  return (
    <div className="relative pl-6">
      {/* Vertikale Linie */}
      <div
        className={`absolute left-2 top-0 bottom-0 w-px ${lineColor}`}
      />
      {data.map((entry, i) => (
        <div key={entry.id || i} className="relative mb-6 last:mb-0">
          {/* Punkt */}
          <div className="absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-orange-500 bg-orange-500/20" />
          <div className="flex items-start gap-2">
            <span
              className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                typeBadgeColors[entry.type] || typeBadgeColors.info
              }`}
            >
              {entry.type}
            </span>
            <div className="flex-1">
              <p className={`text-sm font-medium ${textColor}`}>
                {entry.title}
              </p>
              <p className={`mt-0.5 text-xs ${subText}`}>
                {entry.description}
              </p>
              <p className={`mt-1 text-xs ${subText}`}>
                {new Date(entry.timestamp).toLocaleString("de-DE")}
              </p>
            </div>
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <p className={`py-8 text-center text-sm ${subText}`}>
          Keine Änderungen vorhanden
        </p>
      )}
    </div>
  );
}

function AgentStatus({
  data,
  isDark,
}: {
  data: AgentStatusData;
  isDark: boolean;
}) {
  const textColor = isDark ? "text-white" : "text-gray-900";
  const subText = isDark ? "text-white/60" : "text-gray-500";
  const borderColor = isDark ? "border-white/10" : "border-black/10";

  const statusColors = {
    active: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
  };

  const statusLabels = {
    active: "Agent aktiv",
    warning: "Eingeschränkt",
    error: "Agent inaktiv",
  };

  return (
    <div className={`rounded-lg border p-4 ${borderColor}`}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className={`h-3 w-3 rounded-full ${statusColors[data.status]}`}
          />
          {data.status === "active" && (
            <div
              className={`absolute inset-0 h-3 w-3 animate-ping rounded-full ${statusColors[data.status]} opacity-30`}
            />
          )}
        </div>
        <span className={`text-sm font-medium ${textColor}`}>
          {statusLabels[data.status] || data.label}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {data.lastRun && (
          <p className={`text-xs ${subText}`}>
            Letzter Lauf:{" "}
            {new Date(data.lastRun).toLocaleString("de-DE")}
          </p>
        )}
        {data.nextScheduled && (
          <p className={`text-xs ${subText}`}>
            Nächster Lauf:{" "}
            {new Date(data.nextScheduled).toLocaleString("de-DE")}
          </p>
        )}
      </div>
    </div>
  );
}

function KnowledgeSearch({
  data,
  isDark,
  onSearch,
}: {
  data: KnowledgeEntry[];
  isDark: boolean;
  onSearch: (query: string) => void;
}) {
  const textColor = isDark ? "text-white" : "text-gray-900";
  const subText = isDark ? "text-white/60" : "text-gray-500";
  const borderColor = isDark ? "border-white/10" : "border-black/10";
  const inputBg = isDark ? "bg-white/5" : "bg-black/5";

  return (
    <div className="space-y-4">
      <div className="relative">
        <svg
          className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${subText}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Wissen durchsuchen..."
          className={`w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm outline-none transition-colors ${borderColor} ${inputBg} ${textColor} placeholder:${subText} focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20`}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length >= 2) onSearch(value);
          }}
        />
      </div>
      <div className="space-y-2">
        {data.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-lg border p-3 ${borderColor}`}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-flex rounded bg-orange-500/10 px-1.5 py-0.5 text-xs font-medium text-orange-500"
              >
                {entry.type}
              </span>
              <span className={`text-sm font-medium ${textColor}`}>
                {entry.name}
              </span>
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <p className={`py-4 text-center text-sm ${subText}`}>
            Suchbegriff eingeben, um Wissen zu durchsuchen
          </p>
        )}
      </div>
    </div>
  );
}

function ReportViewer({
  data,
  isDark,
}: {
  data: ReportData;
  isDark: boolean;
}) {
  const textColor = isDark ? "text-white" : "text-gray-900";
  const subText = isDark ? "text-white/60" : "text-gray-500";
  const borderColor = isDark ? "border-white/10" : "border-black/10";

  return (
    <div className={`rounded-lg border p-4 ${borderColor}`}>
      <h3 className={`text-sm font-semibold ${textColor}`}>{data.title}</h3>
      <p className={`mt-2 text-sm leading-relaxed ${subText}`}>
        {data.summary}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className={`text-xs ${subText}`}>
          {new Date(data.createdAt).toLocaleString("de-DE")}
        </span>
        {data.downloadUrl && (
          <a
            href={data.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-600"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Herunterladen
          </a>
        )}
      </div>
    </div>
  );
}

// Lade-Spinner
function LoadingSpinner({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div
        className={`h-6 w-6 animate-spin rounded-full border-2 border-t-transparent ${
          isDark ? "border-white/20 border-t-orange-500" : "border-black/10 border-t-orange-500"
        }`}
      />
    </div>
  );
}

// Fehlermeldung
function ErrorState({
  message,
  isDark,
}: {
  message: string;
  isDark: boolean;
}) {
  const subText = isDark ? "text-white/60" : "text-gray-500";
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <svg
        className="mb-3 h-8 w-8 text-red-500/60"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <p className={`text-sm ${subText}`}>{message}</p>
    </div>
  );
}

// Powered-by-Footer
function PoweredByFooter({ isDark }: { isDark: boolean }) {
  const subText = isDark ? "text-white/30" : "text-gray-400";
  return (
    <div className={`mt-4 text-center text-xs ${subText}`}>
      <a
        href="https://kiln.hephaistos-systems.de"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-orange-500"
      >
        Powered by KILN
      </a>
    </div>
  );
}

const VALID_COMPONENTS = [
  "chat",
  "price_table",
  "diff_timeline",
  "agent_status",
  "knowledge_search",
  "report_viewer",
];

export default function EmbedComponentPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const agentId = params.agentId as string;
  const componentType = params.componentType as string;
  const token = searchParams.get("token") || "";
  const theme = searchParams.get("theme") || "dark";
  const showBranding = searchParams.get("branding") !== "false";

  const isDark = theme === "dark" || (theme === "auto" && true); // Auto = dark default

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ComponentData>(null);
  const [tokenValid, setTokenValid] = useState(false);

  // Token validieren
  useEffect(() => {
    if (!token) {
      setError("Kein Token angegeben");
      setLoading(false);
      return;
    }

    if (!VALID_COMPONENTS.includes(componentType)) {
      setError("Ungültiger Komponententyp");
      setLoading(false);
      return;
    }

    fetch("/api/embed/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, agentId, componentType }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (!result.valid) {
          setError(result.error || "Token ungültig");
          setLoading(false);
          return;
        }
        setTokenValid(true);
        // Daten laden
        fetchComponentData();
      })
      .catch(() => {
        setError("Verbindungsfehler");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, agentId, componentType]);

  function fetchComponentData(query?: string) {
    const url = new URL(
      `/api/embed/components/${agentId}/${componentType}`,
      window.location.origin
    );
    if (query) url.searchParams.set("q", query);

    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Datenfehler");
        return res.json();
      })
      .then((result) => {
        setData(result.data);
        setLoading(false);
      })
      .catch(() => {
        setError("Daten konnten nicht geladen werden");
        setLoading(false);
      });
  }

  // Hintergrundfarbe
  const bgColor = isDark ? "bg-[#0C0A09]" : "bg-white";
  const textColor = isDark ? "text-white" : "text-gray-900";

  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>KILN Embed</title>
      </head>
      <body className={`${bgColor} ${textColor} p-4 antialiased`}>
        {loading && <LoadingSpinner isDark={isDark} />}

        {error && <ErrorState message={error} isDark={isDark} />}

        {!loading && !error && tokenValid && (
          <>
            {componentType === "price_table" && data && (
              <PriceTable
                data={data as PriceEntry[]}
                isDark={isDark}
              />
            )}

            {componentType === "diff_timeline" && data && (
              <DiffTimeline
                data={data as DiffEntry[]}
                isDark={isDark}
              />
            )}

            {componentType === "agent_status" && data && (
              <AgentStatus
                data={data as AgentStatusData}
                isDark={isDark}
              />
            )}

            {componentType === "knowledge_search" && (
              <KnowledgeSearch
                data={(data as KnowledgeEntry[]) || []}
                isDark={isDark}
                onSearch={(query) => fetchComponentData(query)}
              />
            )}

            {componentType === "report_viewer" && data && (
              <ReportViewer
                data={data as ReportData}
                isDark={isDark}
              />
            )}

            {showBranding && <PoweredByFooter isDark={isDark} />}
          </>
        )}
      </body>
    </html>
  );
}
