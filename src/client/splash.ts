import { requestExpandedMode } from '@devvit/web/client';
import type { InitResponse } from '../shared/types';

const startButton = document.getElementById('start-button') as HTMLButtonElement;
const titleElement = document.getElementById('title') as HTMLHeadingElement;
const statusElement = document.getElementById('status') as HTMLParagraphElement;
const blobElement = document.getElementById('blob') as HTMLDivElement;

startButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

const BODY_COLORS = ['#8ad9a3', '#86b9e8', '#e8a0c4', '#e8cc8a'];

async function init() {
  try {
    const response = await fetch('/api/init');
    if (!response.ok) return;
    const data = (await response.json()) as InitResponse;
    const c = data.creature;
    titleElement.textContent = c.dead
      ? `${c.name} has passed on...`
      : `${c.name} - Gen ${c.generation}, Day ${c.dayNumber}`;
    statusElement.textContent = c.dead
      ? 'Its lineage lives on in a newer post.'
      : `Health ${c.health}/100 (${data.stage}). ${data.actionsRemaining} actions left today.`;
    blobElement.style.backgroundColor = BODY_COLORS[c.traits.body] ?? '#8ad9a3';
    if (c.dead) blobElement.classList.add('dead');
    else if (data.stage === 'dying') blobElement.classList.add('dying');
  } catch (error) {
    console.error('Splash init failed:', error);
  }
}

void init();
