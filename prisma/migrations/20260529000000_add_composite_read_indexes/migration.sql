-- Sprint 20.2 P1-perf: composite indexes for hot read paths.
--
-- Authored by hand to match the `@@index` additions in schema.prisma without
-- running `prisma migrate dev` against the live database. `prisma migrate
-- deploy` applies this file on the next deploy.
--
-- IF NOT EXISTS makes this a no-op when the indexes were pre-created
-- out-of-band. For very large tables (Conversation, Message) consider running
-- `CREATE INDEX CONCURRENTLY` manually BEFORE deploy to avoid a write lock,
-- then this migration becomes a no-op.

CREATE INDEX IF NOT EXISTS "Conversation_agentId_createdAt_idx" ON "Conversation"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiCreditUsage_orgId_createdAt_idx" ON "AiCreditUsage"("orgId", "createdAt");
