# KILN MCP Server

KILN exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI assistants like Claude Code and Cursor manage your KILN agents programmatically.

## Prerequisites

- A KILN account with an **Agency** or **Admin** plan
- An API access key (`sk-kiln-...`) from Settings > API Access

## Setup

### Claude Code (CLI)

Add via command line:

```bash
claude mcp add --transport http kiln https://kiln-topaz.vercel.app/api/mcp --header "Authorization: Bearer sk-kiln-YOUR_API_KEY"
```

Or add to your `~/.claude.json` or project `.mcp.json`:

```json
{
  "mcpServers": {
    "kiln": {
      "type": "streamableHttp",
      "url": "https://kiln-topaz.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer sk-kiln-YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json` in your project or global config):

```json
{
  "mcpServers": {
    "kiln": {
      "type": "streamableHttp",
      "url": "https://kiln-topaz.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer sk-kiln-YOUR_API_KEY"
      }
    }
  }
}
```

### Local Development

For local development:

```bash
claude mcp add --transport http kiln-local http://localhost:3000/api/mcp --header "Authorization: Bearer sk-kiln-YOUR_API_KEY"
```

## Available Tools

### `kiln_list_agents`
List all AI agents for the authenticated user.

**Parameters:** None

**Returns:** Array of agents with id, name, slug, status, model, conversation count, and public URL.

---

### `kiln_create_agent`
Create a new AI agent.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Name of the agent |
| `description` | string | Yes | What the agent does |
| `industry` | string | Yes | Industry context (e.g. "real estate", "saas") |

**Returns:** Agent ID, slug, and public URL.

---

### `kiln_update_agent`
Update an existing agent's configuration.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Agent ID |
| `system_prompt` | string | No | New system prompt |
| `personality` | object | No | `{ tone, language, formality }` |
| `welcome_message` | string | No | New welcome message |
| `name` | string | No | New agent name |
| `model` | string | No | LLM model ID |

---

### `kiln_add_knowledge`
Add a knowledge base entry to an agent for RAG.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID |
| `type` | string | Yes | `TEXT`, `URL`, `PDF`, or `FAQ` |
| `sourceName` | string | Yes | Display name for the source |
| `content` | string | Yes | The content text or URL |

---

### `kiln_deploy_agent`
Deploy or undeploy an agent.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Agent ID |
| `status` | string | Yes | `LIVE`, `DRAFT`, or `PAUSED` |

---

### `kiln_get_analytics`
Get analytics for an agent.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID |
| `range` | string | Yes | `7d`, `30d`, or `90d` |

**Returns:** Total conversations, leads collected, average lead score, and daily breakdown.

---

### `kiln_clone_agent`
Clone an existing agent with all configuration.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Source agent ID |
| `name` | string | Yes | Name for the clone |

---

### `kiln_create_automation`
Create a scheduled automation for an agent.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID |
| `name` | string | Yes | Automation name |
| `schedule` | string | Yes | `hourly`, `daily`, or `weekly` |
| `task` | string | Yes | Task description |

---

### `kiln_chat`
Send a message to an agent and get a response.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID |
| `message` | string | Yes | Message to send |
| `sessionId` | string | No | Session ID for continuity |

**Returns:** Agent response, session ID, conversation ID, and model used.

---

### `kiln_delete_agent`
Permanently delete an agent.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Agent ID |

## Authentication

All requests require a valid API access key passed in the `Authorization` header:

```
Authorization: Bearer sk-kiln-YOUR_API_KEY
```

API keys can be generated in the KILN dashboard under Settings > API Access (Agency/Admin plans only).

## Rate Limits

- 100 requests per minute per API key
- Rate limit headers are included in responses

## Protocol

The server implements the MCP Streamable HTTP transport (stateless mode). It accepts JSON-RPC 2.0 messages via POST and returns responses as JSON.
