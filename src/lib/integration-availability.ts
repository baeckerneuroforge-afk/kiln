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
    vars: [],
    note: "Configured per agent with your own Stripe Secret Key",
  },
  airtable: {
    vars: [],
    note: "Configured per agent with your own Airtable Personal Access Token",
  },
  calendly: {
    vars: [],
    note: "Configured per agent with your own Calendly Personal Access Token",
  },
  "google-sheets": {
    vars: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"],
    note: "Uses Google OAuth — requires Sheets API enabled in Google Cloud Console",
  },
  github: {
    vars: [], // GitHub uses repo URL + webhook, always available
  },
  zapier: {
    vars: [],
    note: "Paste your Zapier webhook URL to connect",
  },
  make: {
    vars: [],
    note: "Paste your Make (Integromat) webhook URL to connect",
  },
  // Telegram/WhatsApp: always available (user provides their own bot token)
  telegram: {
    vars: [],
  },
  "whatsapp-business": {
    vars: [],
  },
};

export function getAvailableIntegrations(): IntegrationAvailability[] {
  const results: IntegrationAvailability[] = [];

  // Providers in the catalog
  const allProviders = [
    "google_calendar", "gmail", "hubspot", "slack", "telegram", "notion", "stripe",
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
