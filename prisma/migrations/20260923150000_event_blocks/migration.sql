-- Events become a stack of blocks (design/app/event-builder/HANDOFF.md).
-- Every existing event is converted into a single block holding all of its
-- movements, so nothing entered so far is lost.

CREATE TYPE "BlockFormat" AS ENUM ('FOR_TIME', 'ROUNDS_FOR_TIME', 'AMRAP', 'EMOM', 'INTERVALS', 'LADDER', 'MAX_LOAD', 'REST');
CREATE TYPE "WorkSplit" AS ENUM ('ANYHOW', 'YOU_GO_I_GO', 'ALTERNATE_REPS', 'SYNCHRO', 'CONGA', 'RELAY', 'ONE_WORKS_ONE_HOLDS', 'BOTH_DO_ALL', 'SPLIT_50_50');

CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "divisionId" TEXT,
    "position" INTEGER NOT NULL,
    "format" "BlockFormat" NOT NULL DEFAULT 'FOR_TIME',
    "setting" TEXT,
    "split" "WorkSplit",

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Block_eventId_position_idx" ON "Block"("eventId", "position");
ALTER TABLE "Block" ADD CONSTRAINT "Block_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT "Block_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ADD COLUMN "tiebreakBlockId" TEXT;

-- One block per existing event, in the format its old score type meant.
-- Teams share the work any way they like until the organiser says otherwise;
-- individual competitions have no split.
INSERT INTO "Block" ("id", "eventId", "position", "format", "setting", "split")
SELECT
  'blk_' || e."id",
  e."id",
  1,
  CASE e."scoreType"
    WHEN 'ROUNDS_REPS' THEN 'AMRAP'::"BlockFormat"
    WHEN 'REPS' THEN 'AMRAP'::"BlockFormat"
    WHEN 'WEIGHT' THEN 'MAX_LOAD'::"BlockFormat"
    ELSE 'FOR_TIME'::"BlockFormat"
  END,
  CASE
    WHEN e."scoreType" IN ('ROUNDS_REPS', 'REPS') AND e."timeCapSeconds" IS NOT NULL
      THEN (e."timeCapSeconds" / 60)::TEXT
    WHEN e."scoreType" = 'WEIGHT' AND e."timeCapSeconds" IS NOT NULL
      THEN (e."timeCapSeconds" / 60)::TEXT || ':' || LPAD((e."timeCapSeconds" % 60)::TEXT, 2, '0')
    ELSE NULL
  END,
  CASE WHEN c."mode" = 'INDIVIDUAL' THEN NULL ELSE 'ANYHOW'::"WorkSplit" END
FROM "Event" e
JOIN "Competition" c ON c."id" = e."competitionId";

UPDATE "Event" SET "tiebreakBlockId" = 'blk_' || "id";

-- Movements move into their event's block. The per-division column was never
-- used; divisions now get their own blocks instead.
ALTER TABLE "Movement" ADD COLUMN "blockId" TEXT;
UPDATE "Movement" SET "blockId" = 'blk_' || "eventId";
ALTER TABLE "Movement" ALTER COLUMN "blockId" SET NOT NULL;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Movement" DROP CONSTRAINT "Movement_divisionId_fkey";
ALTER TABLE "Movement" DROP COLUMN "divisionId";
