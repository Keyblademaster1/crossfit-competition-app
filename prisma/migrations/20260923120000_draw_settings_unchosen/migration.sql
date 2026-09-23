-- The draw settings and where fixed teams come from start empty, so the setup
-- wizard shows them unchosen. Existing competitions keep what they have.
ALTER TABLE "Competition" ALTER COLUMN "drawMethod" DROP NOT NULL,
                          ALTER COLUMN "drawMethod" DROP DEFAULT,
                          ALTER COLUMN "teammateRule" DROP NOT NULL,
                          ALTER COLUMN "teammateRule" DROP DEFAULT,
                          ALTER COLUMN "drawGender" DROP NOT NULL,
                          ALTER COLUMN "drawGender" DROP DEFAULT,
                          ALTER COLUMN "spreadSixtyPlus" SET DEFAULT false,
                          ALTER COLUMN "fixedTeamSource" DROP NOT NULL,
                          ALTER COLUMN "fixedTeamSource" DROP DEFAULT;
