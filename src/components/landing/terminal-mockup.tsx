"use client";

/**
 * Mac-style terminal mockup that types out a sequence of prompts +
 * responses. Adapted from the legacy landing's TerminalTyped — same
 * visual style, simpler API. Useful as an interlude visual on the
 * Final-CTA section to suggest "you can do this from the CLI today".
 *
 * Lines are typed in based on the cumulative `delay` offsets. The
 * final cursor pulses while waiting for the next command.
 */
import { useEffect, useMemo, useState } from "react";

export interface TerminalLine {
  prompt: boolean;
  text: string;
  delay: number;
}

interface TerminalMockupProps {
  /** Default lines tell the agency-onboarding story. */
  lines?: TerminalLine[];
  className?: string;
}

const DEFAULT_LINES: TerminalLine[] = [
  {
    prompt: true,
    text: 'kiln_create_subOrg --name "Acme Corp" --domain ai.acme.com',
    delay: 200,
  },
  {
    prompt: false,
    text: "  Sub-org created: org_a1b2c3 (Acme Corp · custom-domain provisioned)",
    delay: 1700,
  },
  {
    prompt: true,
    text: 'kiln_clone_agent --from sales_template --to org_a1b2c3',
    delay: 3000,
  },
  {
    prompt: false,
    text: "  Cloned: 1 agent, 3 workflows, 47 KB documents",
    delay: 4500,
  },
  {
    prompt: true,
    text: "kiln_set_pricing --org org_a1b2c3 --monthly 497",
    delay: 5800,
  },
  {
    prompt: false,
    text: "  Stripe Subscription live · billing starts after 14-day trial",
    delay: 7300,
  },
];

export function TerminalMockup({
  lines = DEFAULT_LINES,
  className,
}: TerminalMockupProps) {
  const memoLines = useMemo(() => lines, [lines]);
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(memoLines.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    memoLines.forEach((line, i) => {
      timers.push(setTimeout(() => setVisible(i + 1), line.delay));
    });
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [memoLines]);

  return (
    <div
      className={
        "rounded-xl border border-white/[0.08] bg-[#0A0A0A] overflow-hidden shadow-2xl shadow-black/60 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <div className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-3 font-mono text-[11px] text-neutral-500">
          kiln — zsh
        </span>
      </div>
      <div className="min-h-[260px] p-5 font-mono text-[12px] leading-loose">
        {memoLines.slice(0, visible).map((line, i) =>
          line.prompt ? (
            <div key={i}>
              <span className="text-[#22C55E]">~</span>
              <span className="text-[#3B82F6]"> kiln</span>
              <span className="text-neutral-500"> $ </span>
              <span className="text-white">{line.text}</span>
            </div>
          ) : (
            <div key={i} className="text-neutral-400">
              {line.text}
            </div>
          ),
        )}
        {visible < memoLines.length && (
          <span className="inline-block h-3.5 w-2 animate-pulse bg-[#F97316]" />
        )}
        {visible >= memoLines.length && (
          <div className="mt-1">
            <span className="text-[#22C55E]">~</span>
            <span className="text-[#3B82F6]"> kiln</span>
            <span className="text-neutral-500"> $ </span>
            <span className="inline-block h-3.5 w-2 animate-pulse bg-[#F97316]" />
          </div>
        )}
      </div>
    </div>
  );
}
