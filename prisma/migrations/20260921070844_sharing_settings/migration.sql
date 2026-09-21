-- The last step of the setup wizard: what athletes and the public can see.
ALTER TABLE "Competition"
  ADD COLUMN "athleteAccess" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicLink" BOOLEAN NOT NULL DEFAULT false;
