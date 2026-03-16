"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, ArrowRight, X } from "lucide-react";

const DISMISSED_KEY = "kiln-getting-started-dismissed";

export function GettingStartedBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if dismissed
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    } catch { /* SSR / privacy */ }

    // Check if user has 0 agents
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data) => {
        const agents = data.agents || data || [];
        if (Array.isArray(agents) && agents.length === 0) {
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISSED_KEY, "true"); } catch { /* */ }
  }

  if (!show) return null;

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-kiln-orange/20 bg-gradient-to-r from-kiln-orange/10 via-kiln-ember/5 to-transparent p-6">
      <button
        onClick={dismiss}
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kiln-orange/20">
          <Rocket className="h-5 w-5 text-kiln-orange" />
        </div>
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-white">Getting Started</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Create your first AI agent in under 2 minutes. No code required.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/dashboard/agents/new"
              className="inline-flex items-center gap-2 rounded-lg bg-kiln-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90"
            >
              Create Your First Agent
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/help#create-first-agent"
              className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              Read the Guide
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
