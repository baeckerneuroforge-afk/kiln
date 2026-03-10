"use client";

import { useEffect, useState } from "react";
import { Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function UpgradeBanner() {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => {
        if (!data.limits) return;

        const agentLimitReached =
          data.limits.agents !== null &&
          data.limits.agents !== Infinity &&
          data.agentCount >= data.limits.agents;

        const chatLimitNear =
          data.chatCount >= data.limits.chatsPerMonth * 0.8;

        if (agentLimitReached) {
          setMessage(
            `Du hast dein Agent-Limit erreicht (${data.agentCount}/${data.limits.agents}). Upgrade für mehr Agents.`
          );
          setShow(true);
        } else if (chatLimitNear) {
          setMessage(
            `${data.chatCount.toLocaleString()} von ${data.limits.chatsPerMonth.toLocaleString()} Gesprächen diesen Monat genutzt. Upgrade für mehr.`
          );
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div className="mx-6 mt-4 flex items-center justify-between rounded-xl border border-kiln-orange/30 bg-kiln-orange/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <Crown className="h-4 w-4 text-kiln-orange" />
        <p className="text-sm text-foreground">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/dashboard/settings">
          <Button size="sm" className="h-7 text-xs">
            Upgraden
          </Button>
        </Link>
        <button
          onClick={() => setShow(false)}
          className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
