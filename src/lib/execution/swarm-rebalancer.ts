import type { CostTracker } from "@/lib/cost/cost-tracker";
import type { ParallelExecutor, SubTask } from "./parallel-executor";
import type { SharedWorkspace, WorkspaceEntry } from "./shared-workspace";
import type { SwarmEvent, SwarmEventStream } from "./swarm-event-stream";
import type { SubAgentResult } from "./sub-agent-executor";

interface AgentState {
  task: SubTask;
  status: "running" | "completed" | "failed";
  lastActivityAt: number;
  retriesScheduled: number;
  qualityChecked: boolean;
}

interface RebalancerOptions {
  executor: ParallelExecutor;
  workspace: SharedWorkspace;
  eventStream: SwarmEventStream;
  costTracker: CostTracker;
  budgetCredits?: number;
}

const STUCK_AFTER_MS = 30_000;
const MAX_RETRIES_PER_AGENT = 1;

export class SwarmRebalancer {
  private readonly executor: ParallelExecutor;
  private readonly workspace: SharedWorkspace;
  private readonly eventStream: SwarmEventStream;
  private readonly costTracker: CostTracker;
  private readonly budgetCredits?: number;
  private readonly agentStates = new Map<string, AgentState>();
  private unsubscribeEvent?: () => void;
  private unsubscribeWorkspace?: () => void;
  private intervalId?: NodeJS.Timeout;

  constructor(options: RebalancerOptions) {
    this.executor = options.executor;
    this.workspace = options.workspace;
    this.eventStream = options.eventStream;
    this.costTracker = options.costTracker;
    this.budgetCredits = options.budgetCredits;
  }

  registerTask(task: SubTask): void {
    if (this.agentStates.has(task.id)) return;
    this.agentStates.set(task.id, {
      task,
      status: "running",
      lastActivityAt: Date.now(),
      retriesScheduled: 0,
      qualityChecked: false,
    });
  }

  start(): void {
    this.unsubscribeEvent = this.eventStream.on((event) => this.handleEvent(event));
    this.unsubscribeWorkspace = this.workspace.subscribe((entry) => this.handleWorkspaceEntry(entry));
    this.intervalId = setInterval(() => {
      void this.tick();
    }, 5_000);
  }

  stop(): void {
    if (this.unsubscribeEvent) this.unsubscribeEvent();
    if (this.unsubscribeWorkspace) this.unsubscribeWorkspace();
    if (this.intervalId) clearInterval(this.intervalId);
  }

  noteResult(result: SubAgentResult): void {
    const state = this.agentStates.get(result.id);
    if (!state) return;

    state.status = result.stoppedReason === "error" ? "failed" : "completed";
    state.lastActivityAt = Date.now();

    if (!state.qualityChecked) {
      state.qualityChecked = true;
      const lowQuality = this.isLowQuality(result, state.task);
      if (lowQuality && state.retriesScheduled < MAX_RETRIES_PER_AGENT) {
        this.scheduleReplacement(state.task, "Quality check failed — retry with fallback strategy.");
        state.retriesScheduled++;
        this.eventStream.qualityWarning(
          state.task.id,
          "Low-quality result detected. Scheduling one fallback attempt."
        );
      }
    }
  }

  private handleEvent(event: SwarmEvent): void {
    if (event.type === "agent.started") {
      const taskId = String(event.data.agentId);
      const state = this.agentStates.get(taskId);
      if (state) {
        state.lastActivityAt = Date.now();
        state.status = "running";
      }
      return;
    }

    const agentId = String(
      event.data.agentId
      || event.data.newAgentId
      || event.data.from
      || ""
    );
    if (!agentId) return;

    const state = this.agentStates.get(agentId);
    if (!state) return;

    state.lastActivityAt = Date.now();
    if (event.type === "agent.completed") state.status = "completed";
    if (event.type === "agent.failed") state.status = "failed";
  }

  private handleWorkspaceEntry(entry: WorkspaceEntry): void {
    const state = this.agentStates.get(entry.agentId);
    if (state) {
      state.lastActivityAt = Date.now();
    }

    if (entry.tags.includes("critical_info") || entry.tags.includes("plan_change")) {
      this.workspace.broadcast("coordinator", `Critical finding from ${entry.agentId}: ${entry.key} — adjust your plan if relevant.`);
      this.eventStream.swarmRebalanced(`Broadcast critical finding from ${entry.agentId}.`);
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    for (const state of this.agentStates.values()) {
      if (state.status !== "running") continue;
      if (now - state.lastActivityAt < STUCK_AFTER_MS) continue;
      if (state.retriesScheduled >= MAX_RETRIES_PER_AGENT) continue;

      this.scheduleReplacement(
        state.task,
        `Agent ${state.task.id} appears stuck. Retrying with fallback strategy.`
      );
      state.retriesScheduled++;
      state.lastActivityAt = now;
    }

    if (this.budgetCredits) {
      const budget = this.costTracker.checkBudget(this.budgetCredits);
      const completed = Array.from(this.agentStates.values()).filter((state) => state.status === "completed").length;
      const completionRatio = this.agentStates.size > 0 ? completed / this.agentStates.size : 0;

      if (budget.percentUsed >= 70 && completionRatio < 0.5) {
        for (const state of this.agentStates.values()) {
          if (state.task.priority === "nice_to_have") {
            this.executor.cancelTask(state.task.id, "Budget triage: optional task cancelled.");
          }
        }

        this.workspace.broadcast("coordinator", "Budget is running low. Wrap up with the best verified results so far.");
        this.eventStream.swarmRebalanced("Budget triage activated. Optional tasks cancelled and agents asked to wrap up.");
      }
    }
  }

  private scheduleReplacement(task: SubTask, reason: string): void {
    const fallbackDescription = task.fallbackStrategy
      ? `${task.description}\n\nFallback strategy: ${task.fallbackStrategy}`
      : `${task.description}\n\nFallback strategy: use a different source or cheaper tool route if the original approach is blocked.`;

    const replacementTask: SubTask = {
      ...task,
      id: `${task.id}_retry_${Date.now()}`,
      description: fallbackDescription,
      dependencies: [],
      priority: task.priority === "nice_to_have" ? "important" : task.priority,
    };

    const added = this.executor.addTask(replacementTask);
    if (!added) return;

    this.registerTask(replacementTask);
    this.workspace.broadcast("coordinator", reason);
    this.eventStream.agentRetryScheduled(task.id, replacementTask.id, reason);
  }

  private isLowQuality(result: SubAgentResult, task: SubTask): boolean {
    const text = result.result.trim();
    if (text.length < 40) return true;
    if (/partial results may be in workspace|agent error|budget exceeded/i.test(text)) return true;

    const sourceCount = (result.sources || []).length;
    if ((task.specialization === "researcher" || task.specialization === "synthesizer") && sourceCount < 2) {
      return true;
    }

    if (task.specialization === "price_extractor" && !/[€$£]|\bprice\b/i.test(text)) {
      return true;
    }

    return false;
  }
}
