// Event type definitions — safe for both client and server imports

export type EventType =
  | "conversation.started"
  | "conversation.completed"
  | "lead.captured"
  | "appointment.booked"
  | "task.completed"
  | "task.failed"
  | "team.awaiting_approval"
  | "team.completed"
  | "team.execution.started"
  | "team.execution.step_completed"
  | "team.execution.approval_needed"
  | "team.execution.completed"
  | "team.execution.failed"
  | "credits.low"
  | "agent.updated";

export const ALL_EVENT_TYPES: EventType[] = [
  "conversation.started",
  "conversation.completed",
  "lead.captured",
  "appointment.booked",
  "task.completed",
  "task.failed",
  "team.awaiting_approval",
  "team.completed",
  "team.execution.started",
  "team.execution.step_completed",
  "team.execution.approval_needed",
  "team.execution.completed",
  "team.execution.failed",
  "credits.low",
  "agent.updated",
];

// Team-spezifische Event-Typen
export const TEAM_EVENT_TYPES: EventType[] = [
  "team.execution.started",
  "team.execution.step_completed",
  "team.execution.approval_needed",
  "team.execution.completed",
  "team.execution.failed",
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  "conversation.started": "Conversation Started",
  "conversation.completed": "Conversation Completed",
  "lead.captured": "Lead Captured",
  "appointment.booked": "Appointment Booked",
  "task.completed": "Task Completed",
  "task.failed": "Task Failed",
  "team.awaiting_approval": "Team Awaiting Approval",
  "team.completed": "Team Execution Completed",
  "team.execution.started": "Team Execution Started",
  "team.execution.step_completed": "Team Step Completed",
  "team.execution.approval_needed": "Team Approval Needed",
  "team.execution.completed": "Team Execution Completed (Full)",
  "team.execution.failed": "Team Execution Failed",
  "credits.low": "Credits Running Low",
  "agent.updated": "Agent Updated",
};
