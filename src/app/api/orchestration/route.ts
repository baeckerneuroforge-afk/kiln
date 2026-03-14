import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: Load all orchestration connections for the user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connections = await prisma.agentOrchestration.findMany({
      where: { sourceAgent: { userId } },
      include: {
        sourceAgent: { select: { id: true, name: true, status: true, slug: true } },
        targetAgent: { select: { id: true, name: true, status: true, slug: true } },
        _count: { select: { handoffs: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Also load all agents for the canvas
    const agents = await prisma.agent.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        description: true,
        agentMode: true,
        triggerType: true,
        _count: { select: { conversations: true, runs: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Add handoff counts to connections
    const connectionsWithCounts = connections.map((c) => ({
      ...c,
      handoffCount: c._count.handoffs,
    }));

    return Response.json({ connections: connectionsWithCounts, agents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Create a new connection or bulk-create from template
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Template mode: create agents + connections
    if (body.template) {
      return handleTemplate(userId, body.template);
    }

    const { sourceAgentId, targetAgentId, condition } = body;
    if (!sourceAgentId || !targetAgentId) {
      return Response.json({ error: "Source and target agent required" }, { status: 400 });
    }

    // Verify both agents belong to user
    const [source, target] = await Promise.all([
      prisma.agent.findFirst({ where: { id: sourceAgentId, userId } }),
      prisma.agent.findFirst({ where: { id: targetAgentId, userId } }),
    ]);
    if (!source || !target) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const connection = await prisma.agentOrchestration.create({
      data: {
        sourceAgentId,
        targetAgentId,
        condition: condition || "",
        enabled: true,
      },
      include: {
        sourceAgent: { select: { id: true, name: true, status: true, slug: true } },
        targetAgent: { select: { id: true, name: true, status: true, slug: true } },
      },
    });

    return Response.json(connection);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH: Update a connection (condition, enabled)
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id, condition, enabled } = await request.json();
    if (!id) return Response.json({ error: "Connection ID required" }, { status: 400 });

    // Verify ownership
    const existing = await prisma.agentOrchestration.findFirst({
      where: { id, sourceAgent: { userId } },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.agentOrchestration.update({
      where: { id },
      data: {
        ...(condition !== undefined && { condition }),
        ...(enabled !== undefined && { enabled }),
      },
      include: {
        sourceAgent: { select: { id: true, name: true, status: true, slug: true } },
        targetAgent: { select: { id: true, name: true, status: true, slug: true } },
      },
    });

    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove a connection
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await request.json();
    if (!id) return Response.json({ error: "Connection ID required" }, { status: 400 });

    const existing = await prisma.agentOrchestration.findFirst({
      where: { id, sourceAgent: { userId } },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.agentOrchestration.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Template handler — creates agents + connections
async function handleTemplate(userId: string, template: string) {
  const templates: Record<string, { agents: { name: string; systemPrompt: string; description: string }[]; connections: { from: number; to: number; condition: string }[] }> = {
    "sales-funnel": {
      agents: [
        { name: "Lead Qualifier", systemPrompt: "You are a lead qualification agent. Ask about budget, timeline, needs, and decision-making authority. Score leads based on BANT criteria. When lead score is 7+, hand off to sales.", description: "Qualifies incoming leads with BANT criteria" },
        { name: "Sales Closer", systemPrompt: "You are a sales agent. You receive qualified leads. Present solutions, handle objections, create urgency, and guide toward purchase decisions. When deal is closed, hand off to onboarding.", description: "Closes qualified leads into customers" },
        { name: "Onboarding Guide", systemPrompt: "You are an onboarding agent. Welcome new customers, walk them through setup, answer getting-started questions, and ensure successful activation.", description: "Guides new customers through setup" },
      ],
      connections: [
        { from: 0, to: 1, condition: "When lead score is 7 or higher, hand off to Sales" },
        { from: 1, to: 2, condition: "When deal is closed or customer signs up" },
      ],
    },
    "support-escalation": {
      agents: [
        { name: "L1 Support", systemPrompt: "You are a first-line support agent. Handle common questions, FAQs, and basic troubleshooting. Escalate complex technical issues to L2.", description: "Handles common questions and basic issues" },
        { name: "L2 Technical", systemPrompt: "You are a technical support specialist. Handle complex issues, debug problems, check system status, and provide advanced solutions. Escalate unresolvable issues to human.", description: "Advanced technical troubleshooting" },
        { name: "Human Handoff", systemPrompt: "You are a handoff agent. Collect all relevant context, summarize the issue, and let the user know a human agent will take over shortly. Provide an estimated wait time.", description: "Collects context before human agent takeover" },
      ],
      connections: [
        { from: 0, to: 1, condition: "When issue is technical or cannot be resolved with FAQ" },
        { from: 1, to: 2, condition: "When issue requires human intervention or is unresolvable" },
      ],
    },
    "lead-nurture": {
      agents: [
        { name: "Lead Capture", systemPrompt: "You are a lead capture agent. Engage visitors, identify their needs, collect contact information (name, email, company), and understand their use case. Be conversational and helpful.", description: "Captures visitor information and needs" },
        { name: "Lead Scorer", systemPrompt: "You are a lead scoring agent. Analyze the conversation context, evaluate lead quality based on company size, urgency, budget fit, and buying signals. Score from 1-10.", description: "Evaluates and scores lead quality" },
        { name: "Follow-Up Agent", systemPrompt: "You are a follow-up nurture agent. For high-scoring leads, provide relevant case studies, schedule demos, and maintain engagement. For lower scores, provide valuable content and re-engage later.", description: "Nurtures leads with personalized follow-up" },
      ],
      connections: [
        { from: 0, to: 1, condition: "When visitor provides contact information" },
        { from: 1, to: 2, condition: "After lead has been scored" },
      ],
    },
  };

  const tmpl = templates[template];
  if (!tmpl) return Response.json({ error: "Unknown template" }, { status: 400 });

  // Create agents
  const createdAgents = [];
  for (const agentDef of tmpl.agents) {
    const slug = agentDef.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
    const agent = await prisma.agent.create({
      data: {
        userId,
        name: agentDef.name,
        slug: uniqueSlug,
        systemPrompt: agentDef.systemPrompt,
        description: agentDef.description,
        welcomeMessage: `Hello! I'm ${agentDef.name}. How can I help you today?`,
        status: "DRAFT",
        llmModel: "claude-sonnet-4-20250514",
      },
    });
    createdAgents.push(agent);
  }

  // Create connections
  for (const conn of tmpl.connections) {
    await prisma.agentOrchestration.create({
      data: {
        sourceAgentId: createdAgents[conn.from].id,
        targetAgentId: createdAgents[conn.to].id,
        condition: conn.condition,
        enabled: true,
      },
    });
  }

  return Response.json({ created: true, agentIds: createdAgents.map((a) => a.id) });
}
