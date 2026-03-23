import type { SwarmEvent } from "@/lib/execution/swarm-event-stream";

export type QuickUseType = "computer-use" | "agent-swarm" | "deep-research";

export interface QuickUseCreditInfo {
  estimatedCredits?: number;
  creditsUsed?: number;
  creditsRemaining?: number;
}

export interface QuickUseArtifact {
  kind: "image" | "link" | "file";
  name: string;
  url?: string;
  dataUrl?: string;
  mimeType?: string;
}

export interface QuickUseSource {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
}

export interface QuickUseResult {
  title?: string;
  summary: string;
  markdown?: string;
  data?: unknown;
  artifacts?: QuickUseArtifact[];
  sources?: QuickUseSource[];
  qualityScore?: number;
  meta?: Record<string, unknown>;
}

export type QuickUseStreamEvent =
  | {
      type: "meta";
      meta: {
        estimatedCredits?: number;
        executionId?: string;
      };
    }
  | {
      type: "progress";
      message: string;
      detail?: string;
    }
  | {
      type: "finding";
      message: string;
    }
  | {
      type: "swarm_event";
      event: SwarmEvent;
    }
  | {
      type: "result";
      result: QuickUseResult;
      credits?: QuickUseCreditInfo;
    }
  | {
      type: "error";
      error: string;
      suggestions?: string[];
    };
