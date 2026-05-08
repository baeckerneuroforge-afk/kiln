-- Apply in Supabase SQL Editor for Departments Phase 2 channel integration.
-- After apply, resolve the migration as applied:
-- npx prisma migrate resolve --applied 20260508000001_add_department_channels

DO $$ BEGIN
  CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ChannelMessageStatus" AS ENUM ('RECEIVED', 'DRAFTED', 'APPROVED', 'SENT', 'BLOCKED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "emailEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "emailInboundAddr" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "emailFromAddr" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "emailFromName" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "emailReplyToAddr" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "whatsappPhoneId" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "whatsappBusinessId" TEXT;

CREATE TABLE IF NOT EXISTS "DepartmentChannelMessage" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "backlogItemId" TEXT,
  "channel" "ChannelType" NOT NULL,
  "direction" "MessageDirection" NOT NULL,
  "emailMessageId" TEXT,
  "emailFrom" TEXT,
  "emailTo" TEXT,
  "emailSubject" TEXT,
  "emailHeaders" JSONB,
  "emailBody" TEXT,
  "whatsappMessageId" TEXT,
  "whatsappFrom" TEXT,
  "whatsappTo" TEXT,
  "whatsappBody" TEXT,
  "whatsappType" TEXT,
  "whatsappMediaId" TEXT,
  "status" "ChannelMessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "blockedReason" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "externalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentChannelMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DepartmentChannelMessage_departmentId_channel_createdAt_idx" ON "DepartmentChannelMessage"("departmentId", "channel", "createdAt");
CREATE INDEX IF NOT EXISTS "DepartmentChannelMessage_departmentId_direction_status_idx" ON "DepartmentChannelMessage"("departmentId", "direction", "status");
CREATE INDEX IF NOT EXISTS "DepartmentChannelMessage_backlogItemId_idx" ON "DepartmentChannelMessage"("backlogItemId");

DO $$ BEGIN
  ALTER TABLE "DepartmentChannelMessage"
    ADD CONSTRAINT "DepartmentChannelMessage_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DepartmentChannelMessage"
    ADD CONSTRAINT "DepartmentChannelMessage_backlogItemId_fkey"
    FOREIGN KEY ("backlogItemId") REFERENCES "DepartmentBacklogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
