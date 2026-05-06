# Workflow-Routing Audit (Phase A)

Snapshot taken at branch `claude/zen-black-1e5131`, May 2026.

## TL;DR

`/dashboard/teams` **is and remains** the canonical workflow editor. The
Phase A spec proposed `/dashboard/workflows` as canonical based on the
assumption that two editors exist — they don't. Only one editor lives
in the codebase, under `/dashboard/teams`.

Phase A applies the **inverse** redirect logic the spec described:
non-canonical paths (`/workflows`, `/workflows/templates`, `/flows`)
redirect to `/dashboard/teams`. The redirects for `/flows` and
`/workflows/templates` are already in place from earlier phases; this
phase adds the missing `/workflows` → `/teams` stub.

`/dashboard/orchestration` is a **separate feature** (agent-to-agent
handoff graph, not a workflow editor) and stays standalone, with a
sidebar tooltip clarifying the distinction.

## What actually exists

| Route | LOC | Purpose | Status |
|---|---|---|---|
| `/dashboard/teams` | 2 388 | Workflow list page (search, templates showcase, quick-start templates, create-workflow modal, import YAML) | **canonical (active)** |
| `/dashboard/teams/[id]` | 3 663 | Workflow detail (visual team editor, member nodes, workflow nodes, executions, logs) | **canonical (active)** |
| `/dashboard/teams/new` | (inline) | Templates gallery for creating from a template | active |
| `/dashboard/teams/monitor` | (inline) | Live monitoring of running workflows | active (Pro+) |
| `/dashboard/teams/ab-tests` | (inline) | A/B test lab | active (Pro+) |
| `/dashboard/workflows` | – | **404 hole** — no `page.tsx` exists | fixed in this phase |
| `/dashboard/workflows/templates` | 11 | Redirect → `/dashboard/teams/new` | active redirect |
| `/dashboard/flows` | 10 | Redirect → `/dashboard/teams` | active redirect |
| `/dashboard/orchestration` | 1 138 | Agent-to-agent handoff graph (`AgentNode` + connections, separate ReactFlow canvas) | **separate feature, kept** |

## Inbound link census

11 inbound links to `/dashboard/teams/*` across the app:

- Sidebar `Workflows` nav item (`src/components/sidebar.tsx`)
- Onboarding checklist's "Build Agent Teams" link
- Mobile quick-actions FAB (`src/components/mobile/mobile-quick-actions.tsx`)
- Marketplace page CTA (`src/app/marketplace/page.tsx`)
- Internal back-links from teams subpages
- The `/dashboard/flows` redirect stub
- The `/dashboard/workflows/templates` redirect stub

0 inbound links to `/dashboard/workflows/[id]` or `/dashboard/workflows`
(non-templates) anywhere in the codebase. The proposed editor at
`/dashboard/workflows` was never built.

## Database models

```
AgentTeam            ← top-level entity (the "workflow")
AgentTeamMember      ← node in the team / workflow
AgentTeamTask        ← task definition
TeamExecution        ← run history
TeamExecutionLog     ← per-step log
TeamPermission       ← collaborators
TeamABTest           ← A/B test pairings
TeamVersion          ← version control
```

**No `Workflow` model exists.** All schema is keyed on `AgentTeam`. The
"workflow" terminology is a UX rename of the same model (Phase 2.x
chose `Workflows` as the user-facing label; the underlying table stayed
`AgentTeam` for backward compatibility).

## API surface

Every endpoint that backs the editor is under `/api/teams/*`:

- `GET /api/teams` (list)
- `POST /api/teams` (create)
- `POST /api/teams/suggest-structure` (AI-assisted creation)
- `POST /api/teams/templates` (template catalog)
- `POST /api/teams/[id]/execute` (run a workflow)
- `POST /api/teams/[id]/executions/[execId]/{approve,reject}` (approval gates)
- `GET /api/teams/monitor` (live monitor feed)

There is NO `/api/workflows/*` namespace. Renaming the namespace would
require updating ~15 call sites + middleware route matchers and is
explicitly out of scope for Phase A (the spec says "KEINE
Code-Konsolidierung in dieser Phase — nur Routing").

## Decision: Teams is canonical

The Phase A spec offered:

> Standard-Empfehlung: `/dashboard/workflows` als kanonisch (kleiner,
> fokussierter, hat AI-Agent-Node + Tools).
>
> Aber wenn Audit zeigt dass `/dashboard/teams` deutlich mehr genutzt /
> feature-reicher ist, dokumentiere das und mache Teams kanonisch
> (mit umgekehrter Redirect-Logik).

The audit shows the second branch is the only viable one — there is no
`/dashboard/workflows` editor to be canonical. Teams is canonical
because it's the only editor that exists.

## Why the spec assumed two editors existed

Likely a memory drift across sessions. The phrase "AI Agent Node +
Tools" probably referenced the `agent-node-config.tsx` component
(`src/components/workflows/node-configs/agent-node-config.tsx`) — a
node-config component that is rendered INSIDE the team editor at
`/dashboard/teams/[id]`. The `src/components/workflows/` directory
holds workflow-related sub-components that the team editor consumes,
not a standalone workflow editor route.

## Orchestration is intentionally separate

`/dashboard/orchestration/page.tsx` (1 138 lines) renders an
agent-to-agent handoff graph: nodes are individual agents, edges are
"hand off conversation when condition X". This is a different feature
from the workflow editor (which composes workflow steps via team
members + workflow nodes).

**Decision:** keep `/dashboard/orchestration` standalone. The phase A
spec offered "behalten als sub-feature" as an option for orchestration —
that's the path taken. Sidebar copy gets a tooltip explaining the
distinction so users don't confuse the two entry-points.

## What this phase changes

1. **Adds `/dashboard/workflows/page.tsx`** as a server-side redirect to
   `/dashboard/teams`. Closes the 404 hole — anyone typing the bare
   path lands on the canonical editor.
2. **Sidebar polish:** the existing `Workflows` → `/dashboard/teams`
   stays. Adds a description-only tooltip clarifying that
   `Orchestration` covers agent handoffs, not workflow steps.
3. **Cross-link:** agent detail page surfaces a "Used in workflows"
   row pointing to the workflows that reference the agent — discovery
   from the agent side without rebuilding the editor.
4. **Smoke tests** pin the redirect paths so a future refactor can't
   silently re-introduce 404s.

## Out of scope (Phase B candidates)

- Renaming the `AgentTeam` Prisma model to `Workflow` (cascades
  through ~30 files, migration risk on production data).
- Renaming `/api/teams/*` → `/api/workflows/*`. Same migration risk +
  every external integration the operator has set up against
  `/api/teams/*` would break.
- Migrating `/dashboard/orchestration` into the team editor as a
  "Routing" tab (it's a different graph topology — would require
  schema work).
- Real templates content for the new `/dashboard/agents/new/templates`
  page (Phase 1 mock cards still in place).
