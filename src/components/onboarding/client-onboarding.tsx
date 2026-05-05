"use client";

import { useState } from "react";
import { ArrowRight, Bot, MessageSquare, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Agent {
  id: string;
  name: string;
  description?: string;
}

interface Props {
  agencyName: string;
  agencyLogo?: string;
  accentColor?: string;
  agents: Agent[];
  portalId: string;
  token: string;
}

/**
 * Vereinfachtes Onboarding für Client-Portal-Nutzer.
 * 3 Schritte statt 8 — Clients müssen nichts konfigurieren.
 */
export function ClientOnboarding({ agencyName, agencyLogo, accentColor = "#F97316", agents, portalId, token }: Props) {
  const [step, setStep] = useState(0);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-card p-6">
      <div className="w-full max-w-md">
        {/* Agency Logo */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          {agencyLogo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={agencyLogo} alt="" className="h-10 w-10 rounded-lg object-cover" />
            </>
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}
            >
              <span className="font-serif text-xl font-bold text-white">
                {agencyName.charAt(0)}
              </span>
            </div>
          )}
          <span className="font-serif text-2xl text-foreground">{agencyName}</span>
        </div>

        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step ? "w-8" : "w-2"
              }`}
              style={{
                backgroundColor: s <= step ? accentColor : "#27272A",
                opacity: s <= step ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 0 && (
          <div className="text-center">
            <Sparkles className="mx-auto mb-4 h-12 w-12" style={{ color: accentColor }} />
            <h1 className="font-serif text-2xl text-foreground">
              Willkommen bei {agencyName}!
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Wir haben AI Assistenten für Sie eingerichtet, die Ihnen rund um die Uhr zur Verfügung stehen.
            </p>
            <Button
              onClick={() => setStep(1)}
              className="mt-8 h-11 px-8 text-sm"
              style={{ backgroundColor: accentColor }}
            >
              Los geht&apos;s <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Meet your agents */}
        {step === 1 && (
          <div>
            <h2 className="text-center font-serif text-xl text-foreground">Ihre AI Assistenten</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Diese Agents wurden speziell für Sie konfiguriert.
            </p>
            <div className="mt-6 space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-4"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${accentColor}15` }}
                  >
                    <Bot className="h-5 w-5" style={{ color: accentColor }} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{agent.name}</h4>
                    {agent.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{agent.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={() => setStep(2)}
              className="mt-6 w-full h-11 text-sm"
              style={{ backgroundColor: accentColor }}
            >
              Agent testen <MessageSquare className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 2 && (
          <div className="text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${accentColor}15` }}
            >
              <Check className="h-8 w-8" style={{ color: accentColor }} />
            </div>
            <h2 className="font-serif text-2xl text-foreground">Alles bereit!</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Ihr AI Assistent steht Ihnen jederzeit zur Verfügung.
              Sprechen Sie ihn einfach an wie einen Mitarbeiter.
            </p>
            <a
              href={`/portal/${portalId}?token=${token}`}
              className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: accentColor }}
            >
              Zum Dashboard <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
