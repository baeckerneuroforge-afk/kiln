export type ScheduleDayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ScheduleDayConfig = {
  start: string | null;
  end: string | null;
  enabled: boolean;
};

export type OfflineAction = "collect_email" | "show_message" | "hide_widget";

export type AgentScheduleConfig = {
  enabled: boolean;
  timezone: string;
  hours: Record<ScheduleDayKey, ScheduleDayConfig>;
  offlineMessage: string;
  offlineAction: OfflineAction;
};

export type AgentScheduleStatus = {
  isOnline: boolean;
  nextOnlineText: string | null;
  nextOnlineAt: string | null;
  timezone: string;
};

export const SCHEDULE_DAY_ORDER: ScheduleDayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT_DAY: ScheduleDayConfig = {
  start: "09:00",
  end: "18:00",
  enabled: true,
};

const DISABLED_DAY: ScheduleDayConfig = {
  start: null,
  end: null,
  enabled: false,
};

const WEEKDAY_DEFAULTS: Record<ScheduleDayKey, ScheduleDayConfig> = {
  monday: { ...DEFAULT_DAY },
  tuesday: { ...DEFAULT_DAY },
  wednesday: { ...DEFAULT_DAY },
  thursday: { ...DEFAULT_DAY },
  friday: { ...DEFAULT_DAY },
  saturday: { ...DISABLED_DAY },
  sunday: { ...DISABLED_DAY },
};

const WEEKDAY_LABELS: Record<ScheduleDayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DEFAULT_OFFLINE_MESSAGE =
  "We're currently offline. Leave your email and we'll get back to you.";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: ScheduleDayKey;
};

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function getDefaultDay(day: ScheduleDayKey): ScheduleDayConfig {
  return {
    ...WEEKDAY_DEFAULTS[day],
  };
}

function normalizeDay(
  day: ScheduleDayKey,
  input: unknown
): ScheduleDayConfig {
  const fallback = getDefaultDay(day);
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const record = input as Record<string, unknown>;
  const enabled =
    typeof record.enabled === "boolean" ? record.enabled : fallback.enabled;
  const start = isValidTime(record.start)
    ? record.start
    : enabled
      ? fallback.start
      : null;
  const end = isValidTime(record.end)
    ? record.end
    : enabled
      ? fallback.end
      : null;

  return {
    enabled,
    start,
    end,
  };
}

export function normalizeAgentSchedule(input: unknown): AgentScheduleConfig {
  const record = input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
  const rawHours =
    record.hours && typeof record.hours === "object"
      ? (record.hours as Record<string, unknown>)
      : {};

  return {
    enabled:
      typeof record.enabled === "boolean" ? record.enabled : false,
    timezone:
      typeof record.timezone === "string" && record.timezone.trim()
        ? record.timezone
        : "Europe/Berlin",
    hours: {
      monday: normalizeDay("monday", rawHours.monday),
      tuesday: normalizeDay("tuesday", rawHours.tuesday),
      wednesday: normalizeDay("wednesday", rawHours.wednesday),
      thursday: normalizeDay("thursday", rawHours.thursday),
      friday: normalizeDay("friday", rawHours.friday),
      saturday: normalizeDay("saturday", rawHours.saturday),
      sunday: normalizeDay("sunday", rawHours.sunday),
    },
    offlineMessage:
      typeof record.offlineMessage === "string" && record.offlineMessage.trim()
        ? record.offlineMessage.trim()
        : DEFAULT_OFFLINE_MESSAGE,
    offlineAction:
      record.offlineAction === "show_message" ||
      record.offlineAction === "hide_widget"
        ? record.offlineAction
        : "collect_email",
  };
}

export function getAgentScheduleFromWhiteLabel(
  whiteLabel: unknown
): AgentScheduleConfig {
  if (!whiteLabel || typeof whiteLabel !== "object") {
    return normalizeAgentSchedule(null);
  }

  const record = whiteLabel as Record<string, unknown>;
  return normalizeAgentSchedule(record.schedule);
}

