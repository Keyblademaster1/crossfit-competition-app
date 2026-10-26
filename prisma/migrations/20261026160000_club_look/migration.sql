-- Club settings: each club's own colours and logos. All empty to begin with,
-- which means the built-in look.

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "logoDark" BYTEA,
ADD COLUMN     "logoDarkType" TEXT,
ADD COLUMN     "logoLight" BYTEA,
ADD COLUMN     "logoLightType" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "primaryColor" TEXT,
ADD COLUMN     "secondaryColor" TEXT;
