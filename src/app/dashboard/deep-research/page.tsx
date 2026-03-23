"use client";

import { Search } from "lucide-react";
import { QuickUseChat } from "@/components/quick-use/quick-use-chat";

export default function DeepResearchPage() {
  return (
    <QuickUseChat
      title="Deep Research"
      subtitle="Ask me anything and I'll research it thoroughly"
      icon={Search}
      apiEndpoint="/api/quick-use/deep-research"
      type="deep-research"
      examplePrompts={[
        "What are the latest developments in voice AI for businesses?",
        "Research the German SHK market size and key players",
        "Find the pros and cons of Next.js vs Remix in 2026",
        "What regulations apply to AI agents in the EU?",
      ]}
    />
  );
}
