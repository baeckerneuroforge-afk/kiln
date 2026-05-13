/**
 * Email-string i18n. DE primary (DACH-first), EN as international fallback.
 *
 * Locale resolution order: explicit prop → User.preferredLanguage → "de".
 * Unknown locale values collapse to "de" so a corrupted column never breaks
 * a send.
 *
 * Translation keys are namespaced by template (`sub-org-invited.existing.*`)
 * to make it obvious which strings belong to which email when adding new
 * languages later. Interpolation uses `{var}` placeholders so the rendered
 * output is debuggable without a runtime template engine.
 */

export type Locale = "de" | "en";

export const SUPPORTED_LOCALES: ReadonlySet<Locale> = new Set(["de", "en"]);
export const DEFAULT_LOCALE: Locale = "de";

export function resolveLocale(value: string | null | undefined): Locale {
  if (value && SUPPORTED_LOCALES.has(value as Locale)) return value as Locale;
  return DEFAULT_LOCALE;
}

type TranslationDict = Record<string, string>;
type TranslationsByLocale = Record<Locale, TranslationDict>;

const TRANSLATIONS: TranslationsByLocale = {
  de: {
    // Sub-org invite — existing user (Path 2): instant access
    "sub-org-invited.existing.subject": "Du wurdest zu {subOrgName} hinzugefügt",
    "sub-org-invited.existing.preview":
      "{inviterName} hat dich zu {subOrgName} hinzugefügt",
    "sub-org-invited.existing.heading": "Willkommen bei {subOrgName}",
    "sub-org-invited.existing.greeting": "Hallo {recipientName},",
    "sub-org-invited.existing.body":
      "{inviterName} hat dich als {roleLabel} zu {subOrgName} hinzugefügt. Du kannst dich sofort einloggen und loslegen.",
    "sub-org-invited.existing.permission":
      "Dein Zugriff: {permissionLabel}.",
    "sub-org-invited.existing.cta": "Workspace öffnen",

    // Sub-org invite — new email (Path 1): supplement to Clerk's sign-up mail
    "sub-org-invited.new.subject": "Einladung zu {subOrgName} bei {brandName}",
    "sub-org-invited.new.preview":
      "{inviterName} lädt dich zu {subOrgName} ein",
    "sub-org-invited.new.heading": "Du wurdest eingeladen",
    "sub-org-invited.new.greeting": "Hallo,",
    "sub-org-invited.new.body":
      "{inviterName} lädt dich als {roleLabel} zu {subOrgName} ein — verwaltet über {brandName}. Eine separate E-Mail zur Konto-Erstellung folgt von uns.",
    "sub-org-invited.new.permission":
      "Dein geplanter Zugriff: {permissionLabel}.",
    "sub-org-invited.new.cta": "Mehr über {brandName}",

    // Agency-team invite
    "agency-member-invited.subject":
      "Einladung in das {brandName}-Team",
    "agency-member-invited.preview":
      "{inviterName} hat dich als {roleLabel} zum {brandName}-Team eingeladen",
    "agency-member-invited.heading": "Willkommen im Team",
    "agency-member-invited.greeting": "Hallo {recipientName},",
    "agency-member-invited.body":
      "{inviterName} hat dich als {roleLabel} in das {brandName}-Team aufgenommen. Du kannst dich jetzt einloggen und mit deinen Sub-Orgs arbeiten.",
    "agency-member-invited.assignments":
      "Du hast Zugriff auf {assignmentCount} Sub-Org(s).",
    "agency-member-invited.cta": "Team öffnen",

    // Onboarding completed
    "onboarding-completed.subject": "Du bist startklar bei {subOrgName}",
    "onboarding-completed.preview":
      "Dein Onboarding bei {subOrgName} ist abgeschlossen",
    "onboarding-completed.heading": "Startklar",
    "onboarding-completed.greeting": "Hallo {recipientName},",
    "onboarding-completed.body":
      "Dein Onboarding bei {subOrgName} ist abgeschlossen. Du kannst jetzt mit Agenten und Workflows arbeiten — los geht's.",
    "onboarding-completed.tip":
      "Tipp: Beginne mit einem Template aus dem Katalog, wenn du nicht weißt, wo du anfangen sollst.",
    "onboarding-completed.cta": "Zum Dashboard",

    // Shared role + permission labels
    "role.OWNER": "Owner",
    "role.ADMIN": "Admin",
    "role.MEMBER": "Mitglied",
    "role.VIEWER": "Viewer",
    "agency-role.OWNER": "Agency-Owner",
    "agency-role.ADMIN": "Agency-Admin",
    "agency-role.CONSULTANT": "Consultant",
    "agency-role.VIEWER": "Viewer",
    "permission-set.READ_ONLY": "nur lesend",
    "permission-set.USE_AGENTS": "Agenten nutzen",
    "permission-set.USE_AGENTS_PLUS_KNOWLEDGE":
      "Agenten + Knowledge-Base",
    "permission-set.FULL_ACCESS": "Vollzugriff",
  },
  en: {
    "sub-org-invited.existing.subject": "You've been added to {subOrgName}",
    "sub-org-invited.existing.preview":
      "{inviterName} added you to {subOrgName}",
    "sub-org-invited.existing.heading": "Welcome to {subOrgName}",
    "sub-org-invited.existing.greeting": "Hi {recipientName},",
    "sub-org-invited.existing.body":
      "{inviterName} added you to {subOrgName} as {roleLabel}. You can sign in and get started right away.",
    "sub-org-invited.existing.permission":
      "Your access: {permissionLabel}.",
    "sub-org-invited.existing.cta": "Open workspace",

    "sub-org-invited.new.subject":
      "Invitation to {subOrgName} on {brandName}",
    "sub-org-invited.new.preview":
      "{inviterName} invited you to {subOrgName}",
    "sub-org-invited.new.heading": "You've been invited",
    "sub-org-invited.new.greeting": "Hi,",
    "sub-org-invited.new.body":
      "{inviterName} invited you as {roleLabel} to {subOrgName} — managed via {brandName}. A separate sign-up email will follow.",
    "sub-org-invited.new.permission":
      "Your access will be: {permissionLabel}.",
    "sub-org-invited.new.cta": "Learn about {brandName}",

    "agency-member-invited.subject":
      "Invitation to join the {brandName} team",
    "agency-member-invited.preview":
      "{inviterName} invited you as {roleLabel} to the {brandName} team",
    "agency-member-invited.heading": "Welcome to the team",
    "agency-member-invited.greeting": "Hi {recipientName},",
    "agency-member-invited.body":
      "{inviterName} added you as {roleLabel} to the {brandName} team. You can sign in and start working with your sub-orgs.",
    "agency-member-invited.assignments":
      "You have access to {assignmentCount} sub-org(s).",
    "agency-member-invited.cta": "Open team page",

    "onboarding-completed.subject":
      "You're all set on {subOrgName}",
    "onboarding-completed.preview":
      "Your onboarding for {subOrgName} is complete",
    "onboarding-completed.heading": "You're all set",
    "onboarding-completed.greeting": "Hi {recipientName},",
    "onboarding-completed.body":
      "Your onboarding for {subOrgName} is complete. You can now work with agents and workflows — go for it.",
    "onboarding-completed.tip":
      "Tip: start with a template from the catalog if you're unsure where to begin.",
    "onboarding-completed.cta": "Go to dashboard",

    "role.OWNER": "Owner",
    "role.ADMIN": "Admin",
    "role.MEMBER": "Member",
    "role.VIEWER": "Viewer",
    "agency-role.OWNER": "Agency Owner",
    "agency-role.ADMIN": "Agency Admin",
    "agency-role.CONSULTANT": "Consultant",
    "agency-role.VIEWER": "Viewer",
    "permission-set.READ_ONLY": "read-only",
    "permission-set.USE_AGENTS": "use agents",
    "permission-set.USE_AGENTS_PLUS_KNOWLEDGE":
      "agents + knowledge base",
    "permission-set.FULL_ACCESS": "full access",
  },
};

export function t(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  const template = dict[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{([^}]+)\}/g, (match, name) => {
    const v = params[name as keyof typeof params];
    return v === undefined || v === null ? match : String(v);
  });
}

export const __test__ = { TRANSLATIONS };
