"use client";

import { Users } from "lucide-react";
import { QuickUseChat } from "@/components/quick-use/quick-use-chat";

export default function AgentSwarmPage() {
  return (
    <QuickUseChat
      title="Agent Swarm"
      subtitle="Give me a complex task and I'll split it across multiple agents"
      icon={Users}
      apiEndpoint="/api/quick-use/agent-swarm"
      type="agent-swarm"
      examplePrompts={[
        "Compare PS5 prices on amazon.de, mediamarkt.de, and saturn.de",
        "Research the top 5 CRM tools for small businesses",
        "Write a blog post about AI agents from 3 different angles",
        "Analyze these 3 competitors: HubSpot, Pipedrive, Salesforce",
      ]}
    />
  );
}
