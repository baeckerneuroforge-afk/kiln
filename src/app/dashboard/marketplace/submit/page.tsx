"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Upload,
  ArrowLeft,
  Info,
  Loader2,
  Check,
  Image as ImageIcon,
  Tag,
  DollarSign,
  ChevronRight,
  Star,
  Download,
  X,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AgentOption {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

const CATEGORIES = [
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "research", label: "Research" },
  { value: "monitoring", label: "Monitoring" },
  { value: "e-commerce", label: "E-Commerce" },
  { value: "recruiting", label: "Recruiting" },
  { value: "marketing", label: "Marketing" },
  { value: "legal", label: "Legal" },
];

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "business", label: "Business" },
];

const categoryColors: Record<string, string> = {
  sales: "bg-muted text-muted-foreground",
  support: "bg-muted text-muted-foreground",
  research: "bg-muted text-muted-foreground",
  monitoring: "bg-yellow-500/10 text-yellow-400",
  "e-commerce": "bg-muted text-muted-foreground",
  recruiting: "bg-muted text-muted-foreground",
  marketing: "bg-cyan-500/10 text-cyan-400",
  legal: "bg-muted text-muted-foreground",
};

export default function MarketplaceSubmitPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();

  // Agents laden
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Formular-State
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [minPlan, setMinPlan] = useState("free");
  const [screenshots, setScreenshots] = useState<string[]>([""]);
  const [demoConversation, setDemoConversation] = useState("");

  // Submit-State
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan-Check (simuliert)
  const [userPlan] = useState<string>("pro");

  const isPlanSufficient = userPlan === "pro" || userPlan === "business" || userPlan === "agency";

  useEffect(() => {
    fetch("/api/agents")
      .then(async (res) => {
        if (!res.ok) throw new Error("Fehler beim Laden");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setAgents(
            data.map((a: Record<string, string>) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              status: a.status,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
  }, []);

  // Agent-Auswahl: Felder vorausfuellen
  function handleAgentSelect(agentId: string) {
    setSelectedAgentId(agentId);
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      setName(agent.name);
      setShortDescription(agent.description || "");
    }
  }

  // Screenshots verwalten
  function addScreenshot() {
    if (screenshots.length < 5) {
      setScreenshots([...screenshots, ""]);
    }
  }

  function removeScreenshot(index: number) {
    setScreenshots(screenshots.filter((_, i) => i !== index));
  }

  function updateScreenshot(index: number, value: string) {
    const updated = [...screenshots];
    updated[index] = value;
    setScreenshots(updated);
  }

  // Formular absenden
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAgentId || !name || !shortDescription || !category) {
      setError("Bitte fülle alle Pflichtfelder aus.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/marketplace/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgentId,
          name,
          shortDescription,
          longDescription,
          category,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          price,
          minPlan,
          screenshots: screenshots.filter(Boolean),
          demoConversation: demoConversation || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Fehler beim Einreichen");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten.");
    } finally {
      setSubmitting(false);
    }
  }

  // Erfolgs-Ansicht
  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Check className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          Agent eingereicht!
        </h1>
        <p className="mt-3 text-muted-foreground">
          Dein Agent wird geprüft und du wirst benachrichtigt, sobald er im
          Marketplace veröffentlicht wird.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/dashboard/marketplace">
            <Button variant="outline">Zum Marketplace</Button>
          </Link>
          <Link href="/dashboard/agents">
            <Button>Meine Agents</Button>
          </Link>
        </div>
      </div>
    );
  }

  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/dashboard"
          className="transition-colors hover:text-foreground"
        >
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link
          href="/dashboard/marketplace"
          className="transition-colors hover:text-foreground"
        >
          Marketplace
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Agent einreichen</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/dashboard/marketplace"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-serif text-2xl text-foreground">
            Agent im Marketplace veröffentlichen
          </h1>
        </div>
        <p className="ml-11 text-muted-foreground">
          Teile deinen Agent mit der KILN Community und verdiene an jedem
          Verkauf.
        </p>
      </div>

      {/* Plan-Check Banner */}
      {!isPlanSufficient && (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-border bg-kiln-orange/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">
              Marketplace-Veröffentlichung erfordert mindestens Pro
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upgrade deinen Plan, um Agents im Marketplace zu veröffentlichen
              und an Verkäufen zu verdienen.
            </p>
            <Link href="/dashboard/billing">
              <Button size="sm" className="mt-3">
                Upgrade auf Pro
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <form onSubmit={handleSubmit}>
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left column - Form */}
          <div className="space-y-6 lg:col-span-2">
            {/* Agent auswählen */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Upload className="h-4 w-4" />
                Agent auswählen
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Wähle einen Agent *
                  </label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => handleAgentSelect(e.target.value)}
                    disabled={loadingAgents || !isPlanSufficient}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                  >
                    <option value="">
                      {loadingAgents
                        ? "Agents werden geladen..."
                        : "Agent auswählen..."}
                    </option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}{" "}
                        {agent.status === "LIVE" ? "(Live)" : `(${agent.status})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name deines Agents"
                    disabled={!isPlanSufficient}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Kurzbeschreibung *
                  </label>
                  <textarea
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Was macht dein Agent? (1-2 Sätze)"
                    rows={2}
                    disabled={!isPlanSufficient}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Ausführliche Beschreibung
                  </label>
                  <textarea
                    value={longDescription}
                    onChange={(e) => setLongDescription(e.target.value)}
                    placeholder="Beschreibe Features, Use-Cases und Vorteile deines Agents im Detail..."
                    rows={5}
                    disabled={!isPlanSufficient}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Kategorie & Tags */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Tag className="h-4 w-4" />
                Kategorie & Tags
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Kategorie *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={!isPlanSufficient}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                  >
                    <option value="">Kategorie wählen...</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="z.B. chatbot, lead-gen, automation (kommagetrennt)"
                    disabled={!isPlanSufficient}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kommagetrennte Tags für bessere Auffindbarkeit
                  </p>
                </div>
              </div>
            </div>

            {/* Preis & Plan */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                Preis & Plan
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Preis (EUR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      €
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={price}
                      onChange={(e) =>
                        setPrice(Math.max(0, parseInt(e.target.value) || 0))
                      }
                      disabled={!isPlanSufficient}
                      className="w-full rounded-lg border border-border bg-background py-2.5 pl-8 pr-3 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    0 = kostenlos
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Mindest-Plan
                  </label>
                  <select
                    value={minPlan}
                    onChange={(e) => setMinPlan(e.target.value)}
                    disabled={!isPlanSufficient}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                  >
                    {PLAN_OPTIONS.map((plan) => (
                      <option key={plan.value} value={plan.value}>
                        {plan.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Screenshots */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
                Screenshots
              </h2>

              <div className="space-y-3">
                {screenshots.map((url, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => updateScreenshot(index, e.target.value)}
                      placeholder={`Screenshot-URL ${index + 1}`}
                      disabled={!isPlanSufficient}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
                    />
                    {screenshots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeScreenshot(index)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {screenshots.length < 5 && (
                  <button
                    type="button"
                    onClick={addScreenshot}
                    disabled={!isPlanSufficient}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Screenshot hinzufügen
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  Bis zu 5 Screenshot-URLs. Zeige deinen Agent in Aktion.
                </p>
              </div>
            </div>

            {/* Demo-Konversation */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Demo-Konversation (optional)
              </h2>
              <textarea
                value={demoConversation}
                onChange={(e) => setDemoConversation(e.target.value)}
                placeholder={`Beispiel-Konversation im JSON-Format:\n[\n  { "role": "user", "content": "Hallo!" },\n  { "role": "assistant", "content": "Willkommen! Wie kann ich helfen?" }\n]`}
                rows={6}
                disabled={!isPlanSufficient}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground transition-colors focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Eine Beispiel-Konversation, die potenziellen Nutzern zeigt, was
                dein Agent kann.
              </p>
            </div>

            {/* Submit section */}
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nach dem Einreichen wird dein Agent geprüft. Bei
                  Veröffentlichung erhältst du{" "}
                  <span className="font-semibold text-foreground">
                    70% der Einnahmen
                  </span>
                  .
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || !isPlanSufficient || !selectedAgentId}
                className="w-full bg-gradient-to-r from-kiln-orange to-kiln-ember text-white shadow-lg transition-all hover:shadow-kiln-orange/20 disabled:opacity-50"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird eingereicht...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Einreichen
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Right column - Preview */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vorschau
              </p>

              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {/* Preview Image Area */}
                <div className="flex h-40 items-center justify-center bg-gradient-to-br from-stone-900 to-stone-800">
                  {screenshots[0] ? (
                    <img
                      src={screenshots[0]}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                      <span className="text-xs">Kein Screenshot</span>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  {/* Category Badge */}
                  {category && (
                    <span
                      className={cn(
                        "mb-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                        categoryColors[category] || "bg-muted text-muted-foreground"
                      )}
                    >
                      {categoryLabel}
                    </span>
                  )}

                  {/* Name */}
                  <h3 className="font-semibold text-foreground">
                    {name || "Agent Name"}
                  </h3>

                  {/* Description */}
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {shortDescription || "Beschreibung deines Agents..."}
                  </p>

                  {/* Stats Row */}
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-yellow-500" />
                        0.0
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="h-3.5 w-3.5" />0
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        price > 0 ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {price > 0 ? `€${price}` : "Kostenlos"}
                    </span>
                  </div>

                  {/* Tags Preview */}
                  {tags && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .slice(0, 4)
                        .map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  )}

                  {/* Min Plan Badge */}
                  {minPlan !== "free" && (
                    <div className="mt-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Ab {PLAN_OPTIONS.find((p) => p.value === minPlan)?.label}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview hints */}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                So wird dein Agent im Marketplace angezeigt
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
