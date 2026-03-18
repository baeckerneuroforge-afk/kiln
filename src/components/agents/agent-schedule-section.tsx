"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MoonStar, Timer } from "lucide-react";
import {
  type AgentScheduleConfig,
  type OfflineAction,
  type ScheduleDayKey,
  SCHEDULE_DAY_ORDER,
  getAgentScheduleStatus,
  normalizeAgentSchedule,
} from "@/lib/agent-scheduling";
import { cn } from "@/lib/utils";

type Props = {
  value: AgentScheduleConfig | null | undefined;
  onChange: (next: AgentScheduleConfig) => void;
};

const DAY_LABELS: Record<ScheduleDayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const OFFLINE_ACTIONS: { value: OfflineAction; label: string; description: string }[] = [
  {
    value: "collect_email",
    label: "Collect email",
    description: "Show your offline message and let visitors leave their details.",
  },
  {
    value: "show_message",
    label: "Show message",
    description: "Open the widget but keep it in message-only mode.",
  },
  {
    value: "hide_widget",
    label: "Hide widget",
    description: "Do not render the widget at all outside business hours.",
  },
];

const FALLBACK_TIMEZONES = [
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function AgentScheduleSection({ value, onChange }: Props) {
  const schedule = useMemo(() => normalizeAgentSchedule(value), [value]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const timezoneOptions = useMemo(() => {
    try {
      const intlWithSupportedValues = Intl as typeof Intl & {
        supportedValuesOf?: (key: string) => string[];
      };

      if (typeof intlWithSupportedValues.supportedValuesOf === "function") {
        return intlWithSupportedValues.supportedValuesOf("timeZone");
      }
    } catch {
      // ignore
    }

    return FALLBACK_TIMEZONES;
  }, []);

  const status = getAgentScheduleStatus(schedule, now);

  function update(partial: Partial<AgentScheduleConfig>) {
    onChange({
      ...schedule,
      ...partial,
    });
  }

  function updateDay(day: ScheduleDayKey, patch: Partial<AgentScheduleConfig["hours"][ScheduleDayKey]>) {
    onChange({
      ...schedule,
      hours: {
        ...schedule.hours,
        [day]: {
          ...schedule.hours[day],
          ...patch,
        },
      },
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
            <Timer className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Business Hours & Offline Mode
            </h3>
            <p className="text-xs text-muted-foreground">
              Control when your agent is available and what visitors see outside working hours.
            </p>
          </div>
        </div>
        <button
          onClick={() => update({ enabled: !schedule.enabled })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            schedule.enabled ? "bg-amber-500" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
              schedule.enabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      <div className="rounded-lg border border-border/80 bg-background/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Preview
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <span
                className={cn(
                  "inline-flex h-2.5 w-2.5 rounded-full",
                  status.isOnline || !schedule.enabled ? "bg-emerald-500" : "bg-amber-400"
                )}
              />
              Right now your agent is:{" "}
              <span className={status.isOnline || !schedule.enabled ? "text-emerald-400" : "text-amber-400"}>
                {status.isOnline || !schedule.enabled ? "ONLINE" : "OFFLINE"}
              </span>
            </p>
            {!status.isOnline && schedule.enabled && status.nextOnlineText && (
              <p className="mt-1 text-sm text-muted-foreground">{status.nextOnlineText}</p>
            )}
            {!schedule.enabled && (
              <p className="mt-1 text-sm text-muted-foreground">
                Scheduling is disabled. Your agent stays available all the time.
              </p>
            )}
          </div>
          <div className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
            {schedule.timezone}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Timezone
        </label>
        <select
          value={schedule.timezone}
          onChange={(event) => update({ timezone: event.target.value })}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          {timezoneOptions.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-foreground">Weekly Hours</h4>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[90px,96px,1fr,1fr] bg-background/60 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span>Day</span>
            <span>Enabled</span>
            <span>Start</span>
            <span>End</span>
          </div>
          {SCHEDULE_DAY_ORDER.map((day) => {
            const config = schedule.hours[day];
            return (
              <div
                key={day}
                className="grid grid-cols-[90px,96px,1fr,1fr] items-center gap-3 border-t border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{DAY_LABELS[day]}</p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) =>
                      updateDay(day, {
                        enabled: event.target.checked,
                        start: event.target.checked
                          ? config.start || "09:00"
                          : null,
                        end: event.target.checked
                          ? config.end || "18:00"
                          : null,
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-border bg-card text-kiln-orange"
                  />
                  On
                </label>
                <input
                  type="time"
                  value={config.start || "09:00"}
                  disabled={!config.enabled}
                  onChange={(event) => updateDay(day, { start: event.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                />
                <input
                  type="time"
                  value={config.end || "18:00"}
                  disabled={!config.enabled}
                  onChange={(event) => updateDay(day, { end: event.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Offline Behavior
          </label>
          <select
            value={schedule.offlineAction}
            onChange={(event) =>
              update({ offlineAction: event.target.value as OfflineAction })
            }
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {OFFLINE_ACTIONS.map((action) => (
              <option key={action.value} value={action.value}>
                {action.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            {
              OFFLINE_ACTIONS.find((action) => action.value === schedule.offlineAction)
                ?.description
            }
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Offline Message
          </label>
          <textarea
            value={schedule.offlineMessage}
            onChange={(event) => update({ offlineMessage: event.target.value })}
            rows={4}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <MoonStar className="h-3.5 w-3.5" />
            This message is shown whenever the agent is offline.
          </p>
        </div>
      </div>
    </div>
  );
}
