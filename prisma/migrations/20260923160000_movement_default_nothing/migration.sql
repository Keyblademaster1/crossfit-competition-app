-- A new movement starts as done on nothing, rather than a barbell, so the
-- heat's kit list only fetches what someone has said is needed. Existing
-- movements keep what they have.
ALTER TABLE "Movement" ALTER COLUMN "implement" SET DEFAULT 'OTHER';
