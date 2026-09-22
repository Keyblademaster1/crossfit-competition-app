-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Implement" ADD VALUE 'WALL_BALL';
ALTER TYPE "Implement" ADD VALUE 'BOX';
ALTER TYPE "Implement" ADD VALUE 'ROWER';
ALTER TYPE "Implement" ADD VALUE 'JUMP_ROPE';
ALTER TYPE "Implement" ADD VALUE 'PULL_UP_BAR';