function timeToMinutes(value: string | null | undefined) {
  if (!value || !isValidTime(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    weekday: lookup.weekday.toLowerCase() as ScheduleDayKey,
  };
}

function zonedLocalToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const actual = getZonedParts(guess, timeZone);
  const desiredMinutes = Date.UTC(year, month - 1, day, hour, minute);
  const actualMinutes = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute
  );
  return new Date(guess.getTime() + (desiredMinutes - actualMinutes));
}

function addDaysInTimeZone(
  parts: ZonedParts,
  timeZone: string,
  days: number
) {
  const reference = zonedLocalToUtc(
    timeZone,
    parts.year,
    parts.month,
    parts.day,
    12,
    0
  );
  reference.setUTCDate(reference.getUTCDate() + days);
  return getZonedParts(reference, timeZone);
}

function formatScheduleClock(time: string) {
  const [hourString, minuteString] = time.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function getNextOnlineDate(
  schedule: AgentScheduleConfig,
  now: Date
): Date | null {
  if (!schedule.enabled) return null;

  const current = getZonedParts(now, schedule.timezone);

  for (let offset = 0; offset < 8; offset += 1) {
    const parts = offset === 0
      ? current
      : addDaysInTimeZone(current, schedule.timezone, offset);
    const dayConfig = schedule.hours[parts.weekday];
    if (!dayConfig.enabled || !dayConfig.start) continue;

    const [hour, minute] = dayConfig.start.split(":").map(Number);
    const candidate = zonedLocalToUtc(
      schedule.timezone,
      parts.year,
      parts.month,
      parts.day,
      hour,
      minute
    );

    if (candidate.getTime() > now.getTime()) {
      return candidate;
    }
  }

  return null;
}

export function isAgentOnline(
  input: AgentScheduleConfig | unknown,
  now = new Date()
): boolean {
  const schedule = normalizeAgentSchedule(input);
  if (!schedule.enabled) return true;

  const zoned = getZonedParts(now, schedule.timezone);
  const dayConfig = schedule.hours[zoned.weekday];

  if (!dayConfig.enabled) return false;

  const start = timeToMinutes(dayConfig.start);
  const end = timeToMinutes(dayConfig.end);
  if (start === null || end === null) return false;

  const current = zoned.hour * 60 + zoned.minute;
  if (end <= start) {
    return current >= start || current < end;
  }

  return current >= start && current < end;
}

export function getNextOnlineTime(
  input: AgentScheduleConfig | unknown,
  now = new Date()
): string | null {
  const schedule = normalizeAgentSchedule(input);
  if (!schedule.enabled) return null;
  if (isAgentOnline(schedule, now)) return "Online now";

  const nextOnline = getNextOnlineDate(schedule, now);
  if (!nextOnline) return null;

  const diffMs = nextOnline.getTime() - now.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `Opens in ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Opens in ${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  }

  const nextParts = getZonedParts(nextOnline, schedule.timezone);
  const nextDay = schedule.hours[nextParts.weekday];
  if (!nextDay.start) return null;

  return `Opens again ${WEEKDAY_LABELS[nextParts.weekday]} at ${formatScheduleClock(
    nextDay.start
  )}`;
}

export function getAgentScheduleStatus(
  input: AgentScheduleConfig | unknown,
  now = new Date()
): AgentScheduleStatus {
  const schedule = normalizeAgentSchedule(input);
  const online = isAgentOnline(schedule, now);
  const nextOnlineText = online ? null : getNextOnlineTime(schedule, now);
  const nextOnlineAt = online ? null : getNextOnlineDate(schedule, now)?.toISOString() || null;

  return {
    isOnline: online,
    nextOnlineText,
    nextOnlineAt,
    timezone: schedule.timezone,
  };
}
