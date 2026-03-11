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
      .then((res) => {
        if (!res.ok) throw new Error("Plan API error");
        return res.json();
      })
      .then((data) => {
        if (!data.limits || !data.limits.agents || !data.limits.chatsPerMonth) return;

        // agents >= 999999 means "unlimited"
        const agentLimitReached =
          data.limits.agents < 999999 &&
          data.agentCount >= data.limits.agents;

        const chatLimitNear =
          data.chatCount >= data.limits.chatsPerMonth * 0.8;

        if (agentLimitReached) {
          setMessage(
            `You've reached your agent limit (${data.agentCount}/${data.limits.agents}). Upgrade for more agents.`
          );
          setShow(true);
        } else if (chatLimitNear) {
          setMessage(
            `${data.chatCount.toLocaleString()} of ${data.limits.chatsPerMonth.toLocaleString()} conversations used this month. Upgrade for more.`
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
            Upgrade
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
