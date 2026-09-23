-- Heat order and "last heat doesn't start the next event" move to the Format
-- step of setup. Existing competitions keep heats as they were: leaders last,
-- with the rule on only for scrambles, where it always applies.
CREATE TYPE "HeatOrder" AS ENUM ('STANDING', 'RANDOM');
ALTER TABLE "Competition" ADD COLUMN "heatOrder" "HeatOrder";
ALTER TABLE "Competition" ADD COLUMN "lastHeatNotFirst" BOOLEAN NOT NULL DEFAULT false;
