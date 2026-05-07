import { Metadata } from "next";
import { Workflow } from "lucide-react";
import { FeaturePageTemplate } from "@/components/landing/feature-page-template";

export const metadata: Metadata = {
  title: "Multi-Agent Workflows — KILN",
  description:
    "Visual drag-and-drop editor with 18+ node types. Compose agents that talk to each other with conditional logic and parallel execution.",
};

export default function MultiAgentWorkflowsPage() {
  return (
    <FeaturePageTemplate
      prePill="Feature · Multi-Agent Workflows"
      icon={Workflow}
      headline={
        <>
          Compose agents that <span className="text-kiln-orange">talk to each other</span>
        </>
      }
      subhead="Visual editor. 18+ node types including triggers, agents, conditional logic, parallel execution, integrations, and Computer Use. Build the workflows your agency needs in hours, not weeks."
      whatBody={
        <>
          <p>
            Most AI tools give you a single agent and hope it can do
            everything. KILN lets you compose multiple agents into a workflow
            — a triage agent qualifies, a research agent enriches, an action
            agent executes. Each step is its own node, with its own model,
            prompt, and config.
          </p>
          <p>
            The editor is visual. You drag a node onto the canvas, connect it
            to the next, and inspect the data shape between nodes. Conditional
            branches handle &ldquo;if hot lead, route to CRM; else, send a
            nurture email&rdquo;. Parallel branches execute simultaneously
            and merge — for fan-out / fan-in patterns like &ldquo;summarise
            from three sources, then synthesize&rdquo;.
          </p>
          <p>
            Every workflow run is observable. Inputs, outputs, and decisions
            at each node are logged with a clickable timeline. Failed steps
            can be retried or replaced without restarting the whole flow.
          </p>
          <p>
            For agencies, this is the difference between &ldquo;custom build
            per client&rdquo; and &ldquo;template that scales&rdquo;.
          </p>
        </>
      }
      howSteps={[
        {
          title: "Drop nodes onto the canvas",
          body:
            "Triggers (webhook, schedule, lead, chat). Agents (chat, task). Logic (if/else, switch, filter). Actions (HTTP, email, Slack). Integrations (Sheets, Notion, Airtable). Computer Use, RAG, sub-workflows.",
        },
        {
          title: "Wire data between nodes",
          body:
            "Each node exposes a JSON output schema. Map fields explicitly or pass payloads through. Schema mismatch warnings highlight broken connections before run-time.",
        },
        {
          title: "Run, observe, iterate",
          body:
            "Hit Run. Watch the live execution timeline. Inspect inputs and outputs at every step. Bugs surface as failed nodes you can replay individually.",
        },
      ]}
      useCases={[
        {
          title: "Lead Qualification Pipeline",
          body:
            "Trigger on new lead → score with an LLM → branch hot vs cold → route to CRM, email, or Slack accordingly.",
        },
        {
          title: "Customer Support Tiers",
          body:
            "Greeter agent triages → diagnose with the knowledge base → either resolve directly or escalate to a human handoff.",
        },
        {
          title: "Content Generation",
          body:
            "Research agent gathers sources → drafter writes → editor agent revises → publish to CMS via integration node.",
        },
      ]}
      techBullets={[
        "18+ node types: triggers, agents, logic, actions, integrations, AI tools, advanced (sub-workflow, agent-team, ensemble)",
        "Visual editor with drag-and-drop, multi-select, copy-paste, undo/redo",
        "Conditional branches, parallel fan-out, merge-back, sub-workflows for reuse",
        "Per-node retry policies, dead-letter queue, deterministic replay",
        "Live cost tracking, token counts, and per-node duration metrics",
        "Export workflows as JSON for version-control and migration",
      ]}
    />
  );
}
