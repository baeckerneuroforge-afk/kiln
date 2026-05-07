import { Metadata } from "next";
import { Brain } from "lucide-react";
import { FeaturePageTemplate } from "@/components/landing/feature-page-template";

export const metadata: Metadata = {
  title: "Self-Learning RAG — KILN",
  description:
    "Agents learn from interactions and suggest knowledge updates automatically. Less manual maintenance, smarter agents over time.",
};

export default function SelfLearningRagPage() {
  return (
    <FeaturePageTemplate
      prePill="Feature · Self-Learning Knowledge Base"
      icon={Brain}
      headline={
        <>
          Agents that{" "}
          <span className="text-kiln-orange">get smarter</span> with use
        </>
      }
      subhead="Upload docs once. Agents extract knowledge from real conversations and suggest updates back. The knowledge base grows by itself."
      whatBody={
        <>
          <p>
            Most RAG implementations are static — you upload PDFs, the model
            retrieves chunks, conversations forget. KILN keeps a feedback
            loop: every conversation gets analyzed for missing or outdated
            knowledge, surfaced as a suggestion to the agency owner.
          </p>
          <p>
            When a customer asks something the agent couldn&apos;t answer,
            the system flags the gap. When the agent answered with stale
            info, that gets flagged too. You review the suggestions, accept
            them, and the knowledge base updates without writing prompts.
          </p>
          <p>
            Embeddings refresh automatically when you accept a suggestion.
            Visitor memory builds in parallel — the agent remembers
            individual users across sessions, learning their preferences and
            history without you re-feeding context.
          </p>
        </>
      }
      howSteps={[
        {
          title: "Upload + auto-chunk",
          body:
            "PDF, URL, FAQ, or raw text. KILN chunks intelligently, embeds via your BYOK provider, and stores vectors in pgvector with full provenance.",
        },
        {
          title: "Review suggestions",
          body:
            "After every conversation, an analyzer agent surfaces 'gaps' (questions the agent couldn't answer well). You accept, edit, or reject each suggestion in the dashboard.",
        },
        {
          title: "Watch quality climb",
          body:
            "Accuracy metrics per topic update in real-time. Agents pick up new knowledge automatically. No prompt-engineering treadmill.",
        },
      ]}
      useCases={[
        {
          title: "Sales-enablement agent",
          body:
            "Starts with the product wiki. Learns objection handling from real prospect calls. By month two, it knows the angles your top sales rep uses.",
        },
        {
          title: "Internal knowledge bot",
          body:
            "Onboarded with the company handbook. Suggests updates whenever policy changes are mentioned in slack threads. HR reviews and accepts.",
        },
        {
          title: "Customer-support tier 1",
          body:
            "Initial seed: docs + FAQ. After a month of real tickets, the bot has learned which workarounds the actual support team uses for common issues.",
        },
      ]}
      techBullets={[
        "PDF / URL / FAQ / TEXT upload with auto-chunking and provenance tracking",
        "pgvector embeddings stored per sub-org with org-scoped retrieval",
        "Conversation analyzer flags knowledge gaps + outdated information",
        "Suggestion review queue with diff-style accept / edit / reject",
        "Persistent visitor memory across channels — agent remembers individuals",
        "Embedding cost attributed per sub-org via BYOK keys",
      ]}
    />
  );
}
