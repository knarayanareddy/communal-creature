import type { InstinctBucket, TraitSlot } from './types';

// Static keyword -> bucket table. The top-ranked comment containing any of
// these words (and passing the blocklist) becomes the creature's instinct
// for the next tick. Deterministic on purpose: no LLM calls at runtime.
export const INSTINCT_BUCKETS: Record<InstinctBucket, readonly string[]> = {
  ferocity: [
    'attack',
    'bite',
    'fight',
    'claw',
    'fang',
    'roar',
    'hunt',
    'fierce',
    'rage',
    'sharp',
    'spike',
    'strike',
    'savage',
    'wild',
    'predator',
    'teeth',
    'growl',
    'battle',
    'aggressive',
    'strong',
  ],
  hunger: [
    'eat',
    'food',
    'feed',
    'hungry',
    'snack',
    'devour',
    'nom',
    'yum',
    'taste',
    'chew',
    'swallow',
    'gobble',
    'munch',
    'feast',
    'appetite',
    'delicious',
    'consume',
    'crave',
    'nibble',
    'gulp',
  ],
  guardian: [
    'protect',
    'guard',
    'shield',
    'safe',
    'defend',
    'shelter',
    'hide',
    'armor',
    'shell',
    'care',
    'gentle',
    'calm',
    'peace',
    'watch',
    'nurture',
    'hug',
    'warm',
    'cozy',
    'rest',
    'sleep',
  ],
  chaos: [
    'chaos',
    'weird',
    'strange',
    'mutate',
    'glitch',
    'random',
    'twist',
    'warp',
    'melt',
    'explode',
    'dance',
    'spin',
    'scream',
    'zoom',
    'bounce',
    'wiggle',
    'funky',
    'cursed',
    'unhinged',
    'goofy',
  ],
};

// Which trait slot each instinct bucket biases toward mutating, and the
// health modifier it applies at tick time.
export const BUCKET_EFFECTS: Record<
  InstinctBucket,
  { slot: TraitSlot; healthDelta: number; direction: 1 | -1 }
> = {
  ferocity: { slot: 'limbs', healthDelta: -3, direction: 1 },
  hunger: { slot: 'body', healthDelta: 5, direction: 1 },
  guardian: { slot: 'aura', healthDelta: 3, direction: 1 },
  chaos: { slot: 'eyes', healthDelta: -5, direction: -1 },
};

// Comments containing any blocked word are skipped entirely when picking
// the instinct. Keep this list conservative: slurs and doxx-y terms are
// already handled by Reddit itself; this guards against instinct abuse.
export const INSTINCT_BLOCKLIST: readonly string[] = [
  'kill yourself',
  'kys',
  'suicide',
  'nazi',
  'hitler',
  'rape',
  'slur',
  'porn',
  'nsfw',
  'doxx',
  'address',
  'phone number',
];

export const findInstinctWord = (
  text: string
): { bucket: InstinctBucket; word: string } | null => {
  const lower = text.toLowerCase();
  for (const blocked of INSTINCT_BLOCKLIST) {
    if (lower.includes(blocked)) return null;
  }
  const words = lower.split(/[^a-z]+/);
  for (const [bucket, keywords] of Object.entries(INSTINCT_BUCKETS) as [
    InstinctBucket,
    readonly string[],
  ][]) {
    for (const word of words) {
      if (word.length > 2 && keywords.includes(word)) {
        return { bucket, word };
      }
    }
  }
  return null;
};
