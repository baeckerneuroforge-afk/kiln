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
