CREATE TABLE IF NOT EXISTS "AgencyOpsSnapshot" (
  "id" TEXT NOT NULL,
  "agencyOrgId" TEXT NOT NULL,
  "totalCustomers" INTEGER NOT NULL,
  "activeDepartments" INTEGER NOT NULL,
  "pendingApprovals" INTEGER NOT NULL,
  "failedRuns24h" INTEGER NOT NULL,
  "tokensUsedToday" INTEGER NOT NULL,
  "revenueToday" DOUBLE PRECISION NOT NULL,
  "customerHealth" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgencyOpsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyOpsSnapshot_agencyOrgId_computedAt_key"
  ON "AgencyOpsSnapshot"("agencyOrgId", "computedAt");

CREATE INDEX IF NOT EXISTS "AgencyOpsSnapshot_agencyOrgId_computedAt_idx"
  ON "AgencyOpsSnapshot"("agencyOrgId", "computedAt");
