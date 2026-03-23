"use client";

import { Globe } from "lucide-react";
import { QuickUseChat } from "@/components/quick-use/quick-use-chat";

export default function ComputerUsePage() {
  return (
    <QuickUseChat
      title="Computer Use"
      subtitle="Tell me what to browse and I'll do it"
      icon={Globe}
      apiEndpoint="/api/quick-use/computer-use"
      type="computer-use"
      examplePrompts={[
        "Check the price of PlayStation 5 on amazon.de",
        "Screenshot the homepage of apple.com",
        "Fill out the contact form on example.com",
        "Extract all product prices from this page: https://example.com",
      ]}
    />
  );
}
