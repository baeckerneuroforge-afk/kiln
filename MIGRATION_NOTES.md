# Migration Notes — Bekannter Schema-Drift

Dieses Dokument listet bewusste Diskrepanzen zwischen `prisma/schema.prisma` und der Live-Datenbank, die NICHT durch reguläre Prisma-Migrations aufgelöst werden sollen.

## 1. `User.byokEnabled` (Spalte existiert in DB, nicht im Schema)

- Die Spalte wurde in Commit `2c6ac84` aus `schema.prisma` entfernt, ist aber weiterhin in der Production-DB vorhanden.
- Status: **intentional drift, nicht aktiv genutzt**. Kein Code referenziert die Spalte, ein DROP würde keinen funktionalen Schaden verursachen, aber zur Vermeidung von Datenverlust wurde sie zunächst belassen.
- Aufräumen frühestens in Phase 2.2 (sobald sicher ist, dass kein historischer Restore-Pfad sie noch braucht).

## 2. `knowledge_chunks` Table (Tabelle existiert in DB, nicht im Schema)

- Wird **außerhalb von Prisma** verwaltet — Supabase pgvector-Migrations erstellen sie mit Raw-SQL inkl. `vector(N)`-Spalten.
- Prisma unterstützt den `vector`-Typ nicht; ein Re-Import ins Schema würde die pgvector-Definition zerstören.
- Status: **permanent drift by design**. Tabelle muss erhalten bleiben — sie hält alle RAG-Embeddings.

## Verfahren bei `prisma migrate diff`

Ein `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` produziert immer mindestens diese zwei Statements:

```sql
ALTER TABLE "User" DROP COLUMN "byokEnabled";
DROP TABLE "knowledge_chunks";
```

Vor dem Apply einer aus diesem Diff generierten Migration **müssen beide Statements entfernt werden**. Spezialfall: wenn `byokEnabled`-DROP im selben `ALTER TABLE`-Block mit anderen `ADD COLUMN`-Statements steht (combined statement), darf nur der `DROP COLUMN`-Teil entfernt werden — die `ADD COLUMN`-Statements bleiben.

Alternative: `knowledge_chunks` per `@@ignore` ins Schema aufzunehmen würde den DROP aus dem Diff eliminieren, ist aber wegen des fehlenden `vector`-Type-Supports in Prisma derzeit nicht praktikabel.

## Phase-2.2-TODO

- Entscheidung über finalen DROP von `byokEnabled` (mit DB-Backup vorher).
- Evaluieren, ob `knowledge_chunks` per `@@ignore` Stub im Schema verewigt werden kann, sobald Prisma `vector` unterstützt oder ein `Unsupported("vector")`-Workaround tragfähig ist.
