"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AgentDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05]">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-foreground">
        Something went wrong
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred while loading this agent."}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline" size="sm">
          Try again
        </Button>
        <Button onClick={() => window.location.href = "/dashboard/agents"} size="sm">
          Back to Agents
        </Button>
      </div>
    </div>
  );
}
