import { Metadata } from "next";
import { Plug } from "lucide-react";
import { FeaturePageTemplate } from "@/components/landing/feature-page-template";

export const metadata: Metadata = {
  title: "BYOK + MCP + A2A — KILN",
  description:
    "Bring your own keys. Connect 500+ tools via Model Context Protocol. Agent-to-Agent communication via Google's open standard. No vendor lock-in.",
};

export default function ByokMcpA2APage() {
  return (
    <FeaturePageTemplate
      prePill="Feature · BYOK + MCP + A2A"
      icon={Plug}
      headline={
        <>
          Open infrastructure.{" "}
          <span className="text-kiln-orange">No vendor lock-in.</span>
        </>
      }
      subhead="Bring your client's API keys. Connect 500+ tools via MCP. Speak A2A to other agent platforms. Three open standards, one platform."
      whatBody={
        <>
          <p>
            <strong>BYOK</strong>: every sub-org can ship its own
            Anthropic / OpenAI / Gemini / Groq keys. Your client pays the
            model provider directly. KILN never marks up tokens — you keep
            100% of the platform fee, and your client keeps full control of
            their AI spend.
          </p>
          <p>
            <strong>MCP (Model Context Protocol)</strong>: the open standard
            for tool calls. Connect any MCP server — there are 500+ in the
            community already covering Notion, Slack, Linear, Airtable,
            internal databases, custom HTTP services. KILN agents discover
            tools at runtime; no per-tool integration work.
          </p>
          <p>
            <strong>A2A (Agent-to-Agent)</strong>: Google&apos;s open
            standard for inter-agent communication. KILN agents can call
            and be called by any A2A-speaking agent — your sub-org&apos;s
            agent can hand off to a partner agency&apos;s specialized agent
            without leaving the protocol.
          </p>
        </>
      }
      howSteps={[
        {
          title: "Connect provider keys (BYOK)",
          body:
            "Per sub-org or per agent. Anthropic, OpenAI, Gemini, Groq, OpenRouter all supported. Override at the workflow node level for cost/performance routing.",
        },
        {
          title: "Plug in MCP servers",
          body:
            "Hosted MCP servers (Notion, Slack, GitHub, Linear) are one click. Custom MCP servers can be added by URL + bearer token. Tools surface in the workflow editor immediately.",
        },
        {
          title: "Connect A2A agents",
          body:
            "Register external A2A agents from your KILN dashboard. Workflows can call them with the same node interface as internal agents. Discovery via the public A2A directory.",
        },
      ]}
      useCases={[
        {
          title: "Cost-controlled deployments",
          body:
            "Use a cheap model (Haiku) for triage, route to Sonnet for reasoning, fall back to Gemini Flash for high-throughput batch. BYOK keeps the bill on the client.",
        },
        {
          title: "Internal-tool access",
          body:
            "Build an MCP server that exposes your client's CRM. Their agent now reads/writes CRM records natively, no glue code per client.",
        },
        {
          title: "Cross-agency handoff",
          body:
            "Your travel-booking agent calls a partner agency's flight-pricing agent via A2A. Both keep their own infrastructure; you split the revenue.",
        },
      ]}
      techBullets={[
        "Per-org and per-agent API key management with RBAC enforcement",
        "Native MCP client — discovers tools, validates schemas, manages auth tokens",
        "MCP server registry with one-click installs from the marketplace",
        "A2A protocol implementation matching Google's spec (call, observe, stream)",
        "Per-call cost attribution: which provider, which key, which token cost",
        "Rate-limit + budget-cap enforcement before any external call fires",
      ]}
    />
  );
}
