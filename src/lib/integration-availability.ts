// Server-side helper: checks which integrations have their env vars configured

export interface IntegrationAvailability {
  provider: string;
  available: boolean;
  note?: string;
}

const INTEGRATION_ENV_CHECKS: Record<string, { vars: string[]; note?: string }> = {
  google_calendar: {
    vars: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"],
    note: "Requires Google Calendar API enabled in Google Cloud Console",
  },
  gmail: {
    vars: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"],
    note: "Uses Google OAuth — requires gmail.readonly and gmail.send scopes",
  },
  hubspot: {
    vars: ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"],
  },
  slack: {
    vars: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
  },
  notion: {
    vars: ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
  },
  stripe: {
    vars: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
  },
  github: {
    vars: [], // GitHub uses repo URL + webhook, always available
  },
  // Telegram/WhatsApp: always available (user provides their own bot token)
  "whatsapp-business": {
    vars: [],
  },
};

export function getAvailableIntegrations(): IntegrationAvailability[] {
  const results: IntegrationAvailability[] = [];

  // Providers in the catalog
  const allProviders = [
    "google_calendar", "gmail", "hubspot", "slack", "notion", "stripe",
    "github", "whatsapp-business", "calendly", "mailchimp", "shopify",
    "salesforce", "airtable", "google-sheets", "zapier", "make",
  ];

  for (const provider of allProviders) {
    const check = INTEGRATION_ENV_CHECKS[provider];
    if (!check) {
      // No env check defined → Coming Soon
      results.push({ provider, available: false });
      continue;
    }
    const allSet = check.vars.length === 0 || check.vars.every((v) => !!process.env[v]);
    results.push({ provider, available: allSet, note: check.note });
  }

  return results;
}
