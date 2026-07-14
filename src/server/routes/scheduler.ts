import { Hono } from 'hono';
import { runTick, saveCreature } from '../core/creature';
import { listActivePosts, spawnSuccessor } from '../core/post';

export const scheduler = new Hono();

export const tickAllCreatures = async (): Promise<string[]> => {
  const postIds = await listActivePosts();
  const log: string[] = [];
  for (const postId of postIds) {
    try {
      const result = await runTick(postId);
      if (!result) {
        log.push(`${postId}: no living creature, skipped`);
        continue;
      }
      if (result.died) {
        const { post, state } = await spawnSuccessor(result.state);
        result.state.successorPostId = post.id;
        await saveCreature(result.state);
        log.push(
          `${postId}: died, spawned gen ${state.generation} at ${post.id}`
        );
      } else {
        log.push(`${postId}: ticked, health ${result.state.health}`);
      }
    } catch (error) {
      console.error(`Tick failed for ${postId}:`, error);
      log.push(`${postId}: error`);
    }
  }
  return log;
};

scheduler.post('/daily-tick', async (c) => {
  const log = await tickAllCreatures();
  console.log('daily-tick:', log.join(' | '));
  return c.json({ status: 'success', log }, 200);
});
