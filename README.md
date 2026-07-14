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

**Play it live:** [demo post on r/CommuneCritter](https://www.reddit.com/r/CommuneCritter/comments/1uwc39c/a_creature_has_hatched_keep_it_alive_together/)
· [app listing](https://developers.reddit.com/apps/commune-critter)
· [demo video](https://youtu.be/utvbGXZr-DQ)

## How to play

1. **Open the post.** The splash card shows the creature's name, generation,
   and health. Tap **Tend the creature** to open the full game view.
2. **Spend your 3 daily actions** (they reset each day):
   - **Feed** — instantly gives the creature +2 health, and every feed adds
     +3 more at the overnight tick. A hungry community keeps it alive.
   - **Mutate** — pick a trait slot (body, eyes, limbs, or aura) and vote for
     it to change tonight. The most-voted slot mutates.
   - **Ward** — cast a protective ward. The most neglected trait slot gets
     shielded from tonight's mutation and decay (a shield icon shows which).
3. **Comment on the post.** This is the secret weapon: if your comment
   contains an instinct keyword (words about eating, fighting, protecting, or
   chaos), the top-ranked such comment becomes the creature's **instinct**
   for the night. The instinct biases which trait mutates and whether the
   creature gains or loses health — and your username is credited on the
   morning reveal card.
4. **Come back tomorrow.** The overnight tick resolves everything: decay,
   feeds, the winning mutation, the ward, and the instinct. The reveal card
   shows exactly what the community did while you were away.
5. **Keep it alive — or meet the next generation.** Health stages are visible
   at a glance (sparkles when thriving, flies and drooping when dying, X-eyes
   when dead). If health hits 0, the creature dies and a Generation N+1
   successor auto-hatches in a brand-new post, inheriting two of its
   ancestor's traits.

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
