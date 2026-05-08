# Sub-Org Isolation Audit — Departments

Date: 2026-05-08
Branch: claude/infallible-shannon-6e1dfe
Auditor: Claude (Opus 4.7)

## Files Audited

### API routes (15)
- `src/app/api/departments/route.ts` — GET (list), POST (create)
- `src/app/api/departments/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/departments/[id]/approve/[itemId]/route.ts` — POST
- `src/app/api/departments/[id]/reject/[itemId]/route.ts` — POST
- `src/app/api/departments/[id]/backlog/route.ts` — GET
- `src/app/api/departments/[id]/runs/route.ts` — GET
- `src/app/api/departments/[id]/run/route.ts` — POST (manual trigger)
- `src/app/api/departments/[id]/memory/route.ts` — GET, POST
- `src/app/api/departments/[id]/channel-messages/route.ts` — GET
- `src/app/api/departments/[id]/channel-messages/[msgId]/route.ts` — GET
- `src/app/api/departments/[id]/trigger/route.ts` — POST (webhook trigger w/secret)
- `src/app/api/departments/templates/customer-support/route.ts` — POST
- `src/app/api/departments/knowledge-bases/route.ts` — GET (added Phase B)
- `src/app/api/webhooks/department-email/[departmentId]/route.ts` — POST
- `src/app/api/webhooks/department-whatsapp/[departmentId]/route.ts` — POST + GET (verify)

### Library code (12)
- `src/lib/departments/department-engine.ts`
- `src/lib/departments/manager-loop.ts`
- `src/lib/departments/invocation.ts`
- `src/lib/departments/backlog.ts`
- `src/lib/departments/approval-gate.ts`
- `src/lib/departments/operating-memory.ts`
- `src/lib/departments/trigger-system.ts`
- `src/lib/departments/notifications/notification-router.ts`
- `src/lib/departments/notifications/digest-builder.ts`
- `src/lib/departments/rag/department-rag.ts`
- `src/lib/departments/channels/email-sender.ts`
- `src/lib/departments/channels/whatsapp-sender.ts`

## Issues Found

### CRITICAL

**1. PATCH `/api/departments/[id]` accepts cross-org `knowledgeBaseId`**
- Location: `src/app/api/departments/[id]/route.ts`, lines 117-119
- A user in Org X could PATCH their own department with `knowledgeBaseId` belonging to Org Y. Although `getRelevantKnowledgeForDepartment` enforces a runtime cross-org check that prevents data being read at query time, the FK reference itself is a leak (UI would display KB from another org via the GET endpoint's `include: { knowledgeBase }`).
- Impact: KB metadata (sourceName, chunkCount) of a different org's KB can be read via GET after PATCH.

### HIGH

**2. Inbound email webhook lacks signature verification** (pre-existing, not introduced by Phase 3)
- Location: `src/app/api/webhooks/department-email/[departmentId]/route.ts`
- Anyone who knows a `departmentId` (cuid()) can POST to this endpoint and inject backlog items.
- Mitigations in place: `isInboundAllowed` allowlist (when configured), `emailEnabled` flag.
- Resend supports Svix-style webhook signing — should be verified when configured.

### MEDIUM (defense-in-depth)

**3. `approveItem` and `rejectItem` in `approval-gate.ts` trust caller for org-scoping**
- Location: `src/lib/departments/approval-gate.ts`, lines 19-67 (`approveItem`), 69-103 (`rejectItem`)
- Functions don't verify that `userId` (the approver) is in the same org as the item's department. The API routes do verify this BEFORE calling, so it's not exploitable today. But future callers (e.g., a programmatic approval action) might not enforce this.

**4. `getPendingApprovals(orgId)` uses `orgOnlyFilter` semantics**
- Location: `src/lib/departments/approval-gate.ts`, line 8-17
- Function only filters by `orgId` (no fallback for legacy `orgId IS NULL` rows). This is correct for new rows but may cause legacy departments to be invisible. Acceptable trade-off — listed for awareness.

### LOW

**5. Notification slack lookup is per-user, not per-org**
- Location: `src/lib/departments/notifications/slack-notifier.ts`
- `IntegrationConnection` is keyed by `userId + provider`. If a user is in two orgs, both orgs share the same Slack connection. Existing system architecture, not introduced by Phase 3. Listed for awareness.

## Fixes Applied

### Fix 1 — CRITICAL: validate knowledgeBaseId in PATCH
- File: `src/app/api/departments/[id]/route.ts`
- Action: Before applying `knowledgeBaseId`, validate it exists and is in caller's org via `prisma.knowledgeBase.findFirst({ where: { id, OR: [{ orgId: scope.orgId }, { orgId: null, agent: { userId: scope.userId, orgId: null }}] }})`. Reject with 404 (404-shaped, not 403) if not found.

### Fix 2 — HIGH: optional inbound email signature verification
- File: `src/app/api/webhooks/department-email/[departmentId]/route.ts` + helper
- Action: When `RESEND_WEBHOOK_SECRET` env var is set, verify Svix-style signature. When unset, fall back to existing behavior (backward-compatible for local dev / current production without rotation).

### Fix 3 — MEDIUM: approval-gate verifies org access
- File: `src/lib/departments/approval-gate.ts`
- Action: `approveItem` and `rejectItem` now also accept an optional `scope` argument. When provided, the function verifies the item's department belongs to the scope. The API routes pass the scope so callers get defense-in-depth without breaking the legacy unscoped signature.

## Tests Added

10 new isolation tests in `src/__tests__/api/departments-isolation.test.ts` and `src/__tests__/lib/departments/isolation.test.ts`:

1. User-A in Org-X cannot read Department of Org-Y via GET /api/departments/:id
2. User-A in Sub-Org-X1 cannot trigger Department in Sub-Org-X2 via POST /run
3. User-A cannot approve backlog item from another org (404)
4. Webhook trigger URL with wrong secret rejects payload (401)
5. Department-A cannot read Department-B's operating memory
6. Worker invocation requires correct org context (cross-org returns 'Worker not found')
7. KB query from Dept-A only returns entries from same Sub-Org (cross-org KB returns empty)
8. Approval queue list scoped to caller's org via department FK
9. PATCH cannot set knowledgeBaseId from another org
10. Channel-message list does NOT leak across orgs

## Recommendations

- Consider adding a project-level ESLint rule that flags `prisma.X.findUnique` on org-scoped tables; require `findFirst` with org filter instead.
- Consider middleware-level org enforcement at `/api/departments/*` so route handlers don't have to repeat the pattern.
- Set `RESEND_WEBHOOK_SECRET` in production env; rotate periodically.
- Add a future migration that backfills `orgId IS NULL` rows so we can drop the dual-filter logic in `orgScopeFilter` Phase 3.0.
- Move `IntegrationConnection` to per-org or per-user-per-org keying so users in multiple orgs can have separate Slack workspaces.
