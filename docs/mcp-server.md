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

---

### `kiln_create_task_agent`
Create a fully configured Task Agent with input schema, output format, pre/post-processing, and actions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Name of the task agent |
| `description` | string | Yes | What the task does |
| `systemPrompt` | string | No | Custom system prompt |
| `model` | string | No | LLM model ID |
| `inputSchema` | object | No | `{ fields: [{ name, type, description, required }] }` |
| `outputFormat` | string | No | `json`, `text`, or `markdown` |
| `preProcess` | object | No | `{ code, conditions }` for input validation/transform |
| `postProcess` | object | No | `{ code, branches }` for output transform and routing |
| `actions` | string[] | No | Actions to enable: `COLLECT_EMAIL`, `SCORE_LEAD`, `HTTP_REQUEST`, `FIRE_WEBHOOK`, `CUSTOM_CODE` |

---

### `kiln_run_task`
Execute a Task Agent with structured JSON input, full tool calling, pre/post-processing, and output routing.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID of the task agent |
| `input` | object | No | JSON object with input data matching the agent's input schema |

**Returns:** Run ID, status, duration, output (parsed JSON if applicable), actions executed.

---

### `kiln_execute_team`
Execute a team workflow: decompose a goal into subtasks assigned to team members.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `teamId` | string | Yes | Team ID |
| `goal` | string | Yes | Goal or task for the team |

**Returns:** Array of created tasks with assignments and priorities.

---

### `kiln_create_workflow_automation`
Create an advanced automation with cron expressions, webhook triggers, or input templates.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string | Yes | Agent ID to automate |
| `name` | string | Yes | Automation name |
| `trigger` | object | Yes | `{ type: "schedule"|"webhook", schedule, webhookConfig }` |
| `inputTemplate` | string | No | Input template with `{{date}}` / `{{timestamp}}` placeholders |
| `notification` | object | No | `{ method: "NONE"|"EMAIL"|"WEBHOOK", target }` |

---

### `kiln_list_workflows`
List all automations, team configurations, and orchestration rules in one call.

**Parameters:** None

**Returns:** Automations with schedules, teams with members, orchestration rules, and summary counts.

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
