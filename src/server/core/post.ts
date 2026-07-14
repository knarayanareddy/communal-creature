import { redis, reddit, context } from '@devvit/web/server';
import type {
  AncestorRecord,
  CreatureState,
  Traits,
  TraitSlot,
} from '../../shared/types';
import {
  createCreatureState,
  pickInheritedSlots,
  pickSuccessorName,
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
  inherited?: {
    traits: Traits;
    slots: TraitSlot[];
    lineage: AncestorRecord[];
    name?: string;
  }
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

export const spawnSuccessor = async (parent: CreatureState) => {
  const slots = pickInheritedSlots();
  const ancestorRecord: AncestorRecord = {
    name: parent.name,
    generation: parent.generation,
    postId: parent.postId,
    daysSurvived: parent.dayNumber,
    passedOnSlots: slots,
  };
  const proposedName = await pickSuccessorName(parent.postId);
  const { post, state } = await spawnCreaturePost(parent.generation + 1, {
    traits: parent.traits,
    slots,
    lineage: [...parent.lineage, ancestorRecord],
    ...(proposedName ? { name: proposedName } : {}),
  });
  await markPostDead(parent.postId);
  return { post, state };
};
