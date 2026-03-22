"use client";

import { useState } from "react";
import { WifiOff, RefreshCw, Bot } from "lucide-react";

export default function OfflinePage() {
  const [checking, setChecking] = useState(false);

  const handleRetry = () => {
    setChecking(true);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      window.location.href = "/dashboard";
      return;
    }
    // Check by trying to fetch
    fetch("/api/health", { cache: "no-store" })
      .then(() => {
        window.location.href = "/dashboard";
      })
      .catch(() => {
        setChecking(false);
      });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0C0A09] px-6 text-center">
      {/* Logo */}
      <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-kiln-orange to-kiln-ember shadow-lg shadow-kiln-orange/20">
        <span className="font-serif text-2xl font-bold text-white">K</span>
      </div>

      {/* Offline icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-stone-800/50">
        <WifiOff className="h-10 w-10 text-stone-500" />
      </div>

      <h1 className="mb-3 font-serif text-2xl text-white">Du bist offline</h1>

      <p className="mb-2 max-w-sm text-stone-400">
        Deine Agents laufen weiter in der Cloud. Du siehst alle Updates, sobald
        du wieder online bist.
      </p>

      <div className="mb-8 flex items-center gap-2 text-sm text-stone-500">
        <Bot className="h-4 w-4" />
        <span>Agents sind weiterhin aktiv und erreichbar</span>
      </div>

      <button
        onClick={handleRetry}
        disabled={checking}
        className="flex items-center gap-2 rounded-lg bg-kiln-orange px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
        {checking ? "Verbindung prüfen..." : "Erneut versuchen"}
      </button>
    </div>
  );
}
