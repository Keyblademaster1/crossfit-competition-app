-- Share links: the unguessable part of a competition's public link,
-- /share/<shareCode>. Empty until the organiser first switches the link on.

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "shareCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Competition_shareCode_key" ON "Competition"("shareCode");
