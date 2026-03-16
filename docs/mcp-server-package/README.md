![npm](https://img.shields.io/npm/v/kiln-mcp)
![license](https://img.shields.io/badge/license-MIT-blue)
![KILN](https://img.shields.io/badge/KILN-compatible-F97316)

# kiln-mcp

> Create, deploy, and manage AI agents from Claude Code, Cursor, or any MCP client.

The official MCP (Model Context Protocol) server for [KILN](https://kiln.so) -- the AI Creation Platform. Build production-ready AI agents entirely from your IDE, no browser required.

---

## Quick Start

### Claude Code

```bash
claude mcp add --transport http kiln https://your-kiln-instance.com/api/mcp --header "Authorization: Bearer sk-kiln-YOUR_KEY"
```

### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kiln": {
      "transport": "http",
      "url": "https://your-kiln-instance.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk-kiln-YOUR_KEY"
      }
    }
  }
}
```

Once connected, you can start using KILN tools immediately -- ask your AI assistant to create an agent, add knowledge, or deploy.

---

## Features

- **31 MCP tools** for complete agent lifecycle management
- **Agent CRUD** -- create, update, clone, delete agents from your editor
- **Task Agents** -- create autonomous agents with input schemas, pre/post-processing, and output routing
- **RAG knowledge bases** -- add PDFs, URLs, and FAQs with automatic chunking and vector embedding
- **Smart actions** -- toggle appointment booking, email collection, lead scoring, webhooks
- **Custom tools & code** -- extend agents with custom tool definitions and executable code blocks
- **Prompt branching** -- create conditional conversation flows
- **Agent Teams** -- build multi-agent teams with roles, hierarchy, and goal decomposition
- **Workflow Automations** -- schedule agents on cron or trigger via webhook
- **Analytics** -- pull conversation counts, lead data, and estimated revenue
- **Testing** -- create and run test suites before deploying
- **Multi-agent orchestration** -- define handoff rules between agents
- **Webhooks** -- subscribe to agent events (new lead, conversation, appointment)
- **White-label** -- configure branding, logos, colors, and custom domains per agent
- **Memory** -- enable persistent conversation memory across sessions
- **BYOK (Bring Your Own Key)** -- use your own LLM API keys
- **Embed code generation** -- get ready-to-paste widget snippets

---

## Tool Reference

### Agent Management

| Tool | Description |
|------|-------------|
| `kiln_list_agents` | List all agents in the current workspace |
| `kiln_create_agent` | Create a new Chat or Task agent with name, system prompt, and personality |
| `kiln_create_task_agent` | Create a fully configured Task Agent with input schema, output format, pre/post-processing, and actions |
| `kiln_update_agent` | Update an existing agent's configuration |
| `kiln_delete_agent` | Permanently delete an agent |
| `kiln_clone_agent` | Clone an existing agent as a new draft (useful for templates) |
| `kiln_deploy_agent` | Deploy an agent to production (makes it live) |

### Execution

| Tool | Description |
|------|-------------|
| `kiln_chat` | Send a message to a Chat Agent and receive a response |
| `kiln_run_agent` | Trigger a Task Agent with text input and return the result |
| `kiln_run_task` | Execute a Task Agent with structured JSON input, full tool calling, pre/post-processing, and output routing |
| `kiln_get_runs` | Get execution history for a Task Agent |

### Knowledge & Training

| Tool | Description |
|------|-------------|
| `kiln_add_knowledge` | Add a knowledge base entry (PDF, URL, or FAQ text) for RAG |
| `kiln_add_action` | Enable or disable a built-in action (booking, email, lead scoring, etc.) |
| `kiln_add_custom_tool` | Register a custom HTTP API tool the agent can invoke |
| `kiln_add_custom_code` | Add a custom code block that executes during conversations |
| `kiln_add_branch` | Add a prompt branch for conditional conversation routing |
| `kiln_create_test` | Define a test case with input message and expected behavior |
| `kiln_run_tests` | Execute all test cases for an agent and return results |

### Teams & Workflows

| Tool | Description |
|------|-------------|
| `kiln_create_team` | Create a new Agent Team (optionally from a SALES, SUPPORT, or CONTENT template) |
| `kiln_list_teams` | List all Agent Teams with member and task counts |
| `kiln_add_team_member` | Add an agent to a team with a role (HEAD, COORDINATOR, EXECUTOR, REPORTER) |
| `kiln_assign_task` | Assign a task to the team's HEAD for delegation |
| `kiln_execute_team` | Execute a team workflow: decompose a goal into subtasks assigned to members |
| `kiln_get_team_status` | Get current team status: members, tasks, progress |

### Automations & Orchestration

| Tool | Description |
|------|-------------|
| `kiln_create_automation` | Create a simple scheduled automation (hourly, daily, weekly) |
| `kiln_create_workflow_automation` | Create an advanced automation with cron expressions, webhooks, or input templates |
| `kiln_list_workflows` | List all automations, team configs, and orchestration rules |
| `kiln_orchestrate` | Define agent-to-agent handoff rules for multi-agent orchestration |

### Configuration & Analytics

| Tool | Description |
|------|-------------|
| `kiln_get_analytics` | Retrieve analytics: conversations, leads, appointments, estimated value |
| `kiln_get_conversations` | Fetch recent conversations for an agent |
| `kiln_get_leads` | List captured leads with scores and contact info |
| `kiln_set_white_label` | Configure white-label branding (logo, colors, domain, disclaimer) |
| `kiln_set_memory` | Enable or disable persistent memory for an agent |
| `kiln_get_embed_code` | Generate the HTML/JS embed snippet for a deployed agent |
| `kiln_create_webhook` | Register a webhook URL for agent events |
| `kiln_list_webhooks` | List all registered webhooks for an agent |
| `kiln_delete_webhook` | Remove a registered webhook |

---

## Example Workflows

### 1. Lead Qualification Pipeline with 3 Agents

Build an automated lead qualification pipeline that scores, routes, and follows up.

```
You: Create a lead qualification pipeline:

     1. A "Lead Qualifier" task agent that takes { name, email, company, message }
        as input, scores the lead 1-10, and outputs JSON with score and reasoning.

     2. A "Sales Outreach" task agent that generates a personalized follow-up email
        based on the lead data and qualification score.

     3. A "CRM Updater" task agent with an HTTP_REQUEST action that posts lead data
        to our CRM webhook.

     Set up the Qualifier to route high-score leads (>7) to Sales Outreach and all
     leads to the CRM Updater. Schedule the Qualifier to run daily at 9am.
