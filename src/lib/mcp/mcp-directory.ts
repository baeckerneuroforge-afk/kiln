/**
 * MCP Server Directory
 * Kuratierte Liste bekannter MCP-Server für One-Click-Setup
 */

export interface MCPDirectoryEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  authType: "none" | "api_key" | "oauth";
  setupInstructions: string;
  category: MCPCategory;
  verified: boolean;
}

export type MCPCategory =
  | "productivity"
  | "crm"
  | "development"
  | "communication"
  | "data"
  | "design"
  | "project_management";

// Hinweis: URLs sind Platzhalter — vor Produktionsnutzung verifizieren
export const MCP_DIRECTORY: MCPDirectoryEntry[] = [
  {
    id: "notion",
    name: "Notion",
    description: "Create pages, databases, and manage your Notion workspace",
    url: "https://mcp.notion.so/sse",
    authType: "api_key",
    setupInstructions: "Create an integration at notion.so/my-integrations and copy the Internal Integration Secret.",
    category: "productivity",
    verified: false,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, pull requests, and code",
    url: "https://api.githubcopilot.com/mcp/",
    authType: "api_key",
    setupInstructions: "Generate a Personal Access Token at github.com/settings/tokens with the required scopes.",
    category: "development",
    verified: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, manage channels, and interact with Slack workspaces",
    url: "https://mcp.slack.com/sse",
    authType: "oauth",
    setupInstructions: "Create a Slack App at api.slack.com/apps and configure OAuth with required scopes.",
    category: "communication",
    verified: false,
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Read and write spreadsheet data, create sheets, manage formulas",
    url: "https://mcp.googleapis.com/sheets/sse",
    authType: "oauth",
    setupInstructions: "Enable the Google Sheets API in Google Cloud Console and create OAuth credentials.",
    category: "data",
    verified: false,
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Manage bases, tables, records, and views in Airtable",
    url: "https://mcp.airtable.com/sse",
    authType: "api_key",
    setupInstructions: "Generate a Personal Access Token at airtable.com/create/tokens.",
    category: "data",
    verified: false,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Manage contacts, deals, companies, and CRM pipelines",
    url: "https://mcp.hubspot.com/sse",
    authType: "api_key",
    setupInstructions: "Create a Private App at app.hubspot.com/private-apps and copy the access token.",
    category: "crm",
    verified: false,
  },
  {
    id: "jira",
    name: "Jira",
    description: "Create and manage issues, boards, sprints, and projects",
    url: "https://mcp.atlassian.com/jira/sse",
    authType: "api_key",
    setupInstructions: "Generate an API token at id.atlassian.com/manage-profile/security/api-tokens.",
    category: "project_management",
    verified: false,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage issues, projects, cycles, and team workflows",
    url: "https://mcp.linear.app/sse",
    authType: "api_key",
    setupInstructions: "Create a Personal API Key at linear.app/settings/api.",
    category: "project_management",
    verified: false,
  },
  {
    id: "figma",
    name: "Figma",
    description: "Access design files, components, styles, and comments",
    url: "https://mcp.figma.com/sse",
    authType: "api_key",
    setupInstructions: "Generate a Personal Access Token in Figma settings under Account > Personal access tokens.",
    category: "design",
    verified: false,
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Manage leads, opportunities, accounts, and CRM data",
    url: "https://mcp.salesforce.com/sse",
    authType: "oauth",
    setupInstructions: "Create a Connected App in Salesforce Setup and configure OAuth.",
    category: "crm",
    verified: false,
  },
  {
    id: "asana",
    name: "Asana",
    description: "Manage tasks, projects, and team workspaces",
    url: "https://mcp.asana.com/sse",
    authType: "api_key",
    setupInstructions: "Create a Personal Access Token at app.asana.com/0/developer-console.",
    category: "project_management",
    verified: false,
  },
  {
    id: "zendesk",
    name: "Zendesk",
    description: "Manage tickets, users, and support workflows",
    url: "https://mcp.zendesk.com/sse",
    authType: "api_key",
    setupInstructions: "Generate an API token in Zendesk Admin > Channels > API.",
    category: "crm",
    verified: false,
  },
];

/**
 * Gibt alle Directory-Einträge zurück, optional nach Kategorie gefiltert
 */
export function getMCPDirectory(category?: MCPCategory): MCPDirectoryEntry[] {
  if (category) {
    return MCP_DIRECTORY.filter((e) => e.category === category);
  }
  return MCP_DIRECTORY;
}

/**
 * Findet einen Directory-Eintrag nach ID
 */
export function getMCPDirectoryEntry(id: string): MCPDirectoryEntry | undefined {
  return MCP_DIRECTORY.find((e) => e.id === id);
}

/**
 * Sucht im Directory nach Name
 */
export function searchMCPDirectory(query: string): MCPDirectoryEntry[] {
  const q = query.toLowerCase();
  return MCP_DIRECTORY.filter(
    (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
  );
}

/**
 * Alle verfügbaren Kategorien
 */
export function getMCPCategories(): { id: MCPCategory; label: string }[] {
  return [
    { id: "productivity", label: "Productivity" },
    { id: "crm", label: "CRM" },
    { id: "development", label: "Development" },
    { id: "communication", label: "Communication" },
    { id: "data", label: "Data" },
    { id: "design", label: "Design" },
    { id: "project_management", label: "Project Management" },
  ];
}
