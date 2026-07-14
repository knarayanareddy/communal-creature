import { redis, reddit } from '@devvit/web/server';
import {
  ACTIONS_PER_DAY,
  CREATURE_NAMES,
  DAILY_DECAY,
  FEED_GAIN,
  FEED_GAIN_CAP,
  FEED_INSTANT_GAIN,
  HEALTH_MAX,
  HEALTH_START,
  INHERITED_SLOT_COUNT,
} from '../../shared/config';
import { BUCKET_EFFECTS, findInstinctWord } from '../../shared/instincts';
import type {
  ActionType,
  CreatureState,
  DayCounts,
  Instinct,
  RevealCard,
  Traits,
  TraitSlot,
} from '../../shared/types';
import { TRAIT_SLOTS, VARIANTS_PER_SLOT } from '../../shared/types';

const creatureKey = (postId: string) => `creature:${postId}`;
const countsKey = (postId: string, day: string) => `counts:${postId}:${day}`;
const userKey = (postId: string, day: string, user: string) =>
  `useracts:${postId}:${day}:${user}`;

export const todayKey = (): string =>
  new Date().toISOString().slice(0, 10);

const randomVariant = (): number =>
  Math.floor(Math.random() * VARIANTS_PER_SLOT);

const randomName = (): string => {
  const name = CREATURE_NAMES[Math.floor(Math.random() * CREATURE_NAMES.length)];
  return name ?? 'Blib';
};

export const newTraits = (): Traits => ({
  body: randomVariant(),
  eyes: randomVariant(),
  limbs: randomVariant(),
  aura: randomVariant(),
});

export const createCreatureState = (
  postId: string,
  generation: number,
  inherited?: { traits: Traits; slots: TraitSlot[] }
): CreatureState => {
  const traits = newTraits();
  const inheritedSlots: TraitSlot[] = [];
  if (inherited) {
    for (const slot of inherited.slots) {
      traits[slot] = inherited.traits[slot];
      inheritedSlots.push(slot);
    }
  }
  return {
    postId,
    generation,
    name: randomName(),
    bornAtMs: Date.now(),
    health: HEALTH_START,
    traits,
    dayNumber: 1,
    lastTickDay: todayKey(),
    protectedSlot: null,
    instinct: null,
    lastReveal: null,
    inheritedSlots,
    dead: false,
    successorPostId: null,
  };
};

export const getCreature = async (
  postId: string
): Promise<CreatureState | null> => {
  const raw = await redis.get(creatureKey(postId));
  if (!raw) return null;
  return JSON.parse(raw) as CreatureState;
};

export const saveCreature = async (state: CreatureState): Promise<void> => {
  await redis.set(creatureKey(state.postId), JSON.stringify(state));
};

const emptyCounts = (): DayCounts => ({
  feeds: 0,
  mutateVotes: { body: 0, eyes: 0, limbs: 0, aura: 0 },
  protects: 0,
  touches: { body: 0, eyes: 0, limbs: 0, aura: 0 },
});

export const getDayCounts = async (
  postId: string,
  day: string
): Promise<DayCounts> => {
  const raw = await redis.hGetAll(countsKey(postId, day));
  const counts = emptyCounts();
  if (!raw) return counts;
  counts.feeds = parseInt(raw['feeds'] ?? '0') || 0;
  counts.protects = parseInt(raw['protects'] ?? '0') || 0;
  for (const slot of TRAIT_SLOTS) {
    counts.mutateVotes[slot] = parseInt(raw[`mutate:${slot}`] ?? '0') || 0;
    counts.touches[slot] = parseInt(raw[`touch:${slot}`] ?? '0') || 0;
  }
  return counts;
};

export const getUserActionsUsed = async (
  postId: string,
  day: string,
  username: string
): Promise<number> => {
  const raw = await redis.get(userKey(postId, day, username));
  return raw ? parseInt(raw) || 0 : 0;
};

export type ApplyActionResult =
  | { ok: true; state: CreatureState; counts: DayCounts; remaining: number; message: string }
  | { ok: false; message: string };

export const applyAction = async (
  postId: string,
  username: string,
  action: ActionType,
  slot: TraitSlot | undefined
): Promise<ApplyActionResult> => {
  const state = await getCreature(postId);
  if (!state) return { ok: false, message: 'No creature lives here.' };
  if (state.dead) {
    return { ok: false, message: `${state.name} has passed on. Visit the next generation!` };
  }
  const day = todayKey();
  const used = await getUserActionsUsed(postId, day, username);
  if (used >= ACTIONS_PER_DAY) {
    return { ok: false, message: 'You have used all 3 actions today. Come back tomorrow!' };
  }

  const cKey = countsKey(postId, day);
  let message: string;
  if (action === 'feed') {
    await redis.hIncrBy(cKey, 'feeds', 1);
    state.health = Math.min(HEALTH_MAX, state.health + FEED_INSTANT_GAIN);
    await saveCreature(state);
    message = `You fed ${state.name} (+${FEED_INSTANT_GAIN} now, more at the overnight tick).`;
  } else if (action === 'mutate') {
    const target = slot ?? TRAIT_SLOTS[Math.floor(Math.random() * TRAIT_SLOTS.length)] ?? 'body';
    await redis.hIncrBy(cKey, `mutate:${target}`, 1);
    await redis.hIncrBy(cKey, `touch:${target}`, 1);
    message = `You voted to mutate ${state.name}'s ${target}. The change lands overnight.`;
  } else {
    await redis.hIncrBy(cKey, 'protects', 1);
    message = `You cast a ward. Tonight, ${state.name}'s most neglected trait is shielded.`;
  }
  await redis.incrBy(userKey(postId, day, username), 1);
  await redis.expire(userKey(postId, day, username), 60 * 60 * 48);

  const counts = await getDayCounts(postId, day);
  return {
    ok: true,
    state,
    counts,
    remaining: ACTIONS_PER_DAY - used - 1,
    message,
  };
};

