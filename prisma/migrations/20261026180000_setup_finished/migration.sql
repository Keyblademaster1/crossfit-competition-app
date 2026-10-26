-- Remembers when a competition's setup was finished, so a draft opens back
-- into setup rather than onto the competition page.

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "setupFinishedAt" TIMESTAMP(3);

-- Competitions made before this, with a name and a format chosen, count as
-- set up already. The rest are drafts.
UPDATE "Competition" SET "setupFinishedAt" = CURRENT_TIMESTAMP
WHERE "name" <> '' AND "mode" IS NOT NULL;
