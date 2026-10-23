/**
 * Keeps the hosted Supabase database from being paused.
 *
 * Supabase pauses a free database that shows too little activity, and one
 * identical tiny query a day was not enough to convince it. What works (this
 * follows Stephen Lau's setup) is about one visit an hour at an unpredictable
 * minute, a few varied reads, and a small write to a table kept for the
 * purpose.
 *
 * It talks to Postgres directly with DATABASE_URL, the same way the app does,
 * rather than through supabase-js: the Supabase Data API is switched off on
 * purpose (see "Security decisions" in SPEC.md).
 */
import pg from "pg";

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The schedule ticks every 10 minutes and one tick in six goes ahead, so the
// visits average one an hour at minutes nobody could predict. A skipped tick
// leaves before connecting, so the quiet gaps stay quiet.
const PING_PROBABILITY = 1 / 6;

// Cheap reads from the app's own tables. Each visit picks some of them and
// varies how many rows it asks for, so no two visits send the same queries.
const READS: Record<string, () => string> = {
  Competition: () => `SELECT id FROM "Competition" LIMIT ${randInt(1, 5)}`,
  Athlete: () => `SELECT id FROM "Athlete" LIMIT ${randInt(1, 5)}`,
  Event: () => `SELECT id FROM "Event" LIMIT ${randInt(1, 3)}`,
  Score: () => `SELECT count(*) FROM "Score"`,
};

// Some connection errors carry only a code, such as ECONNREFUSED, and no message.
const why = (error: unknown) => (error as Error).message || (error as { code?: string }).code || String(error);

const reply = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Keepalive: DATABASE_URL is not set");
    return reply(500, { status: "error", reason: "DATABASE_URL is not set" });
  }

  if (Math.random() >= PING_PROBABILITY) {
    console.log("Keepalive tick skipped");
    return reply(200, { status: "ok", pinged: false });
  }

  // A few seconds' jitter on top of the random choice of tick.
  await sleep(randInt(0, 3000));

  const db = new pg.Client({ connectionString });
  const succeeded: string[] = [];
  const failed: string[] = [];
  let heartbeat = "failed";

  try {
    await db.connect();

    const names = Object.keys(READS)
      .sort(() => Math.random() - 0.5)
      .slice(0, randInt(1, 3));
    for (const name of names) {
      try {
        await db.query(READS[name]());
        succeeded.push(name);
      } catch (error) {
        console.error(`Keepalive read on ${name} failed:`, why(error));
        failed.push(name);
      }
    }

    // The write is what counts as unmistakable activity. A missing table
    // (its migration not applied yet) is only a warning: the reads still count.
    try {
      const result = await db.query(
        `UPDATE "KeepaliveHeartbeat" SET "pings" = "pings" + 1, "lastPingAt" = now() WHERE "id" = 1`,
      );
      heartbeat = result.rowCount === 1 ? "ok" : "missing row";
    } catch (error) {
      console.warn("Keepalive heartbeat write failed:", why(error));
    }
  } catch (error) {
    console.error("Keepalive could not reach the database:", why(error));
  } finally {
    await db.end().catch(() => {});
  }

  if (succeeded.length === 0 && heartbeat !== "ok") {
    console.error("Keepalive: no query reached the database");
    return reply(500, { status: "error", reads_failed: failed, heartbeat });
  }

  console.log(`Keepalive ping successful: reads=[${succeeded.join(", ")}] heartbeat=${heartbeat}`);
  return reply(200, { status: "ok", pinged: true, reads: succeeded, heartbeat });
};

export const config = {
  // Every 10 minutes, at 4, 14, 24... past the hour (UTC). Netlify fixes the
  // schedule when it deploys, so the randomness has to come from skipping.
  schedule: "4-59/10 * * * *",
};
