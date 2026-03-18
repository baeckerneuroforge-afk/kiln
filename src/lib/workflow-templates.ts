import crypto from "crypto";
import type { ActionType, AgentMode, AgentTeamRole, Prisma, TriggerType } from "@prisma/client";

type WorkflowTemplateAction = {
  type: ActionType;
  enabled: boolean;
  config?: Prisma.InputJsonValue;
};

type WorkflowTemplateAgent = {
  key: string;
  name: string;
  description: string;
  responsibilities: string;
  systemPrompt: string;
  agentMode: AgentMode;
  role: AgentTeamRole;
  reportsTo?: string;
  llmModel: string;
  welcomeMessage?: string;
  suggestedQuestions?: string[];
  triggerType?: TriggerType;
  triggerConfig?: Prisma.InputJsonValue;
  actions?: WorkflowTemplateAction[];
};

type WorkflowTemplateConnection = {
  from: string;
  to: string;
  condition: string;
  enabled?: boolean;
};

type WorkflowTemplateTask = {
  title: string;
  description: string;
  assignedTo: string;
  status?: string;
  priority?: string;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  goal: string;
  category: "Workflow Templates";
  orchestration: {
    mode: string;
    description: string;
    connections: WorkflowTemplateConnection[];
  };
  agents: WorkflowTemplateAgent[];
  teamTasks?: WorkflowTemplateTask[];
  marketplace: {
    welcomeMessage: string;
    suggestedQuestions?: string[];
  };
};

