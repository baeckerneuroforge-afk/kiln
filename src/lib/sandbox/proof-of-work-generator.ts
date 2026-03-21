/**
 * Proof of Work Generator
 * Generiert professionelle PDF-Reports nach Computer Use Ausführungen.
 * Screenshots, Reasoning, Timestamps, Findings — alles in einem Dokument.
 */

import { prisma } from "@/lib/prisma";
import { saveArtifact } from "@/lib/sandbox/artifact-manager";
import {
  createSandbox,
  executeCode,
  installPackage,
  downloadFile,
  writeFile,
  destroySandbox,
} from "@/lib/sandbox/code-sandbox";
import type { ReasoningEntry } from "@/lib/sandbox/reasoning-logger";

/* ── Types ── */

export interface ReportSection {
  type: "cover" | "summary" | "step" | "findings" | "statistics";
  content: Record<string, unknown>;
}

export interface ProofOfWorkReport {
  reportId: string;
  reportUrl: string;
  agentName: string;
  task: string;
  generatedAt: string;
  totalSteps: number;
  status: "success" | "partial" | "failed";
}

interface ExecutionData {
  agentId: string;
  agentName: string;
  task: string;
  steps: Array<{
    stepIndex: number;
    action: string;
    actionDetail: string;
    url: string;
    screenshot: string | null;
    timestamp: string;
    durationMs: number;
    verified?: boolean;
    extractedData?: Record<string, unknown> | null;
  }>;
  reasoningLog: ReasoningEntry[];
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  completionReason: string;
  extractedData: Record<string, unknown> | null;
  creditsUsed?: number;
  modelsUsed?: string[];
  whiteLabel?: {
    logo?: string;
    primaryColor?: string;
  } | null;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/* ── Main Class ── */

export class ProofOfWorkGenerator {
  /**
   * Generiert einen vollständigen PDF-Report für eine Ausführung
   */
  async generateReport(executionId: string): Promise<ProofOfWorkReport> {
    // 1. Execution-Daten laden
    const executionData = await this.loadExecutionData(executionId);
    if (!executionData) {
      throw new Error(`Execution ${executionId} nicht gefunden`);
    }

    // 2. Executive Summary generieren (via Haiku)
    const summary = await this.generateSummary(executionData);

    // 3. PDF via Code Sandbox generieren
    const pdfBuffer = await this.generatePdf(executionData, summary);

    // 4. PDF als Artifact speichern
    const fileName = `proof-of-work-${executionId}-${Date.now()}.pdf`;
    const artifact = await saveArtifact(
      executionId,
      fileName,
      pdfBuffer,
      "application/pdf",
    );

    return {
      reportId: artifact.id,
      reportUrl: artifact.storageUrl,
      agentName: executionData.agentName,
      task: executionData.task,
      generatedAt: new Date().toISOString(),
      totalSteps: executionData.steps.length,
      status: executionData.completionReason === "done" ? "success"
        : executionData.completionReason === "error" ? "failed"
        : "partial",
    };
  }

  /**
   * Generiert eine Executive Summary via Claude Haiku
   */
  async generateSummary(data: ExecutionData): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return "Executive summary generation unavailable — no API key configured.";

    const findings = data.extractedData
      ? `Key findings: ${JSON.stringify(data.extractedData).slice(0, 500)}`
      : "No structured data extracted.";

