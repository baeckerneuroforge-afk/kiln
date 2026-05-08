import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OrgScope } from "@/lib/auth/org-scope";

export const CUSTOMER_SUPPORT_TEMPLATE = {
  type: "CUSTOMER_SUPPORT",
  name: "Customer Support",
  description: "Triages tickets, drafts customer replies, and escalates when needed.",
  approvalMode: "APPROVAL_FIRST",
  managerModel: "claude-sonnet-4-6",
  managerSystemPrompt: `You are the manager of a customer support department.
Inbound messages arrive via Email or WhatsApp.
Your job is to route incoming tickets to the right worker, produce useful drafts on the same channel, and escalate when needed.
Use APPROVAL_FIRST mode: never auto-send customer responses. Always queue customer-facing responses for human review.

Decision flow:
1. New ticket arrives -> TRIAGE classifies it.
2. Standard questions -> L1_SUPPORT drafts a response from the knowledge base on the same channel.
3. Complex issues -> L2_SUPPORT investigates and drafts a response.
4. Unclear, angry, risky, or account-sensitive issues -> ESCALATOR drafts an internal escalation summary.

When drafting outbound messages, use REQUEST_APPROVAL with:
- Email: { "action": "send-email-reply", "channel": "EMAIL", "to": "...", "subject": "Re: ...", "body": "..." }
- WhatsApp: { "action": "send-whatsapp-reply", "channel": "WHATSAPP", "to": "...", "body": "..." }

Channel-aware drafting:
- Email: include a subject, formal greeting, clear paragraphs, and a concise signature.
- WhatsApp: keep it short, conversational, and avoid formal salutations.

Operating memory should track customer history, recent tickets, sentiment, and repeated issues.`,
  workerTemplates: [
    {
      role: "TRIAGE",
      name: "Support Triage",
      description: "Classifies tickets by type, urgency, sentiment, and routing target.",
      priority: 100,
      systemPrompt:
        "Classify support tickets as Bug, Question, Feature Request, Complaint, Billing, or Other. Include urgency, sentiment, customer intent, and the next recommended support worker.",
    },
    {
      role: "L1_SUPPORT",
      name: "L1 Support",
      description: "Drafts standard support replies using product knowledge.",
      priority: 80,
      systemPrompt:
        "Draft clear, friendly support replies for standard product questions. Use knowledge-base context when present. Do not claim actions were taken unless the input proves it.",
    },
    {
      role: "L2_SUPPORT",
      name: "L2 Support",
      description: "Handles technical or ambiguous tickets that need deeper investigation.",
      priority: 60,
      systemPrompt:
        "Investigate complex technical support tickets. Produce a concise diagnostic summary, likely cause, questions to ask, and a customer-ready draft when possible.",
    },
    {
      role: "ESCALATOR",
      name: "Support Escalator",
      description: "Creates escalation summaries for humans when risk or ambiguity is high.",
      priority: 40,
      systemPrompt:
        "Prepare escalation summaries for a human support lead. Include customer context, risk, sentiment, known facts, unknowns, and a recommended next action.",
    },
  ],
} as const;

export async function createCustomerSupportDepartment(args: {
  scope: OrgScope;
  name?: string;
  description?: string;
}) {
  const slugSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return prisma.$transaction(async (tx) => {
    const department = await tx.department.create({
      data: {
        userId: args.scope.userId,
        orgId: args.scope.orgId,
        name: args.name || CUSTOMER_SUPPORT_TEMPLATE.name,
        description: args.description || CUSTOMER_SUPPORT_TEMPLATE.description,
        type: CUSTOMER_SUPPORT_TEMPLATE.type,
        approvalMode: CUSTOMER_SUPPORT_TEMPLATE.approvalMode,
        managerModel: CUSTOMER_SUPPORT_TEMPLATE.managerModel,
        managerSystemPrompt: CUSTOMER_SUPPORT_TEMPLATE.managerSystemPrompt,
        webhookEnabled: true,
        scheduleEnabled: false,
        emailEnabled: true,
        emailInboundAddr: "support@yourcompany.com",
        emailFromAddr: "support@yourcompany.com",
        emailFromName: "Customer Support",
        whatsappEnabled: false,
        operatingMemory: {
          customers: {},
          recentTickets: [],
          sentimentTrends: {},
        } satisfies Prisma.InputJsonValue,
      },
    });

    for (const worker of CUSTOMER_SUPPORT_TEMPLATE.workerTemplates) {
      const agent = await tx.agent.create({
        data: {
          userId: args.scope.userId,
          orgId: args.scope.orgId,
          name: worker.name,
          slug: `${worker.role.toLowerCase().replaceAll("_", "-")}-${slugSuffix}`,
          description: worker.description,
          systemPrompt: worker.systemPrompt,
          mode: "TASK",
          status: "DRAFT",
          visibility: "INTERNAL",
          llmModel: "claude-sonnet-4-6",
          modelProvider: "ANTHROPIC",
          suggestedQuestions: [],
          a2aCapabilities: [],
        },
      });

      await tx.departmentWorker.create({
        data: {
          departmentId: department.id,
          agentId: agent.id,
          role: worker.role,
          description: worker.description,
          priority: worker.priority,
        },
      });
    }

    return tx.department.findUniqueOrThrow({
      where: { id: department.id },
      include: { workerAgents: { include: { agent: true } } },
    });
  });
}
