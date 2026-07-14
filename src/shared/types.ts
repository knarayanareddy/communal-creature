export const TRAIT_SLOTS = ['body', 'eyes', 'limbs', 'aura'] as const;
export type TraitSlot = (typeof TRAIT_SLOTS)[number];

export const VARIANTS_PER_SLOT = 4;

export type Traits = Record<TraitSlot, number>;

export type HealthStage = 'thriving' | 'struggling' | 'dying' | 'dead';

export type InstinctBucket = 'ferocity' | 'hunger' | 'guardian' | 'chaos';

export type Instinct = {
  bucket: InstinctBucket;
  word: string;
  commentText: string;
  author: string;
};

export type RevealCard = {
  dayNumber: number;
  healthBefore: number;
  healthAfter: number;
  feeds: number;
  mutatedSlot: TraitSlot | null;
  mutatedFrom: number | null;
  mutatedTo: number | null;
  protectedSlot: TraitSlot | null;
  instinct: Instinct | null;
  died: boolean;
  summary: string;
};

export type CreatureState = {
  postId: string;
  generation: number;
  name: string;
  bornAtMs: number;
  health: number;
  traits: Traits;
  dayNumber: number;
  lastTickDay: string;
  protectedSlot: TraitSlot | null;
  instinct: Instinct | null;
  lastReveal: RevealCard | null;
  inheritedSlots: TraitSlot[];
  dead: boolean;
  successorPostId: string | null;
};

export type ActionType = 'feed' | 'mutate' | 'protect';

export type DayCounts = {
  feeds: number;
  mutateVotes: Record<TraitSlot, number>;
  protects: number;
  touches: Record<TraitSlot, number>;
};

export type InitResponse = {
  type: 'init';
  creature: CreatureState;
  stage: HealthStage;
  counts: DayCounts;
  username: string;
  actionsRemaining: number;
};

export type ActResponse = {
  type: 'act';
  creature: CreatureState;
  stage: HealthStage;
  counts: DayCounts;
  actionsRemaining: number;
  message: string;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
