const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export interface NotionTokens {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string | null;
  botId: string;
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  lastEditedTime: string;
  parentType: "database" | "page" | "workspace";
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  properties: Record<string, { type: string; name: string }>;
}

function notionHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

// Exchange OAuth code for tokens
export async function exchangeNotionCode(code: string): Promise<NotionTokens> {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI;
  if (!clientId || !clientSecret) throw new Error("Notion OAuth not configured");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${NOTION_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Notion OAuth failed: ${data.error}`);

  return {
    accessToken: data.access_token,
    workspaceId: data.workspace_id,
    workspaceName: data.workspace_name || "Notion Workspace",
    workspaceIcon: data.workspace_icon || null,
    botId: data.bot_id,
  };
}

// Search pages and databases in the workspace
export async function searchNotion(
  accessToken: string,
  query: string = "",
  filter?: "page" | "database"
): Promise<(NotionPage | NotionDatabase)[]> {
  const body: Record<string, unknown> = {
    page_size: 50,
    sort: { direction: "descending", timestamp: "last_edited_time" },
  };
  if (query) body.query = query;
  if (filter) body.filter = { value: filter, property: "object" };

  const res = await fetch(`${NOTION_API}/search`, {
    method: "POST",
    headers: notionHeaders(accessToken),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.results) return [];

  return data.results.map((item: NotionSearchResult) => {
    if (item.object === "database") {
      return {
        id: item.id,
        title: extractTitle(item),
        url: item.url || "",
        icon: extractIcon(item),
        properties: extractDatabaseProperties(item),
      } as NotionDatabase;
    }
    return {
      id: item.id,
      title: extractTitle(item),
      url: item.url || "",
      icon: extractIcon(item),
      lastEditedTime: item.last_edited_time || "",
      parentType: item.parent?.type === "database_id" ? "database" : item.parent?.type === "page_id" ? "page" : "workspace",
    } as NotionPage;
  });
}

// Get page content as plain text (for KB embedding)
export async function getPageContent(accessToken: string, pageId: string): Promise<string> {
  // Get page title
  const pageRes = await fetch(`${NOTION_API}/pages/${pageId}`, {
    headers: notionHeaders(accessToken),
  });
  const pageData = await pageRes.json();
  const title = extractTitle(pageData);

  // Get all blocks (paginated)
  const blocks = await getAllBlocks(accessToken, pageId);
  const textParts = blocksToText(blocks);

  return title ? `# ${title}\n\n${textParts}` : textParts;
}

// Create a page in a Notion database (for lead export)
export async function createDatabaseEntry(
  accessToken: string,
  databaseId: string,
  properties: Record<string, unknown>,
  content?: string
): Promise<{ id: string; url: string }> {
  const body: Record<string, unknown> = {
    parent: { database_id: databaseId },
    properties,
  };

  if (content) {
    body.children = textToBlocks(content);
  }

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: notionHeaders(accessToken),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.object === "error") throw new Error(`Notion API error: ${data.message}`);

  return { id: data.id, url: data.url };
}

// Append content to an existing page
export async function appendToPage(
  accessToken: string,
  pageId: string,
  content: string
): Promise<void> {
  const blocks = textToBlocks(content);

  const res = await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: notionHeaders(accessToken),
    body: JSON.stringify({ children: blocks }),
  });

  const data = await res.json();
  if (data.object === "error") throw new Error(`Notion API error: ${data.message}`);
}

// Get database schema (properties)
export async function getDatabaseSchema(
  accessToken: string,
  databaseId: string
): Promise<NotionDatabase> {
  const res = await fetch(`${NOTION_API}/databases/${databaseId}`, {
    headers: notionHeaders(accessToken),
  });

  const data = await res.json();
  if (data.object === "error") throw new Error(`Notion API error: ${data.message}`);

  return {
    id: data.id,
    title: extractTitle(data),
    url: data.url || "",
    icon: extractIcon(data),
    properties: extractDatabaseProperties(data),
  };
}

// ----------- Internal helpers -----------

// Notion's polymorphic type system
interface NotionSearchResult {
  object: "page" | "database";
  id: string;
  url?: string;
  last_edited_time?: string;
  parent?: { type: string };
  properties?: Record<string, NotionPropertyValue>;
  title?: NotionRichText[];
  icon?: { type: string; emoji?: string; external?: { url: string } };
}

interface NotionRichText {
  type: string;
  plain_text?: string;
  text?: { content: string };
}

interface NotionPropertyValue {
  type: string;
  title?: NotionRichText[];
  name?: string;
  [key: string]: unknown;
}

interface NotionBlock {
  type: string;
  has_children?: boolean;
  id: string;
  [key: string]: unknown;
}

