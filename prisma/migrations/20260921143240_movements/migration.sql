-- The lines of a workout, so a capped result can be entered as "reps into
-- wall balls" and turned into a total by the app rather than in someone's head.

CREATE TYPE "LoadMode" AS ENUM ('EACH', 'SHARED');

CREATE TABLE "Movement" (
  "id"             TEXT NOT NULL,
  "eventId"        TEXT NOT NULL,
  "divisionId"     TEXT,
  "position"       INTEGER NOT NULL,
  "reps"           INTEGER NOT NULL,
  "name"           TEXT NOT NULL,
  "loadMode"       "LoadMode" NOT NULL DEFAULT 'EACH',
  -- Free text, because a load is not always a weight: a box jump is "60 cm".
  "loadMenMen"     TEXT,
  "loadWomenWomen" TEXT,
  "loadMixed"      TEXT,
  "loadSixtyPlus"  TEXT,
  CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Movement_eventId_position_idx" ON "Movement"("eventId", "position");

ALTER TABLE "Movement"
  ADD CONSTRAINT "Movement_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Movement"
  ADD CONSTRAINT "Movement_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
