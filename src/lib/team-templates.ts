import crypto from "crypto";
import type {
  ActionType,
  AgentMode,
  AgentTeamRole,
  Prisma,
} from "@prisma/client";
import { MODEL_PROVIDER_MAP } from "./ai";

type TeamTemplateAction = {
  type: ActionType;
  enabled: boolean;
  config?: Prisma.InputJsonValue;
};

type TeamTemplateAgent = {
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
  actions?: TeamTemplateAction[];
};

type TeamTemplateConnection = {
  from: string;
  to: string;
  condition: string;
  enabled?: boolean;
};

export type TeamTemplate = {
  id: string;
  legacyAliases?: string[];
  name: string;
  description: string;
  goal: string;
  category: "Workflow Templates";
  orchestration: {
    mode: string;
    description: string;
    connections: TeamTemplateConnection[];
  };
  agents: TeamTemplateAgent[];
  marketplace: {
    welcomeMessage: string;
    suggestedQuestions?: string[];
  };
};

export type TeamTemplateCustomization = {
  teamName?: string;
  businessName?: string;
  industry?: string;
  agentNames?: Record<string, string>;
};

const PRIMARY_MODEL = "claude-sonnet-4-6";
const FAST_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_BUSINESS_NAME = "Your Business";
const FALLBACK_INDUSTRY = "general business";

const TEMPLATE_STRINGS = {
  businessName: /\{\{businessName\}\}/g,
  industry: /\{\{industry\}\}/g,
};

function fillTemplate(
  value: string,
  context: { businessName: string; industry: string }
) {
  return value
    .replace(TEMPLATE_STRINGS.businessName, context.businessName)
    .replace(TEMPLATE_STRINGS.industry, context.industry);
}

function generateSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function uniqueActions(template: TeamTemplate) {
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

const RAW_TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: "sales-pipeline",
    legacyAliases: ["sales", "SALES"],
    name: "Sales Pipeline",
    description:
      "Qualify inbound leads, route high-intent prospects to a closer, and nurture lower-fit leads automatically.",
    goal:
      "Run a sales workflow for {{businessName}} in the {{industry}} industry that qualifies leads, routes hot prospects to closing, and keeps colder leads engaged.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Qualification with conditional routing",
      description:
        "Qualifier runs first, assigns a score from 1-100, then routes hot leads to Closer and colder leads to Follow-Up.",
      connections: [
        {
          from: "qualifier",
          to: "closer",
          condition:
            "If the lead score is above 70 and the prospect is a strong fit for {{businessName}}, route to Closer.",
        },
        {
          from: "qualifier",
          to: "follow-up",
          condition:
            "If the lead score is 70 or below, route to Follow-Up with the full qualification summary and next best nurture angle.",
        },
      ],
    },
    agents: [
      {
        key: "qualifier",
        name: "Qualifier",
        description:
          "Greets visitors, asks qualification questions, and scores the lead from 1-100.",
        responsibilities:
          "Open the conversation, ask focused qualification questions, capture contact details, and decide whether the lead is hot or cold.",
        systemPrompt:
          "You are the lead qualifier for {{businessName}}, a {{industry}} company. Greet new prospects, ask concise qualifying questions about need, urgency, budget, authority, and timeline, then assign a lead score from 1 to 100 with a short rationale. Capture the prospect's email when appropriate and hand off with a crisp summary.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "Welcome to {{businessName}}. I can help figure out the best next step for your needs.",
        suggestedQuestions: [
          "What problem are you trying to solve right now?",
          "What timeline are you working against?",
          "Who will be involved in the final decision?",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
          { type: "SCORE_LEAD", enabled: true, config: {} },
        ],
      },
      {
        key: "closer",
        name: "Closer",
        description:
          "Receives hot leads, presents the offer clearly, and handles objections.",
        responsibilities:
          "Move qualified prospects toward commitment, explain the offer, and secure the next action without friction.",
        systemPrompt:
          "You are the closer for {{businessName}} in {{industry}}. You receive hot leads with context and score. Present the offer clearly, answer objections with confidence, reinforce business value, and move the lead toward a booked call or a concrete buying next step.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "You're in a strong position to move forward. Let me walk you through the best next step.",
        suggestedQuestions: [
          "Would you like a tailored walkthrough of the offer?",
          "What concern should we address before you decide?",
          "Should we get time on the calendar to finalize this?",
        ],
        actions: [
          { type: "BOOK_APPOINTMENT", enabled: true, config: {} },
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
        ],
      },
      {
        key: "follow-up",
        name: "Follow-Up",
        description:
          "Receives colder leads and keeps them warm with relevant content and next steps.",
        responsibilities:
          "Nurture lower-intent leads with helpful guidance, strong content angles, and a clear path back into the sales process.",
        systemPrompt:
          "You are the follow-up specialist for {{businessName}} in {{industry}}. You receive colder leads or lower-fit prospects. Keep the conversation helpful, deliver relevant education, suggest the most useful next resource, and look for the right moment to re-qualify later.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: FAST_MODEL,
        welcomeMessage:
          "You may not need to make a decision today. I can still point you to the most helpful next resource.",
        suggestedQuestions: [
          "Would a short guide help you evaluate options?",
          "Do you want a checklist to compare vendors?",
          "Should I send the best next resource to your inbox?",
        ],
        actions: [{ type: "COLLECT_EMAIL", enabled: true, config: {} }],
      },
    ],
    marketplace: {
      welcomeMessage:
        "Deploy a qualification-first sales team with hot-lead routing and built-in nurture follow-up.",
      suggestedQuestions: [
        "How are hot leads routed to the closer?",
        "What score sends a lead into follow-up?",
        "Can I adapt the sales prompts to my industry?",
      ],
    },
  },
  {
    id: "customer-support-tiers",
    legacyAliases: ["support", "SUPPORT"],
    name: "Customer Support Tiers",
    description:
      "Resolve common questions quickly, escalate harder technical cases, and package unresolved issues for human follow-up.",
    goal:
      "Run a support workflow for {{businessName}} in the {{industry}} industry that resolves easy issues fast and escalates only when necessary.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Tiered support escalation",
      description:
        "Tier 1 answers first. If unresolved, Tier 2 troubleshoots. If still unresolved, Escalation prepares a human handoff.",
      connections: [
        {
          from: "tier-1",
          to: "tier-2",
          condition:
            "If the question remains unresolved after Tier 1 or needs deeper troubleshooting, route to Tier 2.",
        },
        {
          from: "tier-2",
          to: "escalation",
          condition:
            "If Tier 2 still cannot resolve the issue safely or confidently, route to Escalation with the full issue summary.",
        },
      ],
    },
    agents: [
      {
        key: "tier-1",
        name: "Tier 1",
        description:
          "FAQ-oriented support agent that handles common questions from the knowledge base.",
        responsibilities:
          "Answer common support questions quickly, keep conversations calm, and identify when deeper troubleshooting is required.",
        systemPrompt:
          "You are Tier 1 support for {{businessName}}, a {{industry}} business. Resolve frequent questions clearly and quickly using approved knowledge. If the issue requires technical troubleshooting, system access, or repeated back-and-forth, escalate to Tier 2 with a concise summary.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "I can help with common questions and quick fixes for {{businessName}}.",
        suggestedQuestions: [
          "What exactly are you trying to do?",
          "What happened before the problem started?",
          "Have you already tried any steps on your side?",
        ],
      },
      {
        key: "tier-2",
        name: "Tier 2",
        description:
          "Deeper technical support agent for troubleshooting and diagnosis.",
        responsibilities:
          "Handle deeper troubleshooting, isolate root causes, and decide when a human team member must take over.",
        systemPrompt:
          "You are Tier 2 technical support for {{businessName}} in {{industry}}. Troubleshoot methodically, ask for the minimum information needed, propose precise next steps, and only escalate when the issue is out of scope, risky, or still unresolved.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "tier-1",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "Let's work through the deeper troubleshooting together.",
        suggestedQuestions: [
          "Can you describe the exact error or behavior?",
          "Is this affecting one user or multiple users?",
          "What should the system have done instead?",
        ],
      },
      {
        key: "escalation",
        name: "Escalation",
        description:
          "Human handoff specialist that captures issue detail for the support team.",
        responsibilities:
          "Prepare a human-ready handoff with the issue summary, urgency, impact, and customer expectations.",
        systemPrompt:
          "You are the escalation specialist for {{businessName}} in {{industry}}. Collect the final details required for a human support team to take over, summarize the issue, capture business impact, and set the right expectation for follow-up.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "tier-2",
        llmModel: FAST_MODEL,
        actions: [{ type: "HANDOFF_HUMAN", enabled: true, config: {} }],
      },
    ],
    marketplace: {
      welcomeMessage:
        "Launch a support team with Tier 1 triage, deeper Tier 2 troubleshooting, and a clean escalation handoff.",
      suggestedQuestions: [
        "When does Tier 2 engage?",
        "How are unresolved issues escalated?",
        "Can I attach my support knowledge base afterwards?",
      ],
    },
  },
  {
    id: "content-creation-pipeline",
    legacyAliases: ["content", "CONTENT"],
    name: "Content Creation Pipeline",
    description:
      "Research, draft, and edit content through a structured three-agent production flow.",
    goal:
      "Run a content workflow for {{businessName}} in the {{industry}} industry that turns raw ideas into publication-ready assets.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Sequential production pipeline",
      description:
        "Researcher gathers the brief, Writer drafts the content, and Editor improves clarity and polish before output.",
      connections: [
        {
          from: "researcher",
          to: "writer",
          condition:
            "Once the topic brief, key facts, and structure are ready, hand off to Writer.",
        },
        {
          from: "writer",
          to: "editor",
          condition:
            "After the first full draft is complete, send it to Editor for improvement and formatting.",
        },
      ],
    },
    agents: [
      {
        key: "researcher",
        name: "Researcher",
        description:
          "Researches topics, gathers context, and creates a brief for the writing stage.",
        responsibilities:
          "Frame the topic, collect useful facts, identify audience angles, and produce a strong brief for the writer.",
        systemPrompt:
          "You are the researcher for {{businessName}} in {{industry}}. Collect the context needed for high-quality content: target audience, business angle, core facts, objections, examples, and a recommended structure for the writer.",
        agentMode: "TASK",
        role: "HEAD",
        llmModel: PRIMARY_MODEL,
      },
      {
        key: "writer",
        name: "Writer",
        description:
          "Creates the first full draft from the research brief.",
        responsibilities:
          "Write a strong first draft with clear structure, compelling flow, and alignment to brand voice.",
        systemPrompt:
          "You are the writer for {{businessName}} in {{industry}}. Turn the research brief into a clear, useful, and well-structured draft. Keep the tone professional, the structure logical, and the content specific enough to be genuinely valuable.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "researcher",
        llmModel: PRIMARY_MODEL,
      },
      {
        key: "editor",
        name: "Editor",
        description:
          "Improves readability, formatting, and overall quality before the content is delivered.",
        responsibilities:
          "Tighten the draft, improve clarity, strengthen pacing, and make the content publication-ready.",
        systemPrompt:
          "You are the editor for {{businessName}} in {{industry}}. Improve clarity, structure, phrasing, formatting, and readability without diluting the original intent. Return a final polished asset with short edit notes.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "writer",
        llmModel: FAST_MODEL,
      },
    ],
    marketplace: {
      welcomeMessage:
        "Spin up a three-stage research, writing, and editing workflow with one deployment.",
      suggestedQuestions: [
        "Which agent handles the research brief?",
        "How does the editor improve the final draft?",
        "Can I rename the agents before deploying?",
      ],
    },
  },
  {
    id: "lead-qualification-booking",
    name: "Lead Qualification & Booking",
    description:
      "Qualify inbound prospects using BANT, then hand off qualified leads to a booking agent that works with Google Calendar.",
    goal:
      "Run a qualification and booking workflow for {{businessName}} in the {{industry}} industry that books meetings only with qualified prospects.",
    category: "Workflow Templates",
    orchestration: {
      mode: "Qualification before booking",
      description:
        "Qualifier determines BANT fit first. Only qualified leads are routed to Booker for scheduling.",
      connections: [
        {
          from: "qualifier",
          to: "booker",
          condition:
            "If the prospect is qualified based on BANT and ready to talk, route to Booker to schedule a meeting using Google Calendar.",
        },
      ],
    },
    agents: [
      {
        key: "qualifier",
        name: "Qualifier",
        description:
          "Asks BANT questions, determines fit, and decides whether the lead should move to booking.",
        responsibilities:
          "Qualify the lead, capture email, assess fit, and summarize why the prospect should or should not be booked.",
        systemPrompt:
          "You are the sales qualifier for {{businessName}} in {{industry}}. Ask BANT questions about budget, authority, need, and timeline. Capture email details, decide if the lead is qualified, and prepare a concise booking handoff only when the fit is clear.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "I can help determine whether a call with {{businessName}} makes sense and get it booked if it does.",
        suggestedQuestions: [
          "What problem are you looking to solve?",
          "When do you want to have a solution in place?",
          "Who else will be part of the decision?",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
          { type: "SCORE_LEAD", enabled: true, config: {} },
        ],
      },
      {
        key: "booker",
        name: "Booker",
        description:
          "Schedules appointments through the Google Calendar booking flow once the lead is qualified.",
        responsibilities:
          "Offer available times, book the meeting, and confirm the next step cleanly and efficiently.",
        systemPrompt:
          "You are the appointment booker for {{businessName}} in {{industry}}. You only engage with qualified prospects. Offer clear scheduling options, use the connected Google Calendar setup when available, and confirm the meeting with concise next-step guidance.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: FAST_MODEL,
        welcomeMessage:
          "It looks like a fit. Let's get a time on the calendar.",
        suggestedQuestions: [
          "Which day works best for you?",
          "Do you prefer morning or afternoon?",
          "Is there anything the team should prepare before the meeting?",
        ],
        actions: [{ type: "BOOK_APPOINTMENT", enabled: true, config: {} }],
      },
    ],
    marketplace: {
      welcomeMessage:
        "Deploy a BANT-based qualifier and booking flow that is ready for Google Calendar handoff.",
      suggestedQuestions: [
        "Which agent asks the BANT questions?",
        "How does the booking handoff work?",
        "Can I connect Google Calendar after deployment?",
      ],
    },
  },
];

