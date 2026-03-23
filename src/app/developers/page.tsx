"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Copy as CopyIcon,
  Terminal,
  Bot,
  Globe,
  Key,
  Users,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Wrench,
  FlaskConical,
  Layers,
  Network,
  Zap,
  Database,
  Code2,
  Monitor,
  MousePointer2,
  Shield,
} from "lucide-react";

// ─── Star Field Background ─────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let stars: { x: number; y: number; r: number; vx: number; vy: number; opacity: number; twinkleSpeed: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const createStars = () => {
      stars = [];
      const count = Math.floor((canvas.width * canvas.height) / 4000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.5 + 0.3,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.1,
          opacity: Math.random() * 0.6 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
        });
      }
    };
    createStars();

    let time = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 1;

      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;

        if (star.x < 0) star.x = canvas.width;
        if (star.x > canvas.width) star.x = 0;
        if (star.y < 0) star.y = canvas.height;
        if (star.y > canvas.height) star.y = 0;

        const twinkle = Math.sin(time * star.twinkleSpeed) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);

    window.addEventListener("resize", () => {
      resize();
      createStars();
    });

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ background: "transparent" }}
    />
  );
}

// ─── MCP Tool Reference Data ─────────────────────────────────────
const TOOL_CATEGORIES = [
  {
    name: "Agent Management",
    icon: Bot,
    color: "#F97316",
    tools: [
      { name: "kiln_list_agents", desc: "List all agents with status, model, conversation count, and public URL." },
      { name: "kiln_create_agent", desc: "Create a CHAT or TASK agent from natural language. Returns ID, slug, and URL." },
      { name: "kiln_update_agent", desc: "Update any agent config field — prompt, model, personality, language." },
      { name: "kiln_delete_agent", desc: "Permanently delete an agent and all associated data." },
      { name: "kiln_clone_agent", desc: "Clone an agent with all config, actions, tools, and knowledge." },
      { name: "kiln_deploy_agent", desc: "Set agent status to LIVE, DRAFT, or PAUSED." },
      { name: "kiln_export_agent_config", desc: "Export full agent config as JSON for version control." },
      { name: "kiln_import_agent_config", desc: "Create an agent from exported config JSON." },
    ],
  },
  {
    name: "Knowledge & Training",
    icon: Database,
    color: "#3B82F6",
    tools: [
      { name: "kiln_add_knowledge", desc: "Add TEXT, URL, PDF, or FAQ entries to an agent's knowledge base." },
      { name: "kiln_add_branch", desc: "Add conditional prompt branches triggered by keyword matches." },
      { name: "kiln_set_memory", desc: "Toggle persistent cross-conversation memory for an agent." },
    ],
  },
  {
    name: "Chat & Conversations",
    icon: MessageSquare,
    color: "#22C55E",
    tools: [
      { name: "kiln_chat", desc: "Send a message and get a response. Use sessionId for multi-turn context." },
      { name: "kiln_get_conversations", desc: "Retrieve conversation logs with messages, lead scores, and visitor info." },
      { name: "kiln_get_leads", desc: "Get collected leads with email, name, score, and context." },
      { name: "kiln_get_analytics", desc: "Analytics: conversations, leads, avg score, daily breakdown." },
    ],
  },
  {
    name: "Actions & Custom Tools",
    icon: Wrench,
    color: "#FBBF24",
    tools: [
      { name: "kiln_add_action", desc: "Enable booking, email, lead scoring, webhooks, or custom code actions." },
      { name: "kiln_add_custom_tool", desc: "Add an HTTP API tool the agent can call during conversations." },
      { name: "kiln_add_custom_code", desc: "Add sandboxed custom code that runs when triggered." },
      { name: "kiln_set_white_label", desc: "Configure branding: color, logo, badge visibility." },
    ],
  },
  {
    name: "Testing & Quality",
    icon: FlaskConical,
    color: "#A78BFA",
    tools: [
      { name: "kiln_create_test", desc: "Create a test case with input message and expected keywords." },
      { name: "kiln_run_tests", desc: "Execute all tests — sends inputs to LLM, checks keywords, returns score." },
    ],
  },
  {
    name: "Deployment & Webhooks",
    icon: Globe,
    color: "#EC4899",
    tools: [
      { name: "kiln_get_embed_code", desc: "Get the embed script tag and public URL for the chat widget." },
      { name: "kiln_create_webhook", desc: "Create an inbound webhook endpoint with auth config." },
      { name: "kiln_list_webhooks", desc: "List webhooks with URLs, auth config, and execution stats." },
      { name: "kiln_delete_webhook", desc: "Delete a webhook and all its execution logs." },
    ],
  },
  {
    name: "Teams & Orchestration",
    icon: Users,
    color: "#14B8A6",
    tools: [
      { name: "kiln_create_team", desc: "Create an Agent Team — optionally from SALES, SUPPORT, or CONTENT template." },
      { name: "kiln_list_teams", desc: "List teams with member count, task count, and status." },
      { name: "kiln_add_team_member", desc: "Add an agent as HEAD, COORDINATOR, EXECUTOR, or REPORTER." },
      { name: "kiln_assign_task", desc: "Assign a task to the HEAD for automatic delegation." },
      { name: "kiln_get_team_status", desc: "Get team status: members, tasks, and progress." },
      { name: "kiln_execute_team", desc: "Execute a full team workflow — HEAD decomposes goal into subtasks." },
      { name: "kiln_orchestrate", desc: "Define agent-to-agent handoff rules with conditions." },
    ],
  },
  {
    name: "Task Agents & Workflows",
    icon: Zap,
    color: "#F97316",
    tools: [
      { name: "kiln_create_task_agent", desc: "Create a Task Agent with input schema, output format, and pre/post processing." },
      { name: "kiln_run_task", desc: "Execute a Task Agent with JSON input and wait for results." },
      { name: "kiln_run_agent", desc: "Manually trigger a Task Agent and return execution results." },
      { name: "kiln_get_runs", desc: "Execution history: status, duration, output, credits used." },
      { name: "kiln_create_workflow_automation", desc: "Create scheduled or webhook-triggered automations." },
      { name: "kiln_list_workflows", desc: "List all automations, teams, and orchestration rules." },
    ],
  },
];

