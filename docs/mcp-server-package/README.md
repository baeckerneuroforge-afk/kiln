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

- **25 MCP tools** for complete agent lifecycle management
- **Agent CRUD** -- create, update, clone, delete agents from your editor
- **RAG knowledge bases** -- add PDFs, URLs, and FAQs with automatic chunking and vector embedding
- **Smart actions** -- toggle appointment booking, email collection, lead scoring, webhooks
- **Custom tools & code** -- extend agents with custom tool definitions and executable code blocks
- **Prompt branching** -- create conditional conversation flows
- **Analytics** -- pull conversation counts, lead data, and estimated revenue
- **Testing** -- create and run test suites before deploying
- **Multi-agent orchestration** -- define handoff rules between agents
- **Webhooks** -- subscribe to agent events (new lead, conversation, appointment)
- **Automations** -- trigger workflows based on agent events
- **White-label** -- configure branding, logos, colors, and custom domains per agent
- **Memory** -- enable persistent conversation memory across sessions
- **BYOK (Bring Your Own Key)** -- use your own LLM API keys
- **Embed code generation** -- get ready-to-paste widget snippets

---

## Tool Reference

| Tool | Description |
|------|-------------|
| `kiln_list_agents` | List all agents in the current workspace |
| `kiln_create_agent` | Create a new agent with name, system prompt, personality, and actions |
| `kiln_update_agent` | Update an existing agent's configuration |
| `kiln_delete_agent` | Permanently delete an agent |
| `kiln_clone_agent` | Clone an existing agent as a new draft (useful for templates) |
| `kiln_add_knowledge` | Add a knowledge base entry (PDF, URL, or FAQ text) for RAG |
| `kiln_deploy_agent` | Deploy an agent to production (makes it live) |
| `kiln_get_analytics` | Retrieve analytics: conversations, leads, appointments, estimated value |
| `kiln_get_conversations` | Fetch recent conversations for an agent |
| `kiln_get_leads` | List captured leads with scores and contact info |
| `kiln_chat` | Send a test message to an agent and receive a streamed response |
| `kiln_add_action` | Enable or disable a built-in action (booking, email, lead scoring, etc.) |
| `kiln_add_custom_tool` | Register a custom tool definition the agent can invoke |
| `kiln_add_custom_code` | Add a custom code block that executes during conversations |
| `kiln_add_branch` | Add a prompt branch for conditional conversation routing |
| `kiln_set_white_label` | Configure white-label branding (logo, colors, domain, disclaimer) |
| `kiln_set_memory` | Enable or disable persistent memory for an agent |
| `kiln_create_automation` | Create an event-driven automation (e.g., new lead triggers email) |
| `kiln_create_test` | Define a test case with input message and expected behavior |
| `kiln_run_tests` | Execute all test cases for an agent and return results |
| `kiln_get_embed_code` | Generate the HTML/JS embed snippet for a deployed agent |
| `kiln_orchestrate` | Define multi-agent orchestration rules and handoff conditions |
| `kiln_create_webhook` | Register a webhook URL for agent events |
| `kiln_list_webhooks` | List all registered webhooks for an agent |
| `kiln_delete_webhook` | Remove a registered webhook |

---

## Example Workflows

### 1. Full Agent Deploy

Create an agent from scratch, train it, and ship it -- all from your editor.

```
You: Create an agent called "Support Bot" for a SaaS product. It should answer
     billing questions, help with password resets, and escalate complex issues.

     Then add our FAQ document as knowledge, enable email collection and
     appointment booking, deploy it, and give me the embed code.
```

Behind the scenes, this triggers:
1. `kiln_create_agent` -- creates the agent with system prompt and personality
2. `kiln_add_knowledge` -- uploads and chunks the FAQ document
3. `kiln_add_action` -- enables email collection and appointment booking
4. `kiln_deploy_agent` -- pushes the agent live
5. `kiln_get_embed_code` -- returns the widget snippet

### 2. Multi-Agent Sales Team

Build a coordinated sales pipeline with specialized agents.

```
You: Create three agents: a Qualifier that asks budget/timeline questions,
     a Closer that handles objections and presents pricing, and an Onboarding
     agent that walks new customers through setup. Set up handoffs so the
     Qualifier passes hot leads to the Closer, and the Closer passes
     signed customers to Onboarding.
```

Behind the scenes:
1. `kiln_create_agent` x3 -- creates Qualifier, Closer, and Onboarding agents
2. `kiln_add_action` -- enables lead scoring on Qualifier, email on Closer
3. `kiln_orchestrate` -- defines handoff rules between the three agents

### 3. Client Onboarding (Agency)

Quickly spin up a branded agent for a new client using a template.

```
You: Clone the "Real Estate" template agent for our client Prestige Properties.
     Set their branding: logo URL, primary color #1A3A5C, remove the
     "Powered by KILN" badge. Add their property listings PDF as knowledge,
     then deploy to prestige.kiln.so.
```

Behind the scenes:
1. `kiln_clone_agent` -- clones the real estate template
2. `kiln_set_white_label` -- applies client branding and custom domain
3. `kiln_add_knowledge` -- uploads the property listings PDF
4. `kiln_deploy_agent` -- deploys to the custom domain

### 4. CI/CD Testing

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
