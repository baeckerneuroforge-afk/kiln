"use client";

import { Globe } from "lucide-react";
import { QuickUseChat } from "@/components/quick-use/quick-use-chat";

export default function ComputerUsePage() {
  return (
    <QuickUseChat
      title="Computer Use"
      subtitle="Browse websites with a live AI agent"
      icon={Globe}
      apiEndpoint="/api/quick-use/computer-use"
      type="computer-use"
      examplePrompts={[
        "Log into my Sonepar account and check order status",
        "Fill out the contact form on example.com",
        "Search for iPhone 17 on apple.com and screenshot all models",
        "Navigate through MediaMarkt and find PS5 bundles",
      ]}
    />
  );
}