const TOTAL_TOOLS = TOOL_CATEGORIES.reduce((sum, c) => sum + c.tools.length, 0);

// ─── Copy Button Component ──────────────────────────────────────
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-white"
    >
      {copied ? <Check className="h-3 w-3 text-[#22C55E]" /> : <CopyIcon className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Animated Section ────────────────────────────────────────────
function Section({
  children,
  className = "",
  id,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  delay?: number;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// ─── Tool Category Accordion ─────────────────────────────────────
function ToolCategory({ category, defaultOpen = false }: { category: typeof TOOL_CATEGORIES[0]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = category.icon;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/[0.10]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${category.color}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: category.color }} />
        </div>
        <div className="flex-1">
          <span className="text-sm font-medium text-white">{category.name}</span>
          <span className="ml-2 text-xs text-neutral-500">{category.tools.length} tools</span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-neutral-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-neutral-500" />
        )}
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-5 pb-4 pt-2">
          {category.tools.map((tool) => (
            <div key={tool.name} className="flex items-start gap-3 py-2.5">
              <code className="shrink-0 rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-[#22C55E]">
                {tool.name}
              </code>
              <span className="text-xs leading-relaxed text-neutral-400">{tool.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────
export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-[#0C0A09] text-white">
      <StarField />
      <div className="relative z-10">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-[#0C0A09]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#F97316] to-[#DC2626]">
              <span className="font-serif text-sm font-bold text-white">K</span>
            </div>
            <span className="font-serif text-lg text-white">KILN</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-neutral-400">
            <Link href="/#features" className="hidden transition-colors hover:text-white sm:block">Features</Link>
            <Link href="/#pricing" className="hidden transition-colors hover:text-white sm:block">Pricing</Link>
            <Link href="/enterprise" className="hidden transition-colors hover:text-white sm:block">Enterprise</Link>
            <Link href="/developers" className="text-white">Developers</Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-[#22C55E] px-4 py-1.5 text-xs font-semibold text-[#0C0A09] transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#22C55E]/20"
            >
              Get API Key
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <Section className="pb-20 pt-32">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-4 py-1.5 text-xs font-medium text-[#22C55E]"
          >
            <Terminal className="h-3.5 w-3.5" />
            MCP Server &middot; {TOTAL_TOOLS} tools &middot; Full lifecycle
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-5xl leading-[1.1] tracking-tight sm:text-7xl"
          >
            Deploy AI Agents
            <br />
            <span className="bg-gradient-to-r from-[#22C55E] to-[#3B82F6] bg-clip-text text-transparent">
              from your terminal
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400"
          >
            KILN is an MCP server. Build, deploy, and manage agents from Claude Code,
            Cursor, or any MCP client. {TOTAL_TOOLS} tools. Full lifecycle.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 flex items-center justify-center gap-4"
          >
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-6 py-3 text-sm font-semibold text-[#0C0A09] transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#22C55E]/20"
            >
              Get your API key — free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#get-started"
              className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-neutral-300 transition-all hover:border-white/20 hover:text-white"
            >
              See the setup
            </a>
          </motion.div>

          {/* Supported clients */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-12 flex items-center justify-center gap-8 text-xs text-neutral-500"
          >
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Claude Code
            </span>
            <span className="flex items-center gap-2">
              <Code2 className="h-4 w-4" /> Cursor
            </span>
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" /> Windsurf
            </span>
            <span className="flex items-center gap-2">
              <Network className="h-4 w-4" /> Any MCP Client
            </span>
          </motion.div>
        </div>
      </Section>

      {/* ── Get Started in 30 Seconds ──────────────────────── */}
      <Section id="get-started" className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#22C55E]">Quick Start</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Get started in <span className="text-[#22C55E]">30 seconds</span>
            </h2>
          </div>

          <div className="space-y-8">
            {/* Step 1 */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#22C55E] text-xs font-bold text-[#0C0A09]">1</div>
                <h3 className="text-sm font-semibold text-white">Add the MCP server</h3>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0A0A0A] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Terminal</span>
                  <CopyButton text='claude mcp add kiln-mcp --transport http https://kilnbase.com/api/mcp -H "Authorization: Bearer sk-kiln-YOUR_KEY"' />
                </div>
                <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
                  <code>
                    <span className="text-neutral-500">$</span>{" "}
                    <span className="text-[#F97316]">claude mcp add</span>{" "}
                    <span className="text-white">kiln-mcp</span>{" "}
                    <span className="text-neutral-500">\</span>{"\n"}
                    {"  "}<span className="text-neutral-400">--transport http</span>{" "}
                    <span className="text-neutral-500">\</span>{"\n"}
                    {"  "}<span className="text-[#22C55E]">https://kilnbase.com/api/mcp</span>{" "}
                    <span className="text-neutral-500">\</span>{"\n"}
                    {"  "}<span className="text-neutral-400">-H</span>{" "}
                    <span className="text-[#3B82F6]">&quot;Authorization: Bearer sk-kiln-YOUR_KEY&quot;</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#22C55E] text-xs font-bold text-[#0C0A09]">2</div>
                <h3 className="text-sm font-semibold text-white">Or configure via JSON</h3>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0A0A0A] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">.cursor/mcp.json or claude_desktop_config.json</span>
                  <CopyButton text={`{\n  "mcpServers": {\n    "kiln-mcp": {\n      "url": "https://kilnbase.com/api/mcp",\n      "headers": {\n        "Authorization": "Bearer sk-kiln-YOUR_KEY"\n      }\n    }\n  }\n}`} />
                </div>
                <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
                  <code>
                    <span className="text-neutral-500">{"{"}</span>{"\n"}
                    {"  "}<span className="text-[#3B82F6]">&quot;mcpServers&quot;</span><span className="text-neutral-500">:</span> <span className="text-neutral-500">{"{"}</span>{"\n"}
                    {"    "}<span className="text-[#3B82F6]">&quot;kiln-mcp&quot;</span><span className="text-neutral-500">:</span> <span className="text-neutral-500">{"{"}</span>{"\n"}
                    {"      "}<span className="text-[#3B82F6]">&quot;url&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;https://kilnbase.com/api/mcp&quot;</span><span className="text-neutral-500">,</span>{"\n"}
                    {"      "}<span className="text-[#3B82F6]">&quot;headers&quot;</span><span className="text-neutral-500">:</span> <span className="text-neutral-500">{"{"}</span>{"\n"}
                    {"        "}<span className="text-[#3B82F6]">&quot;Authorization&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;Bearer sk-kiln-YOUR_KEY&quot;</span>{"\n"}
                    {"      "}<span className="text-neutral-500">{"}"}</span>{"\n"}
                    {"    "}<span className="text-neutral-500">{"}"}</span>{"\n"}
                    {"  "}<span className="text-neutral-500">{"}"}</span>{"\n"}
                    <span className="text-neutral-500">{"}"}</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Step 3 */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#22C55E] text-xs font-bold text-[#0C0A09]">3</div>
                <h3 className="text-sm font-semibold text-white">Start building</h3>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0A0A0A] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Just tell your AI assistant what to build</span>
                </div>
                <div className="space-y-3 font-mono text-xs leading-relaxed">
                  <div>
                    <span className="text-neutral-500">You:</span>{" "}
                    <span className="text-white">&quot;Create a support agent for acme.com that answers questions about our product, collects leads, and escalates complex issues.&quot;</span>
                  </div>
                  <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
                    <span className="text-neutral-500">KILN:</span>{" "}
                    <span className="text-[#22C55E]">Agent created</span>{" "}
                    <span className="text-neutral-400">&#8212; &quot;Acme Support&quot;</span>{"\n"}
                    <span className="text-neutral-500">  Status:</span> <span className="text-[#F97316]">LIVE</span>{"\n"}
                    <span className="text-neutral-500">  URL:</span> <span className="text-[#3B82F6]">kilnbase.com/a/acme-support</span>{"\n"}
                    <span className="text-neutral-500">  Actions:</span> <span className="text-neutral-400">COLLECT_EMAIL, SCORE_LEAD, HANDOFF_HUMAN</span>{"\n"}
                    <span className="text-neutral-500">  Knowledge:</span> <span className="text-neutral-400">Crawling acme.com... 12 pages indexed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── What You Can Do ────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Capabilities</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">What you can do</h2>
            <p className="mt-4 text-lg text-neutral-400">Everything from agent creation to production monitoring, all from your IDE.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Bot,
                title: "Create agents",
                desc: "Describe what you need in natural language. KILN generates the system prompt, configures actions, and deploys instantly.",
                color: "#F97316",
                example: "\"Create a booking agent for my dental practice\"",
              },
              {
                icon: Database,
                title: "Train on data",
                desc: "Add URLs, PDFs, FAQs, and text to the knowledge base via MCP. Auto-chunking and vector embeddings.",
                color: "#3B82F6",
                example: "kiln_add_knowledge({ type: \"URL\", sourceUrl: \"docs.acme.com\" })",
              },
              {
                icon: Globe,
                title: "Deploy anywhere",
                desc: "Embed widget on any site, connect Slack, WhatsApp, Telegram, Email, or GitHub. One agent, every channel.",
                color: "#22C55E",
                example: "kiln_get_embed_code({ agentId }) → <script>",
              },
              {
                icon: Users,
                title: "Build teams",
                desc: "Multi-agent orchestration from your terminal. Create teams with HEAD, COORDINATOR, and EXECUTOR roles.",
                color: "#14B8A6",
                example: "kiln_create_team({ template: \"SALES\" })",
              },
              {
                icon: FlaskConical,
                title: "Monitor quality",
                desc: "Create test suites, run evals, analyze knowledge gaps, and A/B test different configs programmatically.",
                color: "#A78BFA",
                example: "kiln_run_tests({ agentId }) → { score: 0.92 }",
              },
              {
                icon: Key,
                title: "Scale with API",
                desc: "Scoped API keys, inbound webhooks, scheduled automations, and workflow orchestration for production workloads.",
                color: "#EC4899",
                example: "kiln_create_workflow_automation({ schedule: \"0 9 * * 1\" })",
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]"
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${card.color}15` }}
                >
                  <card.icon className="h-5 w-5" style={{ color: card.color }} />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-neutral-400">{card.desc}</p>
                <code className="block rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-500">
                  {card.example}
                </code>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── CLI / Infrastructure as Code ───────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#3B82F6]">Infrastructure as Code</p>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Version control
                <br />
                <span className="bg-gradient-to-r from-[#3B82F6] to-[#A78BFA] bg-clip-text text-transparent">your AI agents</span>
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-400">
                Export agent configs as JSON, store them in Git, and import them anywhere.
                Treat AI agents like any other infrastructure.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <Link
                  href="/sign-up"
                  className="rounded-xl bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#3B82F6]/20"
                >
                  Start building
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0A0A0A] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#DC2626]/60" />
                  <div className="h-3 w-3 rounded-full bg-[#FBBF24]/60" />
                  <div className="h-3 w-3 rounded-full bg-[#22C55E]/60" />
                  <span className="ml-3 text-xs text-neutral-500">agent-config.json</span>
                </div>
                <CopyButton text={`{\n  "name": "Acme Support",\n  "systemPrompt": "Du bist der Kundenservice...",\n  "llmModel": "claude-sonnet-4-6",\n  "temperature": 0.7,\n  "actions": [\n    { "type": "COLLECT_EMAIL", "enabled": true },\n    { "type": "SCORE_LEAD", "enabled": true },\n    { "type": "BOOK_APPOINTMENT", "config": {\n      "calendlyUrl": "https://cal.com/acme"\n    }}\n  ],\n  "whiteLabel": {\n    "primaryColor": "#2563EB",\n    "showPoweredBy": false\n  }\n}`} />
              </div>
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
                <code>
                  <span className="text-neutral-500">{"{"}</span>{"\n"}
                  {"  "}<span className="text-[#3B82F6]">&quot;name&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;Acme Support&quot;</span><span className="text-neutral-500">,</span>{"\n"}
                  {"  "}<span className="text-[#3B82F6]">&quot;systemPrompt&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;Du bist der Kundenservice...&quot;</span><span className="text-neutral-500">,</span>{"\n"}
                  {"  "}<span className="text-[#3B82F6]">&quot;llmModel&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;claude-sonnet-4-6&quot;</span><span className="text-neutral-500">,</span>{"\n"}
                  {"  "}<span className="text-[#3B82F6]">&quot;temperature&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#F97316]">0.7</span><span className="text-neutral-500">,</span>{"\n"}
                  {"  "}<span className="text-[#3B82F6]">&quot;actions&quot;</span><span className="text-neutral-500">:</span> <span className="text-neutral-500">[</span>{"\n"}
                  {"    "}<span className="text-neutral-500">{"{"}</span> <span className="text-[#3B82F6]">&quot;type&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;COLLECT_EMAIL&quot;</span><span className="text-neutral-500">,</span> <span className="text-[#3B82F6]">&quot;enabled&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#F97316]">true</span> <span className="text-neutral-500">{"}"}</span><span className="text-neutral-500">,</span>{"\n"}
                  {"    "}<span className="text-neutral-500">{"{"}</span> <span className="text-[#3B82F6]">&quot;type&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;SCORE_LEAD&quot;</span><span className="text-neutral-500">,</span> <span className="text-[#3B82F6]">&quot;enabled&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#F97316]">true</span> <span className="text-neutral-500">{"}"}</span><span className="text-neutral-500">,</span>{"\n"}
                  {"    "}<span className="text-neutral-500">{"{"}</span> <span className="text-[#3B82F6]">&quot;type&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;BOOK_APPOINTMENT&quot;</span><span className="text-neutral-500">,</span> <span className="text-[#3B82F6]">&quot;config&quot;</span><span className="text-neutral-500">:</span> <span className="text-neutral-500">{"{"}</span>{"\n"}
                  {"      "}<span className="text-[#3B82F6]">&quot;calendlyUrl&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;https://cal.com/acme&quot;</span>{"\n"}
                  {"    "}<span className="text-neutral-500">{"}"}</span> <span className="text-neutral-500">{"}"}</span>{"\n"}
                  {"  "}<span className="text-neutral-500">]</span><span className="text-neutral-500">,</span>{"\n"}
                  {"  "}<span className="text-[#3B82F6]">&quot;whiteLabel&quot;</span><span className="text-neutral-500">:</span> <span className="text-neutral-500">{"{"}</span>{"\n"}
                  {"    "}<span className="text-[#3B82F6]">&quot;primaryColor&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#22C55E]">&quot;#2563EB&quot;</span><span className="text-neutral-500">,</span>{"\n"}
                  {"    "}<span className="text-[#3B82F6]">&quot;showPoweredBy&quot;</span><span className="text-neutral-500">:</span> <span className="text-[#F97316]">false</span>{"\n"}
                  {"  "}<span className="text-neutral-500">{"}"}</span>{"\n"}
                  <span className="text-neutral-500">{"}"}</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Full Tool Reference ─────────────────────────────── */}
      <Section id="tools" className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#A78BFA]">Reference</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Full tool reference
            </h2>
            <p className="mt-4 text-lg text-neutral-400">
              {TOTAL_TOOLS} MCP tools across {TOOL_CATEGORIES.length} categories. Click to expand.
            </p>
          </div>

          <div className="space-y-3">
            {TOOL_CATEGORIES.map((category, i) => (
              <ToolCategory key={category.name} category={category} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </Section>

      {/* ── Computer Use & Sandbox ─────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#DC2626]">Computer Use</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Computer Use &
              <br />
              <span className="bg-gradient-to-r from-[#DC2626] to-[#F97316] bg-clip-text text-transparent">Sandbox Execution</span>
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-neutral-400">
              Give your agents real computer capabilities. Browse websites, fill forms, extract data,
              and execute code in isolated sandboxes — all orchestrated through KILN.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Monitor,
                title: "Browser Automation",
                desc: "Agents navigate real websites, click buttons, fill forms, and extract structured data. Powered by Playwright with anti-detection.",
                color: "#DC2626",
              },
              {
                icon: MousePointer2,
                title: "Visual Understanding",
                desc: "Screenshot-based reasoning. Agents see the page like a human, identify elements, and take action based on visual context.",
                color: "#F97316",
              },
              {
                icon: Code2,
                title: "Code Sandbox",
                desc: "Execute Python, JavaScript, and TypeScript in isolated E2B sandboxes. Install packages, process files, run data pipelines.",
                color: "#22C55E",
              },
              {
                icon: Shield,
                title: "Isolated Execution",
                desc: "Every sandbox is a fresh VM with resource limits. No cross-session contamination. Auto-cleanup after execution completes.",
                color: "#3B82F6",
              },
              {
                icon: Database,
                title: "Persistent Workspace",
                desc: "Agents save files, reports, and artifacts to persistent workspaces. Version history, download API, and plan-gated storage limits.",
                color: "#A78BFA",
              },
              {
                icon: Zap,
                title: "Checkpoint & Resume",
                desc: "Long-running browser and code tasks checkpoint automatically. If the serverless function times out, execution resumes from the last checkpoint.",
                color: "#14B8A6",
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]"
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${card.color}15` }}
                >
                  <card.icon className="h-5 w-5" style={{ color: card.color }} />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{card.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 flex items-center justify-center gap-4">
            <Link
              href="/computer-use"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-neutral-300 transition-all hover:border-white/20 hover:text-white"
            >
              Learn more about Computer Use
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Section>

      {/* ── Agent SDK & CLI ──────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Agent SDK</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Agent SDK & CLI</h2>
            <p className="mt-4 text-lg text-neutral-400">
              Build, deploy, and manage agents programmatically with our TypeScript SDK and CLI tool.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "TypeScript SDK", desc: "First-class TypeScript support with full type definitions. Create agents, manage knowledge bases, and handle conversations from your codebase.", color: "#3B82F6" },
              { title: "CLI Tool", desc: "Deploy agents from CI/CD pipelines, export configs, run tests, and manage infrastructure — all from the command line.", color: "#22C55E" },
              { title: "RBAC Scoped Keys", desc: "Generate API keys with granular permissions. Restrict access to specific agents, actions, or read-only analytics.", color: "#A78BFA" },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]">
                <div className="mb-3 h-1 w-8 rounded-full" style={{ backgroundColor: card.color }} />
                <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Custom Node SDK ───────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#14B8A6]">Extensibility</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Custom Node SDK</h2>
            <p className="mt-4 text-lg text-neutral-400">
              Build custom workflow nodes with our Node SDK. Define inputs, outputs, and execution logic — then share them on the Marketplace.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: "Define Schema", desc: "Strongly typed input/output schemas with validation. Your nodes appear in the visual workflow editor with auto-generated UI." },
              { title: "Sandboxed Execution", desc: "Nodes run in isolated sandboxes with resource limits. Access HTTP, file system (scoped), and environment variables securely." },
              { title: "Marketplace Publishing", desc: "Package and publish custom nodes to the KILN Marketplace. Version control, documentation, and usage analytics included." },
              { title: "Pre-built Connectors", desc: "Start from 20+ pre-built connectors (Slack, Gmail, Sheets, Notion) or fork them to build your own." },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]">
                <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Embeddable Components ─────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#EC4899]">Embed</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Embeddable Components</h2>
            <p className="mt-4 text-lg text-neutral-400">
              Drop KILN agents into any frontend. React, Vue, vanilla JS — or just an iframe.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "React SDK", desc: "<KilnChat /> component with full props API. Theme customization, event hooks, and TypeScript support.", code: "npm install @kiln/react" },
              { title: "Web Component", desc: "Framework-agnostic <kiln-chat> custom element. Works with Vue, Svelte, Angular, or plain HTML.", code: "<script src=\"kiln.js\"></script>" },
              { title: "iframe Embed", desc: "Zero-dependency embed with one line. Full white-label support, responsive sizing, and cross-origin messaging.", code: "<iframe src=\"/embed/slug\" />" },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]">
                <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-neutral-400">{card.desc}</p>
                <code className="block rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-[11px] text-neutral-500">{card.code}</code>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Sandbox API ──────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#FBBF24]">Execution</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Sandbox API</h2>
            <p className="mt-4 text-lg text-neutral-400">
              Execute arbitrary code in isolated sandboxes. Perfect for AI-generated code, data transformations, and custom agent logic.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "Language Support", desc: "Run JavaScript, TypeScript, and Python in sandboxed environments with pre-installed packages and dependency management." },
              { title: "Resource Limits", desc: "Configurable CPU, memory, and execution time limits. Auto-termination for runaway processes. Scoped filesystem access." },
              { title: "REST API", desc: "Simple POST endpoint. Send code, get results. Supports stdin/stdout streaming for long-running tasks." },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]">
                <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Webhook V2 ───────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#DC2626]">Integrations</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Webhook V2</h2>
            <p className="mt-4 text-lg text-neutral-400">
              Production-grade webhook infrastructure with retry logic, HMAC signatures, and delivery tracking.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "HMAC Signatures", desc: "Every payload is signed with SHA-256 HMAC. Verify authenticity on your end with the shared secret." },
              { title: "Auto Retry", desc: "Failed deliveries are retried with exponential backoff. Up to 5 attempts over 24 hours." },
              { title: "Delivery Logs", desc: "Full history of every webhook delivery — payload, response code, latency, and retry count." },
              { title: "Event Filtering", desc: "Subscribe to specific events: conversation.started, lead.captured, agent.deployed, task.completed." },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]">
                <h3 className="mb-2 text-base font-semibold">{card.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Bottom CTA ──────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">
            Ready to build?
          </h2>
          <p className="mt-4 text-lg text-neutral-400">
            Get your free API key and start deploying agents in minutes.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#3B82F6] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#22C55E]/20"
            >
              Get your API key — free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-6 text-xs text-neutral-500">
            Free tier includes 50 AI credits/month. No credit card required.
          </p>
        </div>
      </Section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-[#F97316] to-[#DC2626]">
              <span className="font-serif text-[10px] font-bold text-white">K</span>
            </div>
            KILN by Hephaistos Systems
          </div>
          <div className="flex items-center gap-6 text-xs text-neutral-500">
            <Link href="/enterprise" className="hover:text-neutral-300">Enterprise</Link>
            <Link href="/changelog" className="hover:text-neutral-300">Changelog</Link>
            <Link href="/privacy" className="hover:text-neutral-300">Privacy</Link>
            <Link href="/terms" className="hover:text-neutral-300">Terms</Link>
            <Link href="/dpa" className="hover:text-neutral-300">DPA</Link>
            <Link href="/impressum" className="hover:text-neutral-300">Impressum</Link>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
