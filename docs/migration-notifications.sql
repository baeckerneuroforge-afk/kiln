-- Apply in Supabase SQL Editor for Departments Phase 3 approval-notifications.
-- After apply, resolve the migration as applied:
-- npx prisma migrate resolve --applied 20260508000002_add_department_notifications

DO $$ BEGIN
  CREATE TYPE "NotifyChannel" AS ENUM ('SLACK_ONLY', 'EMAIL_ONLY', 'SLACK_THEN_EMAIL', 'NONE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "notifyOnApprovalNeeded" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "notifyChannel" "NotifyChannel" NOT NULL DEFAULT 'SLACK_THEN_EMAIL';
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "notifySlackChannel" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "notifyEmailRecipients" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "notifyDigestEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "notifyDigestSentAt" TIMESTAMP(3);