```

Behind the scenes:
1. `kiln_create_task_agent` -- creates Lead Qualifier with input schema `{ name, email, company, message }`, outputFormat `json`, and a postProcess branch routing score > 7 to the next agent
2. `kiln_create_task_agent` -- creates Sales Outreach agent
3. `kiln_create_task_agent` -- creates CRM Updater with HTTP_REQUEST action
4. `kiln_add_action` -- enables SCORE_LEAD and COLLECT_EMAIL on the Qualifier
5. `kiln_orchestrate` -- defines handoff from Qualifier to Sales Outreach
6. `kiln_create_workflow_automation` -- schedules Qualifier to run daily at 9am UTC

### 2. Daily Content Generation Workflow

Set up a team of agents that produces daily blog content automatically.

```
You: Build a content generation team:

     - "Content Strategist" (HEAD) that decides the topic based on trending keywords
     - "Writer" (EXECUTOR) that drafts a 500-word blog post
     - "Editor" (EXECUTOR) that reviews and polishes the draft
     - "Publisher" (REPORTER) that formats as markdown and fires a webhook

     Create a daily automation that triggers the team with the goal
     "Generate today's blog post based on trending topics in AI."
```

Behind the scenes:
1. `kiln_create_task_agent` x4 -- creates the four specialized agents
2. `kiln_create_team` -- creates the "Content Team"
3. `kiln_add_team_member` x4 -- adds agents with HEAD/EXECUTOR/REPORTER roles
4. `kiln_create_workflow_automation` -- schedules daily execution at 9am
5. `kiln_execute_team` -- can be triggered manually or via the automation

### 3. Customer Onboarding Sequence

Create a multi-step onboarding flow triggered by a webhook from your payment system.

```
You: Build a customer onboarding sequence:

     1. "Welcome Agent" -- sends a personalized welcome email when a new customer
        signs up (triggered by Stripe webhook)

     2. "Setup Guide Agent" -- generates a custom setup checklist based on the
        customer's plan and industry

     3. "Check-in Agent" -- scheduled to run 3 days after signup, checks if the
        customer completed onboarding steps and sends a follow-up

     Connect them so Welcome hands off to Setup Guide, and set up a
     webhook trigger on the Welcome agent.
