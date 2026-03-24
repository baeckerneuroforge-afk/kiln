"use client";

import { Search } from "lucide-react";
import { QuickUseChat } from "@/components/quick-use/quick-use-chat";

export default function DeepResearchPage() {
  return (
    <QuickUseChat
      title="Deep Research"
      subtitle="Fast, source-backed web research"
      icon={Search}
      apiEndpoint="/api/quick-use/deep-research"
      type="deep-research"
      examplePrompts={[
        "What's the current price of PS5 on amazon.de?",
        "Compare the top 5 project management tools",
        "Comprehensive analysis of the German SHK market",
        "What regulations apply to AI agents in the EU?",
      ]}
    />
  );
}
