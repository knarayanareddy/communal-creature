// Quick logic smoke test for shared game rules. Run with:
//   npm run test:logic
import assert from 'node:assert';
import {
  DAILY_DECAY,
  FEED_GAIN,
  FEED_GAIN_CAP,
  HEALTH_START,
} from '../src/shared/config.ts';
import { findInstinctWord, BUCKET_EFFECTS } from '../src/shared/instincts.ts';
import { healthStage } from '../src/shared/stage.ts';

// Health stage thresholds
assert.equal(healthStage(100), 'thriving');
assert.equal(healthStage(70), 'thriving');
assert.equal(healthStage(69), 'struggling');
assert.equal(healthStage(30), 'struggling');
assert.equal(healthStage(29), 'dying');
assert.equal(healthStage(1), 'dying');
assert.equal(healthStage(0), 'dead');

// Instinct keyword matching
assert.deepEqual(findInstinctWord('I think it should EAT everything'), {
  bucket: 'hunger',
  word: 'eat',
});
assert.deepEqual(findInstinctWord('protect the little guy!'), {
  bucket: 'guardian',
  word: 'protect',
});
assert.equal(findInstinctWord('nothing relevant here'), null);
// Blocklist wins even when a keyword is present
assert.equal(findInstinctWord('eat this, kys'), null);
// Short-word guard: "no" style fragments never match
assert.equal(findInstinctWord('no'), null);

// Every bucket has an effect definition
for (const bucket of ['ferocity', 'hunger', 'guardian', 'chaos'] as const) {
  assert.ok(BUCKET_EFFECTS[bucket].slot);
}

// Tick math: unfed creature survives day 1 but trends down
const unfed = HEALTH_START - DAILY_DECAY;
assert.ok(unfed > 0, 'unfed creature must survive its first night');
// A well-fed creature gains health
assert.ok(Math.min(FEED_GAIN_CAP, 8 * FEED_GAIN) > DAILY_DECAY);

console.log('All smoke tests passed.');