function extractTitle(item: NotionSearchResult): string {
  // Database title
  if (item.title) {
    return item.title.map((t) => t.plain_text || "").join("") || "Untitled";
  }
  // Page title from properties
  if (item.properties) {
    const props = Object.values(item.properties);
    for (const prop of props) {
      if (prop.type === "title" && prop.title) {
        return prop.title.map((t: NotionRichText) => t.plain_text || "").join("") || "Untitled";
      }
    }
  }
  return "Untitled";
}

function extractIcon(item: NotionSearchResult): string | null {
  if (!item.icon) return null;
  if (item.icon.type === "emoji") return item.icon.emoji || null;
  if (item.icon.type === "external") return item.icon.external?.url || null;
  return null;
}

function extractDatabaseProperties(item: NotionSearchResult): Record<string, { type: string; name: string }> {
  const result: Record<string, { type: string; name: string }> = {};
  if (!item.properties) return result;
  const entries = Object.entries(item.properties);
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    result[key] = { type: val.type, name: val.name || key };
  }
  return result;
}

// Recursively fetch all blocks from a page
async function getAllBlocks(accessToken: string, blockId: string, depth: number = 0): Promise<NotionBlock[]> {
  if (depth > 3) return []; // Limit recursion depth

  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 5; page++) { // Max 5 pages of blocks
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);

    const res = await fetch(`${NOTION_API}/blocks/${blockId}/children?${params.toString()}`, {
      headers: notionHeaders(accessToken),
    });

    const data = await res.json();
    if (!data.results) break;

    for (const block of data.results as NotionBlock[]) {
      blocks.push(block);

      // Recursively fetch children
      if (block.has_children && block.type !== "child_page" && block.type !== "child_database") {
        const children = await getAllBlocks(accessToken, block.id, depth + 1);
        blocks.push(...children);
      }
    }

    cursor = data.next_cursor;
    if (!cursor) break;
  }

  return blocks;
}

// Convert Notion blocks to plain text
function blocksToText(blocks: NotionBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text !== null) {
      parts.push(text);
    }
  }

  return parts.join("\n\n");
}

function extractBlockText(block: NotionBlock): string | null {
  const type = block.type;
  const content = block[type] as { rich_text?: NotionRichText[]; caption?: NotionRichText[]; text?: NotionRichText[]; language?: string; checked?: boolean } | undefined;
  if (!content) return null;

  const richText = content.rich_text || content.caption || content.text || [];
  const text = richText.map((t: NotionRichText) => t.plain_text || "").join("");

  switch (type) {
    case "paragraph":
      return text || null;
    case "heading_1":
      return text ? `# ${text}` : null;
    case "heading_2":
      return text ? `## ${text}` : null;
    case "heading_3":
      return text ? `### ${text}` : null;
    case "bulleted_list_item":
      return text ? `- ${text}` : null;
    case "numbered_list_item":
      return text ? `1. ${text}` : null;
    case "to_do":
      return text ? `[${content.checked ? "x" : " "}] ${text}` : null;
    case "toggle":
      return text || null;
    case "quote":
      return text ? `> ${text}` : null;
    case "callout":
      return text || null;
    case "code":
      return text ? `\`\`\`${content.language || ""}\n${text}\n\`\`\`` : null;
    case "divider":
      return "---";
    case "table_row": {
      const cells = (block[type] as { cells?: NotionRichText[][] })?.cells || [];
      const row = cells.map((cell) => cell.map((t) => t.plain_text || "").join("")).join(" | ");
      return row || null;
    }
    case "bookmark":
    case "embed":
    case "link_preview": {
      const urlContent = block[type] as { url?: string };
      return urlContent?.url || null;
    }
    default:
      return text || null;
  }
}

// Convert plain text to Notion blocks (for writing content)
function textToBlocks(content: string): unknown[] {
  const lines = content.split("\n").filter((l) => l.trim());
  const blocks: unknown[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: line.slice(2) } }] },
      });
    } else if (line.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: line.slice(2) } }] },
      });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: line } }] },
      });
    }
  }

  return blocks;
}

// Build Notion properties for lead export
export function buildLeadProperties(data: {
  name?: string;
  email: string;
  summary?: string;
  date?: string;
}): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  // Title property — use name or email as the page title
  properties["Name"] = {
    title: [{ text: { content: data.name || data.email } }],
  };

  // Email as rich text
  properties["Email"] = {
    rich_text: [{ text: { content: data.email } }],
  };

  // Date
  if (data.date) {
    properties["Date"] = {
      date: { start: data.date },
    };
  }

  // Summary as rich text
  if (data.summary) {
    properties["Summary"] = {
      rich_text: [{ text: { content: data.summary.slice(0, 2000) } }],
    };
  }

  return properties;
}
