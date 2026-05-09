-- Customer-Reporting: white-label monthly/weekly reports per Sub-Org.
-- Idempotent for production hotfix safety.

CREATE TABLE IF NOT EXISTS "CustomerReport" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "periodType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "metrics" JSONB NOT NULL,
  "highlights" JSONB,
  "pdfUrl" TEXT,
  "htmlBody" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "triggerType" TEXT NOT NULL DEFAULT 'CRON',
  "triggeredByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerReport_orgId_periodEnd_idx" ON "CustomerReport"("orgId", "periodEnd");
CREATE INDEX IF NOT EXISTS "CustomerReport_status_periodEnd_idx" ON "CustomerReport"("status", "periodEnd");

CREATE TABLE IF NOT EXISTS "CustomerReportConfig" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  "recipientEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "includeMetrics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "customMessage" TEXT,
  "sendDayOfMonth" INTEGER NOT NULL DEFAULT 1,
  "sendHour" INTEGER NOT NULL DEFAULT 8,
  "sendOnEmpty" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerReportConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerReportConfig_orgId_key" ON "CustomerReportConfig"("orgId");
CREATE INDEX IF NOT EXISTS "CustomerReportConfig_isEnabled_frequency_idx" ON "CustomerReportConfig"("isEnabled", "frequency");
