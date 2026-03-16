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

## License
Proprietary — All rights reserved.
