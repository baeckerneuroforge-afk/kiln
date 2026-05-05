"use client";

import { useState, useCallback } from "react";
import {
  FileText,
  Download,
  Share2,
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface ReportData {
  exists: boolean;
  reportId?: string;
  reportUrl?: string;
  fileName?: string;
  generatedAt?: string;
  expiresAt?: string;
}

interface ProofOfWorkReportProps {
  executionId: string;
  className?: string;
}

export function ProofOfWorkReport({ executionId, className }: ProofOfWorkReportProps) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workflows/executions/${executionId}/report`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/executions/${executionId}/report`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setReport({
          exists: true,
          reportId: data.reportId,
          reportUrl: data.reportUrl,
          generatedAt: data.generatedAt,
        });
      } else {
        const err = await res.json();
        setError(err.error || "Failed to generate report");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = () => {
    if (report?.reportUrl) {
      setShareUrl(report.reportUrl);
      navigator.clipboard.writeText(report.reportUrl);
    }
  };

  const handleEmailSend = async () => {
    if (!emailInput || !report?.reportUrl) return;
    setEmailSending(true);
    try {
      await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailInput,
          subject: "Proof of Work Report — KILN AI",
          body: `Your execution report is ready: ${report.reportUrl}`,
          attachmentUrl: report.reportUrl,
        }),
      });
      setShowEmailForm(false);
      setEmailInput("");
    } catch {
      // Silent
    } finally {
      setEmailSending(false);
    }
  };

  // Auto-fetch on mount
  if (!report && !loading && !generating) {
    fetchReport();
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-medium text-foreground">Proof of Work Report</h3>
        </div>
        {report?.generatedAt && (
          <span className="text-[10px] text-muted-foreground">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {!loading && !report?.exists && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-3">
              No report generated yet. Generate a PDF proof-of-work report with screenshots, reasoning, and findings.
            </p>
            <Button
              onClick={generateReport}
              disabled={generating}
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        )}

        {report?.exists && report.reportUrl && (
          <>
            {/* Preview */}
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-foreground">Report Ready</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                {report.reportUrl}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(report.reportUrl, "_blank")}
                className="flex-1"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleShare}
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowEmailForm(!showEmailForm)}
              >
                <Mail className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Share URL copied */}
            {shareUrl && (
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Link copied to clipboard (valid for 7 days)
              </p>
            )}

            {/* Email form */}
            {showEmailForm && (
              <div className="flex items-center gap-2">
                <input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="client@example.com"
                  className="flex-1 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-orange-500/50 focus:outline-none"
                />
                <Button
                  size="sm"
                  onClick={handleEmailSend}
                  disabled={emailSending || !emailInput}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {emailSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                </Button>
              </div>
            )}

            {/* Regenerate */}
            <button
              onClick={generateReport}
              disabled={generating}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {generating ? "Regenerating..." : "Regenerate report"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
