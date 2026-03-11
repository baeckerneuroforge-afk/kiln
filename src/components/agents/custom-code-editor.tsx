"use client";

import { useEffect, useRef, useState } from "react";
import { X, Play, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  {
    id: "shipping",
    name: "Calculate Shipping Cost",
    code: `// Calculate shipping cost based on weight and destination
// context: { userMessage, conversationHistory, agentName, leadScore, collectedEmail }

const message = context.userMessage.toLowerCase();

// Extract weight (simple regex)
const weightMatch = message.match(/(\\d+(?:\\.\\d+)?)\\s*(?:kg|kilo)/i);
const weight = weightMatch ? parseFloat(weightMatch[1]) : null;

if (!weight) {
  return { response: "Please provide the package weight in kg so I can calculate the shipping cost." };
}

// Shipping rates
const baseRate = 4.99;
const perKg = 1.50;
const cost = (baseRate + weight * perKg).toFixed(2);

return {
  response: \`Shipping for \${weight} kg costs €\${cost} (base €\${baseRate} + €\${perKg}/kg).\`,
  data: { weight, cost: parseFloat(cost), currency: "EUR" }
};`,
  },
  {
    id: "hours",
    name: "Check Business Hours",
    code: `// Check if the business is currently open
// context: { userMessage, conversationHistory, agentName, leadScore, collectedEmail }

const now = new Date();
const day = now.getDay(); // 0=Sun, 1=Mon, ...
const hour = now.getHours();

const schedule = {
  weekday: { open: 9, close: 18 },
  saturday: { open: 10, close: 14 },
};

const isWeekday = day >= 1 && day <= 5;
const isSaturday = day === 6;
const isSunday = day === 0;

let response;
if (isSunday) {
  response = "We're closed on Sundays. We open Monday at 9:00 AM.";
} else if (isSaturday) {
  const { open, close } = schedule.saturday;
  response = hour >= open && hour < close
    ? \`We're open! Saturday hours: \${open}:00 – \${close}:00.\`
    : \`We're closed. Saturday hours: \${open}:00 – \${close}:00.\`;
} else {
  const { open, close } = schedule.weekday;
  response = hour >= open && hour < close
    ? \`We're open! Weekday hours: \${open}:00 – \${close}:00.\`
    : \`We're closed. Weekday hours: \${open}:00 – \${close}:00.\`;
}

return { response, data: { isOpen: (isWeekday && hour >= 9 && hour < 18) || (isSaturday && hour >= 10 && hour < 14) } };`,
  },
  {
    id: "phone",
    name: "Format Phone Number",
    code: `// Format and validate a phone number
// context: { userMessage, conversationHistory, agentName, leadScore, collectedEmail }

const message = context.userMessage;

// Extract digits
const digits = message.replace(/[^\\d+]/g, "");

if (digits.length < 7) {
  return { response: "I couldn't find a valid phone number. Please provide a number with at least 7 digits." };
}

// Format for German numbers
let formatted = digits;
if (digits.startsWith("0049")) {
  formatted = "+" + digits.slice(2);
} else if (digits.startsWith("49") && digits.length > 10) {
  formatted = "+" + digits;
} else if (digits.startsWith("0")) {
  formatted = "+49 " + digits.slice(1);
}

// Add spaces for readability
if (formatted.startsWith("+49")) {
  const rest = formatted.replace("+49", "").replace(/\\s/g, "");
  formatted = "+49 " + rest.slice(0, 3) + " " + rest.slice(3);
}

return {
  response: \`Formatted number: \${formatted}\`,
  data: { original: digits, formatted, country: digits.startsWith("49") || digits.startsWith("0") ? "DE" : "unknown" }
};`,
  },
];

interface CustomCodeEditorProps {
  code: string;
  description: string;
  onSave: (code: string, description: string) => void;
  onClose: () => void;
  saving?: boolean;
}

