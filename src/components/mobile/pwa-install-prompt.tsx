"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X, Share, Smartphone } from "lucide-react";

const DISMISS_KEY = "kiln_pwa_prompt_dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Prüfen ob bereits als PWA installiert
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return;

    // Prüfen ob auf Mobilgerät
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobileDevice) return;

    // iOS-Erkennung
    const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(isApple);

    // Prüfen ob kürzlich dismissed
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10);
        if (Date.now() - dismissedAt < DISMISS_DURATION_MS) return;
      }
    } catch {
      // ignore
    }

    // Chrome/Android: beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: Zeige manuellen Hint nach kurzer Verzögerung
    if (isApple) {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShow(false);
      }
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  if (!show || isStandalone) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] p-4 safe-bottom animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-2xl border border-kiln-orange/20 bg-card/95 backdrop-blur-md p-4 shadow-xl shadow-black/40">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-kiln-orange to-kiln-ember">
            <Smartphone className="h-5 w-5 text-white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">
              KILN installieren
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              {isIOS
                ? 'Tippe auf das Teilen-Symbol und wähle \u201EZum Home-Bildschirm\u201C'
                : "Installiere KILN als App für schnelleren Zugriff und Benachrichtigungen"}
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="p-1 text-stone-600 hover:text-stone-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action */}
        <div className="flex gap-2 mt-3 ml-[52px]">
          {isIOS ? (
            <div className="flex items-center gap-2 text-xs text-kiln-orange">
              <Share className="h-4 w-4" />
              <span>Teilen → Zum Home-Bildschirm</span>
            </div>
          ) : deferredPrompt ? (
            <button
              onClick={handleInstall}
              className="flex items-center gap-2 rounded-lg bg-kiln-orange px-4 py-2 text-xs font-medium text-white active:bg-kiln-orange/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Installieren
            </button>
          ) : null}

          <button
            onClick={handleDismiss}
            className="rounded-lg px-3 py-2 text-xs text-stone-500 active:text-stone-300 transition-colors"
          >
            Später
          </button>
        </div>
      </div>
    </div>
  );
}
