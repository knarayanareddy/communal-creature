import { redis, reddit, context } from '@devvit/web/server';
import type { Traits, TraitSlot } from '../../shared/types';
import {
  createCreatureState,
  pickInheritedSlots,
  saveCreature,
} from './creature';

const ACTIVE_POSTS_KEY = 'active_posts';

export const listActivePosts = async (): Promise<string[]> => {
  const raw = await redis.hGetAll(ACTIVE_POSTS_KEY);
  return raw ? Object.keys(raw) : [];
};

export const markPostActive = async (postId: string): Promise<void> => {
  await redis.hSet(ACTIVE_POSTS_KEY, { [postId]: '1' });
};

export const markPostDead = async (postId: string): Promise<void> => {
  await redis.hDel(ACTIVE_POSTS_KEY, [postId]);
};

export const spawnCreaturePost = async (
  generation: number,
  inherited?: { traits: Traits; slots: TraitSlot[] }
) => {
  const post = await reddit.submitCustomPost({
    title:
      generation === 1
        ? 'A creature has hatched! Keep it alive together'
        : `Generation ${generation} has hatched from its ancestor`,
    subredditName: context.subredditName ?? '',
  });
  const state = createCreatureState(post.id, generation, inherited);
  await saveCreature(state);
  await markPostActive(post.id);
  return { post, state };
};

export const spawnSuccessor = async (
  parentPostId: string,
  parentGeneration: number,
  parentTraits: Traits
) => {
  const slots = pickInheritedSlots();
  const { post, state } = await spawnCreaturePost(parentGeneration + 1, {
    traits: parentTraits,
    slots,
  });
  await markPostDead(parentPostId);
  return { post, state };
};
