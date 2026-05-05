"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TeamScheduleConfigValue {
  enabled: boolean;
  cron: string;
  timezone: string;
  input: string;
  notifyOnComplete: boolean;
  notifyEmail: string;
}

export interface TeamSchedulePreviewValue {
  description: string;
  nextRuns: string[];
}

interface TeamScheduleTabProps {
  teamId: string;
  initialSchedule?: Partial<TeamScheduleConfigValue> | null;
  initialPreview?: TeamSchedulePreviewValue | null;
  onSaved?: () => Promise<void> | void;
}

type SchedulePreset = "daily" | "weekly" | "hourly" | "custom";

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/London",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

const WEEKDAYS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
] as const;

function normalizeSchedule(
  value?: Partial<TeamScheduleConfigValue> | null
): TeamScheduleConfigValue {
  return {
    enabled: value?.enabled === true,
    cron: value?.cron?.trim() || "0 9 * * *",
    timezone: value?.timezone?.trim() || "Europe/Berlin",
    input: value?.input?.trim() || "",
    notifyOnComplete: value?.notifyOnComplete === true,
    notifyEmail: value?.notifyEmail?.trim() || "",
  };
}

function parseCronPreset(cron: string): {
  preset: SchedulePreset;
  hour: string;
  minute: string;
  weekday: string;
  customCron: string;
} {
  const trimmed = cron.trim();
  if (trimmed === "0 * * * *") {
    return {
      preset: "hourly",
      hour: "09",
      minute: "00",
      weekday: "1",
      customCron: trimmed,
    };
  }

  const daily = trimmed.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
  if (daily) {
    return {
      preset: "daily",
      minute: daily[1].padStart(2, "0"),
      hour: daily[2].padStart(2, "0"),
      weekday: "1",
      customCron: trimmed,
    };
  }

  const weekly = trimmed.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/);
  if (weekly) {
    return {
      preset: "weekly",
      minute: weekly[1].padStart(2, "0"),
      hour: weekly[2].padStart(2, "0"),
      weekday: weekly[3],
      customCron: trimmed,
    };
  }

  return {
    preset: "custom",
    hour: "09",
    minute: "00",
    weekday: "1",
    customCron: trimmed || "0 9 * * *",
  };
}

function buildCron(params: {
  preset: SchedulePreset;
  hour: string;
  minute: string;
  weekday: string;
  customCron: string;
}) {
  const minute = Math.max(0, Math.min(59, Number(params.minute) || 0));
  const hour = Math.max(0, Math.min(23, Number(params.hour) || 0));

  switch (params.preset) {
    case "hourly":
      return "0 * * * *";
    case "weekly":
      return `${minute} ${hour} * * ${params.weekday || "1"}`;
    case "custom":
      return params.customCron.trim() || "0 9 * * *";
    case "daily":
    default:
      return `${minute} ${hour} * * *`;
  }
}

function formatPreviewTime(value: string, timezone: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
}

