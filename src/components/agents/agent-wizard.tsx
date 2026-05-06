"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Loader2,
  MessageSquare,
  Calendar,
  Mail,
  Target,
  Headphones,
  Sparkles,
  Check,
  Upload,
  FileText,
  HelpCircle,
  Eye,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ---------- Types ---------- */
type WizardStep = "goal" | "business" | "knowledge" | "personality" | "review";

interface GoalOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  actions: string[];
}

const GOALS: GoalOption[] = [
  { id: "support", label: "Answer Customer Questions", description: "FAQ, product info, troubleshooting", icon: MessageSquare, actions: ["faq", "handoff"] },
  { id: "leads", label: "Capture Leads", description: "Collect emails, qualify visitors", icon: Mail, actions: ["email", "lead_scoring"] },
  { id: "booking", label: "Book Appointments", description: "Schedule meetings, check availability", icon: Calendar, actions: ["booking", "email"] },
  { id: "qualify", label: "Qualify Prospects", description: "Ask qualifying questions, score leads", icon: Target, actions: ["lead_scoring", "email", "notification"] },
  { id: "service", label: "Provide Support", description: "Technical help, order status, escalation", icon: Headphones, actions: ["faq", "handoff", "notification"] },
  { id: "custom", label: "Custom", description: "I'll define the goal myself", icon: Sparkles, actions: [] },
];

const INDUSTRIES = [
  "SaaS / Software", "E-Commerce", "Real Estate", "Coaching / Consulting",
  "Healthcare / Dental", "Restaurant / Hospitality", "Legal", "Finance / Insurance",
  "Fitness / Wellness", "Marketing Agency", "Education", "Trades / Crafts",
  "Automotive", "Travel / Tourism", "Other",
];

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "goal", label: "Goal" },
  { id: "business", label: "Business" },
  { id: "knowledge", label: "Knowledge" },
  { id: "personality", label: "Style" },
  { id: "review", label: "Review" },
];

/* ---------- System Prompt Generator ───────────────────────────────────
 * Generates the agent's system prompt as English by default. When the
 * operator explicitly selects German (language === "de"), we emit a
 * German prompt so a German-speaking agent stays linguistically natural.
 * Other selections (en / fr / es / auto) get the English template plus
 * an explicit "respond in <language>" footer — the agent runtime
 * handles the actual language switching.
 */
function generateSystemPrompt(opts: {
  goal: string;
  businessName: string;
  industry: string;
  customGoal: string;
  tone: number;
  length: number;
  language: string;
  kbMode: string;
  faqPairs: { q: string; a: string }[];
}): string {
  if (opts.language === "de") return generateGermanPrompt(opts);
  return generateEnglishPrompt(opts);
}

