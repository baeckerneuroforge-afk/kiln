"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Zap, Key } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";

export function CreditBanner() {
  const [balance, setBalance] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [byokActive, setBYOKActive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { advancedMode } = useAdvancedMode();

  useEffect(() => {
    fetch("/api/credits")
      .then((res) => res.json())
      .then((data) => {
        if (data.balance !== undefined) {
          setBalance(data.balance);
          setTotal(data.totalCredits);
          setBYOKActive(data.byokActive);
          setIsAdmin(data.isAdmin);
        }
      })
      .catch(() => {});
  }, []);

  if (dismissed || balance === null || isAdmin || byokActive) return null;

  // Simple Mode: show "AI Chats remaining" instead of "credits"
  const isSimple = !advancedMode;

  // Show at 0 credits
  if (balance <= 0) {
    return (
      <div className="flex items-center gap-3 border-b border-kiln-orange/20 bg-kiln-orange/10 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-kiln-orange" />
        <p className="flex-1 text-xs text-kiln-orange">
          {isSimple
            ? "You\u2019ve used all your AI chats this month. Upgrade to keep your agents running."
            : "You\u2019ve used all your AI credits this month. Your agents can\u2019t respond until you get more credits."}
        </p>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/settings?tab=billing">
            <Button size="sm" className="h-7 text-[11px]"><Zap className="mr-1 h-3 w-3" />Upgrade</Button>
          </Link>
          {!isSimple && (
            <Link href="/dashboard/settings?tab=billing">
              <Button size="sm" variant="outline" className="h-7 text-[11px]">Buy Credits</Button>
            </Link>
          )}
          {!isSimple && (
            <Link href="/dashboard/settings?tab=api-keys">
              <Button size="sm" variant="outline" className="h-7 text-[11px]"><Key className="mr-1 h-3 w-3" />Add API Key</Button>
            </Link>
          )}
          <button onClick={() => setDismissed(true)} className="text-xs text-kiln-orange/60 hover:text-kiln-orange ml-1">✕</button>
        </div>
      </div>
    );
  }

  // Show at <20% credits
  if (total > 0 && balance / total <= 0.2) {
    return (
      <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <p className="flex-1 text-xs text-amber-400">
          {isSimple
            ? `AI Chats remaining: ${balance} / ${total} this month`
            : `You have ${balance} credits remaining this month.`}
        </p>
        <Link href="/dashboard/settings?tab=billing">
          <Button size="sm" variant="outline" className="h-6 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
            {isSimple ? "Get More" : "Buy Credits"}
          </Button>
        </Link>
        <button onClick={() => setDismissed(true)} className="text-xs text-amber-400/60 hover:text-amber-400 ml-1">✕</button>
      </div>
    );
  }

  return null;
}
