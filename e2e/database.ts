/**
 * The database the end-to-end tests use.
 *
 * Tests write real rows, so they must not share a database with real
 * competitions. Rather than needing a second Supabase project, they use a
 * separate *schema* inside the same database: same connection, completely
 * separate set of tables. Postgres keeps them apart, and nothing the tests do
 * can touch the real ones.
 *
 * Set DATABASE_URL_TEST if you would rather point somewhere else entirely.
 */

export const TEST_SCHEMA = "e2e";

export function testDatabaseUrl(): string {
  const explicit = process.env.DATABASE_URL_TEST;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "No DATABASE_URL. Copy .env.example to .env.local and put your connection string in it.",
    );
  }

  const url = new URL(base);
  url.searchParams.set("schema", TEST_SCHEMA);
  return url.toString();
}

/**
 * Refuses to go any further unless the url really does point at a schema kept
 * for tests. Without this, one bad edit would have the tests deleting real
 * competitions, and they would still pass while doing it.
 */
export function assertIsTestDatabase(url: string): void {
  const schema = new URL(url).searchParams.get("schema");
  if (!schema || !/test|e2e/i.test(schema)) {
    throw new Error(
      `Refusing to run tests against schema "${schema ?? "(none)"}". ` +
        `The url must name a schema for testing, such as "?schema=${TEST_SCHEMA}".`,
    );
  }
}
