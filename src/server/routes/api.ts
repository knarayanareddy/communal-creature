import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { ACTIONS_PER_DAY } from '../../shared/config';
import { healthStage } from '../../shared/stage';
import type {
  ActionType,
  ActResponse,
  ErrorResponse,
  InitResponse,
  TraitSlot,
} from '../../shared/types';
import { TRAIT_SLOTS } from '../../shared/types';
import {
  applyAction,
  createCreatureState,
  getCreature,
  getDayCounts,
  getUserActionsUsed,
  saveCreature,
  todayKey,
} from '../core/creature';
import { markPostActive } from '../core/post';

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required but missing from context' },
      400
    );
  }
  try {
    let creature = await getCreature(postId);
    if (!creature) {
      // Post exists but no creature state (e.g. install-created post before
      // state wiring): hatch generation 1 in place.
      const { state } = await hatchInPlace(postId);
      creature = state;
    }
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const day = todayKey();
    const [counts, used] = await Promise.all([
      getDayCounts(postId, day),
      getUserActionsUsed(postId, day, username),
    ]);
    return c.json<InitResponse>({
      type: 'init',
      creature,
      stage: healthStage(creature.dead ? 0 : creature.health),
      counts,
      username,
      actionsRemaining: Math.max(0, ACTIONS_PER_DAY - used),
    });
  } catch (error) {
    console.error(`API init error for ${postId}:`, error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Initialization failed' },
      400
    );
  }
});

const hatchInPlace = async (postId: string) => {
  const state = createCreatureState(postId, 1);
  await saveCreature(state);
  await markPostActive(postId);
  return { state };
};

const isTraitSlot = (value: string): value is TraitSlot =>
  (TRAIT_SLOTS as readonly string[]).includes(value);

api.post('/act', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required' },
      400
    );
  }
  try {
    const body = await c.req.json<{ action: ActionType; slot?: string }>();
    const action = body.action;
    if (action !== 'feed' && action !== 'mutate' && action !== 'protect') {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'Unknown action' },
        400
      );
    }
    const slot =
      body.slot && isTraitSlot(body.slot) ? body.slot : undefined;
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const result = await applyAction(postId, username, action, slot);
    if (!result.ok) {
      return c.json<ErrorResponse>(
        { status: 'error', message: result.message },
        400
      );
    }
    return c.json<ActResponse>({
      type: 'act',
      creature: result.state,
      stage: healthStage(result.state.dead ? 0 : result.state.health),
      counts: result.counts,
      actionsRemaining: result.remaining,
      message: result.message,
    });
  } catch (error) {
    console.error(`API act error for ${postId}:`, error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Action failed' },
      400
    );
  }
});
