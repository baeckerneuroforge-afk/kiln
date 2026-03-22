import { prisma } from "@/lib/prisma";
import { analyzeKnowledgeGaps, KnowledgeGap } from "@/lib/eval-auto-fix";
import { getWeeklyResearchStats } from "@/lib/agentic-rag";

export interface WeeklyReportData {
  userName: string;
  totalConversations: number;
  newLeads: number;
  topAgentName: string | null;
  agents: {
    id: string;
    name: string;
    slug: string;
    conversations: number;
    gaps: KnowledgeGap[];
  }[];
  selfLearning: {
    totalResearched: number;
    autoApproved: number;
    pendingReview: number;
    topTopics: string[];
  } | null;
}

/**
 * Generiert den wöchentlichen KB-Report für einen User.
 * Analysiert alle Agents auf Wissenslücken und sammelt Statistiken.
 */
export async function generateWeeklyReport(userId: string): Promise<WeeklyReportData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, email: true },
  });
  if (!user) return null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Alle aktiven Agents des Users
  const agents = await prisma.agent.findMany({
    where: { userId, status: "LIVE" },
    select: { id: true, name: true, slug: true },
  });

  if (agents.length === 0) return null;

  const agentIds = agents.map((a) => a.id);

  // Globale Stats der letzten 7 Tage
  const [totalConversations, newLeads] = await Promise.all([
    prisma.conversation.count({
      where: { agentId: { in: agentIds }, createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.lead.count({
      where: { agentId: { in: agentIds }, createdAt: { gte: sevenDaysAgo } },
    }),
  ]);

  // Keine Aktivität → kein Report
  if (totalConversations === 0) return null;

  // Pro Agent: Conversations + Knowledge Gaps
  const agentData: WeeklyReportData["agents"] = [];
  let topAgent: { name: string; count: number } | null = null;

  for (const agent of agents) {
    const convCount = await prisma.conversation.count({
      where: { agentId: agent.id, createdAt: { gte: sevenDaysAgo } },
    });

    // Knowledge Gaps analysieren (nutzt die letzten 30 Tage intern)
    const gaps = await analyzeKnowledgeGaps(agent.id);

    agentData.push({
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      conversations: convCount,
      gaps: gaps.slice(0, 5), // Top 5 pro Agent
    });

    if (!topAgent || convCount > topAgent.count) {
      topAgent = { name: agent.name, count: convCount };
    }
  }

  // Self-Learning Stats
  const selfLearning = await getWeeklyResearchStats(userId);

  return {
    userName: user.firstName || "there",
    totalConversations,
    newLeads,
    topAgentName: topAgent?.name || null,
    agents: agentData,
    selfLearning,
  };
}

/**
 * Generiert die HTML-Email für den wöchentlichen KB-Report.
 * Dark-Mode Design passend zum KILN Branding.
 */
export function buildWeeklyReportHtml(data: WeeklyReportData, appUrl: string): string {
  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Top 5 unbeantwortete Fragen über alle Agents
  const allGaps: { question: string; agentName: string; agentSlug: string; count: number }[] = [];
  for (const agent of data.agents) {
    for (const gap of agent.gaps) {
      allGaps.push({
        question: gap.topic,
        agentName: agent.name,
        agentSlug: agent.slug,
        count: gap.count,
      });
    }
  }
  allGaps.sort((a, b) => b.count - a.count);
  const topGaps = allGaps.slice(0, 5);

  const gapsHtml = topGaps.length > 0
    ? topGaps
        .map(
          (gap, i) => `
      <div style="background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="background:#F97316;color:#fff;width:22px;height:22px;border-radius:6px;text-align:center;line-height:22px;font-size:11px;font-weight:700;flex-shrink:0">${i + 1}</div>
          <div style="flex:1">
            <p style="color:#E5E5E5;font-size:13px;margin:0 0 4px;line-height:1.4">&ldquo;${escapeHtml(gap.question.slice(0, 100))}${gap.question.length > 100 ? "&hellip;" : ""}&rdquo;</p>
            <p style="color:#737373;font-size:11px;margin:0">${escapeHtml(gap.agentName)} &middot; ${gap.count}x unanswered</p>
          </div>
          <a href="${appUrl}/dashboard/agents/${gap.agentSlug}/knowledge?add=true" style="display:inline-block;background:#292524;color:#F97316;border:1px solid rgba(249,115,22,0.3);padding:4px 10px;border-radius:6px;font-size:11px;text-decoration:none;white-space:nowrap;font-weight:500">+ Add to KB</a>
        </div>
      </div>`
        )
        .join("")
    : `<div style="background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:20px;text-align:center">
        <p style="color:#22C55E;font-size:14px;margin:0;font-weight:500">&#10003; No knowledge gaps detected</p>
        <p style="color:#737373;font-size:12px;margin:4px 0 0">Your agents answered all questions confidently this week.</p>
      </div>`;

  // Per-Agent Breakdown
  const agentBreakdownHtml = data.agents
    .filter((a) => a.conversations > 0)
    .sort((a, b) => b.conversations - a.conversations)
    .slice(0, 5)
    .map(
      (agent) => `
      <tr>
        <td style="padding:8px 12px;color:#E5E5E5;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <a href="${appUrl}/dashboard/agents/${agent.slug}" style="color:#E5E5E5;text-decoration:none">${escapeHtml(agent.name)}</a>
        </td>
        <td style="padding:8px 12px;color:#F97316;font-size:13px;text-align:right;border-bottom:1px solid rgba(255,255,255,0.04)">${agent.conversations}</td>
        <td style="padding:8px 12px;color:${agent.gaps.length > 0 ? "#FBBF24" : "#22C55E"};font-size:13px;text-align:right;border-bottom:1px solid rgba(255,255,255,0.04)">${agent.gaps.length}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0C0A09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#F97316,#DC2626);line-height:36px;text-align:center;font-family:serif;font-size:18px;font-weight:700;color:#fff">K</div>
      <span style="margin-left:8px;font-family:serif;font-size:20px;color:#F5F5F5;vertical-align:middle">KILN</span>
    </div>

    <!-- Title -->
    <h1 style="font-family:serif;font-size:26px;color:#F5F5F5;text-align:center;margin:0 0 8px">Weekly KB Report</h1>
    <p style="color:#A3A3A3;text-align:center;font-size:14px;margin:0 0 32px">Hey ${escapeHtml(data.userName)}, here&rsquo;s how your agents performed &mdash; and where they need help.</p>

    <!-- Stats -->
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#F97316">${data.totalConversations}</div>
        <div style="font-size:11px;color:#A3A3A3;margin-top:4px">Conversations</div>
      </div>
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#22C55E">${data.newLeads}</div>
        <div style="font-size:11px;color:#A3A3A3;margin-top:4px">Leads</div>
      </div>
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#FBBF24">${topGaps.length}</div>
        <div style="font-size:11px;color:#A3A3A3;margin-top:4px">KB Gaps</div>
      </div>
    </div>

    <!-- Top Unanswered Questions -->
    <h2 style="font-size:16px;color:#F5F5F5;margin:32px 0 12px;font-weight:600">Top Unanswered Questions</h2>
    <p style="color:#A3A3A3;font-size:12px;margin:0 0 16px">Questions your agents couldn&rsquo;t answer confidently. Add them to your Knowledge Base to improve responses.</p>
    ${gapsHtml}

    <!-- Agent Breakdown -->
    ${agentBreakdownHtml ? `
    <h2 style="font-size:16px;color:#F5F5F5;margin:32px 0 12px;font-weight:600">Agent Breakdown</h2>
    <table style="width:100%;border-collapse:collapse;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:10px;overflow:hidden">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
          <th style="padding:10px 12px;color:#737373;font-size:11px;font-weight:500;text-align:left;text-transform:uppercase;letter-spacing:0.05em">Agent</th>
          <th style="padding:10px 12px;color:#737373;font-size:11px;font-weight:500;text-align:right;text-transform:uppercase;letter-spacing:0.05em">Chats</th>
          <th style="padding:10px 12px;color:#737373;font-size:11px;font-weight:500;text-align:right;text-transform:uppercase;letter-spacing:0.05em">Gaps</th>
        </tr>
      </thead>
      <tbody>${agentBreakdownHtml}</tbody>
    </table>` : ""}

    <!-- Self-Learning Update -->
    ${data.selfLearning ? `
    <h2 style="font-size:16px;color:#F5F5F5;margin:32px 0 12px;font-weight:600">Self-Learning Update</h2>
    <div style="background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px;margin-bottom:16px">
      <p style="color:#E5E5E5;font-size:13px;margin:0 0 12px">
        Your agents researched <strong style="color:#A855F7">${data.selfLearning.totalResearched}</strong> new answer${data.selfLearning.totalResearched !== 1 ? "s" : ""} this week.
      </p>
      <div style="display:flex;gap:16px;margin-bottom:12px">
        <div>
          <span style="color:#22C55E;font-size:18px;font-weight:700">${data.selfLearning.autoApproved}</span>
          <span style="color:#737373;font-size:11px;margin-left:4px">auto-approved</span>
        </div>
        <div>
          <span style="color:#FBBF24;font-size:18px;font-weight:700">${data.selfLearning.pendingReview}</span>
          <span style="color:#737373;font-size:11px;margin-left:4px">waiting for review</span>
        </div>
      </div>
      ${data.selfLearning.topTopics.length > 0 ? `
      <p style="color:#737373;font-size:11px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em">Top researched topics</p>
      ${data.selfLearning.topTopics.map((t) => `<p style="color:#A3A3A3;font-size:12px;margin:0 0 3px">&bull; ${escapeHtml(t)}</p>`).join("")}
      ` : ""}
      ${data.selfLearning.pendingReview > 0 ? `
      <div style="margin-top:12px">
        <a href="${appUrl}/dashboard" style="display:inline-block;background:#292524;color:#A855F7;border:1px solid rgba(168,85,247,0.3);padding:6px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500">Review pending answers &rarr;</a>
      </div>
      ` : ""}
    </div>
    ` : ""}

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0">
      <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#F97316,#DC2626);color:#fff;text-decoration:none;border-radius:12px;font-size:14px;font-weight:600">
        Open Dashboard
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px">
      <p style="color:#525252;font-size:11px;margin:0">
        KILN by Hephaistos Systems &middot;
        <a href="${appUrl}/dashboard/settings" style="color:#525252">Settings</a> &middot;
        <a href="${appUrl}/api/unsubscribe/weekly-report?userId=USER_ID_PLACEHOLDER&token=UNSUBSCRIBE_TOKEN_PLACEHOLDER" style="color:#525252">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
