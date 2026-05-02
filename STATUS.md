# KILN — Build Status

**Phase 0 — Pre-Launch Audits**
Lebendes Dokument zum Tracking welche Module wirklich funktionieren vs. nur Gerüst sind.

---

## Agent Builder

**Code Status:** Working (mit Polish-Bedarf)
**Audit Date:** 2026-05-02

### User Flow Coverage

| Step | Code Exists | UI Exists | Functional |
|------|-------------|-----------|------------|
| Create Agent | ✅ | ✅ | ✅ (zu testen) |
| Set System Prompt | ✅ | ✅ | ✅ (zu testen) |
| Upload Knowledge Base | ✅ | ✅ | ✅ (zu testen) |
| Add Custom Tool | ✅ | ✅ | ✅ (zu testen) |
| Test Agent (internal chat) | ✅ | ✅ | ✅ (zu testen) |
| Publish/Use Agent | ✅ | ✅ | ✅ (zu testen) |

Legende: ✅ Code vorhanden und plausibel implementiert. "Functional" wird erst durch manuellen E2E-Test bestätigt (siehe unten).

### Architecture Map

- **DB Tables (Prisma Models, [prisma/schema.prisma](prisma/schema.prisma)):**
  - `Agent` — Kern-Model (id, slug, systemPrompt, llmModel, agentMode CHAT/TASK, status DRAFT/LIVE/PAUSED, personality, welcomeMessage, suggestedQuestions, temperature, modelProvider, whiteLabel, customDomain, autoDetectLanguage, memoryEnabled, imageAnalysisEnabled)
  - `AgentAction` — pre-built actions (BOOK_APPOINTMENT, COLLECT_EMAIL, SEND_EMAIL, SCORE_LEAD, NOTIFY_OWNER, FIRE_WEBHOOK, HANDOFF_HUMAN, HTTP_REQUEST)
  - `AgentCustomTool` — user-definierte HTTP-Tools (name, method, url mit `{{var}}`, headers, bodyTemplate, responseMapping)
  - `KnowledgeBase` — KB-Quellen (type PDF/URL/FAQ/TEXT, sourceName, content, chunkCount, embeddingStatus PENDING/PROCESSING/READY/ERROR)
  - `Conversation` + `Message` — Chat-Historie mit leadScore, channel, visitorEmail
  - `AgentTestCase` + `AgentTestRun` — Testfälle mit erwarteten Keywords
  - `AgentVersion` — Snapshot-Versionierung
  - `AgentRun` — Task-Agent-Runs mit creditsUsed, duration, status
  - `Lead`, `AgentMemory`, `VisitorMemory`, `AgentTeam`, `TeamMember`, `AgentOrchestration`

- **API Routes** (alle unter `src/app/api/agents/`):
  - `agents/route.ts` — GET (list), POST (create mit Plan-Limits + Slug-Collision-Handling)
  - `agents/[id]/route.ts` — GET, PATCH (mit Versionierung + Webhook-Trigger), DELETE
  - `agents/[id]/chat/route.ts` — **1787 Zeilen** Streaming-Chat mit RAG, Tool-Use, Memory
  - `agents/[id]/run/route.ts` — Task-Agent-Execution (Pre/Post-Process + Output-Routing)
  - `agents/[id]/knowledge/route.ts` — KB-CRUD + Trigger Async-Embed
  - `agents/[id]/knowledge/[kbId]/embed/route.ts` — Batch-Embedding-Pipeline
  - `agents/[id]/custom-tools/route.ts` — Custom-Tool-CRUD
  - `agents/[id]/actions/route.ts` — Pre-built-Actions-CRUD
  - `agents/[id]/tests/route.ts` — Test-Cases erstellen + ausführen
  - `agents/[id]/analytics/route.ts` — Conversation/Lead-Stats
  - `agents/[id]/versions/route.ts` — Snapshot-History
  - Weitere: `budget`, `research`, `discover-api`, `roi`, `visitor-memories`, `automations`, `channels`, `mcp`, `model-routing`, `event-subscriptions`, `webhooks`, `clone`, `team`, `verify-domain`, `watch-learn`, `corrections`, `eval`, `test-compare`, `preview`, `logs`, `conversations`
  - `api/embed/widget.js/route.ts` + `api/embed/config/[id]/route.ts` — Universal-Embed-Script
  - `api/ai/generate-agent/route.ts` — Agent aus Beschreibung generieren

- **Main UI Pages:**
  - [src/app/dashboard/agents/page.tsx](src/app/dashboard/agents/page.tsx) — Agent-Liste
  - [src/app/dashboard/agents/new/page.tsx](src/app/dashboard/agents/new/page.tsx) — Mode-Switch CHAT vs. TASK
  - [src/app/dashboard/agents/[id]/page.tsx](src/app/dashboard/agents/[id]/page.tsx) — Edit-View mit Tab-Navigation
  - [src/app/dashboard/agents/templates/page.tsx](src/app/dashboard/agents/templates/page.tsx) — Vorlagen
  - [src/app/embed/[slug]/page.tsx](src/app/embed/[slug]/page.tsx) — Public Iframe-Chat (nur wenn `status=LIVE`)
  - [src/app/a/[slug]/page.tsx](src/app/a/[slug]/page.tsx) — Public-Agent-Page (Standalone)
  - Tab-Komponenten in [src/components/agents/](src/components/agents/): `agent-wizard.tsx`, `actions-tab.tsx`, `custom-tools-tab.tsx`, `knowledge-tab.tsx`, `agent-live-chat.tsx`, `agent-preview.tsx`, `analytics-tab.tsx`, `versions-tab.tsx`, `test-lab.tsx`, `branches-tab.tsx`, `memory-tab.tsx`, `integrations-tab.tsx`, `mcp-connections-tab.tsx`, `webhooks-tab.tsx`, `automations-tab.tsx`, `event-subscriptions-tab.tsx`, `model-routing-tab.tsx`, `visitor-memory-tab.tsx`, `research-tab.tsx`, `logs-tab.tsx`, `logic-block-editor.tsx`, `custom-code-editor.tsx`, `api-discoverer.tsx`, `watch-learn-uploader.tsx`

- **Knowledge Base Storage:**
  - Supabase Storage Bucket: `knowledge` (Pfad: `knowledge/{agentId}/{timestamp}-{filename}`)
  - pgvector-Tabelle: `knowledge_chunks` (Migration: [supabase/migrations/001_knowledge_chunks.sql](supabase/migrations/001_knowledge_chunks.sql))
  - Team-KB-Tabelle: `team_knowledge_chunks` (Migration: [supabase/migrations/002_team_knowledge_chunks.sql](supabase/migrations/002_team_knowledge_chunks.sql))
  - Embedding-Modell: OpenAI `text-embedding-3-small` ([src/lib/rag.ts:46](src/lib/rag.ts:46))
  - Retrieval: Supabase RPC `match_knowledge_chunks` ([src/lib/rag.ts:143](src/lib/rag.ts:143))

- **Tool System:**
  - Pre-built Actions als Toggle-Cards in `actions-tab.tsx` → `AgentAction`-Records
  - Custom Tools als Form in `custom-tools-tab.tsx` → `AgentCustomTool`-Records mit `{{variable}}`-Interpolation
  - Beide werden in [src/lib/services/action-service.ts](src/lib/services/action-service.ts) (`buildTools()`, ~941 Zeilen) zu Anthropic `tool_use`-Definitionen konvertiert
  - Tool-Execution während Chat in `agents/[id]/chat/route.ts` (Lines ~1400+) mit JSON-Path-Response-Mapping

### Findings — Was existiert

