// Event type definitions — safe for both client and server imports

export type EventType =
  | "conversation.started"
  | "conversation.completed"
  | "lead.captured"
  | "appointment.booked"
  | "task.completed"
  | "task.failed"
  | "team.completed"
  | "credits.low"
  | "agent.updated";

export const ALL_EVENT_TYPES: EventType[] = [
  "conversation.started",
  "conversation.completed",
  "lead.captured",
  "appointment.booked",
  "task.completed",
  "task.failed",
  "team.completed",
  "credits.low",
  "agent.updated",
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  "conversation.started": "Conversation Started",
  "conversation.completed": "Conversation Completed",
  "lead.captured": "Lead Captured",
  "appointment.booked": "Appointment Booked",
  "task.completed": "Task Completed",
  "task.failed": "Task Failed",
  "team.completed": "Team Execution Completed",
  "credits.low": "Credits Running Low",
  "agent.updated": "Agent Updated",
};
