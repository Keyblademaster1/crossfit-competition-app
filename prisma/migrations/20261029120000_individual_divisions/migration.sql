-- An individual competition can be split into divisions, as fixed teams are.
ALTER TABLE "Competition" ADD COLUMN "individualDivisions" BOOLEAN NOT NULL DEFAULT false;
