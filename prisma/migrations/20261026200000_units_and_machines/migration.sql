-- The event builder: a rower, a bike and a ski erg are now three kinds of
-- equipment rather than one, and a movement's number can be reps, metres or
-- calories, so a run can go in a workout.

-- AlterEnum
ALTER TYPE "Implement" ADD VALUE 'BIKE';
ALTER TYPE "Implement" ADD VALUE 'SKI_ERG';

-- CreateEnum
CREATE TYPE "MovementUnit" AS ENUM ('REPS', 'METRES', 'CALORIES');

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN "unit" "MovementUnit" NOT NULL DEFAULT 'REPS';