function normalizeTemplateId(templateId: string) {
  return templateId.trim().toLowerCase();
}

export const TEAM_TEMPLATES = RAW_TEAM_TEMPLATES.map((template) => ({
  ...template,
  id: normalizeTemplateId(template.id),
  legacyAliases: (template.legacyAliases || []).map((alias) =>
    normalizeTemplateId(alias)
  ),
}));

export function getTeamTemplate(id: string) {
  const normalized = normalizeTemplateId(id);
  return TEAM_TEMPLATES.find(
    (template) =>
      template.id === normalized ||
      template.legacyAliases?.includes(normalized)
  );
}

export function getTeamTemplateSummaries() {
  return TEAM_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    goal: template.goal,
    category: template.category,
    agentCount: template.agents.length,
    agents: template.agents.map((agent) => ({
      key: agent.key,
      name: agent.name,
      role: agent.role,
      agentMode: agent.agentMode,
    })),
    orchestration: {
      mode: template.orchestration.mode,
      description: template.orchestration.description,
      connections: template.orchestration.connections.map((connection) => ({
        from: connection.from,
        to: connection.to,
        condition: connection.condition,
      })),
    },
  }));
}

function buildContext(customization?: TeamTemplateCustomization) {
  return {
    businessName:
      customization?.businessName?.trim() || FALLBACK_BUSINESS_NAME,
    industry: customization?.industry?.trim() || FALLBACK_INDUSTRY,
  };
}