function generateEnglishPrompt(opts: {
  goal: string;
  businessName: string;
  industry: string;
  customGoal: string;
  tone: number;
  length: number;
  language: string;
  kbMode: string;
  faqPairs: { q: string; a: string }[];
}): string {
  const goalMap: Record<string, string> = {
    support: "answer customer questions accurately and helpfully",
    leads: "engage visitors, understand their needs, and collect their contact information",
    booking: "help visitors schedule appointments and check availability",
    qualify: "qualify prospects by asking the right questions and scoring their fit",
    service: "provide excellent customer support, troubleshoot issues, and escalate when needed",
    custom: opts.customGoal || "assist visitors with their needs",
  };

  const toneLabel = opts.tone <= 30 ? "formal and professional" : opts.tone >= 70 ? "casual and friendly" : "approachable yet professional";
  const lengthLabel = opts.length <= 30 ? "concise — keep responses short and to the point" : opts.length >= 70 ? "detailed — provide thorough, comprehensive answers" : "balanced — be informative without being verbose";

  let prompt = `You are ${opts.businessName ? `the AI assistant for ${opts.businessName}` : "a professional AI assistant"}`;
  if (opts.industry && opts.industry !== "Other") {
    prompt += ` in the ${opts.industry} space`;
  }
  prompt += `. Your goal is to ${goalMap[opts.goal] || goalMap.custom}.\n\n`;

  prompt += `Guidelines:\n`;
  prompt += `- Communicate ${toneLabel}\n`;
  prompt += `- Reply ${lengthLabel}\n`;
  prompt += `- If you don't know the answer, say so honestly and offer to connect the visitor with a human\n`;

  if (opts.goal === "leads" || opts.goal === "qualify") {
    prompt += `- When a visitor shows interest, politely ask for their name and email\n`;
    prompt += `- Use the lead-capture action as soon as you have an email\n`;
  }

  if (opts.goal === "booking") {
    prompt += `- When a visitor wants to book, use the appointment-booking action\n`;
    prompt += `- Surface available slots and confirm the booking explicitly\n`;
  }

  if (opts.goal === "service" || opts.goal === "support") {
    prompt += `- For complex issues you cannot resolve, hand off to a human agent\n`;
    prompt += `- Ask focused questions to narrow down the problem\n`;
  }

  if (opts.kbMode === "faq" && opts.faqPairs.some((f) => f.q && f.a)) {
    prompt += `\n---\nFREQUENTLY ASKED QUESTIONS:\n`;
    for (const faq of opts.faqPairs) {
      if (faq.q && faq.a) {
        prompt += `\nQ: ${faq.q}\nA: ${faq.a}\n`;
      }
    }
    prompt += `---\nUse this FAQ to answer common questions.\n`;
  }

  if (opts.language !== "auto" && opts.language !== "en") {
    const langMap: Record<string, string> = { fr: "French", es: "Spanish" };
    prompt += `\nAlways respond in ${langMap[opts.language] || opts.language}.\n`;
  } else if (opts.language === "auto") {
    prompt += `\nIMPORTANT: Detect the visitor's language and ALWAYS reply in the same language.\n`;
  }

  return prompt;
}

function generateGermanPrompt(opts: {
  goal: string;
  businessName: string;
  industry: string;
  customGoal: string;
  tone: number;
  length: number;
  language: string;
  kbMode: string;
  faqPairs: { q: string; a: string }[];
}): string {
  // German-language template — used when the operator explicitly picks
  // German for the agent. The original wizard always emitted this; we
  // now branch on language so non-German agents get an English prompt.
  const goalMap: Record<string, string> = {
    support: "Kundenfragen präzise und hilfreich zu beantworten",
    leads: "Besucher zu engagieren, ihre Bedürfnisse zu verstehen und ihre Kontaktdaten zu erfassen",
    booking: "Besuchern bei der Terminvereinbarung und Verfügbarkeitsprüfung zu helfen",
    qualify: "Interessenten zu qualifizieren, indem du die richtigen Fragen stellst",
    service: "exzellenten Kundenservice zu bieten, Probleme zu lösen und bei Bedarf zu eskalieren",
    custom: opts.customGoal || "Besucher bei ihren Anliegen zu unterstützen",
  };

  const toneLabel = opts.tone <= 30 ? "formal und professionell" : opts.tone >= 70 ? "locker und freundlich" : "zugänglich und doch professionell";
  const lengthLabel = opts.length <= 30 ? "knapp — halte die Antworten kurz und auf den Punkt" : opts.length >= 70 ? "ausführlich — gib gründliche, umfassende Antworten" : "ausgewogen — sei informativ ohne weitschweifig zu werden";
  const formalityLabel = opts.tone <= 30 ? "Sie" : "du";

  let prompt = `Du bist ${opts.businessName ? `der KI-Assistent von ${opts.businessName}` : "ein professioneller KI-Assistent"}`;
  if (opts.industry && opts.industry !== "Other") {
    prompt += ` im Bereich ${opts.industry}`;
  }
  prompt += `. Dein Ziel ist es, ${goalMap[opts.goal] || goalMap.custom}.\n\n`;

  prompt += `Richtlinien:\n`;
  prompt += `- Kommuniziere ${toneLabel}\n`;
  prompt += `- Antworte ${lengthLabel}\n`;
  prompt += `- Verwende die ${formalityLabel}-Form\n`;
  prompt += `- Wenn du die Antwort nicht weißt, sage es ehrlich und biete an, einen Menschen zu kontaktieren\n`;

  if (opts.goal === "leads" || opts.goal === "qualify") {
    prompt += `- Wenn ein Besucher Interesse zeigt, frage freundlich nach Name und E-Mail-Adresse\n`;
    prompt += `- Nutze die Lead-Erfassung, sobald du eine E-Mail-Adresse erhältst\n`;
  }

  if (opts.goal === "booking") {
    prompt += `- Wenn ein Besucher einen Termin möchte, nutze die Terminbuchungsfunktion\n`;
    prompt += `- Zeige verfügbare Zeitfenster und bestätige die Buchung\n`;
  }

  if (opts.goal === "service" || opts.goal === "support") {
    prompt += `- Bei komplexen Problemen, die du nicht lösen kannst, leite an einen menschlichen Mitarbeiter weiter\n`;
    prompt += `- Frage gezielt nach, um das Problem einzugrenzen\n`;
  }

  if (opts.kbMode === "faq" && opts.faqPairs.some((f) => f.q && f.a)) {
    prompt += `\n---\nHÄUFIG GESTELLTE FRAGEN:\n`;
    for (const faq of opts.faqPairs) {
      if (faq.q && faq.a) {
        prompt += `\nF: ${faq.q}\nA: ${faq.a}\n`;
      }
    }
    prompt += `---\nNutze diese FAQ, um häufige Fragen zu beantworten.\n`;
  }

  prompt += `\nAntworte immer auf Deutsch.\n`;

  return prompt;
}

