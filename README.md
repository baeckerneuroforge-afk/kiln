# KILN — AI Agent Platform

Build, deploy, and manage AI agents with a visual builder, knowledge base, multi-LLM support, and white-label embedding.

## Tech Stack
- Next.js 14 (App Router)
- Prisma + PostgreSQL
- Supabase (pgvector, Storage)
- Clerk (Auth)
- Stripe (Billing)
- Anthropic/OpenAI/Google/Groq/Perplexity (LLM Providers)
- Upstash Redis (Rate Limiting)
- Resend (Email)
- Sentry (Error Tracking)

## Getting Started

1. Clone the repo: `git clone https://github.com/baeckerneuroforge-afk/kiln.git`
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in all values
4. Push database schema: `npx prisma db push`
5. Generate Prisma client: `npx prisma generate`
6. Seed marketplace templates: `npx tsx scripts/seed-marketplace.ts`
7. Run dev server: `npm run dev`
8. Open `http://localhost:3000`

## Deployment
Deployed on Vercel. Push to `main` triggers automatic deployment.  
Domain: https://kilnbase.com

## Multi-Tenancy (Clerk Organizations)

KILN uses Clerk Organizations as the tenant boundary. Every user gets an
auto-created **Personal workspace** organization on sign-up; agency users can
create additional shared orgs.

### One-time Clerk Dashboard setup

1. **Enable Organizations**:
   Clerk Dashboard → **Configure → Organizations Management** → toggle
   *Enable Organizations* on. Without this the auth flow won't expose
   `auth().orgId`, the webhook will fail to create a workspace, and every
   request will fall back to `User.personalOrgId`.
2. **Configure the user.created webhook**:
   Clerk Dashboard → **Configure → Webhooks → Add Endpoint**.
   - URL: `https://<your-domain>/api/webhooks/clerk`
   - Subscribe to: `user.created`, `organization.created`,
     `organizationMembership.created`, `organization.deleted`
   - Copy the *Signing Secret* into `CLERK_WEBHOOK_SECRET` in your env.
3. **Personal-workspace branding** (optional):
   The handler names new orgs `<First Last>'s Workspace`. Adjust
   `buildPersonalOrgName` in `src/app/api/webhooks/clerk/route.ts` if
   you want a different convention.

### Backfill for existing users

After deploying the Phase 2.1 schema migration, run the backfill once to
provision Personal workspaces for users created before Organizations were
enabled:

```bash
npx tsx scripts/backfill-personal-orgs.ts
```

The script is idempotent — re-running it skips users that already have a
`personalOrgId` and skips rows whose `orgId` is already set. Per-user
errors are logged but don't abort the run.

### Local development

For local dev, you can either:
- Enable Organizations in your Clerk dev instance and configure a webhook
  to a tunnelled URL (e.g. ngrok), or
- Skip Clerk Organizations and rely on the `personalOrgId` fallback baked
  into `requireOrgId()`. Org-aware code paths still work — they just see
  every user as the sole member of their own org.

## License
Proprietary — All rights reserved.
