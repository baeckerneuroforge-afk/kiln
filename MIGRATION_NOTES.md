# Migration Notes — Bekannter Schema-Drift

Dieses Dokument listet bewusste Diskrepanzen zwischen `prisma/schema.prisma` und der Live-Datenbank, die NICHT durch reguläre Prisma-Migrations aufgelöst werden sollen.

## 1. `User.byokEnabled` (RESOLVED 2026-05-04)

- Die Spalte wurde in Commit `2c6ac84` aus `schema.prisma` entfernt, blieb aber bis 2026-05-04 in der Production-DB als dead column.
- Migration `20260504130000_drop_byok_enabled` droppt die Spalte offiziell mit `ALTER TABLE "User" DROP COLUMN IF EXISTS "byokEnabled"`. Idempotent (IF EXISTS), kein Code referenziert die Spalte (verifiziert per grep über src/).
- Apply via `npx prisma migrate deploy`. Nach Apply ist die schema/DB-Drift weg.

## 2. `knowledge_chunks` Table (Tabelle existiert in DB, nicht im Schema)

- Wird **außerhalb von Prisma** verwaltet — Supabase pgvector-Migrations erstellen sie mit Raw-SQL inkl. `vector(N)`-Spalten.
- Seit 2026-05-04 als `@@ignore`-Stub im Prisma-Schema (mit `Unsupported("vector")` für die embedding-Spalte). Damit weiß Prisma von der Tabelle und produziert kein DROP TABLE mehr im migrate-diff, **versucht aber nicht, das Schema zu managen** — alle Schema-Änderungen weiterhin via `supabase/migrations/*.sql`.
- DO NOT use the generated Prisma client to read/write knowledge_chunks. Verwende `getSupabaseAdmin()`. (Der Client würde wegen `@@ignore` ohnehin keine Methoden für die Tabelle generieren.)

## Verfahren bei `prisma migrate diff`

Ein `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` produziert seit 2026-05-04 nur noch ein erwartbares Drift-Statement:

```sql
ALTER TABLE "User" DROP COLUMN "byokEnabled";
```

Spezialfall: wenn `byokEnabled`-DROP im selben `ALTER TABLE`-Block mit anderen `ADD COLUMN`-Statements steht (combined statement), darf nur der `DROP COLUMN`-Teil entfernt werden — die `ADD COLUMN`-Statements bleiben.

Das frühere `DROP TABLE "knowledge_chunks"` ist seit der `@@ignore`-Stub-Aufnahme aus dem Diff verschwunden.

## Phase-2.2-TODO

- ~~Entscheidung über finalen DROP von `byokEnabled`~~ ✅ erledigt 2026-05-04 via `20260504130000_drop_byok_enabled`.
- ~~Evaluieren, ob `knowledge_chunks` per `@@ignore` Stub im Schema verewigt werden kann~~ ✅ erledigt 2026-05-04 — Stub mit `Unsupported("vector")` im Schema.

---

## 2026-05-02 — Phase 2.1: Multi-Tenancy foundation

Schema migration `20260502_add_org_id_columns` adds:

- `User.personalOrgId String? @unique`
- `orgId String?` + index on 42 user-owned tables.

After deploy, run the backfill once:

```bash
npx tsx scripts/backfill-personal-orgs.ts
```

The script is idempotent — re-runs skip users with a `personalOrgId`
already set and rows whose `orgId` is already populated.

Clerk Dashboard configuration:

1. **Configure → Organizations Management** → enable Organizations.
2. **Configure → Webhooks → Add Endpoint** → URL
   `https://<domain>/api/webhooks/clerk`, events `user.created`,
   `organization.created`, `organizationMembership.created`,
   `organization.deleted`. Copy the *Signing Secret* into
   `CLERK_WEBHOOK_SECRET` in your env.

---

## 2026-05-04 — Phase 2.2: API routes + Supabase RLS

### Code-side migration (no manual ops)

Resource groups switched to org-scoped reads/writes via the new
`src/lib/auth/org-context.ts` (`requireOrgId`, `getOptionalOrgId`)
and `src/lib/auth/org-scope.ts` (`orgScopeFilter`, `orgOnlyFilter`):

- agent CRUD (`/api/agents/*`, `/api/v1/agents/*`)
- team CRUD (`/api/teams`, `/api/teams/[id]`)
- knowledge CRUD (`/api/agents/[id]/knowledge/*`)
- conversations (`/api/conversations`)
- integrations (`/api/integrations`)
- API keys (`/api/user/api-keys`)
- quick-use tasks (`/api/quick-use/tasks*`)
- reseller / portal (`/api/portal/*`)

