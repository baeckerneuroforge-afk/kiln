import type { IndustryTemplateDefinition, OnboardingIndustry } from "@/lib/onboarding/types";
import { dentalIndustryTemplate } from "@/lib/industries/dental";

const sharedSchedulerPrompt =
  "Coordinate appointment requests. Ask for missing details, propose clear next steps, and keep customer-facing drafts concise.";

export const INDUSTRY_TEMPLATES: IndustryTemplateDefinition[] = [
  dentalIndustryTemplate,
  {
    industry: "kfz",
    displayName: "KFZ",
    displayNameDe: "KFZ-Werkstatt",
    description: "Workshop bookings, estimates, tire-season intake, and WhatsApp image handling.",
    descriptionDe: "Werkstatt-Termine, Kostenvoranschläge, Reifenwechsel-Saison und WhatsApp-Bilder.",
    recommendedChannels: ["email", "whatsapp", "webchat"],
    sortOrder: 20,
    iconName: "Car",
    knowledgeBaseSeeds: [
      { title: "Reparatur-Standards", content: "Standardinformationen zu Diagnose, HU/AU, Inspektion, Ölwechsel, Bremsen und Ersatzteilen." },
      { title: "Inspektionspakete", content: "Beschreibung kleiner und großer Inspektionen, übliche Dauer und benötigte Fahrzeugdaten." },
    ],
    departmentTemplates: [
      {
        id: "werkstatt-termin",
        name: "Werkstatt-Termin Department",
        description: "Collects vehicle details and prepares booking replies.",
        defaultSelected: true,
        workers: [
          { role: "TRIAGE", name: "Werkstatt Triage", description: "Classifies service requests.", prompt: "Classify vehicle service requests by urgency, required data, and likely department.", priority: 100 },
          { role: "SCHEDULER", name: "Werkstatt Scheduler", description: "Drafts appointment replies.", prompt: "Collect make, model, plate, mileage, symptoms, and preferred dates before drafting appointment replies.", priority: 80 },
        ],
      },
      {
        id: "kostenvoranschlag",
        name: "Kostenvoranschlag Department",
        description: "Drafts estimate intake and escalation summaries.",
        defaultSelected: true,
        workers: [
          { role: "ESTIMATE_TRIAGE", name: "KVA Triage", description: "Identifies estimate scope.", prompt: "Extract repair scope, photos mentioned, parts, and risk from estimate requests.", priority: 90 },
          { role: "DRAFTER", name: "KVA Drafter", description: "Drafts estimate request replies.", prompt: "Draft replies requesting missing vehicle and damage information. Do not invent prices.", priority: 70 },
        ],
      },
      {
        id: "reifenwechsel-saison",
        name: "Reifenwechsel-Saison Department",
        description: "Handles seasonal tire-change surges.",
        defaultSelected: true,
        seasonal: true,
        workers: [
          { role: "SEASONAL_ROUTER", name: "Reifenwechsel Router", description: "Routes tire-season requests.", prompt: "Classify tire-change requests and collect tire storage, size, and preferred date information.", priority: 80 },
        ],
      },
      {
        id: "whatsapp-bilder",
        name: "WhatsApp Inbound mit Bilder-Verarbeitung",
        description: "Captures WhatsApp damage photos for human review.",
        defaultSelected: true,
        workers: [
          { role: "IMAGE_INTAKE", name: "Bild Intake", description: "Summarizes photo-based requests.", prompt: "Summarize customer-provided images and text. Flag visual uncertainty clearly.", priority: 80 },
        ],
      },
    ],
  },
  {
    industry: "shk",
    displayName: "SHK",
    displayNameDe: "Sanitär/Heizung/Klima",
    description: "Emergency triage, service appointment requests, and after-hours voice intake.",
    descriptionDe: "Notfall-Triage, Termin-Anfragen und Notfall-Voice-Agent.",
    recommendedChannels: ["email", "whatsapp", "voice"],
    sortOrder: 30,
    iconName: "Wrench",
    knowledgeBaseSeeds: [
      { title: "Notfall-Hotline-Times", content: "Regeln für Wasserrohrbruch, Heizungsausfall, Gasgeruch, Klimaanlagenstörung und Rückrufpriorität." },
      { title: "Service-Bereich", content: "Orte, Postleitzahlen und Servicegrenzen für Notdienst und reguläre Wartung." },
    ],
    departmentTemplates: [
      {
        id: "notfall-triage",
        name: "Notfall-Triage Department",
        description: "Classifies urgent HVAC and plumbing issues.",
        defaultSelected: true,
        workers: [
          { role: "URGENT_CLASSIFIER", name: "Notfall Classifier", description: "Detects emergency severity.", prompt: "Classify SHK requests by emergency severity and safety risk. Escalate gas, water damage, and heating outage risks.", priority: 100 },
          { role: "DISPATCHER", name: "Notfall Dispatcher", description: "Drafts dispatch summaries.", prompt: "Draft structured dispatch summaries with address, symptoms, risk, and callback details.", priority: 90 },
        ],
      },
      {
        id: "termin-anfrage",
        name: "Termin-Anfrage Department",
        description: "Handles standard maintenance and repair appointments.",
        defaultSelected: true,
        workers: [
          { role: "SCHEDULER", name: "SHK Scheduler", description: "Prepares appointment drafts.", prompt: sharedSchedulerPrompt, priority: 80 },
        ],
      },
      {
        id: "voice-notfaelle",
        name: "Voice Agent für Notfälle",
        description: "Captures after-hours emergency voice messages.",
        defaultSelected: true,
        premium: true,
        workers: [
          { role: "CALL_TRIAGE", name: "Notfall Call Triage", description: "Extracts emergency call details.", prompt: "Extract risk, address, callback number, and urgency from emergency call transcripts.", priority: 90 },
        ],
      },
    ],
  },
  {
    industry: "restaurant",
    displayName: "Restaurant",
    displayNameDe: "Restaurant",
    description: "Reservation and catering/order inquiries.",
    descriptionDe: "Reservierungen sowie Catering- und Bestellanfragen.",
    recommendedChannels: ["email", "whatsapp", "webchat"],
    sortOrder: 40,
    iconName: "Utensils",
    knowledgeBaseSeeds: [
      { title: "Speisekarte", content: "Gerichte, Allergene, vegetarische Optionen, Kindergerichte und saisonale Angebote." },
      { title: "Öffnungszeiten", content: "Reguläre Öffnungszeiten, Ruhetage, Küchenzeiten, Feiertage und Reservierungsfenster." },
      { title: "Allergene", content: "Hinweise zu Allergenen, Unverträglichkeiten und Rückfragepflicht bei Unsicherheit." },
    ],
    departmentTemplates: [
      {
        id: "reservierung",
        name: "Reservierung Department",
        description: "Collects party size, date, time, and special requests.",
        defaultSelected: true,
        workers: [
          { role: "RESERVATION_TRIAGE", name: "Reservierung Triage", description: "Classifies reservation requests.", prompt: "Extract date, time, party size, name, phone, and special requests.", priority: 100 },
          { role: "CONFIRMATOR", name: "Reservierung Confirmator", description: "Drafts confirmation replies.", prompt: "Draft concise reservation confirmations or missing-information requests.", priority: 80 },
        ],
      },
      {
        id: "catering-anfrage",
        name: "Bestell-Anfragen Department",
        description: "Handles catering, group, and delivery inquiries.",
        defaultSelected: true,
        workers: [
          { role: "ORDER_TRIAGE", name: "Bestellung Triage", description: "Routes catering and delivery requests.", prompt: "Extract event date, guest count, delivery/pickup, budget, and dietary constraints.", priority: 90 },
        ],
      },
    ],
  },
  {
    industry: "property",
    displayName: "Property Management",
    displayNameDe: "Hausverwaltung",
    description: "Tenant inquiries and damage reports with photo intake.",
    descriptionDe: "Mieter-Anfragen und Schaden-Meldungen mit Bilder-Upload.",
    recommendedChannels: ["email", "whatsapp", "webchat"],
    sortOrder: 50,
    iconName: "Building2",
    knowledgeBaseSeeds: [
      { title: "Mietvertrag-Standards", content: "Standardantworten zu Nebenkosten, Haustieren, Kündigung, Schlüssel, Hausordnung und Reparaturmeldung." },
      { title: "Notfall-Hausmeister", content: "Regeln für Wasser, Strom, Heizung, Aufzug, Schimmel, Einbruch und Hausmeisterkontakte." },
    ],
    departmentTemplates: [
      {
        id: "mieter-anfrage",
        name: "Mieter-Anfrage Department",
        description: "Answers common tenant questions and escalates account-sensitive topics.",
        defaultSelected: true,
        workers: [
          { role: "TENANT_TRIAGE", name: "Mieter Triage", description: "Classifies tenant inquiries.", prompt: "Classify tenant inquiries and identify legal, payment, or urgent maintenance risks.", priority: 100 },
          { role: "DRAFTER", name: "Mieter Antwort Drafter", description: "Drafts tenant replies.", prompt: "Draft polite tenant replies using KB context. Escalate legal and payment disputes.", priority: 80 },
        ],
      },
      {
        id: "schaden-meldung",
        name: "Schaden-Meldung Department",
        description: "Captures damage reports and photo context.",
        defaultSelected: true,
        workers: [
          { role: "PHOTO_INTAKE", name: "Schaden Foto Intake", description: "Summarizes damage photo reports.", prompt: "Extract damage type, location, urgency, photos mentioned, and missing details.", priority: 90 },
          { role: "ESCALATOR", name: "Schaden Escalator", description: "Prepares escalation summaries.", prompt: "Prepare maintenance escalation summaries with risk and next action.", priority: 70 },
        ],
      },
    ],
  },
  {
    industry: "fitness",
    displayName: "Fitness",
    displayNameDe: "Fitnessstudio",
    description: "Trial training and membership inquiries.",
    descriptionDe: "Probetraining und Mitgliedschafts-Anfragen.",
    recommendedChannels: ["email", "whatsapp", "webchat"],
    sortOrder: 60,
    iconName: "Dumbbell",
    knowledgeBaseSeeds: [
      { title: "Kursplan", content: "Kurszeiten, Trainer, Level, Buchungsregeln und Wartelisten." },
      { title: "Preise", content: "Mitgliedschaftsmodelle, Startgebühr, Kündigungsfrist, Pausenregelung und Rabatte." },
      { title: "Trainer-Profile", content: "Schwerpunkte der Trainer, Personal Training, Reha, Kraft, Ausdauer und Ernährung." },
    ],
    departmentTemplates: [
      {
        id: "probetraining",
        name: "Probetraining Department",
        description: "Collects lead details and drafts trial booking replies.",
        defaultSelected: true,
        workers: [
          { role: "LEAD_TRIAGE", name: "Probetraining Triage", description: "Classifies training goals.", prompt: "Extract training goals, experience, preferred times, and contact details.", priority: 100 },
          { role: "BOOKER", name: "Probetraining Booker", description: "Drafts trial booking replies.", prompt: "Draft motivating trial training replies with clear next steps.", priority: 80 },
        ],
      },
      {
        id: "mitgliedschaft",
        name: "Mitgliedschafts-Anfrage Department",
        description: "Answers membership and pricing questions.",
        defaultSelected: true,
        workers: [
          { role: "MEMBERSHIP_ADVISOR", name: "Mitgliedschaft Advisor", description: "Drafts membership replies.", prompt: "Draft clear membership guidance and invite prospects to a trial or consultation.", priority: 80 },
        ],
      },
    ],
  },
  {
    industry: "custom",
    displayName: "Custom",
    displayNameDe: "Individuell",
    description: "Start from an empty configuration and add templates manually.",
    descriptionDe: "Leerer Startpunkt für individuelle Setups.",
    recommendedChannels: ["email", "webchat"],
    sortOrder: 70,
    iconName: "Sparkles",
    knowledgeBaseSeeds: [],
    departmentTemplates: [],
  },
];

export function getIndustryTemplate(industry: OnboardingIndustry): IndustryTemplateDefinition | null {
  return INDUSTRY_TEMPLATES.find((template) => template.industry === industry) ?? null;
}

export function getIndustryOptions(): IndustryTemplateDefinition[] {
  return [...INDUSTRY_TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function toIndustryTemplateRow(template: IndustryTemplateDefinition) {
  return {
    industry: template.industry,
    displayName: template.displayName,
    displayNameDe: template.displayNameDe,
    description: template.description,
    descriptionDe: template.descriptionDe,
    departmentTemplates: template.departmentTemplates,
    knowledgeBaseSeeds: template.knowledgeBaseSeeds,
    recommendedChannels: template.recommendedChannels,
    metadata: template.metadata ?? null,
    isActive: true,
    sortOrder: template.sortOrder,
    iconName: template.iconName,
  };
}
