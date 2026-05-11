"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Loader2, MessageSquare, Phone, Save, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ModuleName } from "@/lib/modules/types";
import { AIModuleForm } from "./AIModuleForm";
import { TwilioModuleForm } from "./TwilioModuleForm";
import { ModeRadio } from "./ModeRadio";
import { ConnectionTester } from "./ConnectionTester";
import {
  MODULE_DESCRIPTIONS,
  MODULE_LABELS,
  isTwilioModule,
  validateModuleDraft,
  type AICredentialsDraft,
  type CredentialsDraft,
  type ModuleMode,
  type TwilioCredentialsDraft,
} from "./validation";

export interface ModuleConfigSummary {
  moduleName: ModuleName;
  mode: ModuleMode;
  isActive: boolean;
  hasCredentials: boolean;
  credentialsOwner: string | null;
}

interface ModuleCardProps {
  subAccountId: string;
  initial: ModuleConfigSummary;
  poolPriceEur: number;
  onSaved: (next: ModuleConfigSummary) => void;
  /** Active conversation count for the deactivation warning. Optional. */
  activeConversationCount?: number;
}

const ICONS: Record<ModuleName, typeof Bot> = {
  ai: Bot,
  sms: MessageSquare,
  voice: Phone,
  whatsapp: Send,
};

