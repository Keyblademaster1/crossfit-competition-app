import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Every action checks whose competition it is before it touches anything.
 *
 * Actions can be called directly, not only from their page, so an action
 * written without the check would let one club change another's
 * competitions. This reads actions.ts and fails if any exported action never
 * calls ownCompetition, or currentClubId for the ones that make a new
 * competition.
 */

const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

/** Each exported action's name and body, up to the next top-level function. */
function actions(): { name: string; body: string }[] {
  const starts = [...source.matchAll(/^export async function (\w+)\(/gm)];
  const ends = [...source.matchAll(/^(?:export )?(?:async )?function \w+|^\}$/gm)].map((m) => m.index!);
  return starts.map((match) => {
    const end = ends.find((index) => index > match.index! && source.slice(index, index + 1) === "}") ?? source.length;
    return { name: match[1], body: source.slice(match.index!, end) };
  });
}

test("there are actions to check", () => {
  assert.ok(actions().length > 20);
});

test("every action checks the competition belongs to this club", () => {
  const unguarded = actions()
    .filter(({ body }) => !/ownCompetition\(|currentClubId\(/.test(body))
    .map(({ name }) => name);
  assert.deepEqual(unguarded, []);
});

test("an action checks ownership before it reads or writes anything", () => {
  const late = actions()
    .filter(({ body }) => {
      const guard = body.search(/ownCompetition\(|currentClubId\(/);
      const firstUse = body.search(/\bdb\.|\b(addEventRow|saveAthleteEdits|leaveFixedTeams|versionBlocks|loadLeaderboard)\(/);
      return firstUse !== -1 && guard > firstUse;
    })
    .map(({ name }) => name);
  assert.deepEqual(late, []);
});