    const stepsOverview = data.steps
      .slice(0, 15)
      .map((s) => `${s.action}: ${s.actionDetail.slice(0, 80)}`)
      .join("\n");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 512,
          system: "You write concise, professional executive summaries for AI execution reports. Write 3-5 sentences. Be factual and specific. Write in English.",
          messages: [{
            role: "user",
            content: `Task: ${data.task}\nStatus: ${data.completionReason}\nDuration: ${Math.round(data.totalDurationMs / 1000)}s\nSteps: ${data.steps.length}\n${findings}\n\nSteps overview:\n${stepsOverview}\n\nWrite a professional executive summary.`,
          }],
        }),
      });

      if (!response.ok) return "Report generated automatically by KILN AI.";

      const result = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };
      return result.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    } catch {
      return "Report generated automatically by KILN AI.";
    }
  }

  /**
   * Generiert PDF via Python in Code Sandbox
   */
  private async generatePdf(data: ExecutionData, summary: string): Promise<Buffer> {
    const sandbox = await createSandbox("python", 120000);
    if (sandbox.status === "failed" || !sandbox.sandbox) {
      throw new Error("Code Sandbox nicht verfügbar für PDF-Generierung");
    }

    try {
      // fpdf2 installieren
      await installPackage(sandbox.id, "pip", "fpdf2");

      // Screenshots als base64-Dateien schreiben
      const screenshotPaths: Record<number, string> = {};
      for (const step of data.steps) {
        if (step.screenshot) {
          const path = `/tmp/screenshot_${step.stepIndex}.png`;
          // Schreibe base64-dekodierten Screenshot
          await writeFile(sandbox.id, `/tmp/write_ss_${step.stepIndex}.py`, `
import base64
data = base64.b64decode("""${step.screenshot.slice(0, 50000)}""")
with open("${path}", "wb") as f:
    f.write(data)
`);
          await executeCode(sandbox.id, "python", `exec(open("/tmp/write_ss_${step.stepIndex}.py").read())`);
          screenshotPaths[step.stepIndex] = path;
        }
      }

      // Report-Daten als JSON schreiben
      const reportData = {
        agentName: data.agentName,
        task: data.task,
        summary,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        totalDurationMs: data.totalDurationMs,
        completionReason: data.completionReason,
        totalSteps: data.steps.length,
        creditsUsed: data.creditsUsed || 0,
        modelsUsed: data.modelsUsed || [],
        primaryColor: data.whiteLabel?.primaryColor || "#F97316",
        showKilnBranding: !data.whiteLabel?.logo,
        steps: data.steps.map((s) => ({
          stepIndex: s.stepIndex,
          action: s.action,
          actionDetail: s.actionDetail,
          url: s.url,
          timestamp: s.timestamp,
          durationMs: s.durationMs,
          verified: s.verified,
          hasScreenshot: !!screenshotPaths[s.stepIndex],
          screenshotPath: screenshotPaths[s.stepIndex] || null,
        })),
        reasoningLog: data.reasoningLog.map((r) => ({
          step: r.step,
          reasoning: r.reasoning.slice(0, 200),
          confidence: r.confidence,
          action: r.action,
          verificationResult: r.verificationResult,
        })),
        findings: data.extractedData,
        verificationPassRate: this.calcVerificationRate(data.reasoningLog),
      };

      await writeFile(sandbox.id, "/tmp/report_data.json", JSON.stringify(reportData));

      // Python-Script zur PDF-Generierung
      const pdfScript = this.buildPdfScript();
      await writeFile(sandbox.id, "/tmp/generate_pdf.py", pdfScript);

      const result = await executeCode(sandbox.id, "python", 'exec(open("/tmp/generate_pdf.py").read())');
      if (!result.success) {
        throw new Error(`PDF-Generierung fehlgeschlagen: ${result.error || result.stderr}`);
      }

      // PDF herunterladen
      const pdfBuffer = await downloadFile(sandbox.id, "/tmp/report.pdf");
      if (!pdfBuffer) {
        throw new Error("PDF-Datei konnte nicht gelesen werden");
      }

      return pdfBuffer;
    } finally {
      await destroySandbox(sandbox.id);
    }
  }

  /**
   * Python-Script das die PDF generiert (fpdf2)
   */
  private buildPdfScript(): string {
    return `
import json
from fpdf import FPDF
from datetime import datetime

with open("/tmp/report_data.json", "r") as f:
    data = json.load(f)

class ReportPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"KILN Proof of Work — {data['agentName']}", align="L")
            self.cell(0, 10, f"Page {self.page_no()}", align="R")
            self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        if data.get("showKilnBranding", True):
            self.cell(0, 10, "Powered by KILN — AI Creation Platform", align="C")

pdf = ReportPDF()
pdf.set_auto_page_break(auto=True, margin=20)

# Cover Page
pdf.add_page()
pdf.set_fill_color(12, 10, 9)
pdf.rect(0, 0, 210, 297, "F")

pdf.set_y(60)
pdf.set_font("Helvetica", "B", 28)
pdf.set_text_color(249, 115, 22)
pdf.cell(0, 15, "Proof of Work", align="C")
pdf.ln(20)

pdf.set_font("Helvetica", "", 16)
pdf.set_text_color(255, 255, 255)
pdf.cell(0, 10, f"Agent: {data['agentName']}", align="C")
pdf.ln(12)

pdf.set_font("Helvetica", "", 12)
pdf.set_text_color(200, 200, 200)
pdf.multi_cell(0, 8, data["task"][:200], align="C")
pdf.ln(10)

# Status badge
status = data["completionReason"]
status_label = "COMPLETED" if status == "done" else "PARTIAL" if status == "max_steps" else "FAILED"
status_color = (34, 197, 94) if status == "done" else (249, 115, 22) if status == "max_steps" else (239, 68, 68)
pdf.set_text_color(*status_color)
pdf.set_font("Helvetica", "B", 14)
pdf.cell(0, 10, status_label, align="C")
pdf.ln(15)

pdf.set_text_color(160, 160, 160)
pdf.set_font("Helvetica", "", 11)
started = data.get("startedAt", "")[:19].replace("T", " ")
pdf.cell(0, 8, f"Started: {started}", align="C")
pdf.ln(8)
duration_s = round(data["totalDurationMs"] / 1000, 1)
pdf.cell(0, 8, f"Duration: {duration_s}s — {data['totalSteps']} steps", align="C")

# Executive Summary
pdf.add_page()
pdf.set_fill_color(255, 255, 255)
pdf.set_text_color(30, 30, 30)
pdf.set_font("Helvetica", "B", 18)
pdf.cell(0, 12, "Executive Summary")
pdf.ln(14)
pdf.set_font("Helvetica", "", 11)
pdf.set_text_color(60, 60, 60)
pdf.multi_cell(0, 7, data["summary"])
pdf.ln(10)

# Step-by-step Log
pdf.set_font("Helvetica", "B", 18)
pdf.set_text_color(30, 30, 30)
pdf.cell(0, 12, "Step-by-Step Execution Log")
pdf.ln(14)

for step in data["steps"]:
    if pdf.get_y() > 240:
        pdf.add_page()

    # Step header
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(249, 115, 22)
    verified = " [Verified]" if step.get("verified") else ""
    pdf.cell(0, 7, f"Step {step['stepIndex'] + 1}: {step['action']}{verified}")
    pdf.ln(7)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(120, 120, 120)
    ts = step.get("timestamp", "")[:19].replace("T", " ")
    pdf.cell(0, 5, f"{ts} — {step['durationMs']}ms — {step['url'][:60]}")
    pdf.ln(6)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    detail = step["actionDetail"][:300]
    pdf.multi_cell(0, 6, detail)

    # Screenshot thumbnail
    if step.get("hasScreenshot") and step.get("screenshotPath"):
        try:
            pdf.image(step["screenshotPath"], x=15, w=120)
        except Exception:
            pdf.set_font("Helvetica", "I", 9)
            pdf.cell(0, 5, "[Screenshot could not be embedded]")
    pdf.ln(8)

    # Reasoning for this step
    matching_reasoning = [r for r in data.get("reasoningLog", []) if r["step"] == step["stepIndex"]]
    if matching_reasoning:
        r = matching_reasoning[0]
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.multi_cell(0, 5, f"Reasoning (confidence: {round(r['confidence'] * 100)}%): {r['reasoning'][:200]}")
        pdf.ln(4)

# Findings
if data.get("findings"):
    if pdf.get_y() > 220:
        pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 12, "Findings & Results")
    pdf.ln(14)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    findings_text = json.dumps(data["findings"], indent=2, ensure_ascii=False)[:2000]
    pdf.multi_cell(0, 6, findings_text)
    pdf.ln(10)

# Statistics
pdf.add_page()
pdf.set_font("Helvetica", "B", 18)
pdf.set_text_color(30, 30, 30)
pdf.cell(0, 12, "Execution Statistics")
pdf.ln(14)

stats = [
    ("Total Steps", str(data["totalSteps"])),
    ("Duration", f"{round(data['totalDurationMs'] / 1000, 1)}s"),
    ("Credits Used", str(data.get("creditsUsed", "N/A"))),
    ("Models Used", ", ".join(data.get("modelsUsed", ["N/A"]))),
    ("Verification Pass Rate", f"{data.get('verificationPassRate', 'N/A')}%"),
    ("Status", status_label),
]

pdf.set_font("Helvetica", "", 11)
for label, value in stats:
    pdf.set_text_color(120, 120, 120)
    pdf.cell(80, 8, label)
    pdf.set_text_color(30, 30, 30)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, value)
    pdf.set_font("Helvetica", "", 11)
    pdf.ln(10)

pdf.output("/tmp/report.pdf")
print("PDF generated successfully")
`;
  }

  /**
   * Lädt Execution-Daten aus der DB
   */
  private async loadExecutionData(executionId: string): Promise<ExecutionData | null> {
    try {
      // Versuche TeamExecution (Workflow-Run)
      const execution = await prisma.teamExecution.findUnique({
        where: { id: executionId },
        include: {
          team: { include: { members: { include: { agent: true } } } },
        },
      });

      if (!execution) return null;

      const context = execution.executionContext as Record<string, unknown> | null;
      const sessionData = context?.computerUseSession as Record<string, unknown> | undefined;

      const steps = (sessionData?.steps as ExecutionData["steps"]) || [];
      const reasoningLog = (context?.reasoningLog as ReasoningEntry[]) || [];

      const agent = execution.team.members[0]?.agent;

      return {
        agentId: agent?.id || "",
        agentName: agent?.name || execution.team.name,
        task: execution.goal || "",
        steps,
        reasoningLog,
        startedAt: execution.startedAt.toISOString(),
        completedAt: execution.completedAt?.toISOString() || new Date().toISOString(),
        totalDurationMs: (sessionData?.totalDurationMs as number) || 0,
        completionReason: (sessionData?.completionReason as string) || execution.status,
        extractedData: (sessionData?.extractedData as Record<string, unknown>) || null,
        creditsUsed: (context?.creditsUsed as number) || undefined,
        modelsUsed: (context?.modelsUsed as string[]) || undefined,
        whiteLabel: agent?.whiteLabel as ExecutionData["whiteLabel"],
      };
    } catch {
      return null;
    }
  }

  /**
   * Berechnet die Verification Pass Rate
   */
  private calcVerificationRate(log: ReasoningEntry[]): number {
    const verified = log.filter((e) => e.verificationResult);
    if (verified.length === 0) return 100;
    const passed = verified.filter((e) => e.verificationResult?.success);
    return Math.round((passed.length / verified.length) * 100);
  }
}
