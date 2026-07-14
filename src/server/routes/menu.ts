import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { spawnCreaturePost } from '../core/post';
import { tickAllCreatures } from './scheduler';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const { post } = await spawnCreaturePost(1);
    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});

menu.post('/run-tick', async (c) => {
  try {
    const log = await tickAllCreatures();
    return c.json<UiResponse>(
      { showToast: `Tick complete: ${log.length} creature(s) processed` },
      200
    );
  } catch (error) {
    console.error(`Error running tick: ${error}`);
    return c.json<UiResponse>({ showToast: 'Tick failed' }, 400);
  }
});
