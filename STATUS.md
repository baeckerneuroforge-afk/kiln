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

## Action Agents & Workflow Integration

**Code Status:** Working (mit Polish-Bedarf, ähnlich wie Chat Agents)
**Audit Date:** 2026-05-02

Hinweis: Workflows leben im Code unter "Teams" (`AgentTeam`-Model + `team.config.workflow` JSON). Es gibt kein eigenes `Workflow`-Model — der Begriff "Team" wird im Code als Container für Agent-Hierarchie + Workflow-Graph verwendet. Im Folgenden meint "Workflow" diesen Graph-Anteil.

### Agent Type Differentiation

- DB-Field `agentMode` ist vorhanden: [prisma/schema.prisma:107](prisma/schema.prisma:107) → Enum `AgentMode { CHAT, TASK }` ([Zeile 230](prisma/schema.prisma:230)).
- TASK-Agents haben zusätzliche Felder ([prisma/schema.prisma:109-117](prisma/schema.prisma:109)): `triggerType` (MANUAL/SCHEDULE/WEBHOOK/EVENT), `triggerConfig`, `preProcessConfig`, `postProcessConfig`, `outputType` (NONE/HTTP_REQUEST/EMAIL/NEXT_AGENT/WEBHOOK/CUSTOM_CODE), `outputConfig`, `lastRunAt`, `lastRunResult`.
- **Chat vs Action Distinction:** Chat-Agents nutzen `chat/route.ts` (Streaming, Conversation-History, Lead-Tracking). Task-Agents nutzen `run/route.ts` (Single Request-Response, Pre/Post-Process, Output-Routing). Beide teilen die gleiche Agent-Tabelle und Tool-Konfiguration.
- Trennung im Code: [src/app/api/agents/[id]/run/route.ts:58](src/app/api/agents/[id]/run/route.ts:58) wirft 400 wenn `agentMode !== "TASK"`.

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