export function ModuleCard({
  subAccountId,
  initial,
  poolPriceEur,
  onSaved,
  activeConversationCount,
}: ModuleCardProps) {
  const moduleName = initial.moduleName;
  const Icon = ICONS[moduleName] ?? Bot;
  const groupId = `module-${moduleName}`;

  const [isActive, setIsActive] = useState(initial.isActive);
  const [mode, setMode] = useState<ModuleMode>(initial.mode);
  const [credentials, setCredentials] = useState<CredentialsDraft>(() =>
    isTwilioModule(moduleName)
      ? ({ accountSid: "", authToken: "", phoneNumber: "" } as TwilioCredentialsDraft)
      : ({ anthropicKey: "", openaiKey: "" } as AICredentialsDraft),
  );
  const [credentialsOwner, setCredentialsOwner] = useState(initial.credentialsOwner ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // When the user flips to pool we keep entered credentials in local state
  // until they hit Save (per UX spec). Resetting only happens after a
  // successful Save round-trip.
  useEffect(() => {
    setErrors({});
  }, [mode]);

  const dirty = useMemo(() => {
    if (initial.isActive !== isActive) return true;
    if (initial.mode !== mode) return true;
    if (mode === "byok_customer" && (credentialsOwner ?? "") !== (initial.credentialsOwner ?? "")) return true;
    if (mode !== "pool" && hasAnyValue(credentials)) return true;
    return false;
  }, [credentials, credentialsOwner, initial, isActive, mode]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const validation = validateModuleDraft({
      moduleName,
      mode,
      credentials: mode === "pool" ? null : credentials,
      credentialsOwner: mode === "byok_customer" ? credentialsOwner : null,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});

    if (mode === "pool" && initial.mode !== "pool" && initial.hasCredentials) {
      const ok = window.confirm(
        "Beim Wechsel zu Pool werden die gespeicherten Credentials gelöscht. Fortfahren?",
      );
      if (!ok) return;
    }
    if (!isActive && initial.isActive && (activeConversationCount ?? 0) > 0) {
      const ok = window.confirm(
        `Es laufen aktuell ${activeConversationCount} aktive Conversations für dieses Modul. Deaktivieren?`,
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // configure endpoint also handles isActive via the body; we still
      // call toggle separately when only isActive changes so the audit
      // trail records MODULE_ACTIVATED / MODULE_DEACTIVATED accurately.
      const onlyToggleChanged =
        initial.mode === mode &&
        (mode === "pool" || !hasAnyValue(credentials)) &&
        initial.isActive !== isActive;

      if (onlyToggleChanged) {
        await postJson(`/api/agency/sub-orgs/${subAccountId}/modules/${moduleName}/toggle`, {
          isActive,
        });
      } else {
        await postJson(`/api/agency/sub-orgs/${subAccountId}/modules/${moduleName}/configure`, {
          mode,
          isActive,
          credentials: mode === "pool" ? undefined : credentials,
          credentialsOwner: mode === "byok_customer" ? credentialsOwner.trim() : undefined,
        });
      }

      const next: ModuleConfigSummary = {
        moduleName,
        mode,
        isActive,
        hasCredentials: mode !== "pool" && hasAnyValue(credentials),
        credentialsOwner: mode === "byok_customer" ? credentialsOwner.trim() : null,
      };
      onSaved(next);
      setSavedAt(new Date().toLocaleTimeString("de-DE"));
      // Clear the credentials inputs after a successful save so we don't
      // re-submit them by accident on a follow-up edit.
      setCredentials(
        isTwilioModule(moduleName)
          ? ({ accountSid: "", authToken: "", phoneNumber: "" } as TwilioCredentialsDraft)
          : ({ anthropicKey: "", openaiKey: "" } as AICredentialsDraft),
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, [
    activeConversationCount,
    credentials,
    credentialsOwner,
    initial,
    isActive,
    mode,
    moduleName,
    onSaved,
    subAccountId,
  ]);

  const handleConnectionTest = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    const validation = validateModuleDraft({
      moduleName,
      mode,
      credentials,
      credentialsOwner: mode === "byok_customer" ? credentialsOwner : null,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return { ok: false, message: "Credentials sind unvollständig" };
    }
    // No live test endpoint yet; surface the validated-shape success so the
    // user gets feedback before saving. A real /test endpoint can replace
    // this in a future sprint.
    return { ok: true, message: "Format korrekt — Save für Live-Test" };
  }, [credentials, credentialsOwner, mode, moduleName]);

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{MODULE_LABELS[moduleName]} Module</h2>
            <p className="text-xs text-muted-foreground">{MODULE_DESCRIPTIONS[moduleName]}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CostBadge mode={mode} isActive={isActive} poolPriceEur={poolPriceEur} />
          <div className="flex items-center gap-2">
            <Label htmlFor={`${groupId}-active`} className="text-xs uppercase text-muted-foreground">
              Aktiv
            </Label>
            <Switch
              checked={isActive}
              onCheckedChange={(value) => setIsActive(!!value)}
              disabled={saving}
            />
          </div>
        </div>
      </header>

      {isActive ? (
        <div className="mt-5 grid gap-4">
          <ModeRadio
            value={mode}
            onChange={setMode}
            poolPriceEur={poolPriceEur}
            disabled={saving}
            groupId={groupId}
          />

          {mode !== "pool" ? (
            <>
              {moduleName === "ai" ? (
                <AIModuleForm
                  value={credentials as AICredentialsDraft}
                  onChange={(next) => setCredentials(next)}
                  errors={errors}
                  disabled={saving}
                  groupId={groupId}
                />
              ) : (
                <TwilioModuleForm
                  value={credentials as TwilioCredentialsDraft}
                  onChange={(next) => setCredentials(next)}
                  errors={errors}
                  disabled={saving}
                  groupId={groupId}
                />
              )}

              {mode === "byok_customer" ? (
                <div>
                  <Label htmlFor={`${groupId}-owner`}>
                    Customer-Email <span className="text-xs text-muted-foreground">(für Audit-Trail)</span>
                  </Label>
                  <Input
                    id={`${groupId}-owner`}
                    type="email"
                    placeholder="kunde@praxis-mueller.de"
                    value={credentialsOwner}
                    onChange={(event) => setCredentialsOwner(event.target.value)}
                    disabled={saving}
                    aria-invalid={!!errors.credentialsOwner}
                    aria-describedby={errors.credentialsOwner ? `${groupId}-owner-error` : undefined}
                  />
                  {errors.credentialsOwner ? (
                    <p id={`${groupId}-owner-error`} className="mt-1 text-xs text-destructive">
                      {errors.credentialsOwner}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <ConnectionTester onTest={handleConnectionTest} disabled={saving} />
            </>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">
              {savedAt ? (
                <span>Zuletzt gespeichert: {savedAt}</span>
              ) : initial.hasCredentials && mode !== "pool" ? (
                <span>Credentials hinterlegt — leer lassen zum Beibehalten.</span>
              ) : null}
              {saveError ? (
                <span className="ml-3 text-destructive">Fehler: {saveError}</span>
              ) : null}
            </div>
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Speichern
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Modul ist deaktiviert. Aktivieren um Mode + Credentials zu konfigurieren.
          </p>
          {initial.isActive !== isActive ? (
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CostBadge({
  mode,
  isActive,
  poolPriceEur,
}: {
  mode: ModuleMode;
  isActive: boolean;
  poolPriceEur: number;
}) {
  if (!isActive) {
    return <Badge variant="outline">0 EUR · inaktiv</Badge>;
  }
  if (mode === "pool") {
    return <Badge>{`${poolPriceEur.toLocaleString("de-DE")} EUR/Monat`}</Badge>;
  }
  return <Badge variant="outline">0 EUR · BYOK</Badge>;
}

function hasAnyValue(creds: CredentialsDraft | null | undefined): boolean {
  if (!creds) return false;
  return Object.values(creds).some((v) => typeof v === "string" && v.trim().length > 0);
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export const __test__ = { hasAnyValue, postJson };
