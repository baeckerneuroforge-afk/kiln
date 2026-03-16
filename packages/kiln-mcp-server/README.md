[![npm version](https://img.shields.io/npm/v/@kilnbase/mcp-server)](https://www.npmjs.com/package/@kilnbase/mcp-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)
[![KILN](https://img.shields.io/badge/KILN-compatible-F97316)](https://kilnbase.com)

# @kilnbase/mcp-server

> Create, deploy and manage AI agents from Claude Code, Cursor, or any MCP client.

The official MCP server for [KILN](https://kilnbase.com) — the AI Creation Platform. Build production-ready AI agents, multi-agent teams, and automated workflows entirely from your IDE.

---

## Quick Start

```bash
npm install -g @kilnbase/mcp-server
kiln-mcp --api-key sk-kiln-YOUR_KEY
```

Or run directly with npx:

```bash
npx @kilnbase/mcp-server --api-key sk-kiln-YOUR_KEY
```

Get your API key at [kilnbase.com/dashboard/settings](https://kilnbase.com/dashboard/settings).

---

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kiln": {
      "command": "npx",
      "args": ["-y", "@kilnbase/mcp-server", "--api-key", "sk-kiln-YOUR_KEY"]
    }
  }
}
```

Config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Claude Code (CLI)

```bash
claude mcp add kiln -- npx -y @kilnbase/mcp-server --api-key sk-kiln-YOUR_KEY
```

Or use the hosted HTTP transport directly (no npm install needed):

```bash
claude mcp add --transport http kiln https://kilnbase.com/api/mcp \
  --header "Authorization: Bearer sk-kiln-YOUR_KEY"
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "kiln": {
      "command": "npx",
      "args": ["-y", "@kilnbase/mcp-server", "--api-key", "sk-kiln-YOUR_KEY"]
    }
  }
}
```

### Environment Variable

Instead of passing the key as an argument, you can use an environment variable:

```bash
export KILN_API_KEY=sk-kiln-YOUR_KEY
kiln-mcp
```

---

## Tools (31)

### Agent Management

| Tool | Description |
|------|-------------|
| `kiln_list_agents` | List all agents in your workspace |
| `kiln_create_agent` | Create a new Chat or Task agent |
| `kiln_create_task_agent` | Create a Task Agent with input schema, output format, pre/post-processing |
| `kiln_update_agent` | Update an agent's config (prompt, personality, model) |
| `kiln_delete_agent` | Permanently delete an agent |
| `kiln_clone_agent` | Clone an agent with all config, actions, and knowledge |
| `kiln_deploy_agent` | Deploy an agent to LIVE, DRAFT, or PAUSED |

### Execution

| Tool | Description |
|------|-------------|
| `kiln_chat` | Send a message to a Chat Agent |
| `kiln_run_agent` | Trigger a Task Agent with text input |
| `kiln_run_task` | Execute a Task Agent with JSON input, tool calling, and output routing |
| `kiln_get_runs` | Get execution history for a Task Agent |

### Knowledge & Training

| Tool | Description |
|------|-------------|
| `kiln_add_knowledge` | Add knowledge (PDF, URL, text, FAQ) for RAG |
| `kiln_add_action` | Enable actions (booking, email, lead scoring, webhooks) |
| `kiln_add_custom_tool` | Register a custom HTTP API tool |
| `kiln_add_custom_code` | Add sandboxed JavaScript code execution |
| `kiln_add_branch` | Add conditional prompt branching |
| `kiln_set_memory` | Toggle persistent conversation memory |
| `kiln_create_test` | Define a test case with expected keywords |
| `kiln_run_tests` | Execute test suite and return pass/fail results |

### Teams & Workflows

| Tool | Description |
|------|-------------|
| `kiln_create_team` | Create an Agent Team (optional SALES/SUPPORT/CONTENT template) |
| `kiln_list_teams` | List all teams with member and task counts |
| `kiln_add_team_member` | Add agent to team (HEAD, COORDINATOR, EXECUTOR, REPORTER) |
| `kiln_assign_task` | Assign task to team HEAD for delegation |
| `kiln_execute_team` | Decompose a goal into subtasks across team members |
| `kiln_get_team_status` | Get team members, tasks, and progress |
| `kiln_orchestrate` | Define agent-to-agent handoff rules |
| `kiln_create_automation` | Create scheduled automation (hourly/daily/weekly) |
| `kiln_create_workflow_automation` | Advanced automation with cron, webhooks, notifications |
| `kiln_list_workflows` | List all automations, teams, and orchestration rules |

### Analytics & Configuration

| Tool | Description |
|------|-------------|
| `kiln_get_analytics` | Get conversation counts, leads, and revenue |
| `kiln_get_conversations` | Fetch conversation logs with messages |
| `kiln_get_leads` | List captured leads with scores |
| `kiln_set_white_label` | Configure branding (logo, colors, badge) |
| `kiln_get_embed_code` | Generate embed snippet for chat widget |
| `kiln_create_webhook` | Create inbound webhook endpoint |
| `kiln_list_webhooks` | List webhooks with execution stats |
| `kiln_delete_webhook` | Remove a webhook endpoint |

---

## Workflow Examples

### 1. Deploy a customer support agent in 30 seconds

```
You: Create a customer support agent called "HelpDesk" for a SaaS product.
     It should answer billing questions, help with password resets, and
     escalate complex issues to a human.

     Add our FAQ as knowledge, enable email collection, create test cases
     for password reset and billing questions, run the tests, and deploy
     it if they pass. Give me the embed code.
```

What happens:
1. `kiln_create_agent` — creates "HelpDesk" with a support-focused system prompt
2. `kiln_add_knowledge` — uploads and indexes the FAQ for RAG
3. `kiln_add_action` — enables `COLLECT_EMAIL` and `HANDOFF_HUMAN`
4. `kiln_create_test` x2 — test cases for password reset and billing
5. `kiln_run_tests` — validates responses contain expected keywords
6. `kiln_deploy_agent` — pushes to LIVE (only if tests pass)
7. `kiln_get_embed_code` — returns the `<script>` tag

### 2. Build a multi-agent sales team

```
You: Build a sales pipeline with three task agents:

     1. "Lead Qualifier" — takes { name, email, company, budget } as input,
        scores the lead 1-10, outputs JSON
     2. "Proposal Writer" — generates a personalized proposal based on
        the qualification data
     3. "Follow-Up Agent" — writes a follow-up email sequence

     Create a team called "Sales Pipeline", add all three agents,
     and set up the Qualifier to route high-score leads (>7) to the
     Proposal Writer. Schedule the Qualifier to run daily.
```

What happens:
1. `kiln_create_task_agent` — creates Lead Qualifier with `inputSchema`, `outputFormat: "json"`, `postProcess` branch for score > 7
2. `kiln_create_task_agent` — creates Proposal Writer with markdown output
3. `kiln_create_task_agent` — creates Follow-Up Agent with email actions
4. `kiln_create_team` — creates "Sales Pipeline" team
5. `kiln_add_team_member` x3 — Qualifier as HEAD, Writer and Follow-Up as EXECUTORs
6. `kiln_orchestrate` — Qualifier → Proposal Writer handoff on high scores
7. `kiln_create_workflow_automation` — daily schedule for the Qualifier

### 3. Train an agent on your documentation

```
You: I have a product called "Acme CRM". Train an agent on these knowledge sources:

     1. Our API docs at https://docs.acme.com/api
     2. A FAQ document with common questions
     3. Our pricing page text

     Then add a custom tool that checks subscription status via our API
     at https://api.acme.com/subscriptions/{{email}}, enable appointment
     booking with our Calendly link, and deploy it.
```

What happens:
1. `kiln_create_agent` — creates "Acme CRM Support" agent
2. `kiln_add_knowledge` x3 — adds URL, FAQ, and text knowledge sources
3. `kiln_add_custom_tool` — registers the subscription lookup API with `{{email}}` placeholder
4. `kiln_add_action` — enables `BOOK_APPOINTMENT` with Calendly URL
5. `kiln_deploy_agent` — pushes to LIVE
6. `kiln_get_embed_code` — returns the widget snippet

---

## CLI Reference

```
Usage:
  kiln-mcp --api-key <key>        Start the MCP server
  kiln-mcp --help                 Show help
  kiln-mcp --version              Show version

Options:
  --api-key, -k <key>   KILN API key (or KILN_API_KEY env var)
  --url, -u <url>        Custom API endpoint URL

Environment Variables:
  KILN_API_KEY           API key for authentication
  KILN_API_URL           Custom API endpoint (default: https://kilnbase.com/api/mcp)
```

---

## Rate Limits

| Plan | Rate Limit |
|------|------------|
| Free | 20 req/min |
| Pro ($49/mo) | 100 req/min |
| Agency ($149/mo) | 100 req/min |

---

## License

MIT

---

## Links

- [KILN Platform](https://kilnbase.com)
- [Dashboard](https://kilnbase.com/dashboard)
- [Documentation](https://docs.kilnbase.com)
- [GitHub](https://github.com/hephaistos-systems/kiln)
- [Report Issues](https://github.com/hephaistos-systems/kiln/issues)
