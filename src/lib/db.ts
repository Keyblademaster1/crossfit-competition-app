import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One shared database connection for the whole app.
 *
 * Prisma 7 needs a "driver adapter": the piece that actually speaks Postgres.
 * PrismaPg wraps the standard Postgres driver and manages a pool of
 * connections that get reused rather than opened afresh each time.
 *
 * During development Next.js reloads your code on every save. Without the
 * `globalThis` cache below, each reload would open a brand new pool and
 * Supabase would eventually refuse the connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  /**
   * Which version of the generated code the cached connection was built from.
   *
   * Prisma writes the app's picture of the database into src/generated. When
   * the schema changes and that picture is rebuilt, this file is reloaded and
   * `PrismaClient` becomes a different function than the one we kept. That
   * mismatch is how we know the connection we are holding is out of date.
   */
  prismaBuiltFrom?: unknown;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste your Supabase connection string into it.",
    );
  }

  // A "?schema=" on the end of the url picks which set of tables to use. The
  // Prisma command line reads it from the url, but the driver adapter does
  // not: it has to be handed over separately. Miss this and everything
  // quietly goes to the default "public" tables instead — which is how the
  // end-to-end tests once wrote into the real competitions.
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }, schema ? { schema } : undefined),
  });
}

// Throw away a connection built from an older picture of the database.
// Without this, changing the schema meant the running app kept asking for
// columns that no longer existed until somebody restarted it by hand.
if (globalForPrisma.prisma && globalForPrisma.prismaBuiltFrom !== PrismaClient) {
  if (process.env.NODE_ENV !== "production") {
    console.log("[db] The database description changed; reconnecting.");
  }
  void globalForPrisma.prisma.$disconnect().catch(() => {});
  globalForPrisma.prisma = undefined;
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaBuiltFrom = PrismaClient;
}
