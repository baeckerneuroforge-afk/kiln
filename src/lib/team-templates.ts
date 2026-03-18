import crypto from "crypto";
import type {
  ActionType,
  AgentMode,
  AgentTeamRole,
  Prisma,
} from "@prisma/client";
import { MODEL_PROVIDER_MAP } from "./ai";
import type { WorkflowNode, WorkflowEdge } from "./workflow-node-types";

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
  config?: Prisma.InputJsonValue;
};

type TeamTemplateConnection = {
  from: string;
  to: string;
  condition: string;
  enabled?: boolean;
};

export type TeamTemplateIndustry = "Handwerk" | "Immobilien" | "Beratung" | "E-Commerce" | "Allgemein";

export type TeamTemplate = {
  id: string;
  legacyAliases?: string[];
  name: string;
  description: string;
  goal: string;
  category: "Workflow Templates";
  industry?: TeamTemplateIndustry;
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
  workflow?: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
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
    industry: "Allgemein",
    orchestration: {
      mode: "Qualification with conditional routing",
      description:
        "Qualifier runs first, routes hot leads through a human approval gate before Closer engages, and sends colder leads to Follow-Up.",
      connections: [
        {
          from: "qualifier",
          to: "approval-gate",
          condition:
            "If the lead score is above 70 and the prospect is a strong fit for {{businessName}}, route to the approval gate for a human decision.",
        },
        {
          from: "approval-gate",
          to: "closer",
          condition:
            "After a human approves the recommended next step, route the lead to Closer with the full qualification summary and recommended offer.",
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
        key: "approval-gate",
        name: "Sales Approval Gate",
        description:
          "Human checkpoint that approves whether a hot lead should advance to the closer.",
        responsibilities:
          "Review the qualification summary, confirm the lead should move forward, and approve or reject the closing handoff.",
        systemPrompt:
          "This is a human approval gate for {{businessName}} in {{industry}}. It should never run as an AI agent. Pause execution and wait for a human approver to confirm whether the closer should engage.",
        agentMode: "TASK",
        role: "APPROVAL_GATE",
        reportsTo: "qualifier",
        llmModel: FAST_MODEL,
        config: {
          label: "Sales Approval Gate",
          approvalMessage:
            "A qualified lead is ready for review. Approve this handoff to let the closer engage, or reject it if the lead should stay in nurture.",
          timeoutHours: 24,
          timeoutAction: "skip",
        },
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
        reportsTo: "approval-gate",
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
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_lead", label: "Lead Captured", position: { x: 400, y: 0 }, config: { agentFilter: "all" } },
        { id: "n2", type: "agent", label: "Qualifier", position: { x: 400, y: 160 }, config: { memberId: "qualifier" } },
        { id: "n3", type: "if_condition", label: "Score > 70?", position: { x: 400, y: 320 }, config: { field: "score", operator: "gt", value: "70" } },
        { id: "n4", type: "agent", label: "Closer", position: { x: 200, y: 480 }, config: { memberId: "closer" } },
        { id: "n5", type: "send_email", label: "Meeting Booked", position: { x: 200, y: 640 }, config: { to: "", subject: "meeting booked", body: "" } },
        { id: "n6", type: "agent", label: "Follow-Up", position: { x: 600, y: 480 }, config: { memberId: "follow-up" } },
        { id: "n7", type: "set_variable", label: "Set Nurture Status", position: { x: 600, y: 640 }, config: { key: "nurture_status", value: "active" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4", sourceHandle: "true", condition: "score > 70" },
        { sourceId: "n3", targetId: "n6", sourceHandle: "false", condition: "score <= 70" },
        { sourceId: "n4", targetId: "n5" },
        { sourceId: "n6", targetId: "n7" },
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
    industry: "Allgemein",
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
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_chat", label: "Chat Started", position: { x: 400, y: 0 }, config: { agentFilter: "all" } },
        { id: "n2", type: "agent", label: "Tier 1 Support", position: { x: 400, y: 160 }, config: { memberId: "tier-1" } },
        { id: "n3", type: "if_condition", label: "Resolved?", position: { x: 400, y: 320 }, config: { field: "resolved", operator: "equals", value: "false" } },
        { id: "n4", type: "agent", label: "Tier 2 Support", position: { x: 400, y: 480 }, config: { memberId: "tier-2" } },
        { id: "n5", type: "if_condition", label: "Resolved?", position: { x: 400, y: 640 }, config: { field: "resolved", operator: "equals", value: "false" } },
        { id: "n6", type: "approval_gate", label: "Approval Gate", position: { x: 400, y: 800 }, config: { approverEmail: "", timeoutMinutes: 60 } },
        { id: "n7", type: "send_email", label: "Escalation Email", position: { x: 400, y: 960 }, config: { to: "", subject: "escalation", body: "" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4", sourceHandle: "true", condition: "resolved == false" },
        { sourceId: "n4", targetId: "n5" },
        { sourceId: "n5", targetId: "n6", sourceHandle: "true", condition: "resolved == false" },
        { sourceId: "n6", targetId: "n7" },
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
    industry: "Allgemein",
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
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_manual", label: "Manual Trigger", position: { x: 400, y: 0 }, config: {} },
        { id: "n2", type: "agent", label: "Researcher", position: { x: 400, y: 160 }, config: { memberId: "researcher" } },
        { id: "n3", type: "agent", label: "Writer", position: { x: 400, y: 320 }, config: { memberId: "writer" } },
        { id: "n4", type: "agent", label: "Editor", position: { x: 400, y: 480 }, config: { memberId: "editor" } },
        { id: "n5", type: "send_email", label: "Content Ready", position: { x: 400, y: 640 }, config: { to: "", subject: "content ready", body: "" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4" },
        { sourceId: "n4", targetId: "n5" },
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
    industry: "Allgemein",
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
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_webhook", label: "Webhook Trigger", position: { x: 400, y: 0 }, config: { method: "POST", path: "" } },
        { id: "n2", type: "agent", label: "Qualifier", position: { x: 400, y: 160 }, config: { memberId: "qualifier" } },
        { id: "n3", type: "if_condition", label: "Qualified?", position: { x: 400, y: 320 }, config: { field: "qualified", operator: "equals", value: "true" } },
        { id: "n4", type: "agent", label: "Booker", position: { x: 400, y: 480 }, config: { memberId: "booker" } },
        { id: "n5", type: "send_email", label: "Appointment Confirmed", position: { x: 400, y: 640 }, config: { to: "", subject: "appointment confirmed", body: "" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4", sourceHandle: "true", condition: "qualified == true" },
        { sourceId: "n4", targetId: "n5" },
      ],
    },
  },

  // ── Branchenspezifische Templates ──

  {
    id: "shk-betrieb-lead-pipeline",
    legacyAliases: ["shk", "plumbing-hvac"],
    name: "SHK-Betrieb Lead Pipeline",
    description:
      "Qualifiziert Anfragen für SHK-Betriebe, bewertet Dringlichkeit und Auftragsart, und vereinbart Besichtigungstermine mit automatischem Follow-Up.",
    goal:
      "Lead-Pipeline für {{businessName}} im Bereich SHK/Handwerk: Anfragen qualifizieren, nach Dringlichkeit priorisieren und Besichtigungstermine buchen.",
    category: "Workflow Templates",
    industry: "Handwerk",
    orchestration: {
      mode: "Qualifikation mit Dringlichkeits-Routing",
      description:
        "Qualifier bewertet die Anfrage. Notfälle (Score 90+) werden direkt zum Booker geroutet, Standard-Anfragen erhalten erst ein Follow-Up.",
      connections: [
        {
          from: "qualifier",
          to: "booker",
          condition:
            "Wenn der Lead-Score über 70 liegt oder es sich um einen Notfall handelt (Rohrbruch, Heizungsausfall), direkt zum Termin-Agenten weiterleiten.",
        },
        {
          from: "qualifier",
          to: "follow-up",
          condition:
            "Wenn der Lead-Score 70 oder darunter liegt (Standard-Installation, Beratungswunsch), eine Nachfass-Email mit Zusammenfassung senden.",
        },
      ],
    },
    agents: [
      {
        key: "qualifier",
        name: "SHK-Qualifier",
        description:
          "Begrüßt Kunden, fragt nach Art der Arbeit, Dringlichkeit und Gebäudetyp, bewertet den Lead.",
        responsibilities:
          "Anfrage qualifizieren, Kontaktdaten erfassen, Lead-Score vergeben und an den richtigen nächsten Schritt weiterleiten.",
        systemPrompt:
          "Sie sind ein freundlicher Assistent für einen SHK-Betrieb ({{businessName}}). Fragen Sie nach: Art der Arbeit (Heizung, Sanitär, Klima), Dringlichkeit, PLZ-Gebiet, Gebäudetyp (Einfamilienhaus, Mehrfamilienhaus, Gewerbe). Bewerten Sie den Lead 1-100. Notfälle wie Rohrbruch oder Heizungsausfall im Winter erhalten automatisch Score 90+. Standard-Installationen liegen bei 50-70. Reine Informationsanfragen bei 20-40. Erfassen Sie die E-Mail-Adresse des Kunden.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "Willkommen bei {{businessName}}! Wie können wir Ihnen helfen? Beschreiben Sie kurz Ihr Anliegen — ob Heizung, Sanitär oder Klima.",
        suggestedQuestions: [
          "Ich habe ein Problem mit meiner Heizung",
          "Wir planen eine Badsanierung",
          "Ich brauche einen Notdienst",
          "Was kostet eine Wärmepumpe?",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
          { type: "SCORE_LEAD", enabled: true, config: {} },
        ],
      },
      {
        key: "booker",
        name: "SHK-Terminplaner",
        description:
          "Vereinbart Besichtigungstermine für qualifizierte Anfragen.",
        responsibilities:
          "Verfügbare Zeitfenster anbieten, Adresse bestätigen, Termin buchen und Bestätigung senden.",
        systemPrompt:
          "Sie sind der Terminplaner von {{businessName}}, einem SHK-Betrieb. Vereinbaren Sie einen Besichtigungstermin. Fragen Sie nach dem bevorzugten Zeitfenster (vormittags/nachmittags). Bestätigen Sie die vollständige Adresse. Bei Notfällen betonen Sie, dass ein Techniker schnellstmöglich kommt. Fassen Sie den Termin am Ende zusammen.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: FAST_MODEL,
        welcomeMessage:
          "Lassen Sie uns einen passenden Termin für die Besichtigung finden.",
        suggestedQuestions: [
          "Welcher Tag passt Ihnen am besten?",
          "Vormittags oder nachmittags?",
          "Wie lautet die Adresse für den Besuch?",
        ],
        actions: [{ type: "BOOK_APPOINTMENT", enabled: true, config: {} }],
      },
      {
        key: "follow-up",
        name: "SHK-Follow-Up",
        description:
          "Sendet eine freundliche Nachfass-Email mit Zusammenfassung des Anliegens.",
        responsibilities:
          "Anfrage zusammenfassen, hilfreiche Informationen zu Förderungen oder Kosten mitgeben und zum Rückruf einladen.",
        systemPrompt:
          "Sie sind der Follow-Up-Spezialist von {{businessName}}, einem SHK-Betrieb. Senden Sie eine freundliche Nachfass-Email. Fassen Sie das Anliegen des Kunden zusammen, geben Sie erste Informationen zu Kosten oder Fördermöglichkeiten (z.B. BAFA/KfW bei Wärmepumpen) und laden Sie zum Rückruf oder zur Terminvereinbarung ein.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: FAST_MODEL,
        actions: [{ type: "COLLECT_EMAIL", enabled: true, config: {} }],
      },
    ],
    marketplace: {
      welcomeMessage:
        "SHK-Lead-Pipeline mit Dringlichkeits-Bewertung, Terminbuchung und automatischem Follow-Up.",
      suggestedQuestions: [
        "Wie werden Notfälle priorisiert?",
        "Welche Informationen werden abgefragt?",
        "Kann ich die Bewertungskriterien anpassen?",
      ],
    },
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_lead", label: "Lead Captured", position: { x: 400, y: 0 }, config: { agentFilter: "all" } },
        { id: "n2", type: "agent", label: "Qualifier", position: { x: 400, y: 160 }, config: { memberId: "qualifier" } },
        { id: "n3", type: "if_condition", label: "Score > 80?", position: { x: 400, y: 320 }, config: { field: "score", operator: "gt", value: "80" } },
        { id: "n4", type: "agent", label: "Booker", position: { x: 200, y: 480 }, config: { memberId: "booker" } },
        { id: "n5", type: "send_email", label: "Termin bestätigt", position: { x: 200, y: 640 }, config: { to: "", subject: "Termin bestätigt", body: "" } },
        { id: "n6", type: "agent", label: "Follow-Up", position: { x: 600, y: 480 }, config: { memberId: "follow-up" } },
        { id: "n7", type: "delay", label: "Warte 2 Tage", position: { x: 600, y: 640 }, config: { duration: 2, unit: "days" } },
        { id: "n8", type: "send_email", label: "Nachfass", position: { x: 600, y: 800 }, config: { to: "", subject: "Nachfass", body: "" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4", sourceHandle: "true", condition: "score > 80" },
        { sourceId: "n3", targetId: "n6", sourceHandle: "false", condition: "score <= 80" },
        { sourceId: "n4", targetId: "n5" },
        { sourceId: "n6", targetId: "n7" },
        { sourceId: "n7", targetId: "n8" },
      ],
    },
  },
  {
    id: "immobilienmakler-pipeline",
    legacyAliases: ["immobilien", "real-estate-pipeline"],
    name: "Immobilienmakler Besichtigungs-Pipeline",
    description:
      "Qualifiziert Immobilien-Interessenten nach Kriterien, schlägt passende Objekte vor und vereinbart Besichtigungstermine.",
    goal:
      "Besichtigungs-Pipeline für {{businessName}}: Interessenten qualifizieren, passende Objekte matchen und Besichtigungstermine buchen.",
    category: "Workflow Templates",
    industry: "Immobilien",
    orchestration: {
      mode: "Qualifikation → Matching → Besichtigung",
      description:
        "Qualifier erfasst Suchkriterien, Matcher schlägt passende Objekte vor, Booker vereinbart die Besichtigung.",
      connections: [
        {
          from: "qualifier",
          to: "matcher",
          condition:
            "Sobald Budget, Lage, Zimmeranzahl und Einzugszeitpunkt erfasst sind, an den Objekt-Matcher weiterleiten.",
        },
        {
          from: "matcher",
          to: "booker",
          condition:
            "Wenn der Interessent sich für ein oder mehrere Objekte interessiert, an den Besichtigungs-Planer weiterleiten.",
        },
      ],
    },
    agents: [
      {
        key: "qualifier",
        name: "Immobilien-Qualifier",
        description:
          "Erfasst die Suchkriterien des Interessenten: Kauf/Miete, Budget, Lage, Größe.",
        responsibilities:
          "Suchprofil erstellen, Kontaktdaten erfassen und Interessenten an den Matcher weiterleiten.",
        systemPrompt:
          "Sie sind Assistent eines Immobilienmaklers ({{businessName}}). Fragen Sie nach: Kauf oder Miete, Budget-Rahmen (monatlich oder Kaufpreis), gewünschte Lage/Stadtteil, Zimmeranzahl und Mindestgröße, gewünschter Einzugszeitpunkt. Erfassen Sie die E-Mail-Adresse. Bewerten Sie den Lead: Klares Budget + zeitnaher Einzug = hoher Score. Nur Informationssuche = niedriger Score.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "Willkommen bei {{businessName}}! Suchen Sie eine Immobilie zum Kauf oder zur Miete? Ich helfe Ihnen, das passende Objekt zu finden.",
        suggestedQuestions: [
          "Ich suche eine Wohnung zur Miete",
          "Was gibt es im Bereich 3-Zimmer?",
          "Welche Häuser sind aktuell verfügbar?",
          "Ich möchte eine Immobilie kaufen",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
          { type: "SCORE_LEAD", enabled: true, config: {} },
        ],
      },
      {
        key: "matcher",
        name: "Objekt-Matcher",
        description:
          "Schlägt passende Objekte basierend auf den Suchkriterien vor.",
        responsibilities:
          "Kriterien auswerten, 2-3 passende Objekte vorschlagen, Highlights beschreiben und Interesse abfragen.",
        systemPrompt:
          "Sie sind der Objekt-Matching-Spezialist von {{businessName}}. Basierend auf den Kriterien des Interessenten (Kauf/Miete, Budget, Lage, Zimmer, Einzug), schlagen Sie 2-3 passende Objekte vor. Beschreiben Sie die Highlights jedes Objekts: Lage-Vorteile, Ausstattung, Preis-Leistung. Fragen Sie, welches Objekt besichtigt werden soll.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: PRIMARY_MODEL,
      },
      {
        key: "booker",
        name: "Besichtigungs-Planer",
        description:
          "Vereinbart Besichtigungstermine für ausgewählte Objekte.",
        responsibilities:
          "Terminwünsche erfassen, Besichtigung koordinieren und Bestätigung mit Objekt-Details senden.",
        systemPrompt:
          "Sie sind der Besichtigungs-Planer von {{businessName}}. Vereinbaren Sie einen Besichtigungstermin für das gewünschte Objekt. Fragen Sie nach bevorzugtem Tag und Uhrzeit. Bestätigen Sie Objekt-Adresse, Zeitpunkt und was der Interessent mitbringen sollte (Ausweis, ggf. Einkommensnachweise bei Miete).",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "matcher",
        llmModel: FAST_MODEL,
        welcomeMessage:
          "Wunderbar! Lassen Sie uns einen Besichtigungstermin vereinbaren.",
        suggestedQuestions: [
          "Wann hätten Sie Zeit für eine Besichtigung?",
          "Soll ich mehrere Termine vorschlagen?",
          "Kommen Sie alleine oder zu zweit?",
        ],
        actions: [{ type: "BOOK_APPOINTMENT", enabled: true, config: {} }],
      },
    ],
    marketplace: {
      welcomeMessage:
        "Immobilien-Pipeline mit Interessenten-Qualifikation, Objekt-Matching und Besichtigungsbuchung.",
      suggestedQuestions: [
        "Wie werden Interessenten qualifiziert?",
        "Wie funktioniert das Objekt-Matching?",
        "Kann ich eigene Objekte hinterlegen?",
      ],
    },
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_webhook", label: "Webhook Trigger", position: { x: 400, y: 0 }, config: { method: "POST", path: "" } },
        { id: "n2", type: "agent", label: "Qualifier", position: { x: 400, y: 160 }, config: { memberId: "qualifier" } },
        { id: "n3", type: "agent", label: "Matcher", position: { x: 400, y: 320 }, config: { memberId: "matcher" } },
        { id: "n4", type: "if_condition", label: "Matched?", position: { x: 400, y: 480 }, config: { field: "matched", operator: "equals", value: "true" } },
        { id: "n5", type: "agent", label: "Booker", position: { x: 400, y: 640 }, config: { memberId: "booker" } },
        { id: "n6", type: "send_email", label: "Besichtigung gebucht", position: { x: 400, y: 800 }, config: { to: "", subject: "Besichtigung gebucht", body: "" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4" },
        { sourceId: "n4", targetId: "n5", sourceHandle: "true", condition: "matched == true" },
        { sourceId: "n5", targetId: "n6" },
      ],
    },
  },
  {
    id: "coach-erstgespraech-pipeline",
    legacyAliases: ["coach", "coaching-pipeline"],
    name: "Coach/Berater Erstgespräch-Pipeline",
    description:
      "Qualifiziert Coaching-Interessenten, identifiziert Herausforderungen und vereinbart kostenlose Erstgespräche.",
    goal:
      "Erstgespräch-Pipeline für {{businessName}}: Coaching-Interessenten qualifizieren und Erstgespräche buchen.",
    category: "Workflow Templates",
    industry: "Beratung",
    orchestration: {
      mode: "Qualifikation → Erstgespräch-Buchung",
      description:
        "Qualifier erfasst Herausforderung und Coaching-Erfahrung, Scheduler bucht das kostenlose Erstgespräch.",
      connections: [
        {
          from: "qualifier",
          to: "scheduler",
          condition:
            "Wenn die Herausforderung klar ist und Interesse an einem Erstgespräch besteht, an den Scheduler weiterleiten.",
        },
      ],
    },
    agents: [
      {
        key: "qualifier",
        name: "Coaching-Qualifier",
        description:
          "Erfasst die Herausforderung und den Coaching-Bedarf des Interessenten.",
        responsibilities:
          "Bedarf analysieren, Erfahrung mit Coaching erfragen, Budget-Vorstellung klären und zum Erstgespräch einladen.",
        systemPrompt:
          "Sie sind Assistent eines Business-Coaches ({{businessName}}). Fragen Sie nach: Aktuelle Herausforderung (Führung, Skalierung, Work-Life-Balance, Karriere), Unternehmensgröße (Solo/KMU/Konzern), bisherige Erfahrung mit Coaching, Budget-Vorstellung (grober Rahmen). Hören Sie aktiv zu. Zeigen Sie Verständnis für die Situation. Betonen Sie, dass ein kostenloses 15-Minuten Erstgespräch der beste nächste Schritt ist, um zu prüfen ob Coaching passt.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "Willkommen bei {{businessName}}! Ich helfe Ihnen herauszufinden, wie Business-Coaching Sie weiterbringen kann. Was beschäftigt Sie gerade am meisten?",
        suggestedQuestions: [
          "Ich brauche Hilfe beim Führen meines Teams",
          "Wie kann Coaching mir bei der Skalierung helfen?",
          "Was kostet Business-Coaching?",
          "Kann ich ein Erstgespräch buchen?",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
          { type: "SCORE_LEAD", enabled: true, config: {} },
        ],
      },
      {
        key: "scheduler",
        name: "Erstgespräch-Planer",
        description:
          "Vereinbart ein kostenloses 15-Minuten Erstgespräch und betont den Mehrwert.",
        responsibilities:
          "Erstgespräch buchen, Vorteile des Gesprächs betonen, Erwartungen setzen und Bestätigung senden.",
        systemPrompt:
          "Sie sind der Erstgespräch-Planer von {{businessName}}. Vereinbaren Sie ein kostenloses 15-Minuten Erstgespräch. Betonen Sie den Mehrwert: Im Gespräch wird die aktuelle Situation analysiert, erste Impulse gegeben und geprüft ob ein Coaching-Programm sinnvoll ist — alles unverbindlich. Fragen Sie nach bevorzugtem Tag und Uhrzeit. Bestätigen Sie den Termin mit einer kurzen Zusammenfassung der besprochenen Herausforderung.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: FAST_MODEL,
        welcomeMessage:
          "Lassen Sie uns einen passenden Termin für Ihr kostenloses Erstgespräch finden.",
        suggestedQuestions: [
          "Welcher Tag passt Ihnen?",
          "Lieber vormittags oder nachmittags?",
          "Wie lange dauert das Erstgespräch?",
        ],
        actions: [{ type: "BOOK_APPOINTMENT", enabled: true, config: {} }],
      },
    ],
    marketplace: {
      welcomeMessage:
        "Coaching-Pipeline mit Bedarfsanalyse und automatischer Erstgespräch-Buchung.",
      suggestedQuestions: [
        "Welche Fragen werden gestellt?",
        "Wie wird der Mehrwert des Erstgesprächs kommuniziert?",
        "Kann ich die Coaching-Themen anpassen?",
      ],
    },
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_lead", label: "Lead Captured", position: { x: 400, y: 0 }, config: { agentFilter: "all" } },
        { id: "n2", type: "agent", label: "Qualifier", position: { x: 400, y: 160 }, config: { memberId: "qualifier" } },
        { id: "n3", type: "if_condition", label: "Qualified?", position: { x: 400, y: 320 }, config: { field: "qualified", operator: "equals", value: "true" } },
        { id: "n4", type: "agent", label: "Scheduler", position: { x: 400, y: 480 }, config: { memberId: "scheduler" } },
        { id: "n5", type: "send_email", label: "Erstgespräch bestätigt", position: { x: 400, y: 640 }, config: { to: "", subject: "Erstgespräch bestätigt", body: "" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4", sourceHandle: "true", condition: "qualified == true" },
        { sourceId: "n4", targetId: "n5" },
      ],
    },
  },
  {
    id: "kuechenstudio-pipeline",
    legacyAliases: ["kueche", "kitchen-pipeline"],
    name: "Küchenstudio Beratungs-Pipeline",
    description:
      "Erfasst Küchenwünsche, präsentiert passende Konzepte mit Preisrahmen und vereinbart Showroom-Besuche.",
    goal:
      "Beratungs-Pipeline für {{businessName}}: Küchenwünsche qualifizieren, Konzepte präsentieren und Showroom-Termine buchen.",
    category: "Workflow Templates",
    industry: "Handwerk",
    orchestration: {
      mode: "Bedarfsanalyse → Konzept-Vorschlag → Showroom-Termin",
      description:
        "Qualifier erfasst Wünsche, Designer präsentiert Konzepte, Booker vereinbart den Showroom-Besuch.",
      connections: [
        {
          from: "qualifier",
          to: "designer",
          condition:
            "Sobald Küchentyp, Budget und Stil-Vorstellung erfasst sind, an den Küchen-Designer weiterleiten.",
        },
        {
          from: "designer",
          to: "booker",
          condition:
            "Wenn der Kunde sich für ein Konzept interessiert oder eine persönliche Beratung wünscht, an den Showroom-Planer weiterleiten.",
        },
      ],
    },
    agents: [
      {
        key: "qualifier",
        name: "Küchen-Berater",
        description:
          "Erfasst die Küchenwünsche: Neubau/Renovierung, Budget, Stil, Zeitrahmen.",
        responsibilities:
          "Bedarf analysieren, Kontaktdaten erfassen und an den Küchen-Designer weiterleiten.",
        systemPrompt:
          "Sie sind Berater in einem Küchenstudio ({{businessName}}). Fragen Sie nach: Küchentyp (Neubau oder Renovierung), Budget-Rahmen (grobe Vorstellung reicht), Stil-Vorstellung (modern, klassisch, Landhausstil, minimalistisch), gewünschter Zeitrahmen für Umsetzung, besondere Wünsche (Kochinsel, bestimmte Geräte, Stauraum). Seien Sie begeistert und inspirierend. Erfassen Sie die E-Mail-Adresse.",
        agentMode: "CHAT",
        role: "COORDINATOR",
        llmModel: PRIMARY_MODEL,
        welcomeMessage:
          "Willkommen bei {{businessName}}! Planen Sie eine neue Küche oder möchten Sie Ihre bestehende Küche renovieren? Erzählen Sie mir von Ihrem Traum-Küchenprojekt!",
        suggestedQuestions: [
          "Wir planen eine neue Küche für unseren Neubau",
          "Was kostet eine Küche mit Kochinsel?",
          "Welche Küchenstile sind aktuell beliebt?",
          "Können wir einen Showroom-Termin vereinbaren?",
        ],
        actions: [
          { type: "COLLECT_EMAIL", enabled: true, config: {} },
          { type: "SCORE_LEAD", enabled: true, config: {} },
        ],
      },
      {
        key: "designer",
        name: "Küchen-Designer",
        description:
          "Präsentiert 2-3 passende Küchen-Konzepte mit Preisrahmen basierend auf den Wünschen.",
        responsibilities:
          "Konzepte erstellen, Preisrahmen kommunizieren, Highlights hervorheben und Interesse für Showroom-Besuch wecken.",
        systemPrompt:
          "Sie sind der Küchen-Design-Spezialist von {{businessName}}. Basierend auf den Wünschen des Kunden (Typ, Budget, Stil, Zeitrahmen), beschreiben Sie 2-3 passende Küchen-Konzepte. Für jedes Konzept: Name/Stil, Highlights (Materialien, Geräte, besondere Features), realistischer Preisrahmen, Umsetzungsdauer. Empfehlen Sie einen Showroom-Besuch für die persönliche Beratung und haptische Erfahrung der Materialien.",
        agentMode: "TASK",
        role: "EXECUTOR",
        reportsTo: "qualifier",
        llmModel: PRIMARY_MODEL,
      },
      {
        key: "booker",
        name: "Showroom-Planer",
        description:
          "Vereinbart einen Showroom-Besuch mit persönlicher Beratung.",
        responsibilities:
          "Termin koordinieren, Erwartungen setzen und Bestätigung mit Anfahrt und Vorbereitung senden.",
        systemPrompt:
          "Sie sind der Showroom-Planer von {{businessName}}. Vereinbaren Sie einen Showroom-Besuch mit persönlicher Beratung. Fragen Sie nach bevorzugtem Tag und Uhrzeit. Erwähnen Sie: Im Showroom können Materialien und Geräte live erlebt werden, ein Küchenplaner erstellt ein 3D-Konzept, und es gibt unverbindliche Angebote. Senden Sie eine Bestätigung mit Adresse und Parkmöglichkeiten.",
        agentMode: "CHAT",
        role: "EXECUTOR",
        reportsTo: "designer",
        llmModel: FAST_MODEL,
        welcomeMessage:
          "Wunderbar! Vereinbaren wir einen Showroom-Besuch, damit Sie Ihre Traumküche live erleben können.",
        suggestedQuestions: [
          "Wann kann ich den Showroom besuchen?",
          "Wie lange dauert eine Beratung?",
          "Muss ich etwas mitbringen?",
        ],
        actions: [{ type: "BOOK_APPOINTMENT", enabled: true, config: {} }],
      },
    ],
    marketplace: {
      welcomeMessage:
        "Küchenstudio-Pipeline mit Bedarfsanalyse, Konzept-Präsentation und Showroom-Buchung.",
      suggestedQuestions: [
        "Wie werden Küchenwünsche erfasst?",
        "Wie funktioniert die Konzept-Präsentation?",
        "Kann ich eigene Küchen-Konzepte hinterlegen?",
      ],
    },
    workflow: {
      nodes: [
        { id: "n1", type: "trigger_chat", label: "Chat Started", position: { x: 400, y: 0 }, config: { agentFilter: "all" } },
        { id: "n2", type: "agent", label: "Qualifier", position: { x: 400, y: 160 }, config: { memberId: "qualifier" } },
        { id: "n3", type: "agent", label: "Designer", position: { x: 400, y: 320 }, config: { memberId: "designer" } },
        { id: "n4", type: "agent", label: "Booker", position: { x: 400, y: 480 }, config: { memberId: "booker" } },
        { id: "n5", type: "send_email", label: "Beratungstermin", position: { x: 400, y: 640 }, config: { to: "", subject: "Beratungstermin", body: "" } },
      ],
      edges: [
        { sourceId: "n1", targetId: "n2" },
        { sourceId: "n2", targetId: "n3" },
        { sourceId: "n3", targetId: "n4" },
        { sourceId: "n4", targetId: "n5" },
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
    industry: template.industry || "Allgemein",
    agentCount: template.agents.filter((agent) => agent.role !== "APPROVAL_GATE").length,
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
      config:
        agent.config &&
        typeof agent.config === "object" &&
        !Array.isArray(agent.config)
          ? Object.fromEntries(
              Object.entries(agent.config as Record<string, unknown>).map(
                ([key, value]) => [
                  key,
                  typeof value === "string" ? fillTemplate(value, context) : value,
                ]
              )
            )
          : agent.config,
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
      agentMode: agent.role === "APPROVAL_GATE" ? "APPROVAL" : agent.agentMode,
      role: agent.role,
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
        name: configured.teamName,
        description: configured.description,
        goal: configured.goal,
      },
    });

    const memberIds = new Map<string, string>();
    const agentIdsByKey = new Map<string, string>();
    const agentIds: string[] = [];

    for (const agentDef of configured.agents) {
      if (agentDef.role === "APPROVAL_GATE") {
        const member = await tx.agentTeamMember.create({
          data: {
            teamId: team.id,
            role: agentDef.role,
            level: levelMap[agentDef.role],
            responsibilities: agentDef.responsibilities,
            config:
              agentDef.config &&
              typeof agentDef.config === "object" &&
              !Array.isArray(agentDef.config)
                ? {
                    approverEmail: userEmail,
                    ...(agentDef.config as Record<string, unknown>),
                    label:
                      customization?.agentNames?.[agentDef.key]?.trim() ||
                      agentDef.name,
                  }
                : {
                    approverEmail: userEmail,
                    label:
                      customization?.agentNames?.[agentDef.key]?.trim() ||
                      agentDef.name,
                  },
          },
        });

        memberIds.set(agentDef.key, member.id);
        continue;
      }

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

    // Speichere Workflow-Nodes im Team-Config (falls vorhanden)
    if (template.workflow) {
      // Resolve agent keys → real memberId + agentId in workflow nodes
      const resolvedNodes = template.workflow.nodes.map((node) => {
        if (node.type === "agent" && node.config.memberId) {
          const agentKey = String(node.config.memberId);
          return {
            ...node,
            config: {
              ...node.config,
              memberId: memberIds.get(agentKey) || agentKey,
            },
            agentId: agentIdsByKey.get(agentKey) || undefined,
          };
        }
        return node;
      });

      await tx.agentTeam.update({
        where: { id: team.id },
        data: {
          config: JSON.parse(JSON.stringify({
            workflow: {
              nodes: resolvedNodes,
              edges: template.workflow.edges,
            },
          })),
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
