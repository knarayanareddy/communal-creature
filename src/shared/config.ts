export const HEALTH_MAX = 100;
export const HEALTH_START = 60;

// Health stage thresholds (locked before build; tune only if time remains).
export const THRIVING_MIN = 70;
export const STRUGGLING_MIN = 30;
export const DYING_MIN = 1;

// Daily tick math.
export const DAILY_DECAY = 15;
export const FEED_GAIN = 3;
export const FEED_GAIN_CAP = 30;
export const FEED_INSTANT_GAIN = 2;

// Per-user daily action budget.
export const ACTIONS_PER_DAY = 3;

// Inheritance: how many trait slots carry into the next generation.
export const INHERITED_SLOT_COUNT = 2;

export const CREATURE_NAMES = [
  'Blib',
  'Snorp',
  'Quazzle',
  'Mumkin',
  'Vexil',
  'Plodge',
  'Krillix',
  'Womp',
  'Zazzle',
  'Grubbin',
  'Flimp',
  'Odd',
  'Nubbin',
  'Squix',
  'Torple',
  'Yim',
] as const;
