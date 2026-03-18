"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface FormField {
  name: string;
  type: "text" | "email" | "number" | "textarea" | "select" | "checkbox";
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormConfig {
  title: string;
  description: string;
  fields: FormField[];
  teamName: string;
}

export default function WorkflowFormPage() {
  const params = useParams();
  const executionId = params.executionId as string;
  const nodeId = params.nodeId as string;

  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/workflows/form/${executionId}/${nodeId}`)
      .then(async (r) => {
        if (r.status === 410) {
          setExpired(true);
          return null;
        }
        if (!r.ok) throw new Error("Form not found");
        return r.json();
      })
      .then((data) => {
        if (data) {
          setConfig(data);
          // Initialize default values
          const defaults: Record<string, unknown> = {};
          (data.fields || []).forEach((f: FormField) => {
            if (f.type === "checkbox") defaults[f.name] = false;
            else defaults[f.name] = "";
          });
          setFormValues(defaults);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [executionId, nodeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/workflows/form/${executionId}/${nodeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });

      if (res.status === 422) {
        const data = await res.json();
        setSubmitError(`Missing required fields: ${data.fields.join(", ")}`);
        return;
      }

      if (res.status === 410) {
        setExpired(true);
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to submit form");
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (name: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0A09] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#0C0A09] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-zinc-100 font-[family-name:var(--font-instrument)] mb-2">
            Form Not Found
          </h1>
          <p className="text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  // Expired state
  if (expired) {
    return (
      <div className="min-h-screen bg-[#0C0A09] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-zinc-100 font-[family-name:var(--font-instrument)] mb-2">
            Form Expired
          </h1>
          <p className="text-sm text-zinc-500">
            This form is no longer accepting responses. The workflow has already continued.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0C0A09] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 font-[family-name:var(--font-instrument)] mb-2">
            Thank You!
          </h1>
          <p className="text-sm text-zinc-500">
            Your response has been recorded. The workflow will now continue.
          </p>
        </div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="min-h-screen bg-[#0C0A09] flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold font-[family-name:var(--font-instrument)]">K</span>
          </div>
          <div>
            <p className="text-xs text-zinc-500">{config.teamName}</p>
            <p className="text-sm font-medium text-zinc-300">Workflow Form</p>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-semibold text-zinc-100 font-[family-name:var(--font-instrument)] mb-2">
            {config.title}
          </h1>
          {config.description && (
            <p className="text-sm text-zinc-500 mb-6">{config.description}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {config.fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-1">
                  {field.label}
                  {field.required && <span className="text-red-400">*</span>}
                </label>

                {field.type === "textarea" ? (
                  <textarea
                    value={(formValues[field.name] as string) || ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    required={field.required}
                    placeholder={field.placeholder}
                    rows={4}
                    className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none p-3 placeholder:text-zinc-600 resize-none focus:border-orange-500/50 transition-colors"
                  />
                ) : field.type === "select" ? (
                  <select
                    value={(formValues[field.name] as string) || ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    required={field.required}
                    className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none px-3 py-2.5 focus:border-orange-500/50 transition-colors"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === "checkbox" ? (
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formValues[field.name]}
                      onChange={(e) => updateField(field.name, e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500/30"
                    />
                    <span className="text-sm text-zinc-400">{field.placeholder || field.label}</span>
                  </label>
                ) : (
                  <input
                    type={field.type}
                    value={(formValues[field.name] as string) || ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    required={field.required}
                    placeholder={field.placeholder}
                    className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none px-3 py-2.5 placeholder:text-zinc-600 focus:border-orange-500/50 transition-colors"
                  />
                )}
              </div>
            ))}

            {submitError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit"
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-center">
          <a
            href="https://kilnbase.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Powered by KILN
          </a>
        </div>
      </footer>
    </div>
  );
}
