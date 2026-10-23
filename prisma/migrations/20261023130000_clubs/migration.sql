-- Clubs: every competition belongs to one, and only its own club sees it.
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- Every competition so far was made for testing, so they go into one club
-- together. A real club is made for each gym when it signs up.
INSERT INTO "Club" ("id", "name")
SELECT 'test-club', 'Test club' WHERE EXISTS (SELECT 1 FROM "Competition");

ALTER TABLE "Competition" ADD COLUMN "clubId" TEXT;
UPDATE "Competition" SET "clubId" = 'test-club';
ALTER TABLE "Competition" ALTER COLUMN "clubId" SET NOT NULL;

ALTER TABLE "Competition" ADD CONSTRAINT "Competition_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
