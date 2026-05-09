import type { IndustryTemplateDefinition, OnboardingIndustry } from "@/lib/onboarding/types";
import { dentalIndustryTemplate } from "@/lib/industries/dental";
import { kfzIndustryTemplate } from "@/lib/industries/kfz";
import { shkIndustryTemplate } from "@/lib/industries/shk";

export const INDUSTRY_TEMPLATES: IndustryTemplateDefinition[] = [
  dentalIndustryTemplate,
  kfzIndustryTemplate,
  shkIndustryTemplate,
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