const isT3 = (id: string): id is `t3_${string}` => id.startsWith('t3_');

const pickInstinct = async (postId: string): Promise<Instinct | null> => {
  if (!isT3(postId)) return null;
  try {
    const comments = await reddit
      .getComments({ postId, limit: 50, sort: 'top' })
      .all();
    for (const comment of comments) {
      const body = comment.body;
      if (!body) continue;
      const match = findInstinctWord(body);
      if (match) {
        return {
          bucket: match.bucket,
          word: match.word,
          commentText: body.slice(0, 140),
          author: comment.authorName,
        };
      }
    }
  } catch (error) {
    console.error(`pickInstinct failed for ${postId}:`, error);
  }
  return null;
};

const leastTouchedSlot = (counts: DayCounts): TraitSlot => {
  let best: TraitSlot = TRAIT_SLOTS[0] ?? 'body';
  let bestTouches = Infinity;
  for (const slot of TRAIT_SLOTS) {
    if (counts.touches[slot] < bestTouches) {
      bestTouches = counts.touches[slot];
      best = slot;
    }
  }
  return best;
};

const mostVotedSlot = (counts: DayCounts): TraitSlot | null => {
  let best: TraitSlot | null = null;
  let bestVotes = 0;
  for (const slot of TRAIT_SLOTS) {
    if (counts.mutateVotes[slot] > bestVotes) {
      bestVotes = counts.mutateVotes[slot];
      best = slot;
    }
  }
  return best;
};

export type TickResult = {
  state: CreatureState;
  reveal: RevealCard;
  died: boolean;
};

export const runTick = async (postId: string): Promise<TickResult | null> => {
  const state = await getCreature(postId);
  if (!state || state.dead) return null;

  const day = state.lastTickDay;
  const counts = await getDayCounts(postId, day);
  const healthBefore = state.health;

  const instinct = await pickInstinct(postId);
  const effect = instinct ? BUCKET_EFFECTS[instinct.bucket] : null;

  const feedGain = Math.min(FEED_GAIN_CAP, counts.feeds * FEED_GAIN);
  let health = state.health - DAILY_DECAY + feedGain + (effect?.healthDelta ?? 0);
  health = Math.max(0, Math.min(HEALTH_MAX, health));

  const shieldedSlot = counts.protects > 0 ? leastTouchedSlot(counts) : null;

  let mutatedSlot: TraitSlot | null = mostVotedSlot(counts);
  if (!mutatedSlot && effect) mutatedSlot = effect.slot;
  if (mutatedSlot === shieldedSlot) mutatedSlot = null;

  let mutatedFrom: number | null = null;
  let mutatedTo: number | null = null;
  if (mutatedSlot) {
    mutatedFrom = state.traits[mutatedSlot];
    const direction = effect?.direction ?? 1;
    mutatedTo =
      (mutatedFrom + direction + VARIANTS_PER_SLOT) % VARIANTS_PER_SLOT;
    state.traits[mutatedSlot] = mutatedTo;
  }

  const died = health <= 0;
  state.health = health;
  state.dead = died;
  state.instinct = instinct;
  state.protectedSlot = shieldedSlot;
  state.dayNumber += 1;
  state.lastTickDay = todayKey();

  const parts: string[] = [];
  parts.push(
    counts.feeds > 0
      ? `Fed ${counts.feeds}x (+${feedGain} health)`
      : 'Nobody fed it (ouch)'
  );
  if (instinct) {
    parts.push(
      `Instinct "${instinct.word}" (${instinct.bucket}) from u/${instinct.author}`
    );
  }
  if (mutatedSlot) parts.push(`${mutatedSlot} mutated`);
  if (shieldedSlot) parts.push(`${shieldedSlot} was shielded`);
  parts.push(died ? 'It did not survive the night.' : `Health ${healthBefore} -> ${health}`);

  const reveal: RevealCard = {
    dayNumber: state.dayNumber,
    healthBefore,
    healthAfter: health,
    feeds: counts.feeds,
    mutatedSlot,
    mutatedFrom,
    mutatedTo,
    protectedSlot: shieldedSlot,
    instinct,
    died,
    summary: parts.join(' • '),
  };
  state.lastReveal = reveal;

  await saveCreature(state);
  return { state, reveal, died };
};

export const pickInheritedSlots = (): TraitSlot[] => {
  const shuffled = [...TRAIT_SLOTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, INHERITED_SLOT_COUNT);
};