function buildConfiguredTemplate(
  template: TeamTemplate,
  customization?: TeamTemplateCustomization
) {
  const context = buildContext(customization);

  return {
    teamName:
      customization?.teamName?.trim() ||
      (customization?.businessName?.trim()
        ? `${customization.businessName.trim()} ${template.name}`
        : template.name),
    description: fillTemplate(template.description, context),
    goal: fillTemplate(template.goal, context),
    orchestration: {
      ...template.orchestration,
      description: fillTemplate(template.orchestration.description, context),
      connections: template.orchestration.connections.map((connection) => ({
        ...connection,
        condition: fillTemplate(connection.condition, context),
      })),
    },
    agents: template.agents.map((agent) => ({
      ...agent,
      name:
        customization?.agentNames?.[agent.key]?.trim() || agent.name,
      description: fillTemplate(agent.description, context),
      responsibilities: fillTemplate(agent.responsibilities, context),
      systemPrompt: fillTemplate(agent.systemPrompt, context),
      welcomeMessage: agent.welcomeMessage
        ? fillTemplate(agent.welcomeMessage, context)
        : undefined,
      suggestedQuestions: agent.suggestedQuestions?.map((question) =>
        fillTemplate(question, context)
      ),
    })),
  };
}

export const TEAM_MARKETPLACE_TEMPLATES = TEAM_TEMPLATES.map((template) => ({
  authorName: "KILN Team",
  name: template.name,
  description: template.description,
  category: template.category,
  agentConfigSnapshot: {
    teamTemplateId: template.id,
    workflowType: "TEAM_TEMPLATE",
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

export async function deployTeamTemplate(
  userId: string,
  templateId: string,
  customization?: TeamTemplateCustomization
) {
  const template = getTeamTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown team template: ${templateId}`);
  }

  const configured = buildConfiguredTemplate(template, customization);
  const [{ prisma }, { getUserEmailOrPlaceholder }] = await Promise.all([
    import("./prisma"),
    import("./clerk-user-email"),
  ]);

  const userEmail = await getUserEmailOrPlaceholder(userId);
  const levelMap = {
    HEAD: 0,
    COORDINATOR: 1,
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
        name: configured.teamName,
        description: configured.description,
        goal: configured.goal,
      },
    });

    const memberIds = new Map<string, string>();
    const agentIdsByKey = new Map<string, string>();
    const agentIds: string[] = [];

    for (const agentDef of configured.agents) {
      const agent = await tx.agent.create({
        data: {
          userId,
          name: agentDef.name,
          slug: generateSlug(agentDef.name),
          description: agentDef.description,
          systemPrompt: agentDef.systemPrompt,
          welcomeMessage:
            agentDef.agentMode === "CHAT"
              ? agentDef.welcomeMessage ||
                `Hi! I'm ${agentDef.name}. How can I help you today?`
              : "",
          suggestedQuestions: agentDef.suggestedQuestions || [],
          llmModel: agentDef.llmModel,
          modelProvider:
            MODEL_PROVIDER_MAP[agentDef.llmModel] || "ANTHROPIC",
          status: "DRAFT",
          agentMode: agentDef.agentMode,
          temperature: agentDef.agentMode === "CHAT" ? 0.7 : 0.4,
          personality: {
            tone: "professional",
            language: "en",
            style:
              agentDef.agentMode === "CHAT" ? "customer-facing" : "operator",
          },
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

      memberIds.set(agentDef.key, member.id);
      agentIdsByKey.set(agentDef.key, agent.id);
      agentIds.push(agent.id);
    }

    for (const agentDef of configured.agents) {
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

    for (const connection of configured.orchestration.connections) {
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

    return {
      templateId: template.id,
      teamId: team.id,
      teamName: team.name,
      detailUrl: `/dashboard/teams/${team.id}`,
      agentIds,
    };
  });
}
