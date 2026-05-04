import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBusinessIntelligence } from "@/lib/enterprise-memory";
import { generateReportHtml } from "@/lib/intelligence-pdf-report";

export const dynamic = "force-dynamic";

// GET /api/intelligence/report?format=pdf&from=X&to=Y
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = Math.min(Number(searchParams.get("days")) || 30, 90);
    const from = new Date(Date.now() - days * 86400000);
    const to = new Date();

    const data = await getBusinessIntelligence(userId, { from, to });

    const html = generateReportHtml({
      generatedAt: new Date().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      totalTopics: data.totalTopics,
      totalMentions: data.totalMentions,
      totalLeads: data.totalLeads,
      totalAppointments: data.totalAppointments,
      topTopics: data.topTopics,
      competitors: data.competitors,
      predictions: data.predictions,
      recommendations: data.recommendations,
    });

    const format = searchParams.get("format");

    if (format === "pdf") {
      // HTML mit Print-Anweisung zurückgeben — Client nutzt window.print()
      const printHtml = html.replace(
        "</body>",
        '<script>window.onload=function(){window.print();}</script></body>'
      );
      return new Response(printHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="kiln-intelligence-report.html"`,
        },
      });
    }

    // Standard: HTML-Report
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
