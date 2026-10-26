-- Logging in with Google: someone logging in for the first time has no club
-- until they name one on the next page, so a user's club may be empty.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "clubId" DROP NOT NULL;
