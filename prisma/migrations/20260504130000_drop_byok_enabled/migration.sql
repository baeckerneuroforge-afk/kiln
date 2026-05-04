-- Drop unused byokEnabled column from User.
-- The column was removed from prisma/schema.prisma in commit 2c6ac84 but
-- left in the production DB to avoid data loss during the rollout window.
-- No application code references it (verified by grep across src/), so the
-- column is dead and the schema/DB drift can be closed.
ALTER TABLE "User" DROP COLUMN IF EXISTS "byokEnabled";
