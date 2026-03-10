# KILN — AI Creation Platform

## Was ist KILN?
Eine AI Creation Platform. Nutzer erstellen per Natural Language AI Agents, Websites und Workflows — und schalten sie sofort live. Kein Code nötig.

## Wer baut das?
André Bäcker, Solo-Founder, Hephaistos Systems, Gießen.

## Design System
- Dark Mode Default
- Fonts: Instrument Serif (Headlines), DM Sans (Body), DM Mono (Code)
- Farben: bg #0C0A09, accent #F97316, ember #DC2626, green #22C55E, blue #3B82F6
- Ästhetik: Linear/Vercel/Raycast-Niveau. Premium, clean.
- Logo: Quadrat mit Orange-Ember-Gradient, weißes "K" in Instrument Serif

## Tech Stack
- Next.js 14 (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- Clerk (Auth, Multi-Tenant via Orgs)
- Supabase (PostgreSQL + pgvector + Storage)
- Prisma (ORM)
- Claude API (Anthropic) — Primär-LLM
- Stripe (Billing: Free/Pro €49/Agency €149)
- Resend (Transaktionale E-Mails)
- Vercel (Hosting)

## Architektur-Regeln
- EIN Next.js Projekt. Kein Monorepo, kein Turborepo.
- Deutsche UI-Texte als Default
- Alle API-Keys in .env.local
- Prisma für DB-Zugriff, NICHT Supabase Client direkt (außer für pgvector/Storage)
- shadcn/ui Komponenten nutzen, nicht selbst bauen
- Streaming für Chat-Responses (Claude API)

## Drei Module
1. 🤖 AI Agent Studio (ORANGE) — Phase 1, JETZT bauen
2. 🌐 Site Builder (BLUE) — Phase 2, "Coming Soon" Placeholder
3. ⚡ Flow Engine (GREEN) — Phase 3, "Coming Soon" Placeholder

## Agent Builder Kern-Features
- Conversational Agent-Erstellung (Chat statt Formular)
- Claude API generiert Agent-Config aus Nutzerbeschreibung
- Split-Screen: Links Config, Rechts Live-Chat-Vorschau
- Knowledge Base: PDF/URL/FAQ Upload → Chunking → pgvector Embedding
- Pre-built Actions: Terminbuchung, E-Mail, Lead-Scoring, Webhook (Toggle-Cards)
- White-Label: Logo, Farben, Custom Domain, "Powered by KILN" entfernbar ab Pro
- Templates: 10 branchenspezifische Agent-Vorlagen
- Analytics: Gespräche, Leads, Termine, geschätzter Wert (€)
- Agent-Training: Feedback-Loop (schlechte Antwort → Korrektur → KB-Update)

## Coding-Style
- TypeScript strict mode
- Server Components wo möglich, Client Components nur wo nötig
- API Routes in app/api/ mit Route Handlers
- Fehler immer mit try/catch + sinnvolle Error Messages
- Kommentare auf Deutsch wo hilfreich

## Wichtige Docs
- docs/KONZEPT.md — Vollständiges Produktkonzept
- docs/AGENT_SPEC.md — Detaillierte Agent Builder Spezifikation
