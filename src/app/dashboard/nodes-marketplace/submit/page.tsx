"use client";

/**
 * Node Submission — Custom Node einreichen
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EXAMPLE_CODE = `// Beispiel: Textzusammenfassung via LLM
const text = input.text;
if (!text) {
  return { output: {}, status: "error", error: "Kein Text bereitgestellt" };
}

const summary = await llm.complete(
  \`Fasse den folgenden Text in 2-3 Saetzen zusammen:\\n\\n\${text}\`
);

return {
  output: { summary },
  status: "success",
  creditsUsed: 1,
};`;

export default function SubmitNodePage() {
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "utility",
    icon: "🧩",
    color: "#F97316",
    version: "1.0.0",
    executeCode: EXAMPLE_CODE,
    readme: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/nodes-marketplace/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: {
            id: `user/${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            name: form.name,
            description: form.description,
            category: form.category,
            icon: form.icon,
            color: form.color,
            version: form.version,
            inputs: [{ name: "text", type: "string", description: "Eingabetext" }],
            outputs: [{ name: "result", type: "string", description: "Ergebnis" }],
            config: [],
            executeCode: form.executeCode,
          },
          readme: form.readme,
        }),
      });
      const data = await res.json();
      setResult({
        success: res.ok,
        message: res.ok ? `Node eingereicht! Status: ${data.status}` : (data.error || "Fehler beim Einreichen"),
      });
    } catch {
      setResult({ success: false, message: "Netzwerkfehler" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async () => {
    setTestResult("Teste...");
    try {
      // Lokaler Test — fuehrt den Code nicht wirklich aus, nur Syntax-Check
      new Function("input", "config", "llm", "http", "storage", "credits", form.executeCode);
      setTestResult("Syntax OK — Code ist gueltig.");
    } catch (err) {
      setTestResult(`Syntax-Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-foreground">Custom Node einreichen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Erstelle und teile einen Custom Node mit der Community
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Mein Node"
              className="bg-card border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Version</Label>
            <Input
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="1.0.0"
              className="bg-card border-border"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Beschreibung</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Was macht dieser Node?"
            className="bg-card border-border"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Kategorie</Label>
            <Select value={form.category} onValueChange={(v) => { if (v) setForm({ ...form, category: v }); }}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data">Daten</SelectItem>
                <SelectItem value="ai">KI & ML</SelectItem>
                <SelectItem value="integration">Integrationen</SelectItem>
                <SelectItem value="transform">Transformation</SelectItem>
                <SelectItem value="output">Ausgabe</SelectItem>
                <SelectItem value="utility">Hilfsmittel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Icon (Emoji)</Label>
            <Input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              className="bg-card border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Farbe</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-10 h-9 p-1 bg-card border-border"
              />
              <Input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="bg-card border-border"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Execute Code</Label>
            <Button size="sm" variant="ghost" className="text-xs text-orange-400" onClick={handleTest}>
              Syntax testen
            </Button>
          </div>
          <Textarea
            value={form.executeCode}
            onChange={(e) => setForm({ ...form, executeCode: e.target.value })}
            className="bg-card border-border font-mono text-xs min-h-[200px]"
            placeholder="// Dein Node-Code hier..."
          />
          {testResult && (
            <p className={`text-xs ${testResult.includes("OK") ? "text-muted-foreground" : "text-muted-foreground"}`}>
              {testResult}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Readme (optional, Markdown)</Label>
          <Textarea
            value={form.readme}
            onChange={(e) => setForm({ ...form, readme: e.target.value })}
            className="bg-card border-border min-h-[100px]"
            placeholder="# Mein Node&#10;&#10;Beschreibung, Beispiele, Konfiguration..."
          />
        </div>

        {result && (
          <div
            className={`p-3 rounded-lg border text-sm ${
              result.success
                ? "bg-muted border-green-500/30 text-muted-foreground"
                : "bg-muted border-red-500/30 text-muted-foreground"
            }`}
          >
            {result.message}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitting || !form.name || !form.description || !form.executeCode}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
        >
          {submitting ? "Wird eingereicht..." : "Node einreichen"}
        </Button>
      </div>
    </div>
  );
}