export function CustomCodeEditor({ code, description, onSave, onClose, saving }: CustomCodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [currentCode, setCurrentCode] = useState(code);
  const [actionDescription, setActionDescription] = useState(description);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: currentCode,
      extensions: [
        javascript(),
        oneDark,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        placeholderExt("// Write your custom action code here...\n// Available: context.userMessage, context.conversationHistory, etc.\n// Return: { response: string, data?: object }"),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setCurrentCode(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(templateCode: string) {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: templateCode },
    });
    setCurrentCode(templateCode);
  }

  async function testCode() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const context = {
        userMessage: "I need to ship a 5kg package to Berlin",
        conversationHistory: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "How can I help you?" },
          { role: "user", content: "I need to ship a 5kg package to Berlin" },
        ],
        agentName: "Test Agent",
        leadScore: null,
        collectedEmail: null,
      };

      // Sandboxed execution via Function constructor
      const fn = new Function("context", `"use strict";\n${currentCode}`);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Execution timed out (5s limit)")), 5000)
      );
      const result = await Promise.race([
        Promise.resolve(fn(context)),
        timeoutPromise,
      ]);

      if (!result || typeof result.response !== "string") {
        setTestError("Code must return { response: string, data?: object }");
      } else {
        setTestResult(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 flex h-[85vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-[#0C0A09] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚡</span>
            <h2 className="text-sm font-semibold text-foreground">
              Custom Code Action
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={testCode}
              disabled={testing || !currentCode.trim()}
            >
              {testing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test
            </Button>
            <Button
              size="sm"
              onClick={() => onSave(currentCode, actionDescription)}
              disabled={saving || !currentCode.trim() || !actionDescription.trim()}
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Editor Area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Action Description */}
            <div className="border-b border-border px-5 py-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Action Description (tells Claude when to trigger this action)
              </label>
              <input
                type="text"
                value={actionDescription}
                onChange={(e) => setActionDescription(e.target.value)}
                placeholder="e.g. Calculate shipping cost when user asks about delivery prices"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Code Editor */}
            <div className="flex-1 overflow-auto">
              <div ref={editorRef} className="h-full" />
            </div>

            {/* Test Result */}
            {(testResult || testError) && (
              <div className={cn(
                "border-t border-border px-5 py-3 font-mono text-xs",
                testError ? "bg-red-500/5" : "bg-green-500/5"
              )}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {testError ? "Error" : "Test Result"}
                </div>
                <pre className={cn(
                  "max-h-32 overflow-auto whitespace-pre-wrap",
                  testError ? "text-red-400" : "text-green-400"
                )}>
                  {testError || testResult}
                </pre>
              </div>
            )}
          </div>

          {/* Sidebar: Templates + Docs */}
          <div className="w-64 shrink-0 overflow-y-auto border-l border-border bg-[#0C0A09] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Templates
            </h3>
            <div className="space-y-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.code)}
                  className="group w-full rounded-lg border border-border/50 bg-card/30 p-2.5 text-left transition-all hover:border-kiln-orange/30 hover:bg-kiln-orange/5"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-kiln-orange" />
                    <span className="text-xs font-medium text-foreground">{t.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-dashed border-border p-3">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Available Context
              </h4>
              <ul className="space-y-1.5 text-[10px] text-muted-foreground">
                <li><code className="text-kiln-orange">context.userMessage</code><br />Last user message</li>
                <li><code className="text-kiln-orange">context.conversationHistory</code><br />Array of {"{role, content}"}</li>
                <li><code className="text-kiln-orange">context.agentName</code><br />Name of the agent</li>
                <li><code className="text-kiln-orange">context.leadScore</code><br />Current lead score (or null)</li>
                <li><code className="text-kiln-orange">context.collectedEmail</code><br />Collected email (or null)</li>
              </ul>

              <h4 className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Return Format
              </h4>
              <pre className="rounded bg-muted/30 px-2 py-1.5 text-[10px] text-foreground">
{`return {
  response: "text",
  data: { ... } // optional
};`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
