"use client";

import { useState, useEffect, useCallback } from "react";
import { Mic, Volume2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VOICE_SETTINGS_KEY = "kiln_voice_settings";

interface VoiceSettings {
  enabled: boolean;
  language: string;
  autoSend: boolean;
  ttsEnabled: boolean;
  ttsRate: number;
  ttsPitch: number;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  enabled: true,
  language: "de-DE",
  autoSend: false,
  ttsEnabled: false,
  ttsRate: 1.0,
  ttsPitch: 1.0,
};

function loadSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: VoiceSettings) {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function VoiceSettingsPanel() {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [testPlaying, setTestPlaying] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    setSettings(loadSettings());
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  const updateSetting = useCallback(
    <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const testTTS = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    setTestPlaying(true);
    const utterance = new SpeechSynthesisUtterance(
      "Hallo, ich bin dein KILN Assistant."
    );
    utterance.lang = settings.language;
    utterance.rate = settings.ttsRate;
    utterance.pitch = settings.ttsPitch;
    utterance.onend = () => setTestPlaying(false);
    utterance.onerror = () => setTestPlaying(false);
    window.speechSynthesis.speak(utterance);
  }, [settings.language, settings.ttsRate, settings.ttsPitch]);

  if (!hasMounted) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
          <Mic className="h-5 w-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Spracheingabe & Audio
          </h3>
          <p className="text-sm text-muted-foreground">
            Steuere KILN per Stimme
          </p>
        </div>
      </div>

      {!voiceSupported && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-sm text-yellow-400">
            Dein Browser unterstützt keine Spracheingabe. Verwende Chrome oder
            Edge für die beste Erfahrung.
          </p>
        </div>
      )}

      {/* Voice Input */}
      <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Spracheingabe aktiviert
            </span>
          </div>
          <button
            onClick={() => updateSetting("enabled", !settings.enabled)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              settings.enabled ? "bg-orange-500" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                settings.enabled ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Automatisch senden nach Erkennung
          </span>
          <button
            onClick={() => updateSetting("autoSend", !settings.autoSend)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              settings.autoSend ? "bg-orange-500" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                settings.autoSend ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Sprache</label>
          <select
            value={settings.language}
            onChange={(e) => updateSetting("language", e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-orange-500/50 focus:outline-none"
          >
            <option value="de-DE">Deutsch</option>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="fr-FR">Français</option>
            <option value="es-ES">Español</option>
          </select>
        </div>
      </div>

      {/* TTS */}
      <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Antworten vorlesen
            </span>
          </div>
          <button
            onClick={() => updateSetting("ttsEnabled", !settings.ttsEnabled)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              settings.ttsEnabled ? "bg-orange-500" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                settings.ttsEnabled ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        {settings.ttsEnabled && (
          <>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Geschwindigkeit</label>
                <span className="text-xs text-muted-foreground">{settings.ttsRate}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.ttsRate}
                onChange={(e) =>
                  updateSetting("ttsRate", parseFloat(e.target.value))
                }
                className="mt-1 w-full accent-orange-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Tonhöhe</label>
                <span className="text-xs text-muted-foreground">{settings.ttsPitch}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.ttsPitch}
                onChange={(e) =>
                  updateSetting("ttsPitch", parseFloat(e.target.value))
                }
                className="mt-1 w-full accent-orange-500"
              />
            </div>

            <button
              onClick={testTTS}
              disabled={testPlaying}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors",
                testPlaying
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                  : "text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {testPlaying ? "Wird abgespielt..." : "Test abspielen"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
