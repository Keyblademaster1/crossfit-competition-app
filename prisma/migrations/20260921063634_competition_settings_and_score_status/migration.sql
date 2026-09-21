-- New settings captured by the setup wizard, plus a proper status on a score.

-- Existing enums gain a value. BEFORE/AFTER keeps the database order the same
-- as schema.prisma, so Prisma does not later think the two have drifted.
ALTER TYPE "CompetitionMode" ADD VALUE 'INDIVIDUAL' BEFORE 'SCRAMBLE';
ALTER TYPE "ScoreType" ADD VALUE 'TIME_OR_REPS' AFTER 'TIME';

CREATE TYPE "PointsSystem" AS ENUM ('HUNDRED_STEPS', 'PLACING');
CREATE TYPE "EventTieRule" AS ENUM ('SHARE_HIGHER', 'TIEBREAK_TIME', 'SHARE_AVERAGE');
CREATE TYPE "DrawMethod" AS ENUM ('RANDOM', 'SNAKE', 'HALVES', 'MANUAL');
CREATE TYPE "TeammateRule" AS ENUM ('ALWAYS_DIFFERENT', 'AVOID_REPEATS', 'ALLOW_REPEATS');
CREATE TYPE "DrawGender" AS ENUM ('IGNORE', 'MIXED', 'SAME');
CREATE TYPE "FixedTeamSource" AS ENUM ('SIGNUP', 'DRAWN', 'BALANCED');
CREATE TYPE "Gender" AS ENUM ('WOMAN', 'MAN', 'OTHER');
CREATE TYPE "ScoreStatus" AS ENUM ('FINISHED', 'CAPPED', 'NO_SHOW');

ALTER TABLE "Competition"
  ADD COLUMN "date" TIMESTAMP(3),
  ADD COLUMN "venue" TEXT,
  ADD COLUMN "pointsSystem" "PointsSystem" NOT NULL DEFAULT 'HUNDRED_STEPS',
  ADD COLUMN "eventTieRule" "EventTieRule" NOT NULL DEFAULT 'SHARE_HIGHER',
  ADD COLUMN "drawMethod" "DrawMethod" NOT NULL DEFAULT 'SNAKE',
  ADD COLUMN "teammateRule" "TeammateRule" NOT NULL DEFAULT 'ALWAYS_DIFFERENT',
  ADD COLUMN "drawGender" "DrawGender" NOT NULL DEFAULT 'IGNORE',
  ADD COLUMN "spreadSixtyPlus" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "fixedTeamSource" "FixedTeamSource" NOT NULL DEFAULT 'SIGNUP';

ALTER TABLE "Athlete"
  ADD COLUMN "gender" "Gender",
  ADD COLUMN "isSixtyPlus" BOOLEAN NOT NULL DEFAULT false;

-- Replace the didNotFinish tickbox with a status, carrying the existing
-- results across rather than losing them: anyone previously marked as not
-- finished was, in the new wording, capped.
ALTER TABLE "Score" ADD COLUMN "status" "ScoreStatus" NOT NULL DEFAULT 'FINISHED';
UPDATE "Score" SET "status" = 'CAPPED' WHERE "didNotFinish" = true;
ALTER TABLE "Score" DROP COLUMN "didNotFinish";
