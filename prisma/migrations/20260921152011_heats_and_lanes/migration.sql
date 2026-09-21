-- Heats and lanes: who is on the floor at the same time, and where.

ALTER TABLE "Competition" ADD COLUMN "lanesPerHeat" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "Heat" (
  "id"       TEXT NOT NULL,
  "eventId"  TEXT NOT NULL,
  "number"   INTEGER NOT NULL,
  "startsAt" TEXT,
  CONSTRAINT "Heat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lane" (
  "id"        TEXT NOT NULL,
  "heatId"    TEXT NOT NULL,
  "number"    INTEGER NOT NULL,
  "teamId"    TEXT,
  "athleteId" TEXT,
  CONSTRAINT "Lane_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Heat_eventId_number_key" ON "Heat"("eventId", "number");
CREATE UNIQUE INDEX "Lane_heatId_number_key" ON "Lane"("heatId", "number");

ALTER TABLE "Heat" ADD CONSTRAINT "Heat_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_heatId_fkey"
  FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
