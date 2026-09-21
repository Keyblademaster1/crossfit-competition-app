-- What a load is on. Only a barbell is made up from plates.
CREATE TYPE "Implement" AS ENUM ('BARBELL', 'DUMBBELL', 'KETTLEBELL', 'SANDBAG', 'OTHER');
ALTER TABLE "Movement" ADD COLUMN "implement" "Implement" NOT NULL DEFAULT 'BARBELL';