const PRIMARY_MODEL = "claude-sonnet-4-6";
const FAST_MODEL = "claude-haiku-4-5-20251001";

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "lead-qualification-pipeline",
    name: "Lead Qualification Pipeline",
    description: "Capture inbound leads, score intent, and move high-value prospects into booking automatically.",
    goal: "Qualify leads quickly, score them consistently, and book meetings only for high-intent prospects.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Sequential with conditional booking",
      description: "Lead Qualifier gathers context, Lead Scorer assigns a score, and Appointment Booker engages only when the score is above 70.",
      connections: [
        {
          from: "lead-qualifier",
          to: "lead-scorer",
          condition: "After the visitor has answered the qualification questions, pass the full context to Lead Scorer for 0-100 scoring.",
        },
        {
          from: "lead-scorer",
          to: "appointment-booker",
          condition: "If the lead score is greater than 70, hand off to Appointment Booker to schedule the next conversation.",
        },
      ],
    },
    agents: [
      {
        key: "lead-qualifier",
        name: "Lead Qualifier",
        description: "Chat agent that asks qualification questions and captures buying intent.",
        responsibilities: "Ask qualifying questions, collect contact details, and summarize the prospect's needs.",
        systemPrompt: "You are a lead qualification specialist. Ask visitors about their needs, budget, and timeline. Collect their contact information and qualify them clearly so the next agent can score the lead accurately.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage: "Welcome! I can help figure out whether we're a strong fit. What are you looking for right now?",
        suggestedQuestions: [
          "What problem are you trying to solve?",
          "What budget range are you working with?",
          "How soon do you want to move forward?",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
        ],
      },
      {
        key: "lead-scorer",
        name: "Lead Scorer",
        description: "Task agent that turns qualification context into a numeric lead score.",
        responsibilities: "Review qualification context and score the lead from 0-100 with concise reasoning.",
        systemPrompt: "You are a lead scoring specialist. Review the qualification notes and score the lead from 0 to 100 based on urgency, fit, budget, authority, and timeline. Return a concise score with reasoning and a clear recommendation.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "lead-qualifier",
        llmModel: FAST_MODEL,
        actions: [
          { type: "SCORE_LEAD", enabled: true, config: {} },
        ],
      },
      {
        key: "appointment-booker",
        name: "Appointment Booker",
        description: "Chat agent that books meetings for high-scoring leads.",
        responsibilities: "Turn qualified intent into a scheduled meeting without slowing down the prospect.",
        systemPrompt: "You are an appointment booking assistant. When a lead is qualified, help them book a meeting by confirming their name, preferred date and time, and the purpose of the meeting. Stay efficient, clear, and friendly.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "lead-qualifier",
        llmModel: PRIMARY_MODEL,
        welcomeMessage: "Great fit so far. Let's get a meeting on the calendar.",
        suggestedQuestions: [
          "What day works best for you?",
          "Do you prefer morning or afternoon?",
          "What should we prepare before the call?",
        ],
        actions: [
          { type: "BOOK_APPOINTMENT", enabled: true, config: {} },
        ],
      },
    ],
    marketplace: {
      welcomeMessage: "Deploy a ready-made lead capture, scoring, and meeting-booking workflow in one step.",
      suggestedQuestions: [
        "Which agent qualifies the lead?",
        "How does the score gate the booking step?",
        "What happens to low-scoring leads?",
      ],
    },
  },
  {
    id: "content-generation-workflow",
    name: "Content Generation Workflow",
    description: "Research, draft, and edit content through a structured multi-agent production pipeline.",
    goal: "Produce stronger long-form content by splitting research, writing, and editing into focused stages.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Sequential pipeline",
      description: "Topic Researcher gathers the brief, Content Writer drafts the article, and Editor improves the final output before handoff.",
      connections: [
        {
          from: "topic-researcher",
          to: "content-writer",
          condition: "After research notes, outline, and source angles are ready, hand off to Content Writer.",
        },
        {
          from: "content-writer",
          to: "editor",
          condition: "After the first full draft is complete, send it to Editor for clarity, structure, and quality improvements.",
        },
      ],
    },
    agents: [
      {
        key: "topic-researcher",
        name: "Topic Researcher",
        description: "Task agent that researches the topic, audience, and angle before drafting starts.",
        responsibilities: "Research the topic, map the target audience, and produce a usable content brief.",
        systemPrompt: "You are a topic researcher. Gather the key facts, audience pain points, competing angles, and a recommended outline for the content writer. Focus on credible, practical inputs and a clear angle.",
        agentMode: "TASK",
        role: "HEAD",
        llmModel: PRIMARY_MODEL,
      },
      {
        key: "content-writer",
        name: "Content Writer",
        description: "Task agent that turns research into a structured article draft.",
        responsibilities: "Write a clear, complete draft from the research brief while matching the intended audience and tone.",
        systemPrompt: "You are a content writer. Use the research brief to write a strong article with a clear structure, strong transitions, practical value, and an intentional voice. Optimize for readability and momentum.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "topic-researcher",
        llmModel: PRIMARY_MODEL,
      },
      {
        key: "editor",
        name: "Editor",
        description: "Task agent that improves quality, structure, and readability before publication.",
        responsibilities: "Edit the draft for clarity, accuracy, flow, and stronger phrasing without losing the core intent.",
        systemPrompt: "You are an editor. Improve clarity, grammar, pacing, structure, and persuasion. Tighten weak sections, remove repetition, and return a publication-ready final version with concise edit notes.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "topic-researcher",
        llmModel: FAST_MODEL,
      },
    ],
    marketplace: {
      welcomeMessage: "Spin up a research-to-draft-to-edit content pipeline with three specialized task agents.",
      suggestedQuestions: [
        "Which agent handles research?",
        "Can I swap the writer model later?",
        "What order do the agents run in?",
      ],
    },
  },
  {
    id: "customer-onboarding-sequence",
    name: "Customer Onboarding Sequence",
    description: "Guide new customers from welcome to setup to proactive follow-up with a staged onboarding workflow.",
    goal: "Make new customers feel guided, reduce setup friction, and trigger a timely follow-up after the first setup phase.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Sequential with delayed follow-up",
      description: "Welcome Bot greets and collects context, Setup Guide generates personalized next steps, and Check-in Bot follows up after a three-day delay.",
      connections: [
        {
          from: "welcome-bot",
          to: "setup-guide",
          condition: "After the customer's goals, plan, and setup context are collected, hand off to Setup Guide.",
        },
        {
          from: "setup-guide",
          to: "check-in-bot",
          condition: "After setup instructions are delivered, wait 3 days before Check-in Bot follows up and asks about progress.",
        },
      ],
    },
    agents: [
      {
        key: "welcome-bot",
        name: "Welcome Bot",
        description: "Chat agent that greets new customers and captures onboarding context.",
        responsibilities: "Welcome the customer, gather their goals, and collect the context required for a personalized setup path.",
        systemPrompt: "You are a customer welcome assistant. Greet new customers warmly, collect the essential setup context, and make the onboarding experience feel easy and personal. Keep the interaction clear and encouraging.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage: "Welcome aboard! I'll help you get set up and moving quickly.",
        suggestedQuestions: [
          "What are you trying to achieve first?",
          "Which tools or systems are already in place?",
          "Is there a deadline or milestone we should plan around?",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
        ],
      },
      {
        key: "setup-guide",
        name: "Setup Guide",
        description: "Task agent that turns onboarding context into personalized setup steps.",
        responsibilities: "Create a practical setup checklist and tailor onboarding guidance to the customer's goals.",
        systemPrompt: "You are a setup guide. Use the customer's onboarding context to create a clear, step-by-step setup plan with priorities, dependencies, and a suggested first win. Keep the plan practical and concise.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "welcome-bot",
        llmModel: PRIMARY_MODEL,
      },
      {
        key: "check-in-bot",
        name: "Check-in Bot",
        description: "Chat agent that follows up after the onboarding plan has had time to run.",
        responsibilities: "Follow up after onboarding, check progress, answer blockers, and escalate when needed.",
        systemPrompt: "You are a customer check-in assistant. Follow up after the setup plan has had time to run, ask about progress, surface blockers, and keep the customer moving forward. Be warm, specific, and proactive.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "welcome-bot",
        llmModel: FAST_MODEL,
        welcomeMessage: "Checking back in. How is the setup going so far?",
        suggestedQuestions: [
          "Which setup step is still blocking you?",
          "Did anything take longer than expected?",
          "Would you like help with the next milestone?",
        ],
        actions: [
          { type: "HANDOFF_HUMAN", enabled: true, config: {} },
        ],
      },
    ],
    teamTasks: [
      {
        title: "3-day onboarding follow-up",
        description: "Trigger Check-in Bot three days after Setup Guide delivers the onboarding plan.",
        assignedTo: "check-in-bot",
        status: "PENDING",
        priority: "MEDIUM",
      },
    ],
    marketplace: {
      welcomeMessage: "Launch a guided onboarding sequence with a welcome step, setup plan, and delayed check-in.",
      suggestedQuestions: [
        "How is the 3-day follow-up represented?",
        "Which agent creates the setup plan?",
        "Can the check-in escalate to a human?",
      ],
    },
  },
  {
    id: "support-ticket-router",
    name: "Support Ticket Router",
    description: "Classify support issues first, then route them to the right specialist or escalate to a human-ready task.",
    goal: "Reduce misrouting by classifying incoming issues once and sending them to the right resolution path immediately.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Classification with conditional routing",
      description: "Classifier categorizes the issue and routes it to Technical Support, Billing Support, or Escalation based on urgency and ownership.",
      connections: [
        {
          from: "classifier",
          to: "technical-support",
          condition: "If the issue is technical, product-related, or requires troubleshooting, route to Technical Support.",
        },
        {
          from: "classifier",
          to: "billing-support",
          condition: "If the issue is about invoices, payments, subscriptions, or refunds, route to Billing Support.",
        },
        {
          from: "classifier",
          to: "escalation",
          condition: "If the issue is high-risk, unclear, abusive, or explicitly requires a human owner, route to Escalation.",
        },
      ],
    },
    agents: [
      {
        key: "classifier",
        name: "Classifier",
        description: "Task agent that reads the issue and decides which support path should own it.",
        responsibilities: "Classify the issue quickly and choose the right route based on topic, urgency, and confidence.",
        systemPrompt: "You are a support classifier. Read the incoming issue, determine whether it belongs to technical support, billing support, or escalation, and explain the routing decision briefly and clearly.",
        agentMode: "TASK",
        role: "COORDINATOR",
        llmModel: FAST_MODEL,
      },
      {
        key: "technical-support",
        name: "Technical Support",
        description: "Chat agent that handles product and troubleshooting issues.",
        responsibilities: "Handle technical support questions, guide troubleshooting, and communicate clearly when more investigation is needed.",
        systemPrompt: "You are a technical support specialist. Resolve technical issues with clear troubleshooting steps, concise explanations, and calm communication. Escalate only when the issue is out of scope or unresolved.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "classifier",
        llmModel: PRIMARY_MODEL,
        welcomeMessage: "I can help troubleshoot the technical issue with you.",
        suggestedQuestions: [
          "What exactly happened before the issue started?",
          "Can you share the error message or behavior?",
          "Is this affecting one user or multiple users?",
        ],
      },
      {
        key: "billing-support",
        name: "Billing Support",
        description: "Chat agent that handles invoices, subscriptions, refunds, and payment issues.",
        responsibilities: "Resolve billing questions clearly and reduce friction around payments, invoices, and subscriptions.",
        systemPrompt: "You are a billing support specialist. Help with payment issues, invoices, subscriptions, plan changes, and refunds. Be precise, empathetic, and policy-aware.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "classifier",
        llmModel: PRIMARY_MODEL,
        welcomeMessage: "I can help with billing, subscription, or invoice questions.",
        suggestedQuestions: [
          "Which invoice or payment is affected?",
          "Are you trying to change plans or update billing details?",
          "Do you need a refund or a payment correction?",
        ],
      },
      {
        key: "escalation",
        name: "Escalation",
        description: "Task agent that packages the issue for human follow-up when automation should stop.",
        responsibilities: "Create a clean escalation summary with urgency, context, and next actions for a human owner.",
        systemPrompt: "You are an escalation coordinator. When a ticket should go to a human, summarize the issue, list the risk or blocker, capture the user's expectations, and prepare a concise handoff package.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "classifier",
        llmModel: FAST_MODEL,
        actions: [
          { type: "HANDOFF_HUMAN", enabled: true, config: {} },
        ],
      },
    ],
    marketplace: {
      welcomeMessage: "Deploy a classifier-led support workflow that routes issues to technical, billing, or escalation paths.",
      suggestedQuestions: [
        "How are technical and billing issues separated?",
        "When does the escalation agent activate?",
        "Can I customize the routing conditions later?",
      ],
    },
  },
];

function generateSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function uniqueActions(template: WorkflowTemplate) {
  const seen = new Set<string>();

  return template.agents
    .flatMap((agent) => agent.actions || [])
    .filter((action) => {
      if (seen.has(action.type)) return false;
      seen.add(action.type);
      return true;
    })
    .map((action) => ({ type: action.type, enabled: action.enabled }));
}

export function getWorkflowTemplate(templateId: string) {
  return WORKFLOW_TEMPLATES.find((template) => template.id === templateId);
}

export const WORKFLOW_MARKETPLACE_TEMPLATES = WORKFLOW_TEMPLATES.map((template) => ({
  authorName: "KILN Team",
  name: template.name,
  description: template.description,
  category: template.category,
  agentConfigSnapshot: {
    workflowTemplateId: template.id,
    workflowType: "TEAM_WORKFLOW",
    welcomeMessage: template.marketplace.welcomeMessage,
    suggestedQuestions: template.marketplace.suggestedQuestions || [],
    actions: uniqueActions(template),
    workflowAgents: template.agents.map((agent) => ({
      name: agent.name,
      agentMode: agent.agentMode,
    })),
    orchestration: {
      mode: template.orchestration.mode,
      description: template.orchestration.description,
    },
  },
}));

export async function deployWorkflow(userId: string, templateId: string) {
  const template = getWorkflowTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown workflow template: ${templateId}`);
  }

  const [{ prisma }, { getUserEmailOrPlaceholder }] = await Promise.all([
    import("./prisma"),
    import("./clerk-user-email"),
  ]);

  const userEmail = await getUserEmailOrPlaceholder(userId);
  const levelMap = {
    HEAD: 0,
    COORDINATOR: 1,
    APPROVAL_GATE: 2,
    EXECUTOR: 2,
    REPORTER: 2,
  } as const;

  return prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: userEmail },
    });

    const team = await tx.agentTeam.create({
      data: {
        userId,
        name: template.name,
        description: template.description,
        goal: template.goal,
      },
    });

    const agentIds: string[] = [];
    const memberIds = new Map<string, string>();
    const agentIdsByKey = new Map<string, string>();

    for (const agentDef of template.agents) {
      const agent = await tx.agent.create({
        data: {
          userId,
          name: agentDef.name,
          slug: generateSlug(agentDef.name),
          description: agentDef.description,
          systemPrompt: agentDef.systemPrompt,
          welcomeMessage:
            agentDef.agentMode === "CHAT"
              ? agentDef.welcomeMessage || `Hi! I'm ${agentDef.name}. How can I help you today?`
              : "",
          suggestedQuestions: agentDef.suggestedQuestions || [],
          llmModel: agentDef.llmModel,
          status: "DRAFT",
          agentMode: agentDef.agentMode,
          triggerType: agentDef.triggerType || "MANUAL",
          triggerConfig: agentDef.triggerConfig || undefined,
        },
      });

      if (agentDef.actions?.length) {
        await tx.agentAction.createMany({
          data: agentDef.actions.map((action) => ({
            agentId: agent.id,
            type: action.type,
            enabled: action.enabled,
            config: action.config ?? {},
          })),
        });
      }

      const member = await tx.agentTeamMember.create({
        data: {
          teamId: team.id,
          agentId: agent.id,
          role: agentDef.role,
          level: levelMap[agentDef.role],
          responsibilities: agentDef.responsibilities,
        },
      });

      agentIds.push(agent.id);
      memberIds.set(agentDef.key, member.id);
      agentIdsByKey.set(agentDef.key, agent.id);
    }

    for (const agentDef of template.agents) {
      if (!agentDef.reportsTo) continue;

      const memberId = memberIds.get(agentDef.key);
      const reportsToId = memberIds.get(agentDef.reportsTo);

      if (memberId && reportsToId) {
        await tx.agentTeamMember.update({
          where: { id: memberId },
          data: { reportsToMemberId: reportsToId },
        });
      }
    }

    for (const connection of template.orchestration.connections) {
      const sourceAgentId = agentIdsByKey.get(connection.from);
      const targetAgentId = agentIdsByKey.get(connection.to);

      if (!sourceAgentId || !targetAgentId) continue;

      await tx.agentOrchestration.create({
        data: {
          sourceAgentId,
          targetAgentId,
          condition: connection.condition,
          enabled: connection.enabled ?? true,
        },
      });
    }

    for (const task of template.teamTasks || []) {
      const assignedToId = memberIds.get(task.assignedTo);

      await tx.agentTeamTask.create({
        data: {
          teamId: team.id,
          ...(assignedToId ? { assignedToId } : {}),
          title: task.title,
          description: task.description,
          status: task.status || "PENDING",
          priority: task.priority || "MEDIUM",
        },
      });
    }

    return {
      templateId: template.id,
      teamId: team.id,
      teamName: team.name,
      agentIds,
    };
  });
}
