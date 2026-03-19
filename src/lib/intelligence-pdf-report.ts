/**
 * Intelligence PDF Report Generator
 * Generiert HTML-basierte PDF-Reports für Business Intelligence.
 * Nutzt einfaches HTML → der Browser/Client kann window.print() nutzen,
 * oder serverseitig via Puppeteer (falls installiert).
 */

interface ReportTopic {
  topic: string;
  count: number;
  trend: string;
  sentiment: string;
  leadCount: number;
  appointmentCount: number;
  conversionRate: number;
  agentCount: number;
}

interface CompetitorData {
  name: string;
  mentions: number;
  sentiment: string;
  context: string;
}

interface PredictionData {
  topic: string;
  currentWeek: number;
  predictedNextWeek: number;
  confidence: number;
  reasoning: string;
}

interface ReportData {
  generatedAt: string;
  dateRange: { from: string; to: string };
  totalTopics: number;
  totalMentions: number;
  totalLeads: number;
  totalAppointments: number;
  topTopics: ReportTopic[];
  competitors: CompetitorData[];
  predictions: PredictionData[];
  recommendations: string[];
}

/**
 * Generiert einen vollständigen HTML-Report für Intelligence-Daten.
 */
export function generateReportHtml(data: ReportData): string {
  const fromDate = new Date(data.dateRange.from).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const toDate = new Date(data.dateRange.to).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const monthYear = new Date(data.dateRange.to).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  // Top 3 Trends für Executive Summary
  const topTrends = data.topTopics.slice(0, 3);
  const topPerformer = data.topTopics.reduce(
    (best, t) => (t.conversionRate > (best?.conversionRate || 0) ? t : best),
    data.topTopics[0]
  );

  // Topic-Tabelle
  const topicRows = data.topTopics
    .map(
      (t, i) => `
      <tr style="${i % 2 === 0 ? "background:#fafafa;" : ""}">
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-weight:500;">${t.topic}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${t.count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${trendArrow(t.trend)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${sentimentBadge(t.sentiment)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;font-weight:600;${t.leadCount > 0 ? "color:#16a34a;" : ""}">${t.leadCount}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${t.appointmentCount}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;font-weight:600;">${(t.conversionRate * 100).toFixed(1)}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${t.agentCount}</td>
      </tr>`
    )
    .join("");

  // Competitor-Tabelle
  const competitorRows =
    data.competitors.length > 0
      ? data.competitors
          .map(
            (c) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-weight:500;">${c.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${c.mentions}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${sentimentBadge(c.sentiment)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${c.context}</td>
        </tr>`
          )
          .join("")
      : '<tr><td colspan="4" style="padding:16px;text-align:center;color:#999;">Keine Wettbewerber-Erwähnungen in diesem Zeitraum.</td></tr>';

  // Predictions
  const predictionRows =
    data.predictions.length > 0
      ? data.predictions
          .map(
            (p) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-weight:500;">${p.topic}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${p.currentWeek}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;font-weight:600;color:#F97316;">~${p.predictedNextWeek}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center;">${confidenceBadge(p.confidence)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-size:12px;color:#666;">${p.reasoning}</td>
        </tr>`
          )
          .join("")
      : '<tr><td colspan="5" style="padding:16px;text-align:center;color:#999;">Nicht genügend Daten für Prognosen.</td></tr>';

  // Recommendations
  const recommendationList = data.recommendations
    .map((r) => `<li style="margin-bottom:8px;color:#333;">${r}</li>`)
    .join("");

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>KILN Business Intelligence Report — ${monthYear}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
    }
    body { font-family: 'DM Sans', -apple-system, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #18181b; color: #fff; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body style="padding: 40px; max-width: 900px; margin: 0 auto;">

  <!-- Header -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
    <div style="width:36px;height:36px;background:linear-gradient(135deg,#F97316,#DC2626);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-family:serif;font-size:18px;font-weight:700;text-align:center;line-height:36px;">K</div>
    <div>
      <h1 style="margin:0;font-size:22px;font-weight:700;">KILN Business Intelligence Report</h1>
      <p style="margin:2px 0 0;font-size:13px;color:#666;">${fromDate} — ${toDate}</p>
    </div>
  </div>
  <hr style="border:none;border-top:2px solid #F97316;margin:16px 0 32px;">

  <!-- Executive Summary -->
  <h2 style="font-size:16px;font-weight:700;margin:0 0 12px;color:#18181b;">Executive Summary</h2>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
    ${kpiBox("Topics", String(data.totalTopics), "#3B82F6")}
    ${kpiBox("Mentions", String(data.totalMentions), "#8B5CF6")}
    ${kpiBox("Leads", String(data.totalLeads), "#22C55E")}
    ${kpiBox("Termine", String(data.totalAppointments), "#F97316")}
  </div>
  <div style="background:#f8fafc;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:32px;">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;">Top 3 Trends:</p>
    <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;">
      ${topTrends.map((t) => `<li><strong>${t.topic}</strong> — ${t.count} Mentions (${t.trend})</li>`).join("")}
    </ul>
    ${topPerformer ? `<p style="margin:12px 0 0;font-size:13px;color:#16a34a;">🏆 Top Performer: <strong>${topPerformer.topic}</strong> mit ${(topPerformer.conversionRate * 100).toFixed(1)}% Conversion Rate</p>` : ""}
  </div>

  <!-- Topic Analysis -->
  <h2 style="font-size:16px;font-weight:700;margin:0 0 12px;color:#18181b;">Topic-Analyse</h2>
  <table style="margin-bottom:32px;">
    <thead>
      <tr>
        <th>Topic</th><th style="text-align:center;">Mentions</th><th style="text-align:center;">Trend</th>
        <th style="text-align:center;">Sentiment</th><th style="text-align:center;">Leads</th>
        <th style="text-align:center;">Termine</th><th style="text-align:center;">Conv. Rate</th>
        <th style="text-align:center;">Agents</th>
      </tr>
    </thead>
    <tbody>${topicRows}</tbody>
  </table>

  <!-- Competitor Analysis -->
  <div class="page-break"></div>
  <h2 style="font-size:16px;font-weight:700;margin:0 0 12px;color:#18181b;">Wettbewerber-Analyse</h2>
  <table style="margin-bottom:32px;">
    <thead>
      <tr>
        <th>Wettbewerber</th><th style="text-align:center;">Erwähnungen</th>
        <th style="text-align:center;">Sentiment</th><th>Kontext</th>
      </tr>
    </thead>
    <tbody>${competitorRows}</tbody>
  </table>

  <!-- Predictions -->
  <h2 style="font-size:16px;font-weight:700;margin:0 0 12px;color:#18181b;">Prognose — Nächste Woche</h2>
  <table style="margin-bottom:32px;">
    <thead>
      <tr>
        <th>Topic</th><th style="text-align:center;">Aktuell</th>
        <th style="text-align:center;">Prognose</th><th style="text-align:center;">Konfidenz</th>
        <th>Begründung</th>
      </tr>
    </thead>
    <tbody>${predictionRows}</tbody>
  </table>

  <!-- Recommendations -->
  <h2 style="font-size:16px;font-weight:700;margin:0 0 12px;color:#18181b;">Empfehlungen</h2>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:32px;">
    ${data.recommendations.length > 0 ? `<ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;">${recommendationList}</ol>` : '<p style="margin:0;font-size:13px;color:#666;">Noch keine Empfehlungen — mehr Daten werden benötigt.</p>'}
  </div>

  <!-- Footer -->
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px;">
  <p style="font-size:11px;color:#999;text-align:center;">
    Generiert am ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
    — KILN AI Platform by Hephaistos Systems
  </p>
</body>
</html>`;
}

function kpiBox(label: string, value: string, color: string): string {
  return `
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:${color};">${value}</div>
      <div style="font-size:11px;color:#666;margin-top:2px;">${label}</div>
    </div>`;
}

function trendArrow(trend: string): string {
  if (trend === "increasing") return '<span style="color:#16a34a;font-weight:600;">↑</span>';
  if (trend === "decreasing") return '<span style="color:#ef4444;font-weight:600;">↓</span>';
  return '<span style="color:#999;">→</span>';
}

function sentimentBadge(sentiment: string): string {
  const colors: Record<string, string> = {
    positive: "#16a34a",
    negative: "#ef4444",
    neutral: "#71717a",
    high_interest: "#f59e0b",
  };
  const color = colors[sentiment] || "#71717a";
  return `<span style="color:${color};font-size:12px;font-weight:500;">${sentiment}</span>`;
}

function confidenceBadge(confidence: number): string {
  const color = confidence >= 0.7 ? "#16a34a" : confidence >= 0.4 ? "#f59e0b" : "#ef4444";
  return `<span style="color:${color};font-weight:600;">${Math.round(confidence * 100)}%</span>`;
}
