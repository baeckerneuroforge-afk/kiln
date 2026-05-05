"use client";

import { useState } from "react";
import {
  CreditCard, ArrowRight, Check, Loader2, DollarSign, Zap, Shield, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { title: "AI Agent Services verkaufen", description: "Biete deinen Kunden AI Agents als Managed Service an" },
  { title: "Stripe verbinden", description: "Verbinde dein Bankkonto über Stripe Express" },
  { title: "Preise festlegen", description: "Definiere deine monatlichen Preise" },
  { title: "Bereit zum Verkaufen!", description: "Erstelle Client-Portale mit Billing" },
];

interface Props {
  onComplete?: () => void;
}

export function ResellerSetup({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [defaultPrice, setDefaultPrice] = useState("19900"); // €199.00 in Cents

  const startConnectSetup = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reseller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: window.location.origin }),
      });
      const data = await res.json();
      if (data.onboardingUrl) {
        setConnectUrl(data.onboardingUrl);
        setStep(1);
      }
    } catch {
      // Fehler ignorieren
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i <= step
                  ? "bg-orange-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 ${i < step ? "bg-orange-500" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Starte als AI-Reseller</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verkaufe AI Agent-Services an deine Kunden. Du setzt den Preis, KILN nimmt nur 20% Platform Fee.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <DollarSign className="mb-2 h-5 w-5 text-green-400" />
              <h4 className="text-sm font-medium text-foreground">Du setzt den Preis</h4>
              <p className="mt-1 text-xs text-muted-foreground">z.B. €200/Monat pro Client</p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <Zap className="mb-2 h-5 w-5 text-orange-400" />
              <h4 className="text-sm font-medium text-foreground">Automatische Abrechnung</h4>
              <p className="mt-1 text-xs text-muted-foreground">Stripe handelt alles</p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <Shield className="mb-2 h-5 w-5 text-blue-400" />
              <h4 className="text-sm font-medium text-foreground">80% für dich</h4>
              <p className="mt-1 text-xs text-muted-foreground">KILN behält nur 20% Fee</p>
            </div>
          </div>

          <Button
            onClick={startConnectSetup}
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-500 text-white h-10"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            Stripe Account verbinden
          </Button>
        </div>
      )}

      {step === 1 && connectUrl && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Stripe verbinden</h2>
          <p className="text-sm text-muted-foreground">
            Klicke unten, um dein Bankkonto bei Stripe einzurichten. Nach der Einrichtung wirst du hierher zurückgeleitet.
          </p>
          <a
            href={connectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#635BFF] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5851DB]"
          >
            <ExternalLink className="h-4 w-4" />
            Stripe Onboarding öffnen
          </a>
          <Button
            variant="outline"
            onClick={() => setStep(2)}
            className="ml-3 border-border text-xs"
          >
            Ich habe Stripe verbunden <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Standard-Preis festlegen</h2>
          <p className="text-sm text-muted-foreground">
            Dieser Preis wird als Vorschlag beim Erstellen neuer Client-Subscriptions verwendet.
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Monatlicher Preis (€)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">€</span>
              <input
                type="number"
                value={Math.round(parseInt(defaultPrice) / 100)}
                onChange={(e) => setDefaultPrice(String(parseInt(e.target.value || "0") * 100))}
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
              />
              <span className="text-xs text-muted-foreground">/ Monat pro Client</span>
            </div>
          </div>
          <Button
            onClick={() => setStep(3)}
            className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
          >
            Weiter <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
            <Check className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Du bist bereit!</h2>
          <p className="text-sm text-muted-foreground">
            Erstelle jetzt ein Client-Portal und füge Billing hinzu.
          </p>
          <Button
            onClick={onComplete}
            className="bg-orange-600 hover:bg-orange-500 text-white h-10"
          >
            Client-Portale verwalten <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
