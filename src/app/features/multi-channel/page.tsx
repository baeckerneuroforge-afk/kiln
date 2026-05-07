import { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { FeaturePageTemplate } from "@/components/landing/feature-page-template";

export const metadata: Metadata = {
  title: "Multi-Channel Deployment — KILN",
  description:
    "Voice, WhatsApp, Email, Web-chat — one agent, every channel. Switch channels mid-conversation without losing context.",
};

export default function MultiChannelPage() {
  return (
    <FeaturePageTemplate
      prePill="Feature · Multi-Channel Deployment"
      icon={MessageSquare}
      headline={
        <>
          One agent. <span className="text-kiln-orange">Every channel.</span>
        </>
      }
      subhead="Voice (phone), WhatsApp, Email, Web-chat — your agent runs across all of them. Conversation context survives the channel switch. Built on Twilio + Vonage."
      whatBody={
        <>
          <p>
            Your client&apos;s customers don&apos;t pick channels by what your
            tool supports — they pick what&apos;s convenient. Email at the
            office, WhatsApp on the train, a quick phone call when they&apos;re
            driving. KILN agents reach all of them with a single configuration.
          </p>
          <p>
            The conversation memory follows the visitor across channels. A
            customer starts via email, escalates to a phone call — the agent
            already knows who they are and what they were asking about.
          </p>
          <p>
            Voice runs on real telephony (Twilio + Vonage), with low-latency
            speech-to-text, mid-call function calls, and human handoff. The
            same agent that handles your web-chat answers the phone.
          </p>
        </>
      }
      howSteps={[
        {
          title: "Configure the agent once",
          body:
            "Set the system prompt, knowledge base, and actions. Channel-specific overrides (voice tone, WhatsApp greeting) are optional add-ons.",
        },
        {
          title: "Connect channels",
          body:
            "Provision a Twilio phone number. Connect WhatsApp Business via the Cloud API. Drop the embed widget on your client&apos;s site. Add an email forwarding rule.",
        },
        {
          title: "Watch one inbox",
          body:
            "Conversations from every channel land in a unified inbox per agent. Threading is per-visitor, not per-channel — same person across email and phone shows as one thread.",
        },
      ]}
      useCases={[
        {
          title: "Lead-Capture Phone Line",
          body:
            "Run an inbound voice agent that qualifies and books a calendar slot. Drop into web-chat for visitors who prefer typing.",
        },
        {
          title: "Support Across Channels",
          body:
            "Customer emails a question, follows up via WhatsApp the next day. Same context, no re-explaining. Agent handles tier-1, escalates tier-2 to a human.",
        },
        {
          title: "Outbound Email Sequences",
          body:
            "Trigger personalized email sequences from a workflow. Replies feed back into the agent for autonomous follow-up.",
        },
      ]}
      techBullets={[
        "Twilio + Vonage telephony adapters for inbound + outbound voice",
        "WhatsApp Business Cloud API native integration",
        "Email inbound + outbound (SES, Postmark, Resend)",
        "Embeddable web-chat widget (one <script> tag, white-label-ready)",
        "Cross-channel session memory keyed by visitor identity (email, phone, cookie)",
        "Per-channel transcripts with full audit trail and replay",
      ]}
    />
  );
}