/* ---------- Personality Preview ---------- */
function PersonalityPreview({ tone, length, businessName }: { tone: number; length: number; businessName: string }) {
  const greeting = tone >= 70
    ? `Hey! 👋 Glad you stopped by! I'm the assistant from ${businessName || "our team"}. How can I help?`
    : tone <= 30
      ? `Good day. Welcome to ${businessName || "our service"}. How may I assist you?`
      : `Hi! Welcome to ${businessName || "us"}. How can I help you?`;

  const answer = length >= 70
    ? `Great question! Let me give you a detailed answer. We offer several options, and I'd be happy to walk you through each one. To start with...`
    : length <= 30
      ? `Yes, that's possible. Send me your email and I'll forward the details.`
      : `Yes, we can do that! Happy to share more details if you'd like.`;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Eye className="h-3 w-3" /> Live Preview
      </p>
      <div className="space-y-2">
        <div className="flex justify-start">
          <div className="rounded-lg rounded-bl-sm bg-muted px-3 py-2 text-xs text-foreground max-w-[85%]">
            {greeting}
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded-lg rounded-br-sm bg-kiln-orange/10 px-3 py-2 text-xs text-foreground max-w-[85%]">
            Can you help me with that?
          </div>
        </div>
        <div className="flex justify-start">
          <div className="rounded-lg rounded-bl-sm bg-muted px-3 py-2 text-xs text-foreground max-w-[85%]">
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */
export function AgentWizard({ onBack }: { onBack: () => void }) {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<WizardStep>("goal");
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  // Step 1: Goal
  const [selectedGoal, setSelectedGoal] = useState<string>("");
  const [customGoal, setCustomGoal] = useState("");

  // Step 2: Business
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Step 3: Knowledge
  const [kbMode, setKbMode] = useState<"later" | "website" | "faq">("later");
  const [faqPairs, setFaqPairs] = useState([
    { q: "", a: "" }, { q: "", a: "" }, { q: "", a: "" }, { q: "", a: "" }, { q: "", a: "" },
  ]);

  // Step 4: Personality
  const [tone, setTone] = useState(50);
  const [length, setLength] = useState(50);
  const [language, setLanguage] = useState("auto");

  // Step 5: Review
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalData = GOALS.find((g) => g.id === selectedGoal);
  const actions = goalData?.actions || [];

  const generatedPrompt = useCallback(() => {
    return generateSystemPrompt({
      goal: selectedGoal,
      businessName,
      industry,
      customGoal,
      tone,
      length,
      language,
      kbMode,
      faqPairs,
    });
  }, [selectedGoal, businessName, industry, customGoal, tone, length, language, kbMode, faqPairs]);

  function getDisplayPrompt() {
    return customPrompt || generatedPrompt();
  }

  function canProceed(): boolean {
    switch (step) {
      case "goal": return !!selectedGoal && (selectedGoal !== "custom" || !!customGoal.trim());
      case "business": return !!businessName.trim();
      case "knowledge": return true;
      case "personality": return true;
      case "review": return true;
      default: return false;
    }
  }

  function goNext() {
    const next = STEPS[stepIdx + 1];
    if (next) {
      // When entering review, sync the prompt
      if (next.id === "review" && !customPrompt) {
        setCustomPrompt("");
      }
      setStep(next.id);
    }
  }

  function goBack() {
    if (stepIdx === 0) {
      onBack();
    } else {
      setStep(STEPS[stepIdx - 1].id);
    }
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);

    try {
      const systemPrompt = getDisplayPrompt();
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36).slice(-4);
      const toneLabel = tone <= 30 ? "formal, professional" : tone >= 70 ? "casual, friendly" : "approachable, professional";
      const welcomeMessage = tone >= 70
        ? `Hey! 👋 Glad you stopped by! I'm the assistant from ${businessName}. How can I help?`
        : tone <= 30
          ? `Good day. Welcome to ${businessName}. How may I assist you?`
          : `Hi! Welcome to ${businessName}. How can I help you?`;

      const suggestedQuestions: string[] = [];
      if (selectedGoal === "booking") suggestedQuestions.push("Can I book an appointment?", "What times do you have available?");
      if (selectedGoal === "leads" || selectedGoal === "qualify") suggestedQuestions.push("What do you offer?", "How can I learn more?");
      if (selectedGoal === "support" || selectedGoal === "service") suggestedQuestions.push("I need help", "How does this work?");
      if (suggestedQuestions.length === 0) suggestedQuestions.push("What can you do for me?", "Tell me more");

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${businessName} Assistant`,
          slug,
          description: goalData?.description || customGoal || "",
          systemPrompt,
          personality: {
            tone: toneLabel,
            language: language === "auto" ? "de" : language,
            formality: tone <= 30 ? "Sie" : "du",
          },
          welcomeMessage,
          suggestedQuestions,
          suggestedActions: actions,
          mode: "CHAT",
          autoDetectLanguage: language === "auto",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error creating agent");
      }

      const agent = await res.json();

      // Auto-crawl website if user chose that option
      if (kbMode === "website" && websiteUrl.trim()) {
        try {
          await fetch(`/api/agents/${agent.id}/knowledge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "URL", url: websiteUrl.trim() }),
          });
        } catch {
          // KB creation failed — agent still created, user can add later
        }
      }

      router.push(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/10">
            <Sparkles className="h-4 w-4 text-kiln-orange" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Agent Builder</h1>
            <p className="text-xs text-muted-foreground">Step {stepIdx + 1} of {STEPS.length}: {STEPS[stepIdx].label}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {step === "review" && (
            <Button onClick={handleCreate} disabled={saving} size="sm">
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Create Agent
            </Button>
          )}
        </div>
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-1 border-b border-border px-6 py-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <button
              onClick={() => i <= stepIdx && setStep(s.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                i === stepIdx ? "bg-kiln-orange text-white" :
                i < stepIdx ? "bg-kiln-orange/10 text-kiln-orange cursor-pointer" :
                "bg-muted text-muted-foreground"
              )}
            >
              {i < stepIdx ? <Check className="mr-1 inline h-3 w-3" /> : null}
              {s.label}
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8">

          {/* ─── Step 1: Goal ─── */}
          {step === "goal" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-foreground">What&apos;s the goal?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Choose what your agent should primarily do.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {GOALS.map((goal) => (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                      selectedGoal === goal.id
                        ? "border-kiln-orange bg-kiln-orange/5 ring-1 ring-kiln-orange/20"
                        : "border-border hover:border-kiln-orange/30 hover:bg-muted/30"
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      selectedGoal === goal.id ? "bg-kiln-orange/10 text-kiln-orange" : "bg-muted text-muted-foreground"
                    )}>
                      <goal.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{goal.label}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">{goal.description}</p>
                    </div>
                  </button>
                ))}
              </div>
              {selectedGoal === "custom" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Describe the goal</label>
                  <textarea
                    value={customGoal}
                    onChange={(e) => setCustomGoal(e.target.value)}
                    rows={3}
                    placeholder="e.g. Help visitors find the right product based on their needs..."
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange resize-none"
                  />
                </div>
              )}
              {selectedGoal && selectedGoal !== "custom" && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Auto-enabled actions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {actions.map((a) => (
                      <span key={a} className="rounded-full bg-kiln-orange/10 px-2.5 py-0.5 text-[10px] font-medium text-kiln-orange">
                        {a === "booking" ? "Appointment Booking" : a === "email" ? "Lead Capture" : a === "lead_scoring" ? "Lead Scoring" : a === "faq" ? "FAQ" : a === "handoff" ? "Human Handoff" : a === "notification" ? "Owner Notification" : a === "webhook" ? "Webhook" : a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={goNext} disabled={!canProceed()}>
                  Next <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 2: Business ─── */}
          {step === "business" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-foreground">Tell me about your business</h2>
                <p className="mt-1 text-sm text-muted-foreground">This helps generate a tailored system prompt.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Business Name *</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Acme Inc., TechFlow GmbH"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Industry</label>
                <div className="relative">
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2.5 pr-10 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                  >
                    <option value="">Select industry...</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Website URL <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.example.com"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">If provided, we can auto-import content for the knowledge base.</p>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={goBack}>Back</Button>
                <Button onClick={goNext} disabled={!canProceed()}>
                  Next <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Knowledge ─── */}
          {step === "knowledge" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-foreground">What should the agent know?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Add knowledge to make your agent smarter. You can always add more later.</p>
              </div>
              <div className="grid gap-3">
                {[
                  { id: "later" as const, label: "I'll upload documents later", desc: "Skip for now — add PDFs, URLs, or text later", icon: Upload },
                  { id: "website" as const, label: "Import from my website", desc: websiteUrl ? `Crawl ${websiteUrl}` : "Enter a URL to auto-import content", icon: FileText },
                  { id: "faq" as const, label: "Start with FAQ", desc: "Add common questions and answers", icon: HelpCircle },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setKbMode(opt.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                      kbMode === opt.id
                        ? "border-kiln-orange bg-kiln-orange/5 ring-1 ring-kiln-orange/20"
                        : "border-border hover:border-kiln-orange/30"
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      kbMode === opt.id ? "bg-kiln-orange/10 text-kiln-orange" : "bg-muted text-muted-foreground"
                    )}>
                      <opt.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{opt.label}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {kbMode === "website" && !websiteUrl && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Website URL</label>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://www.example.com"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                  />
                </div>
              )}

              {kbMode === "faq" && (
                <div className="space-y-3">
                  {faqPairs.map((faq, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <input
                        type="text"
                        value={faq.q}
                        onChange={(e) => {
                          const next = [...faqPairs];
                          next[i] = { ...next[i], q: e.target.value };
                          setFaqPairs(next);
                        }}
                        placeholder={`Question ${i + 1}`}
                        className="w-full rounded border-0 bg-transparent px-0 text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                      />
                      <textarea
                        value={faq.a}
                        onChange={(e) => {
                          const next = [...faqPairs];
                          next[i] = { ...next[i], a: e.target.value };
                          setFaqPairs(next);
                        }}
                        rows={2}
                        placeholder="Answer..."
                        className="w-full rounded border-0 bg-transparent px-0 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setFaqPairs([...faqPairs, { q: "", a: "" }])}
                    className="text-xs font-medium text-kiln-orange hover:text-kiln-orange/80"
                  >
                    + Add another FAQ
                  </button>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={goBack}>Back</Button>
                <Button onClick={goNext}>
                  Next <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 4: Personality & Style ─── */}
          {step === "personality" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-foreground">Personality & Style</h2>
                <p className="mt-1 text-sm text-muted-foreground">Define how your agent communicates.</p>
              </div>

              <div>
                <label className="mb-3 flex items-center justify-between text-sm font-medium text-foreground">
                  <span>Tone</span>
                  <span className="text-xs text-muted-foreground">{tone <= 30 ? "Formal" : tone >= 70 ? "Casual" : "Balanced"}</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-14 text-right">Formal</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={tone}
                    onChange={(e) => setTone(Number(e.target.value))}
                    className="flex-1 accent-kiln-orange"
                  />
                  <span className="text-xs text-muted-foreground w-14">Casual</span>
                </div>
              </div>

              <div>
                <label className="mb-3 flex items-center justify-between text-sm font-medium text-foreground">
                  <span>Response Length</span>
                  <span className="text-xs text-muted-foreground">{length <= 30 ? "Concise" : length >= 70 ? "Detailed" : "Balanced"}</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-14 text-right">Concise</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="flex-1 accent-kiln-orange"
                  />
                  <span className="text-xs text-muted-foreground w-14">Detailed</span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Language</label>
                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2.5 pr-10 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                  >
                    <option value="auto">Auto-detect (recommended)</option>
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                    <option value="es">Español</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <PersonalityPreview tone={tone} length={length} businessName={businessName} />

              <div className="flex justify-between">
                <Button variant="outline" onClick={goBack}>Back</Button>
                <Button onClick={goNext}>
                  Review <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 5: Review & Create ─── */}
          {step === "review" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-foreground">Review & Create</h2>
                <p className="mt-1 text-sm text-muted-foreground">Everything look good? Your agent will be immediately testable.</p>
              </div>

              {/* Summary Cards */}
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Agent</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{businessName} Assistant</p>
                  <p className="text-xs text-muted-foreground">{goalData?.label || customGoal}{industry ? ` — ${industry}` : ""}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Actions</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {actions.length > 0 ? actions.map((a) => (
                      <span key={a} className="rounded-full bg-kiln-orange/10 px-2.5 py-0.5 text-[10px] font-medium text-kiln-orange">
                        {a === "booking" ? "Appointment Booking" : a === "email" ? "Lead Capture" : a === "lead_scoring" ? "Lead Scoring" : a === "faq" ? "FAQ" : a === "handoff" ? "Human Handoff" : a === "notification" ? "Owner Notification" : a}
                      </span>
                    )) : (
                      <span className="text-xs text-muted-foreground">No actions — add in agent settings later</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Style</p>
                  <p className="mt-1 text-xs text-foreground">
                    {tone <= 30 ? "Formal" : tone >= 70 ? "Casual" : "Balanced"} tone,{" "}
                    {length <= 30 ? "concise" : length >= 70 ? "detailed" : "balanced"} responses,{" "}
                    {language === "auto" ? "auto-detect language" : language}
                  </p>
                </div>
                {kbMode === "website" && websiteUrl && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Knowledge Base</p>
                    <p className="mt-1 text-xs text-foreground">Auto-import from {websiteUrl}</p>
                  </div>
                )}
                {kbMode === "faq" && faqPairs.some((f) => f.q && f.a) && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Knowledge Base</p>
                    <p className="mt-1 text-xs text-foreground">{faqPairs.filter((f) => f.q && f.a).length} FAQ entries</p>
                  </div>
                )}
              </div>

              {/* System Prompt */}
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">System Prompt (auto-generated)</p>
                  <button
                    onClick={() => {
                      if (!editingPrompt && !customPrompt) setCustomPrompt(generatedPrompt());
                      setEditingPrompt(!editingPrompt);
                    }}
                    className="text-[10px] font-medium text-kiln-orange hover:text-kiln-orange/80"
                  >
                    {editingPrompt ? "Done editing" : "Edit"}
                  </button>
                </div>
                {editingPrompt ? (
                  <textarea
                    value={customPrompt || generatedPrompt()}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={12}
                    className="w-full border-0 bg-transparent px-4 py-3 font-mono text-xs text-foreground focus:outline-none resize-none"
                  />
                ) : (
                  <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs text-muted-foreground">
                    {getDisplayPrompt()}
                  </pre>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={goBack}>Back</Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                  Create Agent
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
