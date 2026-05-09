-- Audit-Log + DSGVO-Tools: system-wide audit log plus DSGVO export and
-- deletion request models. Idempotent for production hotfix safety.

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" TEXT NOT NULL DEFAULT 'USER',
  "actorOrgId" TEXT,
  "orgId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "description" TEXT,
  "changes" JSONB,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "requestId" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_severity_createdAt_idx" ON "AuditLog"("severity", "createdAt");

CREATE TABLE IF NOT EXISTS "DataExportRequest" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "scope" TEXT NOT NULL DEFAULT 'FULL',
  "format" TEXT NOT NULL DEFAULT 'JSON',
  "fileUrl" TEXT,
  "fileSizeBytes" BIGINT,
  "expiresAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataExportRequest_orgId_createdAt_idx" ON "DataExportRequest"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataExportRequest_status_createdAt_idx" ON "DataExportRequest"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "DataDeletionRequest" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "scope" TEXT NOT NULL DEFAULT 'FULL',
  "graceUntil" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "itemsDeleted" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataDeletionRequest_orgId_idx" ON "DataDeletionRequest"("orgId");
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_status_scheduledFor_idx" ON "DataDeletionRequest"("status", "scheduledFor");
