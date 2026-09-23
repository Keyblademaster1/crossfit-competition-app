-- Reps per round is now worked out from an event's movements rather than typed
-- in. Bring existing rounds + reps events into line: every movement's reps
-- added up, counting the shared version where a division has its own.
UPDATE "Event" AS e
SET "repsPerRound" = totals.reps
FROM (
  SELECT m."eventId",
         COALESCE(SUM(m."reps") FILTER (WHERE m."divisionId" IS NULL), SUM(m."reps")) AS reps
  FROM "Movement" AS m
  GROUP BY m."eventId"
) AS totals
WHERE e."id" = totals."eventId"
  AND e."scoreType" = 'ROUNDS_REPS'
  AND totals.reps > 0;
