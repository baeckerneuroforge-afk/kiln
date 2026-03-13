# Agent Configuration Templates

This directory contains importable JSON configuration files for KILN AI agents. Each template is a ready-to-use agent setup for a specific industry, complete with system prompts, personality settings, suggested questions, and pre-configured actions.

## Available Templates

| File | Industry | Description |
|------|----------|-------------|
| `yoga-studio.json` | Fitness & Wellness | Yoga studio assistant that answers questions about classes, pricing, and trial sessions. Collects leads and books appointments. |
| `real-estate.json` | Real Estate | Professional property advisor that qualifies buyers and renters, answers property questions, and books viewings. |
| `coach.json` | Coaching & Consulting | Business coaching assistant that explains programs, identifies client challenges, and books discovery calls. |
| `shk-handwerker.json` | Plumbing, Heating & AC | HVAC and plumbing trade assistant that handles service inquiries, provides rough estimates, and books on-site appointments. |
| `restaurant.json` | Hospitality | Restaurant concierge that answers menu questions, handles dietary requirements, and takes reservations. |

## How to Import

### Via the Dashboard

1. Go to **Agents > Templates** in your KILN dashboard
2. Click **Import Config**
3. Select the JSON file or paste its contents
4. Customize the agent name, branding, and knowledge base
5. Deploy

### Via MCP (Claude Code / Cursor)

Use the `kiln_create_agent` tool and pass the JSON config as the agent definition:

```
Create an agent using the config from docs/templates/yoga-studio.json
```

Your MCP client will read the file and call `kiln_create_agent` with the template values.

## Important Notes

- **Templates do not include knowledge base content.** After importing a template, add your own knowledge base entries (PDFs, URLs, FAQs) to train the agent on your specific business information.
- **System prompts are starting points.** Customize them to match your brand voice, specific services, and policies.
- **Actions are pre-configured but may need setup.** For example, appointment booking requires connecting your calendar integration in the dashboard.
- All templates use `claude-sonnet-4-20250514` as the default LLM model. You can change this in the agent settings after import.
