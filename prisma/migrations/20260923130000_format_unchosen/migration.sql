-- A new competition starts with no format, so the setup wizard shows all
-- three cards unchosen. Existing competitions keep theirs.
ALTER TABLE "Competition" ALTER COLUMN "mode" DROP NOT NULL;