- **Agent CRUD vollständig**: [src/app/api/agents/route.ts:62-76](src/app/api/agents/route.ts:62) validiert Pflichtfelder, prüft Plan-Limits via `canCreateAgent(userId)`, behandelt Slug-Collisions ([Zeile 87-88](src/app/api/agents/route.ts:87)).
- **System Prompt End-to-End**: Field `systemPrompt` (TEXT, NOT NULL) in DB → Wizard generiert Prompt aus Goal/Industry/Tone ([agent-wizard.tsx:62-100](src/components/agents/agent-wizard.tsx:62)) → Manueller Editor im Edit-View → wird in `chat/route.ts:562` als Anthropic-System-Message verwendet → `promptBranches` (JSON) für keyword-basierte Snippets.
- **Knowledge Base Pipeline real**: PDF/URL/FAQ/TEXT-Upload in [knowledge-tab.tsx:308](src/components/agents/knowledge-tab.tsx:308) (`accept=".pdf"`) → Supabase Storage Upload ([src/app/api/agents/[id]/knowledge/route.ts:100-125](src/app/api/agents/[id]/knowledge/route.ts:100)) → Chunking (1000 Chars, 200-Char Overlap) in [src/lib/rag.ts:18-44](src/lib/rag.ts:18) → OpenAI Embeddings batched ([src/lib/rag.ts:50-108](src/lib/rag.ts:50)) → Insert in `knowledge_chunks` ([src/lib/rag.ts:127](src/lib/rag.ts:127)) → Status `READY` ([embed/route.ts:148](src/app/api/agents/[id]/knowledge/[kbId]/embed/route.ts:148)).
- **RAG im Chat aktiv**: [src/app/api/agents/[id]/chat/route.ts:508-511](src/app/api/agents/[id]/chat/route.ts:508) ruft `searchRelevantChunks(agentId, query, 5)` und injectet Kontext nur wenn `knowledgeBases.length > 0`. Lädt nur KBs mit `embeddingStatus: "READY"` ([Zeile 184](src/app/api/agents/[id]/chat/route.ts:184)).
- **Custom Tools = echte Anthropic Tools**: Konvertiert in `buildTools()` ([action-service.ts:117](src/lib/services/action-service.ts:117)), HTTP-Execution mit `{{var}}`-Interpolation und JSON-Path-Response-Mapping (`data.results[0].name`).
- **8 Pre-built Actions implementiert**: BOOK_APPOINTMENT (Google Calendar + Calendly-Fallback), COLLECT_EMAIL (Lead-Storage), SEND_EMAIL (Resend), SCORE_LEAD (Claude scored 1-10), NOTIFY_OWNER (Email + Slack), FIRE_WEBHOOK, HANDOFF_HUMAN, HTTP_REQUEST.
- **Test-Chat mit Streaming**: [agent-live-chat.tsx](src/components/agents/agent-live-chat.tsx) → Anthropic `ReadableStream`, Tool-Use-Loop, Bild-Upload für `imageAnalysisEnabled` Agents.
- **Test-Lab funktional**: Test-Cases mit erwarteten Keywords ([api/agents/[id]/tests/route.ts:99-150](src/app/api/agents/[id]/tests/route.ts:99)), `AgentTestRun` speichert Pass/Fail.
- **Task-Agent-Runtime**: Pre-Process Conditions + JS-Sandbox ([src/lib/safe-eval.ts](src/lib/safe-eval.ts)) → LLM mit Tools → Post-Process Branches → Output-Routing (EMAIL/HTTP/NEXT_AGENT/WEBHOOK).
- **Public-Embed real**: Universal-Widget-Script in [api/embed/widget.js/route.ts](src/app/api/embed/widget.js/route.ts), Iframe-Page lädt nur LIVE-Agents ([embed/[slug]/page.tsx:31-33](src/app/embed/[slug]/page.tsx:31)), CORS + Rate-Limit auf Chat-Endpoint ([chat/route.ts:73-76](src/app/api/agents/[id]/chat/route.ts:73)).
- **White-Label**: `whiteLabel` JSON-Field (logo, primaryColor, position, customCss, soundEnabled, avatarUrl) + `customDomain` + `showPoweredBy` Flag.
- **Versioning**: PATCH erstellt Snapshot in `AgentVersion` mit `versionNumber` + Config-JSON.
- **Memory-System**: `AgentMemory` (cross-session) + `VisitorMemory` (per-visitor), beide in System-Prompt injectet.
- **MCP-Integration**: `src/lib/mcp/` Verzeichnis für Anthropic Model Context Protocol.
- **Multimodal**: Bildanalyse via Vision-API, Auto-Actions bei Doc-Detection.
- **Integrations vorhanden**: Google Calendar, HubSpot, Notion, Stripe, Airtable in `src/lib/integrations/`.

### Findings — Was fehlt / halb-gebaut

- **In-App-Onboarding-Docs**: Kein sichtbarer Guide für System-Prompt-Best-Practices, Custom-Tool `{{var}}`-Syntax, KB-Chunking-Strategie. Nur `docs/KILN_Agent_Builder_Spec.docx` als externes Dokument.
- **KB-Chunk-Tuning**: Hardcoded 1000-Char-Chunks ([src/lib/rag.ts:20](src/lib/rag.ts:20)), keine UI um Chunk-Size oder Overlap pro KB anzupassen.
- **File-Type-Limits bei KB-Upload**: `accept=".pdf"` ([knowledge-tab.tsx:308](src/components/agents/knowledge-tab.tsx:308)) — keine DOCX/TXT/CSV/Markdown trotz `KnowledgeBaseType` Enum (PDF/URL/FAQ/TEXT) in Schema. Andere Typen sind nur über manuelle Eingabe (Text-Field/URL/FAQ-Pairs) erreichbar, nicht als Datei-Upload.
- **Custom-Tool-Debugging**: Response-Mapping ist String-Pfad (`data.results[0].name`) — bei Fehlern keine UI um Raw-Response zu inspizieren.
- **Pre-Process Conditions**: Nur einfache `field op value`-Logik, keine Datums-/Regex-/Komplex-Bedingungen.
- **Monitoring/Alerting**: `agent-health-monitor.ts` existiert, aber kein aktives Alerting (Email/Slack bei Errors).
- **Cost Visibility**: `creditsUsed` wird in `AgentRun` gespeichert, aber kein Per-Operation-Breakdown im UI sichtbar.
- **KB-Embedding-Retry**: Bei `embeddingStatus="ERROR"` kein expliziter Retry-Button im UI sichtbar (zu verifizieren).
- **Bekannte Vor-Audit-Issues** ([kiln-audit-report.md](kiln-audit-report.md)): `/api/agents/generate` referenziert in `onboarding-wizard.tsx:66` aber Endpoint heißt `/api/ai/generate-agent` (BC-03), Unauth-LLM-Endpoint `/api/ai/generate-agent` (CR-01).

### Critical Gaps für Launch

1. **Auth-Lücke `/api/ai/generate-agent`** ([src/app/api/ai/generate-agent/route.ts](src/app/api/ai/generate-agent/route.ts)): Laut Vor-Audit (CR-01) ohne `auth()`/Rate-Limit/Credits — kostenrisiko bei Public-Endpoint. **Muss vor Launch geschlossen werden.**
2. **Onboarding-Wizard Broken Fetch** ([src/components/onboarding-wizard.tsx:66](src/components/onboarding-wizard.tsx:66)): Ruft `/api/agents/generate` (404) statt `/api/ai/generate-agent`. Onboarding für Agent Builder funktioniert dadurch nicht.
3. **Manueller E2E-Test fehlt**: Code wirkt vollständig, aber niemand hat den End-to-End-Flow (Create → Prompt → KB → Tool → Test → Publish → Embed-Visit) auf Production durchgespielt. Browser-Test ist Pflicht vor Launch.
4. **Erweiterte File-Types für KB**: Nur PDF-Upload — Konkurrenz erlaubt DOCX/TXT/Markdown. Schema unterstützt es nicht direkt (Type-Enum hat nur PDF/URL/FAQ/TEXT), aber UI-Upload-Komponente sollte mehr akzeptieren oder Limitierung explizit kommunizieren.
5. **KB-Embedding-Status-UI**: User braucht klare Indication wenn Embedding "PROCESSING" ist (Spinner), "ERROR" (Retry-Button), "READY" (Häkchen). Status-Werte existieren — UI-Polish nötig.
6. **Cost-Caps sichtbar machen**: `maxCreditsPerRun` und `monthlyCostCapCents` existieren in DB, aber User-facing UI um Caps zu setzen ist unklar.

### Pending: Manual E2E Test by User

User muss folgende Schritte manuell durchklicken:

1. [ ] Auf [kilnbase.com](https://kilnbase.com) einloggen als Admin
2. [ ] Neuen Agent "DSGVO Berater" erstellen (Mode = CHAT)
3. [ ] System Prompt setzen: "Du bist DSGVO-Experte, antworte präzise mit Verweis auf Artikel"
4. [ ] 3 Test-PDFs als Knowledge Base hochladen — beobachten ob `embeddingStatus` von PROCESSING → READY wechselt
5. [ ] Custom Tool hinzufügen (z.B. Webhook zu [webhook.site](https://webhook.site)) — Variable im URL-Template testen
6. [ ] Im Test-Chat fragen: "Was sagt Artikel 17 DSGVO?" — verifizieren dass KB-Kontext eingebracht wird (Antwort sollte aus PDF zitieren)
7. [ ] Tool-Aufruf triggern und auf webhook.site prüfen
8. [ ] Agent auf `LIVE` setzen → `/embed/{slug}` öffnen, Iframe-Chat testen
9. [ ] Embed-Snippet in Test-HTML einbinden ([test-embed.html](test-embed.html)) — Widget-Loading prüfen
10. [ ] Screenshot von jedem Schritt für die Build-Doku

---

## Action Agents

**Status:** Partial (Architektur und Execution real, aber fehlende I/O-Schemas und keine separate UI)
**Audit Date:** 2026-05-02

Hinweis: Im Code existieren ZWEI verschiedene "Type"-Felder am Agent-Model — leicht zu verwechseln:
- `agentType: AgentType { PUBLIC, INTERNAL }` ([prisma/schema.prisma:106](prisma/schema.prisma:106), Enum [Zeile 225](prisma/schema.prisma:225)) — **Sichtbarkeits-Scope** (extern embeddable vs. nur intern aufrufbar).
- `agentMode: AgentMode { CHAT, TASK }` ([prisma/schema.prisma:107](prisma/schema.prisma:107), Enum [Zeile 230](prisma/schema.prisma:230)) — **Funktionaler Modus** (Chat-Streaming vs. Task-Execution).

"Action Agents" ≙ `agentMode = TASK` plus optional `agentType = INTERNAL`.

### DB Schema

- **agentType-Field:** `AgentType { PUBLIC, INTERNAL }` in [prisma/schema.prisma:106](prisma/schema.prisma:106) — bestimmt Embed-Verfügbarkeit.
- **agentMode-Field:** `AgentMode { CHAT, TASK }` in [prisma/schema.prisma:107](prisma/schema.prisma:107) — primärer Differenzierungs-Schalter.
- **TASK-spezifische Felder** ([prisma/schema.prisma:109-117](prisma/schema.prisma:109)):
  - `triggerType: TriggerType { MANUAL, SCHEDULE, WEBHOOK, EVENT }`
  - `triggerConfig: Json` — `{ cron, webhookPath, sourceAgentId }`
  - `preProcessConfig: Json` — `{ enabled, code, conditions: [{field,op,value,action}] }`
  - `postProcessConfig: Json` — `{ enabled, code, conditions, branches: [{name,condition,outputType,outputConfig}] }`
  - `outputType: OutputType { NONE, HTTP_REQUEST, EMAIL, NEXT_AGENT, WEBHOOK, CUSTOM_CODE }`
  - `outputConfig: Json` — `{ url, email, targetAgentId, code }`
  - `lastRunAt`, `lastRunResult`
- **Differentiating Fields gegenüber Chat-Agents:** `triggerType`, `triggerConfig`, `preProcessConfig`, `postProcessConfig`, `outputType`, `outputConfig`, `lastRunAt`, `lastRunResult`. Alle anderen Felder (Knowledge, Tools, Actions, Memory, white-label) sind shared.

### Standalone Execution

- **Trigger via API:** Ja — `POST /api/agents/[id]/run` ([src/app/api/agents/[id]/run/route.ts](src/app/api/agents/[id]/run/route.ts), `maxDuration = 120s` an [Zeile 19](src/app/api/agents/[id]/run/route.ts:19)). Mode-Guard wirft 400 wenn `agentMode !== "TASK"` ([Zeile 58](src/app/api/agents/[id]/run/route.ts:58)). Pre-Process Conditions + JS-Sandbox → LLM → Post-Process Branches → Output-Routing.
- **Trigger via Workflow:** Ja — NodeType `agent` in Workflow-Graph referenziert `agentId`, [executeAgentNode()](src/lib/services/workflow-runtime.ts:1266) erstellt Mini-Execution.
- **Trigger via Schedule:** Ja — `triggerType = SCHEDULE` mit Cron in `triggerConfig.cron` → Vercel Cron `/api/cron/team-schedules` täglich 8:00 ([src/app/api/cron/team-schedules/route.ts](src/app/api/cron/team-schedules/route.ts), 321 LOC) prüft `isTeamScheduleDue` und feuert Execution.

### Input/Output Schemas

- **Input Schema:** ❌ **Fehlt am Agent-Model.** Es gibt KEIN `inputSchema`-Field — Eingabe ist freier JSON-Body. TASK-Agents akzeptieren beliebige Felder, Erwartung wird implizit über `preProcessConfig.conditions` und systemPrompt definiert.
- **Output Schema:** ⚠️ **Existiert nur auf Team-Member-Level**, nicht auf Agent selbst. [prisma/schema.prisma:1023](prisma/schema.prisma:1023) → `AgentTeamMember.outputSchema: Json` als `[{ field, type, description }]`. Standalone Action-Agent → kein typed Output-Schema.
- **Konsequenz:** Workflow-Integration funktioniert über lose `{{ node_X.output }}`-Referenzen statt typsicherer Schema-Validierung. Für Production-Use mit externen Workflow-Integrationen ist das eine Schwachstelle.

### UI

- **Wizard-Differenzierung:** Ja — Onboarding-Wizard ([src/components/onboarding-wizard.tsx:31](src/components/onboarding-wizard.tsx:31)) hat State `agentType: "CHAT" | "TASK"` (Variable-Name irreführend, gemeint ist `agentMode`).
- **Mode-Switch im New-Agent-Flow:** [src/app/dashboard/agents/new/page.tsx:13-34](src/app/dashboard/agents/new/page.tsx:13) bietet CHAT vs. TASK-Auswahl beim Erstellen.
- **Detail-View:** [src/components/agents/task-agent-detail.tsx](src/components/agents/task-agent-detail.tsx) als dedizierte Komponente für TASK-Agents (Pre/Post-Process-Editor, Trigger-Konfiguration, Run-History).

### Top Findings

- **Action Agents sind real**, nicht nur Schema. Pre-Process Conditions + JS-Sandbox ([src/lib/safe-eval.ts](src/lib/safe-eval.ts)) → LLM-Call → Post-Process Branches mit Output-Routing zu Email/Webhook/Next-Agent/Custom-Code. Vollständiger Execution-Pipeline in [run/route.ts](src/app/api/agents/[id]/run/route.ts).
- **Cron-Trigger feuert tatsächlich**. Vercel Cron `team-schedules` täglich 8:00 mit Goal-Decomposer via Claude.
- **Branding-Konflikt zwischen Wizard und Schema**: Wizard verwendet Begriff "TASK" für Mode, Schema-Field heißt aber `agentMode`. State-Variable-Naming `agentType` für Mode-Wahl ist verwirrend, weil tatsächliches `agentType`-Field anderen Zweck hat.

### Critical Gaps

1. **Kein Input-Schema am Agent-Level** — User können nicht definieren "Dieser Agent erwartet `{ email: string, message: string }`". Workflow-Builder muss raten was Agent will.
2. **Output-Schema nur auf Team-Member-Level**, nicht standalone — Wenn Agent außerhalb eines Teams aufgerufen wird, ist sein Output-Format nicht typisiert.
3. **Cron-Granularität nur täglich** in [vercel.json](vercel.json) — sub-tag-Schedules erfordern engeres Cron-Interval.
4. **TASK-Agents nicht prominent in UI** — Standard-Wizard und Listen-View bevorzugen CHAT-Mode visuell.

---

## Workflow Engine

**Status:** Partial-Production (Engine + Builder real, aber Visual-Builder unter "/dashboard/teams" versteckt, keine externe Queue für >300s Runs)
**Audit Date:** 2026-05-02

Hinweis: Workflows leben im Code unter "Teams" (`AgentTeam`-Model + `team.config.workflow` JSON). Es gibt kein eigenes `Workflow`-Model — der Begriff "Team" wird im Code als Container für Agent-Hierarchie + Workflow-Graph verwendet.

### Visual Builder

- **Library:** Xyflow (ReactFlow-Nachfolger) — Imports in [visual-team-editor.tsx:5-27](src/components/teams/visual-team-editor.tsx:5).
- **Path:** [src/components/teams/visual-team-editor.tsx](src/components/teams/visual-team-editor.tsx) (~2317 LOC), eingebunden in [src/app/dashboard/teams/[id]/page.tsx:3025](src/app/dashboard/teams/[id]/page.tsx:3025).
- **Functional:** Ja — Drag-and-Drop, Bezier-Edges, Mini-Map, Pan/Zoom, Node-Search, Per-Node-Config-Panels in [src/components/workflows/node-configs/](src/components/workflows/node-configs/) (7 Files).
- **Lücke:** Kein dedizierter `/dashboard/workflows/[id]/edit`-Pfad. [src/app/dashboard/workflows/](src/app/dashboard/workflows/) hat nur `templates/` und `form/` Subroutes.

### Node Types

| Kategorie | Anzahl | Beispiele | Implementation |
|-----------|--------|-----------|----------------|
| Trigger | 5 | webhook, schedule, lead, chat, manual | [trigger-nodes.ts](src/lib/workflow-nodes/trigger-nodes.ts) (156 LOC) |
| Logic | 5 | if_condition, switch, filter, transform, loop | [logic-nodes.ts](src/lib/workflow-nodes/logic-nodes.ts) |
| Action | 5 | http_request, send_email, send_slack, delay, set_variable | [action-nodes.ts](src/lib/workflow-nodes/action-nodes.ts) (398 LOC) |
| Control | 5 | approval_gate, wait_webhook, wait_form, sub_workflow, merge | [control-nodes.ts](src/lib/workflow-nodes/control-nodes.ts) |
| Integrations | 8 | google_sheets_read/write, gmail_send, slack_oauth, calendar_create/check, notion_create, airtable_create | [integration-nodes.ts](src/lib/workflow-nodes/integration-nodes.ts) (551 LOC), echte OAuth + APIs |
| AI Tools | 7 | ai_summarize, ai_classify, ai_extract, computer_use (~2471 LOC), deep_research (~570 LOC), code_sandbox (~404 LOC), diff_detection | [ai-nodes.ts](src/lib/workflow-nodes/ai-nodes.ts) + dedizierte Files |
| Agent | 2 | agent (User-erstellt), llm_prompt (Inline) | [agent-nodes.ts](src/lib/workflow-nodes/agent-nodes.ts) (76 LOC) |
| Advanced | 7 | a2a_call, goal_trigger, spawn_helper, agent_swarm (~487 LOC), parallel_split, parallel_merge, mcp_tool | [agent-swarm-node.ts](src/lib/workflow-nodes/agent-swarm-node.ts), [parallel-node.ts](src/lib/workflow-nodes/parallel-node.ts) |

**Total: 42+ Node-Types**, vollständig deklariert in [src/lib/workflow-node-types.ts](src/lib/workflow-node-types.ts) (682 LOC).

### Execution

- **Mode:** Async — DAG-Traversal in [src/lib/services/workflow-runtime.ts:313](src/lib/services/workflow-runtime.ts:313) `executeWorkflow()` (2143 LOC). Sub-Workflows können sync oder async sein ([Zeile 1464-1492](src/lib/services/workflow-runtime.ts:1464)).
- **Long-Running Support:** Ja, aber **nicht via externer Queue**. Stattdessen Checkpoint-Resume via [src/lib/execution-persistence.ts](src/lib/execution-persistence.ts):
  - `saveCheckpoint()` ([Zeile 78-107](src/lib/execution-persistence.ts:78)) speichert Context + executed Node-IDs.
  - `loadCheckpoint()` ([Zeile 148-181](src/lib/execution-persistence.ts:148)) resumed bei `resumeExecutionId`.
  - Checkpoint alle 3 Nodes (`shouldCheckpoint()` [Zeile 339](src/lib/execution-persistence.ts:339)).
  - `DEFAULT_MAX_EXECUTION_MS = 30 * 60 * 1000` (30 Min, [Zeile 306](src/lib/execution-persistence.ts:306)) — über Vercel-Single-Function-Limit hinaus durch Resume.
  - Pre-operation Checkpoints vor expensive Nodes (computer-use, code, LLM).
- **Queue/Worker System:** **Keine externe Queue.** Kein Inngest, Trigger.dev, BullMQ, Temporal, @vercel/queue. Bestätigt: 0 Treffer in [package.json](package.json) und Source-Tree.
- **Vercel-Mechanismen:** `waitUntil` von `@vercel/functions` für deferred Promises ([src/app/api/teams/[id]/executions/route.ts:39](src/app/api/teams/[id]/executions/route.ts:39)). Resume via separate API-Calls statt Self-Recursion.
- **maxDuration-Konfig:**
  - `/api/cron/monthly-report`, `/api/cron/weekly-report`, `/api/cron/trend-alerts`: **300s** (Plan-Limit)
  - `/api/agents/[id]/run`: **120s**
  - `/api/webhooks/agent/[path]`, `/api/mcp`: **60s**
  - Workflow-Execution-Routes: kein expliziter Override, fallen auf Vercel-Default zurück (jetzt 300s laut neuem Knowledge-Update).

### Data Flow

- **Variable-System:** Workflow-Variablen separat von Node-Outputs in [src/components/workflows/variables-panel.tsx](src/components/workflows/variables-panel.tsx). Globale Vars über `{{ variables.X }}`.
- **Mapping-Syntax:** `{{ node_${nodeId}.output.field }}` für Node-zu-Node-Datenfluss. Trigger-Payload als `{{ body.X }}` oder `{{ trigger.X }}`. Pipes (`| upper`, `| default("foo")`).
- **Expression-Engine:** [src/lib/workflow-expressions.ts](src/lib/workflow-expressions.ts) (385 LOC) — Dot-Notation, Array-Indexing, 15+ Built-ins (string, math, date, array, JSON).
- **Visual DataMapper:** [src/components/workflows/data-mapper.tsx](src/components/workflows/data-mapper.tsx) — Source-Field → Target-Field-Mapping mit `INPUT_FIELDS`/`OUTPUT_FIELDS` per Node-Type.
- **Context-Propagation in Runtime:** [workflow-runtime.ts:397-404](src/lib/services/workflow-runtime.ts:397) initialisiert `ExpressionContext`, jeder Node schreibt `contextDelta`.

### Persistence

- **DB Table:** `AgentTeam.config: Json` ([prisma/schema.prisma:959+](prisma/schema.prisma:959)) — speichert `{ workflow: { nodes[], edges[], variables[] } }`. **Nicht normalisiert** — kein dediziertes `Workflow` oder `WorkflowNode`-Model.
- **Format:** JSON-DAG mit nodes, edges (mit handle-IDs für error-routing), variables.
- **Versioning:** Ja — separates `TeamVersion`-Model ([prisma/schema.prisma:566](prisma/schema.prisma:566)) mit Snapshot-Storage. Diff-Engine in [src/lib/workflow-versioning.ts:73-96](src/lib/workflow-versioning.ts:73) computes Node/Edge/Variable-Changes. Rollback supported. Auch [AgentVersion](src/lib/agent-versioning.ts) für einzelne Agents.

### Error Handling

- **Retry:** ❌ Keine automatische Retry-Logik im Runtime. Failures triggern Error-Edge oder beenden Execution.
- **Error Branches:** ✅ Ja — Edges mit `sourceHandle: "error"` werden bei Node-Failure traversiert ([workflow-runtime.ts:243-253](src/lib/services/workflow-runtime.ts:243)). Visual-Builder hat dedizierte Error-Handles.
- **Notifications:** ⚠️ Existiert über `error_handler_config` ([src/components/workflows/error-handler-config.tsx](src/components/workflows/error-handler-config.tsx)), aber System-weite Alerting unklar.
- **Approval-Gate-Timeout:** Konfigurierbar in `wait_form`-Node ([workflow-node-types.ts:325-338](src/lib/workflow-node-types.ts:325)), Resolution via `resolveTimedOutApprovalIfNeeded()`.

### Output Targets

| Target | Code Exists | Functional | Datei |
|--------|-------------|------------|-------|
| Email (Resend) | ✅ | ✅ | [action-nodes.ts:110-184](src/lib/workflow-nodes/action-nodes.ts:110) |
| Email (Gmail OAuth) | ✅ | ✅ | [integration-nodes.ts:131-176](src/lib/workflow-nodes/integration-nodes.ts:131) |
| Slack (Webhook) | ✅ | ✅ | [action-nodes.ts:188-240](src/lib/workflow-nodes/action-nodes.ts:188) |
| Slack (OAuth) | ✅ | ✅ | [integration-nodes.ts:180-229](src/lib/workflow-nodes/integration-nodes.ts:180) |
| Google Sheets Write | ✅ | ✅ | [integration-nodes.ts:75-127](src/lib/workflow-nodes/integration-nodes.ts:75) |
| Google Sheets Read | ✅ | ✅ | [integration-nodes.ts:29-71](src/lib/workflow-nodes/integration-nodes.ts:29) |
| Google Calendar | ✅ | ✅ | [integration-nodes.ts:233+](src/lib/workflow-nodes/integration-nodes.ts:233) |
| Notion | ✅ | ✅ | [integration-nodes.ts:363+](src/lib/workflow-nodes/integration-nodes.ts:363) |
| Airtable | ✅ | ✅ | [integration-nodes.ts:456+](src/lib/workflow-nodes/integration-nodes.ts:456) |
| HTTP Webhook (generic) | ✅ | ✅ | [action-nodes.ts:26-106](src/lib/workflow-nodes/action-nodes.ts:26) |
| Next Agent (A2A) | ✅ | ✅ | [action-nodes.ts:266+](src/lib/workflow-nodes/action-nodes.ts:266) |
| File: XLSX (via code-sandbox) | ⚠️ partial | nur indirekt | [code-sandbox-node.ts:329](src/lib/workflow-nodes/code-sandbox-node.ts:329) — kein dedizierter Node |
| File: PDF | ❌ | ❌ | nicht vorhanden |
| File: DOCX | ❌ | ❌ | nicht vorhanden |
| HubSpot | ❌ | ❌ | nicht als Workflow-Node (nur als Agent-Tool) |
| Stripe | ⚠️ partial | nur Agent-Tool | [src/lib/integrations/agent-stripe.ts](src/lib/integrations/agent-stripe.ts) |
| WhatsApp/Twilio | ⚠️ partial | scoped | [src/lib/integrations/whatsapp.ts](src/lib/integrations/whatsapp.ts) |

### Triggers

| Trigger | Code Exists | Functional | Wo |
|---------|-------------|------------|-----|
| Webhook | ✅ | ✅ | [src/app/api/workflows/trigger/route.ts](src/app/api/workflows/trigger/route.ts) — Token-validierter POST |
| Manual | ✅ | ✅ | Team-Editor "Run"-Button + `/api/workflows/trigger` |
| Lead Capture | ✅ | ✅ | Event-System `emitEvent("agent.lead_captured")` |
| Chat Start | ✅ | ✅ | Event-System (NodeType `trigger_chat`) |
| Schedule (Cron) | ✅ | ✅ | Vercel Cron täglich 8:00 → [team-schedules/route.ts](src/app/api/cron/team-schedules/route.ts) |
| Form Submit | ✅ | ✅ | [form/[executionId]/[nodeId]/route.ts](src/app/api/workflows/form/[executionId]/[nodeId]/route.ts) → `resumeWorkflowFromNode` |
| Approval Gate Resume | ✅ | ✅ | [resume/route.ts](src/app/api/workflows/resume/route.ts) |
| Email Receive | ❌ | ❌ | Existiert nicht als Trigger |

### Agent-as-Node

- **Existiert:** Ja. NodeType `agent` referenziert User-erstellten Agent via `agentId`/`memberId`.
- **Implementation:** [src/lib/workflow-nodes/agent-nodes.ts](src/lib/workflow-nodes/agent-nodes.ts) (76 LOC) — `buildAgentTaskFromContext()` mit Expression-Resolution.
- **Executor:** [workflow-runtime.ts:1266](src/lib/services/workflow-runtime.ts:1266) `executeAgentNode()` erstellt Mini-Execution, mappt Result als `node_${nodeId}: { output, ...structuredOutput }`.

### Top Findings

- **Workflow-Runtime ist substantiell**: 2143 LOC mit DAG-Traversal, Error-Edges, Checkpoint-Resume alle 3 Nodes, Sub-Workflow-Nesting (max 5), parallel_split/merge, Cost-Tracking pro Node, Debug-Mode mit Per-Node-Step-State.
- **42+ Node-Types echt implementiert**, nicht Stub-Pattern. Echte OAuth + APIs für Sheets, Gmail, Slack, Notion, Airtable.
- **Versioning vollständig**: `TeamVersion` + `AgentVersion` mit Diff-Engine und Rollback.
- **Keine externe Queue, kein Self-Recursion** — Checkpoint-Resume ist primärer Mechanismus für >300s Runs. Default Max-Execution 30 Min, dann Resume erforderlich.
- **20+ Workflow-Komponenten** in [src/components/workflows/](src/components/workflows/): execution-timeline, debug-runner, log-viewer, version-history, performance-profiler, expression-input, error-handler-config, computer-use-replay, multi-site-results, artifact-viewer, auto-build-chat — Tooling weit über Minimum hinaus.

### Critical Gaps für Gumloop-/Zapier-Parität

1. **Visual Builder versteckt unter `/dashboard/teams`** statt eigener Workflow-Route — User muss "Team" anlegen um Workflow zu bauen. UX-Hürde, kein technischer Blocker.
2. **Output-Connectors fehlen**: PDF, DOCX, dedizierte XLSX-Generation, HubSpot, Salesforce, Asana, Trello, GitHub Issues, Jira. Aktuell nur 8 Integrations + 5 Action-Outputs.
3. **Email-Receive-Trigger fehlt** — Inbound-Email kann Workflows nicht starten.
4. **Cron-Granularität nur täglich** — sub-tag-Schedules erfordern engeres Cron-Interval in [vercel.json](vercel.json).
5. **Keine externe Queue / Durable Execution** — Lange Workflows hängen an Vercel-300s + Resume-Mechanismus. Inngest/Trigger.dev wären für AI-heavy Workflows wertvoll.
6. **Keine automatische Retry-Logik** — Nur manueller Resume nach Failure.
7. **Node-Discovery für End-User mangelhaft** — 42+ Node-Types ohne kategorisierte In-App-Search/Onboarding.
8. **Sub-Workflow ist Single-Tenant zur Parent** — Cross-User Sub-Workflow-Aufrufe nicht direkt unterstützt (siehe Multi-Tenancy-Section).

### Kürzester Demoable End-to-End-Flow

**Use-Case:** "Webhook-Trigger → Agent verarbeitet → Output in Google Sheets"

**Was du dafür brauchst (alles vorhanden):**
1. **Team anlegen** unter `/dashboard/teams/new` → Visual Editor öffnet sich
2. **Webhook-Trigger-Node** (`trigger_webhook`) — generiert Token + Pfad
3. **Agent-Node** (`agent`) — referenziert deinen TASK-Agent
4. **Google-Sheets-Write-Node** — OAuth-Connect erforderlich
5. **Edges + DataMapper** für Agent-Output → Sheet-Spalten

**Schätzung:** **30-60 Minuten manueller Konfiguration** für funktionierenden Demo-Flow, vorausgesetzt OAuth-Connections für Google Sheets sind eingerichtet. Auto-Build-Wizard ([auto-build-chat.tsx](src/components/workflows/auto-build-chat.tsx)) könnte das auf Minuten reduzieren.

### Pending: Manual E2E Test by User

1. [ ] Auf [kilnbase.com/dashboard/teams/new](https://kilnbase.com/dashboard/teams/new) ein neues Team anlegen
2. [ ] Webhook-Trigger-Node platzieren — Token + Pfad notieren
3. [ ] Agent-Node platzieren — bestehenden Agent referenzieren
4. [ ] Google-Sheets-Write-Node platzieren — OAuth-Connect ausführen
5. [ ] Edges + DataMapper konfigurieren
6. [ ] Team auf LIVE setzen
7. [ ] Webhook extern aufrufen (curl/Postman)
8. [ ] Execution-Timeline prüfen
9. [ ] Google-Sheet öffnen → neue Zeile sollte erscheinen
10. [ ] Schedule-Trigger separat testen mit `triggerType=SCHEDULE`

---

## Multi-Tenancy

**Status:** User-First mit zwei Sharing-Layern. Keine Clerk-Organizations. Single-Tenant aus Org-Sicht, aber Agency-Tier-Infrastruktur (ClientPortal + ResellerAccount) existiert separat.
**Audit Date:** 2026-05-02

### Auth Model

- **Clerk Organizations:** ❌ **Disabled / nicht implementiert.** Bestätigt durch 0 Treffer für `useOrganization|orgId|OrganizationSwitcher` im gesamten src/-Tree.
- **Aktuelle Isolation:** Pro `userId`. [src/middleware.ts](src/middleware.ts) protected Routes via Clerk `auth()` ohne Org-Context.
- **Zwei Sharing-Layer oben drauf:**
  1. **TeamPermission** ([prisma/schema.prisma:986-1002](prisma/schema.prisma:986)) — Collaborator-Zugriff auf Teams via `teamId + userId + role` (Email-Invite mit Role).
  2. **ClientPortal** ([prisma/schema.prisma:1803](prisma/schema.prisma:1803)) — Token-basierte Read-Only-View für Agency-Clients auf bestimmte Agents.

### DB Schema

**Tables WITHOUT orgId (User-First):**
- User, Agent, AgentTeam, KnowledgeBase, Conversation, Message, Lead, AgentMemory, VisitorMemory, ApiKey, ApiAccessKey, AgentAnalytics, AutomationRule, IntegrationConnection, AgentIntegration, MarketplaceTemplate, AgentVersion, TeamVersion, AgentTestCase, WebhookEndpoint, AgentRun, AiCreditUsage, MCPConnection, ROIConfig, NotificationPreference, ResellerAccount, ClientPortal, AuditEvent
- → **Alle Top-Level-Models scope per `userId`.**

**Tables MIT Team/Agent/Reseller-Scoping (kein orgId):**
- TeamMember (`teamId`), TeamPermission (`teamId, userId, role`), AgentTeamMember (`teamId, agentId`), Conversation (`agentId`), KnowledgeBase (`agentId` + optional `teamId`), AgentTeamTask (`teamId`), TeamExecution (`teamId`), ClientSubscription (`resellerAccountId, clientPortalId`), AgentTeam (`parentTeamId` für Clone-Tracking, NICHT für Hierarchie)

**Schlüssel-Erkenntnis:** Es gibt NULL Treffer für `orgId|organizationId|tenantId` in der Schema-Datei. **KILN ist auf Schema-Ebene single-tenant pro User.**

### Supabase RLS

- **Policies vorhanden, aber minimal:** Nur 2 RLS-Policies in den Migrations.
  - [supabase/migrations/001_knowledge_chunks.sql](supabase/migrations/001_knowledge_chunks.sql): `enable row level security` + Policy "Service role full access".
  - [supabase/migrations/002_waitlist.sql](supabase/migrations/002_waitlist.sql): identisch.
- **Kein Filter auf orgId/userId in RLS** — Filtering passiert in Application-Code (Prisma where-Clauses).
- **Sicherheits-Implikation:** Wer Service-Role-Key hat, sieht ALLES. Auth + Authorization läuft komplett über Next.js-Middleware + Prisma-Queries, nicht DB-Layer.

### API Routes

| Route | Auth-Pattern | Org-Aware? |
|-------|-------------|-----------|
| `GET /api/agents` | `userId` direct filter | ❌ User-only |
| `POST /api/agents` | `userId` mit Plan-Limits | ❌ User-only |
| `GET /api/teams` | `userId` → `getAccessibleTeamIds()` ([src/lib/team-permissions.ts](src/lib/team-permissions.ts)) | ⚠️ User + TeamPermission share |
| `GET /api/teams/[id]/executions` | `canAccessTeam(teamId, userId)` | ⚠️ Team-scoped via Ownership ODER TeamPermission |
| `POST /api/agents/[id]/chat` | Public (CORS) + Owner-Check | ❌ Agent-scoped via slug, keine Org-Logik |
| `POST /api/portal/[portalId]` | Token-basiert (`accessToken`) | ✅ Portal-scoped, separater Auth-Pfad |
| `GET /api/reseller/clients/[clientId]` | `userId` + Reseller-Ownership | ⚠️ Reseller-scoped |

**Pattern:** Access-Control über User-Ownership ODER Permission-Records (TeamPermission, ResellerAccount), nicht über Org-Membership.

### UI

- **Org Switcher:** ❌ Nicht vorhanden. Keine `OrganizationSwitcher`/`OrganizationProfile` von Clerk im Code.
- **Member Management:** ⚠️ Existiert auf Team-Level via TeamPermission — Email-Invite + Role-Auswahl in [src/components/teams/](src/components/teams/) (ohne Suche bestätigt durch fehlende OrganizationSwitcher-Imports).
- **Roles/Permissions:** ✅ Auf Team-Level: `TeamPermission.role` (vermutlich OWNER/EDITOR/VIEWER per Schema). Auf Plattform-Level: nur User-Plan (FREE/STARTER/PRO/AGENCY/ENTERPRISE) via [src/lib/credits.ts:12](src/lib/credits.ts:12).

### Sub-Accounts (Agency-Tier)

- **Concept exists:** ⚠️ **Partiell, in zwei separaten Modellen.**
  1. **ResellerAccount** ([prisma/schema.prisma:1891](prisma/schema.prisma:1891)) — Stripe Connect mit 20% Plattform-Fee, eigene `defaultMonthlyPriceCents`. User mit ResellerAccount kann Client-Subscriptions anlegen.
  2. **ClientPortal** ([prisma/schema.prisma:1803](prisma/schema.prisma:1803)) — Token-basierte Read-Only-View für Agency-Clients. Felder: `userId` (Agency-Owner), `clientEmail`, `accessToken`, `tokenExpiresAt`, `branding: Json` (Logo, Farben, Custom-CSS), `agentIds: Json` (welche Agents der Client sieht), `permissions: Json` (viewAnalytics, viewConversations, viewReports, downloadExports).
  3. **ClientSubscription** ([prisma/schema.prisma:1908](prisma/schema.prisma:1908)) — verbindet ResellerAccount + ClientPortal mit Stripe-Abo.
- **DB Support:** ✅ Alle drei Models real, mit Indizes und Beziehungen.
- **UI:**
  - Public Portal-View: [src/app/portal/[portalId]/page.tsx](src/app/portal/[portalId]/page.tsx) — White-Label-Frontend für Clients.
  - Reseller-API: [src/app/api/reseller/route.ts](src/app/api/reseller/route.ts) + [reseller/clients/](src/app/api/reseller/clients/), [reseller/clients/[clientId]/](src/app/api/reseller/clients/[clientId]/).
  - Portal-API: [src/app/api/portal/](src/app/api/portal/) (route, [portalId], overview, analytics).
- **Limitation:** Client kann NUR sehen, NICHT bearbeiten/erstellen. Echtes Multi-Tenant-Editing für Clients (Agency baut für Client, Client kann eigene Agents erstellen) gibt's nicht. Auch keine Org-Hierarchie (ClientPortal ist flach pro Agency-User).

### Top Findings

- **KILN ist single-tenant per User auf Schema-Ebene.** 0 Treffer für `orgId/organizationId/tenantId`. Clerk-Organizations sind nicht aktiviert.
- **Agency-Tier-Infrastruktur existiert separat**: ResellerAccount + ClientPortal + ClientSubscription bilden ein vollständiges White-Label-Reseller-Modell mit Stripe-Connect-Integration. Aber: **Read-Only für Clients**.
- **TeamPermission ist die Collaboration-Mechanik**, nicht Orgs. Email-Invite + Role pro Team.
- **RLS in Supabase ist nur Service-Role-Filter**, keine row-level Auth. Application-Layer bestimmt Zugriff.
- **`AgentTeam.parentTeamId`** ([prisma/schema.prisma:968](prisma/schema.prisma:968)) ist Clone-Tracking ("Team X wurde aus Team Y geforkt"), NICHT Org-Hierarchie.

### Critical Gaps für Agency-Tier

**Aktueller Stand:** Agency kann Clients eingeschränkten Read-Only-Portal-Zugang geben + monatlich abrechnen. Das ist genug für "Agency liefert Reports/Analytics an Kunden".

**Was fehlt für vollwertigen Agency-Tier mit eigenen Client-Workspaces:**
1. **Echte Sub-Accounts mit eigenem Workspace** — Client soll eigene Agents erstellen können, separat von Agency-Agents. Aktuell teilen sie sich `agentIds`-Liste der Agency.
2. **Org-Hierarchie auf Schema-Ebene** — `parentOrgId`-Pattern fehlt komplett. Migration zu Clerk-Organizations + `orgId` auf allen Tables wäre 4-6 Wochen Arbeit.
3. **Per-Org Quotas/Credits** — Aktuell sind Credits pro `User`, nicht pro Org. Agency mit 10 Clients → entweder einer zahlt für alle oder jeder Client braucht eigenen User-Account.
4. **RLS-Policies für echte Tenant-Isolation** — Falls Agency-Tier wirklich mandantenfähig werden soll, müssen Supabase-Policies auf `org_id` filtern.
5. **Client-Side Editing-Permissions** — Aktuell `permissions.viewX` Flags, keine `editX`/`createX`-Flags.
6. **Audit-Trail pro Org** — `AuditEvent`-Model existiert ([prisma/schema.prisma:1830](prisma/schema.prisma:1830)) aber ohne orgId-Scope.
7. **Org-Switcher-UI** — User in mehreren Orgs/Workspaces hätte aktuell keine UI um zu wechseln.

---

## Combined Audit Summary

### One-Liner Status

- **Action Agents:** **Real implementiert**, aber kein Input/Output-Schema und Mode-Begriff (`agentMode` vs Wizard-`agentType`) ist verwirrend.
- **Workflow Engine:** **Production-near**, 2143-LOC-Runtime + 42+ Node-Types + Visual Xyflow-Builder, aber unter `/dashboard/teams` versteckt und ohne externe Queue für >30min-Runs.
- **Multi-Tenancy:** **Nicht vorhanden im klassischen Sinne** — keine Clerk-Orgs, kein `orgId` auf Schema-Ebene. Stattdessen User-First + 2 Sharing-Layer (TeamPermission für Collab, ClientPortal für Agency-Read-Only).

### Top 5 Findings über alle drei

1. **Workflow-Engine ist deutlich weiter als Multi-Tenancy** — KILN hat einen Production-Grade-Workflow-Builder, aber keine Org-Isolation. Wenn das Produkt für Enterprise/Agency skaliert, ist Multi-Tenancy der Engpass, nicht Engine.
2. **Agency-Tier existiert bereits, aber als Read-Only-Layer** — ResellerAccount + ClientPortal + Stripe-Connect sind komplett gebaut. Das ist überraschend reif. Aber nur Reporting/Sehen, nicht Editieren.
3. **Action Agents haben keine I/O-Schemas** — größte konzeptionelle Lücke für Workflow-Integration. Workflow-Builder muss raten, was ein Agent als Input erwartet.
4. **Keine externe Durable-Execution-Plattform** (Inngest/Trigger.dev/Temporal). Bei AI-heavy Workflows mit `computer_use` (multi-min) oder `deep_research` (~570 LOC, evtl. >5min) ist das ein Bottleneck. Checkpoint-Resume ist clever, aber nicht so robust wie dedizierte Queue.
5. **Naming-Drift verwirrt** — `agentType` (PUBLIC/INTERNAL) vs. `agentMode` (CHAT/TASK) vs. Wizard-State `agentType: "CHAT" | "TASK"`. Bei nächstem Refactor sauber benennen, sonst Bug-Quelle.

### Top 3 Critical Decisions

1. **Multi-Tenancy: Jetzt oder nie.** Migration von User-First zu Org-First (`orgId` auf allen Tables, Clerk-Orgs, RLS-Policies) ist 4-6 Wochen Arbeit. **Je länger du wartest, desto teurer.** Wenn du Agency-Tier nicht über `ClientPortal` (Read-Only) hinaus willst, kannst du das überspringen — aber dann ist "Multi-Tenant SaaS" kein ehrliches Verkaufsargument.
2. **Action Agent I/O-Schemas: Pflicht für Workflow-Reife.** Ohne `inputSchema`/`outputSchema` am Agent-Model bleibt jede Workflow-Integration brittle (loose `{{ node_X.output }}`-Strings). 1-2 Wochen für Schema-Field + Validator + UI-Editor.
3. **Externe Queue (Inngest/Trigger.dev): Nice-to-have aktuell, Pflicht bei Skalierung.** Solange `computer_use` und `deep_research` Edge-Cases sind, reicht Checkpoint-Resume. Sobald Workflows regelmäßig >5min laufen, wird das instabil.

### Dependency Graph

```
Action Agents (Schema/Runtime real)
    │
    ├─► I/O-Schemas (Gap) ─► Workflow-Builder kann nodes typsicher verbinden
    │
    └─► Workflow Engine (real) ─► Agent-as-Node funktioniert
                │
                ├─► Visual Builder unter /dashboard/teams (UX-Hürde)
                │
                └─► Long-Running via Checkpoint (kein Inngest)
                            │
                            └─► Externe Queue nötig wenn Workflows >30min normal werden

Multi-Tenancy
    │
    ├─► User-First (✅ implementiert)
    ├─► TeamPermission (✅ Collab-Sharing)
    ├─► ClientPortal/ResellerAccount (✅ Agency-Read-Only)
    └─► Org-First / Clerk-Orgs (❌ fehlt) ─► Blocker für Enterprise-Sales / Sub-Account-Editing
```

**Reihenfolge falls du alle drei adressieren willst:**
1. **Action Agent I/O-Schemas** zuerst — kleinster Aufwand, größter Hebel auf Workflow-Reife.
2. **Workflow-Visual-Builder Standalone-Route** (`/dashboard/workflows/new`) — UI-Wrapper über bestehender `visual-team-editor.tsx`. Niedrige Komplexität, hoher Marketing-Nutzen.
3. **Multi-Tenancy** als separates großes Projekt. Nur angehen wenn klar ist dass Enterprise/echtes-Agency-Tier kommt.

### Empfehlung für nächsten Schritt

**Bau zuerst die `inputSchema`/`outputSchema`-Felder am Agent-Model.** Konkret:

- Prisma-Migration: Add `inputSchema: Json?` und `outputSchema: Json?` zu Agent-Model (analog zu existierendem `AgentTeamMember.outputSchema`).
- UI: Schema-Editor als Tab in [src/app/dashboard/agents/[id]/page.tsx](src/app/dashboard/agents/[id]/page.tsx), Format `[{ field, type, description, required }]`.
- Runtime: Validator in [run/route.ts](src/app/api/agents/[id]/run/route.ts) der Input gegen `inputSchema` checkt (400 bei Mismatch). Output-Schema als Hint für LLM (System-Prompt-Injection: "Return JSON matching this schema").
- Workflow-DataMapper: Input/Output-Fields aus Schema lesen statt aus hardcoded `INPUT_FIELDS`/`OUTPUT_FIELDS` ([data-mapper.tsx](src/components/workflows/data-mapper.tsx)).

**Begründung:** Du hast einen funktionierenden Workflow-Engine + funktionierende Action-Agents. Was sie zusammenhält ist brittle (`{{ node_X.output }}` String-Templates). Mit I/O-Schemas wird das Production-Grade, und es schaltet **typsichere Workflow-Composition** frei — die Voraussetzung für seriöses Marketing als "Agent-Workflow-Plattform". Aufwand: ~1-2 Wochen. Hebel: schaltet sowohl Action-Agents als auch Workflow-Builder auf "demoable mit Konfidenz" frei.

**Nicht zuerst Multi-Tenancy machen** — das ist ein 4-6-Wochen-Projekt das aktuell nichts blockiert, solange ClientPortal/ResellerAccount für Agency-Reads reicht.

### Workflow System

- **Visual Builder:** Existiert. [src/components/teams/visual-team-editor.tsx](src/components/teams/visual-team-editor.tsx) (~2317 LOC), basiert auf Xyflow (ReactFlow-Nachfolger). Eingebettet in [src/app/dashboard/teams/[id]/page.tsx:3025](src/app/dashboard/teams/[id]/page.tsx:3025). Kein standalone `/dashboard/workflows/[id]/edit`-Pfad — Workflows werden über Team-Editor erstellt.
- **Runtime:** [src/lib/services/workflow-runtime.ts](src/lib/services/workflow-runtime.ts) (2143 LOC) mit `executeWorkflow()` ([Zeile 313](src/lib/services/workflow-runtime.ts:313)). Async, Checkpoint-Resume ([Zeile 377-381](src/lib/services/workflow-runtime.ts:377)), Error-Edge-Routing (`sourceHandle: "error"`), Debug-Mode mit Per-Node-Cost-Tracking, Max-Nesting-Depth 5.
- **Node-Type-Definition:** [src/lib/workflow-node-types.ts](src/lib/workflow-node-types.ts) (682 LOC) — vollständige Liste aller Node-Types mit Default-Config.
- **Node-Implementierungen:** [src/lib/workflow-nodes/](src/lib/workflow-nodes/) — getrennte Files pro Kategorie (action, integration, ai, control, logic, trigger, agent, agent-swarm, computer-use, deep-research, code-sandbox, multi-site, parallel, diff-detection, data-pipeline).
- **Expressions:** [src/lib/workflow-expressions.ts](src/lib/workflow-expressions.ts) (385 LOC) — `{{ node_X.output.field }}`, Pipes (`| upper`, `| default`), 15+ built-in Functions (string, math, date, array).

**Node-Type-Inventar** (Auswahl, vollständig in [workflow-node-types.ts](src/lib/workflow-node-types.ts)):
- **Trigger (5):** trigger_webhook, trigger_schedule, trigger_lead, trigger_chat, trigger_manual
- **Logic (5):** if_condition, switch, filter, transform, loop
- **Action (5):** http_request, send_email, send_slack, delay, set_variable
- **Control Flow (5):** approval_gate, wait_webhook, wait_form, sub_workflow, merge
- **Integrations (8):** google_sheets_read, google_sheets_write, gmail_send, slack_send_integration, calendar_create, calendar_check, notion_create, airtable_create
- **AI Tools (7):** ai_summarize, ai_classify, ai_extract, computer_use (~2471 LOC), deep_research (~570 LOC), code_sandbox (~404 LOC), diff_detection
- **Agent (2):** agent (User-erstellter Agent), llm_prompt (Inline-Prompt)
- **Advanced (7):** a2a_call, goal_trigger, spawn_helper, agent_swarm (~487 LOC), parallel_split, parallel_merge, mcp_tool

### Agent-as-Node

- **Existiert:** Ja. NodeType `agent` referenziert User-erstellten Agent via `agentId`/`memberId` in Node-Config.
- **Implementation:** [src/lib/workflow-nodes/agent-nodes.ts](src/lib/workflow-nodes/agent-nodes.ts) (76 LOC) — `buildAgentTaskFromContext()` baut Task-Input aus Workflow-Context mit Expression-Resolution.
- **Executor:** [src/lib/services/workflow-runtime.ts:1266](src/lib/services/workflow-runtime.ts:1266) `executeAgentNode()` erstellt Mini-Execution, ruft `executeTeamExecution()` mit Single-Task, mappt Result zurück in Context als `node_${nodeId}: { output, ...structuredOutput }` ([agent-nodes.ts:62-76](src/lib/workflow-nodes/agent-nodes.ts:62)).
- **Beide Modi:** Sowohl CHAT- als auch TASK-Agents können als Node verwendet werden. TASK-Agents führen Pre/Post-Process isoliert aus, CHAT-Agents werden vom Team-Runtime per Message verarbeitet.

### Output Targets

| Target | Code Exists | Functional | Datei |
|--------|-------------|------------|-------|
| Email (Resend) | ✅ | ✅ | [action-nodes.ts:110-184](src/lib/workflow-nodes/action-nodes.ts:110) |
| Email (Gmail OAuth) | ✅ | ✅ | [integration-nodes.ts:131-176](src/lib/workflow-nodes/integration-nodes.ts:131) |
| Slack (Webhook) | ✅ | ✅ | [action-nodes.ts:188-240](src/lib/workflow-nodes/action-nodes.ts:188) |
| Slack (OAuth) | ✅ | ✅ | [integration-nodes.ts:180-229](src/lib/workflow-nodes/integration-nodes.ts:180) |
| Google Sheets Write | ✅ | ✅ | [integration-nodes.ts:75-127](src/lib/workflow-nodes/integration-nodes.ts:75) |
| Google Sheets Read | ✅ | ✅ | [integration-nodes.ts:29-71](src/lib/workflow-nodes/integration-nodes.ts:29) |
| Google Calendar | ✅ | ✅ | [integration-nodes.ts:233+](src/lib/workflow-nodes/integration-nodes.ts:233) |
| Notion | ✅ | ✅ | [integration-nodes.ts:363+](src/lib/workflow-nodes/integration-nodes.ts:363) |
| Airtable | ✅ | ✅ | [integration-nodes.ts:456+](src/lib/workflow-nodes/integration-nodes.ts:456) |
| HTTP Webhook (generic) | ✅ | ✅ | [action-nodes.ts:26-106](src/lib/workflow-nodes/action-nodes.ts:26) |
| Next Agent (A2A) | ✅ | ✅ | [action-nodes.ts:266+](src/lib/workflow-nodes/action-nodes.ts:266) |
| File: XLSX (via code-sandbox) | ⚠️ partial | nur indirekt | [code-sandbox-node.ts:329](src/lib/workflow-nodes/code-sandbox-node.ts:329) — kein dedizierter Node |
| File: PDF | ❌ | ❌ | nicht vorhanden |
| File: DOCX | ❌ | ❌ | nicht vorhanden |
| HubSpot | ❌ | ❌ | nicht vorhanden (nur als Agent-Tool, nicht als Workflow-Node) |
| Stripe | ⚠️ partial | nur Agent-Tool | [src/lib/integrations/agent-stripe.ts](src/lib/integrations/agent-stripe.ts) |
| WhatsApp/Twilio | ⚠️ partial | scoped | [src/lib/integrations/whatsapp.ts](src/lib/integrations/whatsapp.ts) |

### Triggers

| Trigger | Code Exists | Functional | Wo |
|---------|-------------|------------|-----|
| Webhook | ✅ | ✅ | [src/app/api/workflows/trigger/route.ts](src/app/api/workflows/trigger/route.ts) — Token-validierter POST, payload + headers ins Context |
| Manual | ✅ | ✅ | Über Team-Editor "Run"-Button + `/api/workflows/trigger` |
| Lead Capture | ✅ | ✅ | Event-System `emitEvent("agent.lead_captured")` (NodeType `trigger_lead`) |
| Chat Start | ✅ | ✅ | Event-System (NodeType `trigger_chat`) |
| Schedule (Cron) | ✅ | ✅ | Vercel Cron `/api/cron/team-schedules` täglich 8:00 ([vercel.json:14-17](vercel.json:14)) → [src/app/api/cron/team-schedules/route.ts](src/app/api/cron/team-schedules/route.ts) (321 LOC) checkt `isTeamScheduleDue` und decomposes Goals via Claude |
| Form Submit | ✅ | ✅ | [src/app/api/workflows/form/[executionId]/[nodeId]/route.ts](src/app/api/workflows/form/[executionId]/[nodeId]/route.ts) → `resumeWorkflowFromNode` |
| Approval Gate Resume | ✅ | ✅ | [src/app/api/workflows/resume/route.ts](src/app/api/workflows/resume/route.ts) — User-Auth + Internal-Token |
| Email Receive | ❌ | ❌ | Existiert nicht als Trigger (nur als Output) |

### Top Findings

- **Workflow-Runtime ist real und substantiell**: 2143 LOC in [workflow-runtime.ts](src/lib/services/workflow-runtime.ts), DAG-Traversal mit Error-Edges, Checkpoint-Resume, Sub-Workflow-Nesting, parallel_split/merge, Cost-Tracking pro Node, Debug-Mode.
- **42+ Node-Types definiert**, alle mit echten Implementierungen (kein Stub-Pattern). Echte API-Calls für Sheets, Gmail, Slack, Notion, Airtable über OAuth-Tokens.
- **Action Agents sind real**: AgentMode-Enum CHAT/TASK existiert, separate Code-Pfade ([run/route.ts:58](src/app/api/agents/[id]/run/route.ts:58) guards), Pre-Process Conditions + JS-Sandbox, Post-Process Branches mit Output-Routing zu Email/Webhook/Next-Agent/Custom-Code.
- **Agent-as-Node funktioniert end-to-end**: NodeType `agent` referenziert via memberId → `executeAgentNode()` baut Mini-Execution → Result fließt zurück in Workflow-Context als `{{ node_X.output }}`.
- **Visual Builder ist gebaut, aber unter "Teams" versteckt**: [visual-team-editor.tsx](src/components/teams/visual-team-editor.tsx) 2317 LOC mit Xyflow, eingebunden in `/dashboard/teams/[id]`. Kein standalone Workflow-Editor-Route — User müssen "Team" anlegen um Workflow zu bauen.
- **Cron-Trigger feuert tatsächlich**: 7 Vercel-Cron-Jobs in [vercel.json](vercel.json), `team-schedules` täglich 8:00 mit echtem Decomposer ([321 LOC](src/app/api/cron/team-schedules/route.ts)). Anders als der erste Audit-Bericht fälschlich annahm.
- **Form-Submission resumed Workflows**: `wait_form` Node + dedizierter Public-POST-Endpoint ([form/[executionId]/[nodeId]/route.ts](src/app/api/workflows/form/[executionId]/[nodeId]/route.ts)) → `resumeWorkflowFromNode()`. Approval Gates nutzen den gleichen Mechanismus über [resume/route.ts](src/app/api/workflows/resume/route.ts).
- **Expression-Engine vollständig**: [workflow-expressions.ts](src/lib/workflow-expressions.ts) — Dot-Notation, Array-Indexing, Pipes, 15+ Built-ins (`upper`, `lower`, `trim`, `substring`, `replace`, `default`, `includes`, `length`, `now`, `date`, `concat`, `json` etc.).
- **DataMapper-Komponente existiert**: [src/components/workflows/data-mapper.tsx](src/components/workflows/data-mapper.tsx) — visuelles Feld-Mapping zwischen Nodes mit `INPUT_FIELDS`/`OUTPUT_FIELDS` per Node-Type.
- **20+ Workflow-Komponenten**: [src/components/workflows/](src/components/workflows/) enthält execution-timeline, debug-runner, log-viewer, version-history, performance-profiler, expression-input, error-handler-config, variables-panel, computer-use-replay, multi-site-results, artifact-viewer, computer-use-wizard, auto-build-chat, etc. — Tooling weit über das Minimum hinaus.

### Top Gaps für "Action Agent in Workflow"-Use-Case

1. **Workflows verstecken sich unter "/dashboard/teams" statt "/dashboard/workflows"** — verwirrend für User die einen Action-Workflow bauen wollen aber nicht denken "Ich brauche ein Team". Marketing-/UX-Frage, kein technischer Blocker.
2. **Kein dedizierter Workflow-Editor-Pfad** wie `/dashboard/workflows/new` — alles geht über Team-Erstellung. [src/app/dashboard/workflows/](src/app/dashboard/workflows/) hat nur `templates/` und `form/` Subroutes.
3. **File-Output-Nodes fehlen**: Kein dedizierter PDF-/DOCX-/XLSX-Generator-Node. Nur indirekt via `code_sandbox` möglich (Mime-Type-Mapping in [code-sandbox-node.ts:329](src/lib/workflow-nodes/code-sandbox-node.ts:329)).
4. **Email-Receive-Trigger fehlt**: Inbound-Email kann Workflows nicht starten (nur Webhook + Cron).
5. **HubSpot als Workflow-Node fehlt**: Nur als Agent-Tool verfügbar, nicht als reiner Output-Node.
6. **Schedule-Trigger-Granularität**: Cron läuft nur täglich, Sub-Tag-Schedules brauchten engeres Cron-Interval in vercel.json.
7. **Approval-Gate-Timeout-Handling**: Mechanismus für "approve within X hours sonst eskaliere" existiert in Config aber Live-Enforcement unklar.
8. **Node-Discovery für End-User**: 42+ Node-Types, aber keine kategorisierte In-App-Suche/Onboarding für "Welcher Node macht was?".

### Kürzester Demoable End-to-End-Flow

**Use-Case:** "Webhook-Trigger → Agent verarbeitet → Output in Google Sheets"

**Was du dafür brauchst (alles vorhanden):**
1. **Team anlegen** unter `/dashboard/teams/new` → Visual Editor öffnet sich
2. **Webhook-Trigger-Node** (`trigger_webhook`) — generiert Token + Pfad ([api/workflows/trigger/route.ts](src/app/api/workflows/trigger/route.ts))
3. **Agent-Node** (`agent`) — referenziert deinen DSGVO-Berater oder neuen TASK-Agent
4. **Google-Sheets-Write-Node** (`google_sheets_write`) — OAuth-Connect erforderlich, dann Spreadsheet-ID + Range eintragen
5. **Edges** zwischen Trigger → Agent → Sheet-Write
6. **DataMapper** für Agent-Output → Sheet-Spalten

**Kosten/Aufwand:** Reine Konfiguration im Editor. Code-seitig ist alles vorhanden. Schätzung: **30-60 Minuten manueller Konfiguration** für funktionierenden Demo-Flow, vorausgesetzt OAuth-Connections für Google Sheets sind bereits eingerichtet.

**Was vor dem Demo zu klären ist:**
- Hat dein Test-Account bereits Google-OAuth-Token in [src/lib/integrations/google-sheets.ts](src/lib/integrations/google-sheets.ts) Connection?
- Funktioniert der Auto-Build-Wizard ([src/app/api/workflows/auto-build/route.ts](src/app/api/workflows/auto-build/route.ts), [auto-build-chat.tsx](src/components/workflows/auto-build-chat.tsx)) als schnellerer Weg statt manueller Editor-Bedienung?

### Pending: Manual E2E Test by User (Action Agent + Workflow)

User muss folgende Schritte manuell durchklicken:

1. [ ] Auf [kilnbase.com/dashboard/teams/new](https://kilnbase.com/dashboard/teams/new) ein neues Team anlegen
2. [ ] Im Visual Editor Webhook-Trigger-Node platzieren — Token + Pfad notieren
3. [ ] Agent-Node platzieren — bestehenden Agent referenzieren (z.B. "DSGVO Berater" aus Chat-Audit)
4. [ ] Google-Sheets-Write-Node platzieren — OAuth-Connect für Google ausführen falls nicht vorhanden
5. [ ] Edges Trigger → Agent → Sheet-Write ziehen, DataMapper füllen
6. [ ] Team speichern, status auf LIVE setzen
7. [ ] Webhook-URL extern aufrufen mit Test-Payload (curl/Postman)
8. [ ] In Execution-Timeline ([execution-timeline.tsx](src/components/workflows/execution-timeline.tsx)) prüfen ob Run grün durchläuft
9. [ ] Google-Sheet öffnen — neue Zeile sollte erscheinen
10. [ ] Schedule-Trigger separat testen: Agent mit `triggerType=SCHEDULE`, cron `*/15 * * * *`, warten 15 Min, prüfen ob `lastRunAt` aktualisiert wurde (alternativ Cron manuell triggern via `/api/cron/team-schedules` mit `CRON_SECRET`)
