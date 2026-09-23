-- How an event is scored is now worked out from its blocks. Converted events
-- are one block each, so their old score type maps directly: a time becomes
-- "time if finished, reps if capped", and plain reps (now an AMRAP block)
-- becomes rounds + reps. Nothing about the ranking changes.
UPDATE "Event" SET "scoreType" = 'TIME_OR_REPS', "higherIsBetter" = false WHERE "scoreType" = 'TIME';
UPDATE "Event" SET "scoreType" = 'ROUNDS_REPS', "higherIsBetter" = true WHERE "scoreType" = 'REPS';