export function TeamScheduleTab({
  teamId,
  initialSchedule,
  initialPreview,
  onSaved,
}: TeamScheduleTabProps) {
  const normalized = useMemo(
    () => normalizeSchedule(initialSchedule),
    [initialSchedule]
  );
  const initialBuilder = useMemo(
    () => parseCronPreset(normalized.cron),
    [normalized.cron]
  );

  const [enabled, setEnabled] = useState(normalized.enabled);
  const [timezone, setTimezone] = useState(normalized.timezone);
  const [input, setInput] = useState(normalized.input);
  const [notifyOnComplete, setNotifyOnComplete] = useState(
    normalized.notifyOnComplete
  );
  const [notifyEmail, setNotifyEmail] = useState(normalized.notifyEmail);
  const [preset, setPreset] = useState<SchedulePreset>(initialBuilder.preset);
  const [hour, setHour] = useState(initialBuilder.hour);
  const [minute, setMinute] = useState(initialBuilder.minute);
  const [weekday, setWeekday] = useState(initialBuilder.weekday);
  const [customCron, setCustomCron] = useState(initialBuilder.customCron);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<TeamSchedulePreviewValue | null>(
    initialPreview || null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = normalizeSchedule(initialSchedule);
    const builder = parseCronPreset(next.cron);
    setEnabled(next.enabled);
    setTimezone(next.timezone);
    setInput(next.input);
    setNotifyOnComplete(next.notifyOnComplete);
    setNotifyEmail(next.notifyEmail);
    setPreset(builder.preset);
    setHour(builder.hour);
    setMinute(builder.minute);
    setWeekday(builder.weekday);
    setCustomCron(builder.customCron);
    setPreview(initialPreview || null);
  }, [initialPreview, initialSchedule]);

  const cron = useMemo(
    () => buildCron({ preset, hour, minute, weekday, customCron }),
    [customCron, hour, minute, preset, weekday]
  );

  useEffect(() => {
    if (!enabled) {
      setPreview(null);
      setPreviewLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const response = await fetch(`/api/teams/${teamId}/schedule/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule: {
              enabled,
              cron,
              timezone,
              input,
              notifyOnComplete,
              notifyEmail,
            },
          }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Failed to build schedule preview");
        }
        setPreview(data.preview || null);
        setError(null);
      } catch (previewError) {
        if (controller.signal.aborted) return;
        setPreview(null);
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Failed to build schedule preview"
        );
      } finally {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [cron, enabled, input, notifyEmail, notifyOnComplete, teamId, timezone]);

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            schedule: {
              enabled,
              cron,
              timezone,
              input: input.trim(),
              notifyOnComplete,
              notifyEmail: notifyEmail.trim(),
            },
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to save schedule");
      }
      setPreview(data.schedulePreview || null);
      setError(null);
      await onSaved?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save schedule"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Scheduled Runs
                </p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  Run this team on autopilot
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ideal for weekly newsletters, recurring research, reporting, and other repeatable team workflows.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled((value) => !value)}
                className={cn(
                  "relative h-7 w-12 rounded-full transition-colors",
                  enabled ? "bg-orange-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 h-5 w-5 rounded-full bg-white transition-transform",
                    enabled ? "left-6" : "left-1"
                  )}
                />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-orange-400" />
              <h4 className="text-sm font-semibold text-foreground">When should it run?</h4>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { id: "daily", label: "Every day" },
                { id: "weekly", label: "Every week" },
                { id: "hourly", label: "Every hour" },
                { id: "custom", label: "Custom cron" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPreset(option.id as SchedulePreset)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left transition-colors",
                    preset === option.id
                      ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                      : "border-border bg-background/40 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  <p className="text-sm font-medium">{option.label}</p>
                </button>
              ))}
            </div>

            {preset !== "hourly" && preset !== "custom" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {preset === "weekly" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Day</label>
                    <select
                      value={weekday}
                      onChange={(event) => setWeekday(event.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground md:col-span-1">
                    Runs every calendar day using your selected timezone.
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Hour</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(event) => setHour(event.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Minute</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(event) => setMinute(event.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
                  />
                </div>
              </div>
            ) : null}

            {preset === "custom" ? (
              <div className="mt-4 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
                <input
                  value={customCron}
                  onChange={(event) => setCustomCron(event.target.value)}
                  placeholder="0 9 * * 1"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-orange-500/60"
                />
              </div>
            ) : null}

            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Timezone</label>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-background/40 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Effective Cron</p>
              <p className="mt-2 font-mono text-sm text-foreground">{cron}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-300" />
              <h4 className="text-sm font-semibold text-foreground">What should the team do?</h4>
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={5}
              placeholder="Every Monday: research industry news, draft the newsletter, edit it, and prepare it for sending."
              className="mt-4 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-orange-500/60 resize-none"
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-blue-300" />
              <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Notify when a scheduled run finishes</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send a completion summary to an email inbox after the team finishes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotifyOnComplete((value) => !value)}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-colors",
                  notifyOnComplete ? "bg-orange-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
                    notifyOnComplete ? "left-6" : "left-1"
                  )}
                />
              </button>
            </div>

            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notify Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={notifyEmail}
                  onChange={(event) => setNotifyEmail(event.target.value)}
                  placeholder="ops@yourcompany.com"
                  className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-sm text-foreground outline-none focus:border-orange-500/60"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-orange-400" />
              <h4 className="text-sm font-semibold text-foreground">Preview</h4>
              {previewLoading ? (
                <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            {!enabled ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Scheduled execution is currently disabled.
              </p>
            ) : preview ? (
              <>
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">
                    Schedule Summary
                  </p>
                  <p className="mt-2 text-sm font-medium text-emerald-100">
                    {preview.description}
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Next 5 Runs
                  </p>
                  {preview.nextRuns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upcoming runs yet.</p>
                  ) : (
                    preview.nextRuns.map((nextRun) => (
                      <div
                        key={nextRun}
                        className="rounded-xl border border-border bg-background/50 px-4 py-3"
                      >
                        <p className="text-sm text-foreground">
                          {formatPreviewTime(nextRun, timezone)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Save a valid schedule to see the next planned runs.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Right Now
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl",
                  enabled ? "bg-orange-500/10" : "bg-muted"
                )}
              >
                {enabled ? (
                  <CheckCircle2 className="h-5 w-5 text-orange-300" />
                ) : (
                  <Clock3 className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {enabled ? "Scheduled execution enabled" : "Manual runs only"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {enabled
                    ? "This team can launch automatically from the cron worker."
                    : "Turn this on when the workflow should run without manual input."}
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-orange-600 text-white hover:bg-orange-700"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving schedule..." : "Save Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