```

Behind the scenes:
1. `kiln_create_task_agent` -- creates Welcome Agent with EMAIL output
2. `kiln_create_task_agent` -- creates Setup Guide with markdown output format
3. `kiln_create_task_agent` -- creates Check-in Agent with pre-process conditions
4. `kiln_orchestrate` x2 -- defines Welcome -> Setup Guide -> Check-in handoffs
5. `kiln_create_workflow_automation` -- creates webhook trigger on Welcome Agent
6. `kiln_add_action` -- enables COLLECT_EMAIL on Welcome, SEND_EMAIL on Check-in

### 4. Full Agent Deploy

Create an agent from scratch, train it, and ship it -- all from your editor.

```
You: Create an agent called "Support Bot" for a SaaS product. It should answer
     billing questions, help with password resets, and escalate complex issues.

     Then add our FAQ document as knowledge, enable email collection and
     appointment booking, deploy it, and give me the embed code.
```

Behind the scenes:
1. `kiln_create_agent` -- creates the agent with system prompt and personality
2. `kiln_add_knowledge` -- uploads and chunks the FAQ document
3. `kiln_add_action` -- enables email collection and appointment booking
4. `kiln_deploy_agent` -- pushes the agent live
5. `kiln_get_embed_code` -- returns the widget snippet

### 5. CI/CD Testing

Validate agent behavior before deploying to production.

```
You: Create test cases for the Support Bot: test that it correctly answers
     "How do I reset my password?", that it collects an email when asked about
     pricing, and that it escalates when the user says "I want to speak to
     a human." Then run the tests and deploy only if they all pass.
```

Behind the scenes:
1. `kiln_create_test` x3 -- defines the three test cases
2. `kiln_run_tests` -- executes all tests and returns pass/fail results
3. `kiln_deploy_agent` -- deploys only if all tests pass

### 6. Workflow Overview

Get a complete picture of all running workflows, teams, and automations.

```
You: Show me all my active workflows, automations, and agent teams.
     Which automations ran last, and are any teams missing members?
```

Behind the scenes:
1. `kiln_list_workflows` -- returns all automations, teams, and orchestration rules in one call

---

## Authentication

All requests require an API key passed in the `Authorization` header:

```
Authorization: Bearer sk-kiln-YOUR_KEY
```

Generate API keys in the KILN dashboard under **Settings > API Keys**. Keys are scoped to your workspace and inherit your plan's permissions.

| Plan | API Access | Rate Limit |
|------|-----------|------------|
| Free | Read-only | 20 req/min |
| Pro ($49/mo) | Full access | 100 req/min |
| Agency ($149/mo) | Full access + white-label | 100 req/min |

---

## Rate Limits

- **100 requests per minute** per API key (Pro and Agency plans)
- **20 requests per minute** on the Free plan
- Rate limit headers are included in every response: `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Exceeding the limit returns `429 Too Many Requests`

---

## Configuration

### Claude Code

```bash
claude mcp add --transport http kiln https://your-kiln-instance.com/api/mcp --header "Authorization: Bearer sk-kiln-YOUR_KEY"
```

Or add to your Claude Code config file (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "kiln": {
      "transport": "http",
      "url": "https://your-kiln-instance.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk-kiln-YOUR_KEY"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "kiln": {
      "transport": "http",
      "url": "https://your-kiln-instance.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk-kiln-YOUR_KEY"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP-compatible client can connect using the HTTP transport. Point it to:

```
https://your-kiln-instance.com/api/mcp
```

Pass the API key as a Bearer token in the `Authorization` header.

---

## License

MIT -- see [LICENSE](./LICENSE) for details.

---

## Links

- [KILN Website](https://kiln.so)
- [KILN Dashboard](https://app.kiln.so)
- [Documentation](https://docs.kiln.so)
- [GitHub](https://github.com/hephaistos-systems/kiln)
