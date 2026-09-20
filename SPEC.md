# Holger Competition App — Spec

Scoring and team management for box competitions. Supports both
reshuffled-team "scramble" comps and fixed-team "real" comps.

## Research summary

No open-source CrossFit scorer is worth forking. Everything found was either
abandoned (`briandoll/wodleader`), a skeleton (`AlexGuyNichols/crossfit-comp-tracker`),
or a 0-star solo project. Nothing supports reshuffling teams between events.

Worth reading, not forking:
- `MilaMeddler/CrossFit` — MIT, active, closest feature set (divisions, judge UI, tiebreakers)
- `evroon/bracket` — 1.7k stars, mature, but match-based not points-based, and AGPL-3.0

Scoring rules are taken from the published CrossFit Games / Competition Corner rules.

## Core abstraction

A competition has a **scoring unit** — the thing that appears on the leaderboard
and accumulates points. It is either an athlete or a team. Everything downstream
(score entry, ranking, tiebreaks, leaderboard) only ever talks to scoring units,
so both competition modes are one system.

| Setting         | Scramble comp        | Real comp         |
| --------------- | -------------------- | ----------------- |
| Scoring unit    | Athlete              | Team              |
| Teams           | Regenerated per event| Fixed at signup   |
| Scramble method | Random / snake-pair  | (off)             |

Adding a third mode later (pure individual, no teams) is a settings combination,
not new code.

## Decisions

- **Scramble comps:** individuals carry their own points across events.
- **Real comps:** one score per team per event (judge enters a single number).
- **Score entry:** one admin on a laptop. No judge accounts in v1.
- **Divisions:** in from day one (RX Men, Scaled Women, ...), configured per competition.
- **Platform:** phone-friendly web app. Leaderboard readable on a TV.
- **Stack:** Next.js + TypeScript + Postgres.

## Score types

Every event declares a score type and a direction.

| Type            | Direction     | Notes                                      |
| --------------- | ------------- | ------------------------------------------ |
| Time            | lower better  | `7:16`. Needs a time-cap / DNF rule.       |
| Reps            | higher better |                                            |
| Rounds + reps   | higher better | Two fields in, one comparable value out.   |
| Weight          | higher better | kg.                                        |

Every score may also carry a **tiebreak time**, used to split identical scores.

## Scoring rules

1. Within an event, rank scoring units by their score.
2. Rank 1 earns 1 point, rank 2 earns 2 points, and so on. Lowest total wins.
3. Ties within a single event are **not** broken — tied units share the rank and
   each receive the full point value. Tiebreak time, where recorded, splits them.
4. Overall ties break by best single-event finish, then next-best, and so on.

## Rules that shape the code

- **Never store the leaderboard.** Always recompute from raw scores. A corrected
  score then fixes everything downstream for free, and keeps scoring swappable.
- **Scoring policies and scramble methods are pluggable** — each is one function
  in a list, so a new one is an addition rather than an edit.

## Data model

```
Competition   settings: mode, divisions, scoring policy
  Division    RX Men, Scaled Women, ...
  Athlete     name, division
  Team        per-event if scrambled, per-competition if fixed
  Event       name, score type, direction, time cap
    Score     one per scoring unit per event, + optional tiebreak time
Leaderboard   computed, never stored
```
