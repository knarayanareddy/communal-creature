# Commune Critter

One creature. Everyone keeps it alive.

A Reddit game built on [Devvit Web](https://developers.reddit.com/) with
[Phaser](https://phaser.io/). Each interactive post hosts a single shared
creature that the whole community tends together. Every redditor gets **3
actions per day** — feed it, vote to mutate a trait, or ward a trait against
the night — and once a day an overnight tick resolves everything at once:

- **Feed** counts add health; neglect drains it (daily decay).
- **Mutate** votes decide which trait slot (body, eyes, limbs, aura) changes.
- **Protect** wards shield the most neglected trait from mutation.
- **Instinct**: the top-ranked comment containing an instinct keyword becomes
  the creature's instinct for the night — biasing which trait mutates and
  nudging its health. Your comment literally shapes what it becomes.
- If health hits 0, the creature **dies** — and a new post auto-spawns with
  Generation N+1, inheriting two trait slots from its ancestor.

Returning players get a **reveal card**: "While you were away..." — what fed
it, whose comment became its instinct, what mutated, and whether it survived.

## Game rules (constants)

All game math lives in `src/shared/config.ts` and `src/shared/instincts.ts`:

| Rule | Value |
| --- | --- |
| Health stages | 70–100 thriving, 30–69 struggling, 1–29 dying, 0 dead |
| Daily decay | −15 health |
| Feed | +3/feed at tick (cap +30), +2 instantly |
| Actions per user per day | 3 |
| Inherited trait slots on death | 2 of 4 |
| Instinct buckets | ferocity, hunger, guardian, chaos (~20 keywords each) |

## Architecture

- `src/server/` — Devvit serverless backend (Hono). Redis state per post,
  Reddit API for comments (instinct) and auto-spawning successor posts.
  - `core/creature.ts` — state model, action application, the overnight tick.
  - `routes/scheduler.ts` — daily cron tick (`devvit.json` scheduler).
  - `routes/api.ts` — `/api/init` and `/api/act` used by the client.
- `src/client/` — Phaser 4 frontend. The creature is rendered procedurally
  (no image assets): trait-composited Graphics, tweened posture (bob when
  thriving, droop when dying, slump when dead), particle states (sparkles vs
  flies), and a reveal-card overlay.
- `src/shared/` — types and game constants shared by both sides.

## Running it

Requires Node 22.2+ and a Reddit account connected to
[developers.reddit.com](https://developers.reddit.com/).

```bash
npm install
npm run login      # devvit login
npm run dev        # playtest: creates a dev subreddit + test post
```

Moderator menu items (subreddit overflow menu):

- **Hatch a new creature** — spawn a fresh Generation 1 post.
- **Run overnight tick now** — manually trigger the daily tick for demos and
  testing (the real tick runs daily via the scheduler).

## Checks

```bash
npm run type-check
npm run lint
npm run test:logic   # game-rule smoke tests
npm run build
```
