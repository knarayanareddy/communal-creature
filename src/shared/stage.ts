import { STRUGGLING_MIN, THRIVING_MIN } from './config';
import type { HealthStage } from './types';

export const healthStage = (health: number): HealthStage => {
  if (health <= 0) return 'dead';
  if (health >= THRIVING_MIN) return 'thriving';
  if (health >= STRUGGLING_MIN) return 'struggling';
  return 'dying';
};