Backward-compat fallback: rows with `orgId IS NULL` stay reachable via
`{ userId, orgId: null }`, so unmigrated data is never orphaned.

`ApiKeyAuthSuccess.orgId` resolves through the API key row first,
falling back to `User.personalOrgId` for keys issued before Phase 2.1.

New helpers (used by future webhook / cron updates):

- `src/lib/auth/webhook-org-resolver.ts` — `resolveOrgFromStripeCustomer`,
  `resolveOrgFromStripeConnectAccount`, `resolveOrgFromAgentId`,
  `resolveOrgFromAgentSlug`.
- `src/lib/auth/cron-org-iterator.ts` — `iterateOrgs()`, `listOrgs()`.

### Supabase RLS — manual ops required

Two new migrations land:

- `supabase/migrations/20260504_enable_rls_org_scoping.sql` — adds
  `org_id` to `knowledge_chunks`, replaces the wide-open
  `Service role full access` policy with five scoped policies
  (`kb_chunks_service_role`, `kb_chunks_org_select`, …`_insert`,
  …`_update`, …`_delete`).
- `supabase/migrations/20260504_match_knowledge_chunks_org_aware.sql`
  — adds `target_org_id text DEFAULT NULL` to
  `match_knowledge_chunks` and `match_knowledge_chunks_multi`.

Apply with `supabase db push` (or your usual migration runner) on the
production project.

### Clerk JWT template — REQUIRED for RLS to work

The new RLS policies read the active org from the Clerk-issued JWT via
`auth.jwt() ->> 'org_id'`. Clerk's Supabase JWT template does NOT
expose the org claim by default, so policies will reject reads from
authenticated browser clients until the template is updated.

**Configure once per environment** (dev + prod separately):

1. Open the Clerk Dashboard for the right instance.
2. **Configure → JWT Templates**.
3. Edit (or create) the **Supabase** template.
4. Under *Custom Claims* paste:

   ```json
   {
     "aud": "authenticated",
     "role": "authenticated",
     "email": "{{user.primary_email_address}}",
     "org_id": "{{org.id}}"
   }
   ```

   The first three keys are Clerk's standard Supabase claims and may
   already be present; the **`org_id`** line is the addition. If
   Clerk has updated its default Supabase template since these notes
   were written, leave its other fields untouched and only add
   `org_id`.

5. Save the template. Existing JWTs are NOT retroactively re-issued —
   browser sessions will pick up the new claim on their next token
   refresh (default ~60 s).

Server-side code uses the Supabase service role and bypasses RLS, so
ingest, batch embedding, and the retrieval RPC keep working
regardless of the template state. Only direct authenticated reads
(future browser-driven Supabase queries) depend on this
configuration.

### One-time backfill: `knowledge_chunks.org_id`

After applying the RLS migration, backfill `org_id` on existing rows
so legacy chunks match the new policies:

```sql
UPDATE knowledge_chunks kc
SET org_id = kb."orgId"
FROM "KnowledgeBase" kb
WHERE kc.knowledge_base_id::text = kb.id
  AND kc.org_id IS NULL
  AND kb."orgId" IS NOT NULL;
```

Idempotent — re-runs skip rows already stamped because of the
`WHERE kc.org_id IS NULL` guard.

---

## 2026-05-04 — Phase 2.4: Admin credit-bypass

`ADMIN_USER_IDS` (comma-separated Clerk user ids in env) bypass
credit, plan, and feature gates. The bypass is *library-internal*
in six modules — route handlers should not add their own
`isAdmin` short-circuit before calling these helpers:

- `lib/credits.ts` (7 functions, all admin-aware)
- `lib/plan-limits.ts` (`canCreateAgent`)
- `lib/feature-access.ts` (`checkFeatureAccess`)
- `lib/a2a-billing.ts` (`checkA2ACredits`, `deductA2ACredits`)
- `lib/cost/cost-estimator.ts`

Admins do NOT bypass: auth, org membership, org-scope filters,
rate limits. See `src/lib/admin.ts` for the canonical doc.

**Production checklist**: ensure `ADMIN_USER_IDS` is set in the
Vercel project env (Production *and* Preview). Verify with
`vercel env ls`.
