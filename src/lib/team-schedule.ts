import { CronExpressionParser } from "cron-parser";

export interface TeamScheduleConfig {
  enabled: boolean;
  cron: string;
  timezone: string;
  input: string;
  notifyOnComplete: boolean;
  notifyEmail: string;
  lastRunAt?: string | null;
}

export interface TeamSchedulePreview {
  description: string;
  nextRuns: string[];
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function normalizeTeamScheduleConfig(value: unknown): TeamScheduleConfig {
  const record = toRecord(value);

  return {
    enabled: record.enabled === true,
    cron:
      typeof record.cron === "string" && record.cron.trim()
        ? record.cron.trim()
        : "0 9 * * *",
    timezone:
      typeof record.timezone === "string" && record.timezone.trim()
        ? record.timezone.trim()
        : "Europe/Berlin",
    input:
      typeof record.input === "string" && record.input.trim()
        ? record.input.trim()
        : "",
    notifyOnComplete: record.notifyOnComplete === true,
    notifyEmail:
      typeof record.notifyEmail === "string" ? record.notifyEmail.trim() : "",
    lastRunAt:
      typeof record.lastRunAt === "string" && record.lastRunAt.trim()
        ? record.lastRunAt
        : null,
  };
}

export function getTeamScheduleConfig(teamConfig: unknown) {
  const config = toRecord(teamConfig);
  const schedule = normalizeTeamScheduleConfig(config.schedule);
  return schedule;
}

export function updateTeamScheduleConfig(
  teamConfig: unknown,
  schedule: TeamScheduleConfig
) {
  const config = toRecord(teamConfig);
  return {
    ...config,
    schedule,
  };
}

export function describeTeamSchedule(schedule: TeamScheduleConfig | null) {
  if (!schedule?.enabled) return null;

  const [minute = "0", hour = "0", dayOfMonth = "*", month = "*", dayOfWeek = "*"] =
    schedule.cron.split(/\s+/);

  if (schedule.cron === "0 * * * *") {
    return "Runs every hour";
  }

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Runs daily at ${formatClock(hour, minute, schedule.timezone)}`;
  }

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1") {
    return `Runs every Monday at ${formatClock(hour, minute, schedule.timezone)}`;
  }

  return `Runs on cron ${schedule.cron}`;
}

function formatClock(hour: string, minute: string, timezone: string) {
  const base = new Date(Date.UTC(2026, 0, 5, Number(hour) || 0, Number(minute) || 0));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(base);
}

export function getNextTeamScheduleRuns(
  schedule: TeamScheduleConfig,
  count = 5,
  fromDate = new Date()
) {
  if (!schedule.enabled || !schedule.cron.trim()) {
    return [];
  }

  const interval = CronExpressionParser.parse(schedule.cron, {
    currentDate: fromDate,
    tz: schedule.timezone,
  });

  return interval.take(count).map((date) => date.toDate());
}

export function getTeamSchedulePreview(
  schedule: TeamScheduleConfig | null
): TeamSchedulePreview | null {
  if (!schedule?.enabled) return null;

  return {
    description: describeTeamSchedule(schedule) || "Scheduled execution",
    nextRuns: getNextTeamScheduleRuns(schedule).map((date) => date.toISOString()),
  };
}

export function isTeamScheduleDue(
  schedule: TeamScheduleConfig,
  now = new Date()
) {
  if (!schedule.enabled || !schedule.input.trim()) {
    return false;
  }

  try {
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
    const interval = CronExpressionParser.parse(schedule.cron, {
      currentDate: windowStart,
      tz: schedule.timezone,
    });
    const nextRun = interval.next().toDate();
    const lastRunAt = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;

    if (nextRun.getTime() > now.getTime()) {
      return false;
    }

    if (lastRunAt && lastRunAt.getTime() >= nextRun.getTime()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
