import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { ACTIONS_PER_DAY } from '../../shared/config';
import type {
  ActResponse,
  CreatureState,
  HealthStage,
  InitResponse,
  TraitSlot,
} from '../../shared/types';
import { TRAIT_SLOTS } from '../../shared/types';

const REF_W = 1024;
const REF_H = 768;

const AURA_COLORS = [0x7ee787, 0x79c0ff, 0xff9bce, 0xffd66e];
const BODY_COLORS = [0x8ad9a3, 0x86b9e8, 0xe8a0c4, 0xe8cc8a];

const STAGE_LABELS: Record<HealthStage, string> = {
  thriving: 'Thriving',
  struggling: 'Struggling',
  dying: 'Dying!',
  dead: 'Dead',
};

const STAGE_COLORS: Record<HealthStage, string> = {
  thriving: '#7ee787',
  struggling: '#ffd66e',
  dying: '#ff7b72',
  dead: '#8b949e',
};

export class Creature extends Scene {
  private creature: CreatureState | null = null;
  private stage: HealthStage = 'struggling';
  private actionsRemaining = 0;
  private statusText: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private healthBarFill: Phaser.GameObjects.Rectangle;
  private healthBarMax = 320;
  private healthLabel: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text;
  private instinctText: Phaser.GameObjects.Text;
  private creatureContainer: Phaser.GameObjects.Container;
  private bobTween: Phaser.Tweens.Tween | null = null;
  private particles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private slotPicker: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Creature');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x101b26);
    this.buildParticleTexture();

    this.creatureContainer = this.add.container(REF_W / 2, REF_H / 2 - 40);

    this.nameText = this.add
      .text(REF_W / 2, 46, 'Hatching...', {
        fontFamily: 'Georgia, serif',
        fontSize: 40,
        color: '#e6edf3',
      })
      .setOrigin(0.5);

    this.healthLabel = this.add
      .text(REF_W / 2, 92, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 20,
        color: '#e6edf3',
      })
      .setOrigin(0.5);

    this.add
      .rectangle(REF_W / 2, 120, this.healthBarMax + 4, 22, 0x0a121b)
      .setStrokeStyle(2, 0x30363d);
    this.healthBarFill = this.add
      .rectangle(REF_W / 2 - this.healthBarMax / 2, 120, 1, 16, 0x7ee787)
      .setOrigin(0, 0.5);

    this.instinctText = this.add
      .text(REF_W / 2, 150, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 17,
        color: '#a5b4c4',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(REF_W / 2, REF_H - 44, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 18,
        color: '#a5b4c4',
      })
      .setOrigin(0.5);

    this.toastText = this.add
      .text(REF_W / 2, REF_H - 200, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 19,
        color: '#e6edf3',
        backgroundColor: '#1f2c3a',
        padding: { x: 14, y: 8 },
        wordWrap: { width: 700 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.buildActionButtons();
    this.layout(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.layout(gameSize.width, gameSize.height);
    });

    void this.loadState();
  }

  private buildParticleTexture() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
  }

  private async loadState() {
    try {
      const response = await fetch('/api/init');
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = (await response.json()) as InitResponse;
      this.creature = data.creature;
      this.stage = data.stage;
      this.actionsRemaining = data.actionsRemaining;
      this.refresh();
      if (data.creature.lastReveal && data.creature.dayNumber > 1) {
        this.showRevealCard();
      }
    } catch (error) {
      console.error('Failed to load creature:', error);
      this.statusText.setText('Failed to reach the creature. Try refreshing.');
    }
  }

  private refresh() {
    const c = this.creature;
    if (!c) return;
    this.nameText.setText(
      `${c.name} - Generation ${c.generation}, Day ${c.dayNumber}`
    );
    const stageLabel = STAGE_LABELS[this.stage];
    this.healthLabel.setText(
      c.dead ? `${stageLabel}` : `${stageLabel} - ${c.health}/100`
    );
    this.healthLabel.setColor(STAGE_COLORS[this.stage]);
    const frac = c.dead ? 0 : c.health / 100;
    this.healthBarFill.width = Math.max(1, this.healthBarMax * frac);
    this.healthBarFill.fillColor =
      this.stage === 'thriving'
        ? 0x7ee787
        : this.stage === 'struggling'
          ? 0xffd66e
          : 0xff7b72;
    if (c.instinct) {
      this.instinctText.setText(
        `Instinct: "${c.instinct.word}" (${c.instinct.bucket}) - whispered by u/${c.instinct.author}`
      );
    } else {
      this.instinctText.setText(
        'No instinct yet - the top comment tonight shapes what it becomes'
      );
    }
    this.statusText.setText(
      c.dead
        ? 'This creature has passed on. Its lineage continues in a new post.'
        : `${this.actionsRemaining}/${ACTIONS_PER_DAY} actions left today - feed it, mutate it, or ward it`
    );
    this.drawCreature();
  }

  private drawCreature() {
    const c = this.creature;
    if (!c) return;
    this.creatureContainer.removeAll(true);
    if (this.bobTween) {
      this.bobTween.stop();
      this.bobTween = null;
    }
    if (this.particles) {
      this.particles.destroy();
      this.particles = null;
    }

    const dead = c.dead;
    const dying = this.stage === 'dying';
    const saturation = dead ? 0.15 : dying ? 0.45 : this.stage === 'struggling' ? 0.75 : 1;

    const auraColor = this.desaturate(AURA_COLORS[c.traits.aura] ?? 0x7ee787, saturation);
    const bodyColor = this.desaturate(BODY_COLORS[c.traits.body] ?? 0x8ad9a3, saturation);

    const g = this.add.graphics();

    // Aura ring
    g.lineStyle(6, auraColor, dead ? 0.15 : 0.35);
    g.strokeCircle(0, 0, 170);
    g.lineStyle(3, auraColor, dead ? 0.1 : 0.2);
    g.strokeCircle(0, 0, 195);

    // Limbs behind body
    this.drawLimbs(g, c.traits.limbs, bodyColor);

    // Body
    this.drawBody(g, c.traits.body, bodyColor);

    this.creatureContainer.add(g);

    // Eyes on top
    const eyes = this.add.graphics();
    this.drawEyes(eyes, c.traits.eyes, dead);
    this.creatureContainer.add(eyes);

    // Shield indicator on protected slot
    if (c.protectedSlot && !dead) {
      const shield = this.add
        .text(0, -215, `[warded: ${c.protectedSlot}]`, {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: 16,
          color: '#79c0ff',
        })
        .setOrigin(0.5);
      this.creatureContainer.add(shield);
    }

    // Posture: bob when alive, droop/flat when dying, slump when dead
    if (dead) {
      this.creatureContainer.setScale(1, 0.75);
      this.creatureContainer.setAngle(4);
    } else {
      this.creatureContainer.setScale(1, 1);
      this.creatureContainer.setAngle(0);
      this.bobTween = this.tweens.add({
        targets: this.creatureContainer,
        y: this.creatureContainer.y - (dying ? 4 : 14),
        duration: dying ? 1800 : 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Particles: sparkles when thriving, flies when dying/dead
    if (this.stage === 'thriving') {
      this.particles = this.add.particles(REF_W / 2, REF_H / 2 - 40, 'particle', {
        speed: { min: 15, max: 45 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 1600,
        frequency: 220,
        tint: auraColor,
      });
    } else if (dying || dead) {
      this.particles = this.add.particles(REF_W / 2, REF_H / 2 - 40, 'particle', {
        speed: { min: 30, max: 80 },
        scale: { start: 0.4, end: 0.1 },
        alpha: { start: 0.6, end: 0 },
        lifespan: 1100,
        frequency: 300,
        tint: 0x4a4a3a,
      });
    }
  }

  private drawBody(g: Phaser.GameObjects.Graphics, variant: number, color: number) {
    g.fillStyle(color, 1);
    g.lineStyle(4, 0x0a121b, 0.6);
    if (variant === 0) {
      g.fillCircle(0, 0, 120);
      g.strokeCircle(0, 0, 120);
    } else if (variant === 1) {
      g.fillRoundedRect(-110, -100, 220, 200, 48);
      g.strokeRoundedRect(-110, -100, 220, 200, 48);
    } else if (variant === 2) {
      g.fillEllipse(0, 0, 200, 260);
      g.strokeEllipse(0, 0, 200, 260);
    } else {
      g.fillCircle(0, 30, 105);
      g.fillCircle(0, -70, 65);
      g.strokeCircle(0, 30, 105);
      g.strokeCircle(0, -70, 65);
    }
  }

  private drawEyes(g: Phaser.GameObjects.Graphics, variant: number, dead: boolean) {
    if (dead) {
      // X eyes
      g.lineStyle(6, 0x0a121b, 1);
      for (const x of [-40, 40]) {
        g.lineBetween(x - 15, -35, x + 15, -5);
        g.lineBetween(x + 15, -35, x - 15, -5);
      }
      return;
    }
    g.fillStyle(0xffffff, 1);
    if (variant === 0) {
      g.fillCircle(0, -25, 42);
      g.fillStyle(0x0a121b, 1);
      g.fillCircle(6, -25, 18);
    } else if (variant === 1) {
      g.fillCircle(-42, -25, 26);
      g.fillCircle(42, -25, 26);
      g.fillStyle(0x0a121b, 1);
      g.fillCircle(-38, -25, 11);
      g.fillCircle(46, -25, 11);
    } else if (variant === 2) {
      g.fillCircle(-50, -30, 16);
      g.fillCircle(0, -42, 16);
      g.fillCircle(50, -30, 16);
      g.fillStyle(0x0a121b, 1);
      g.fillCircle(-48, -30, 7);
      g.fillCircle(2, -42, 7);
      g.fillCircle(52, -30, 7);
    } else {
      g.fillStyle(0x0a121b, 1);
      g.fillRoundedRect(-60, -32, 44, 10, 5);
      g.fillRoundedRect(16, -32, 44, 10, 5);
    }
  }

  private drawLimbs(g: Phaser.GameObjects.Graphics, variant: number, color: number) {
    const darker = this.shade(color, -30);
    g.fillStyle(darker, 1);
    if (variant === 0) {
      // stub legs
      g.fillRoundedRect(-80, 90, 44, 70, 18);
      g.fillRoundedRect(36, 90, 44, 70, 18);
    } else if (variant === 1) {
      // tentacles
      for (let i = -2; i <= 2; i++) {
        g.fillEllipse(i * 48, 125, 30, 90);
      }
    } else if (variant === 2) {
      // spikes
      for (let i = -3; i <= 3; i++) {
        const x = i * 42;
        g.fillTriangle(x - 16, -95, x + 16, -95, x, -160);
      }
    } else {
      // side nubs (wings)
      g.fillEllipse(-140, -10, 70, 120);
      g.fillEllipse(140, -10, 70, 120);
    }
  }

  private buildActionButtons() {
    const defs: { label: string; action: 'feed' | 'mutate' | 'protect'; x: number; color: number }[] = [
      { label: 'FEED', action: 'feed', x: REF_W / 2 - 220, color: 0x2e7d4f },
      { label: 'MUTATE', action: 'mutate', x: REF_W / 2, color: 0x6b4fa0 },
      { label: 'PROTECT', action: 'protect', x: REF_W / 2 + 220, color: 0x2a6b9c },
    ];
    for (const def of defs) {
      const bg = this.add
        .rectangle(def.x, REF_H - 110, 180, 62, def.color)
        .setStrokeStyle(2, 0xe6edf3, 0.4)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(def.x, REF_H - 110, def.label, {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: 24,
          color: '#e6edf3',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      bg.on('pointerover', () => bg.setFillStyle(this.shade(def.color, 25)));
      bg.on('pointerout', () => bg.setFillStyle(def.color));
      bg.on('pointerdown', () => {
        if (def.action === 'mutate') {
          this.showSlotPicker();
        } else {
          void this.act(def.action, undefined);
        }
      });
      this.uiObjects.push(bg, label);
    }
  }

  private showSlotPicker() {
    if (this.slotPicker) {
      this.slotPicker.destroy();
      this.slotPicker = null;
      return;
    }
    const container = this.add.container(REF_W / 2, REF_H - 235);
    const bg = this.add
      .rectangle(0, 0, 640, 84, 0x1f2c3a)
      .setStrokeStyle(2, 0x30363d);
    container.add(bg);
    const title = this.add
      .text(0, -28, 'Which trait should mutate tonight?', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 16,
        color: '#a5b4c4',
      })
      .setOrigin(0.5);
    container.add(title);
    TRAIT_SLOTS.forEach((slot, i) => {
      const x = -240 + i * 160;
      const button = this.add
        .text(x, 14, slot.toUpperCase(), {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: 18,
          color: '#e6edf3',
          backgroundColor: '#6b4fa0',
          padding: { x: 16, y: 7 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => {
        void this.act('mutate', slot);
        if (this.slotPicker) {
          this.slotPicker.destroy();
          this.slotPicker = null;
        }
      });
      container.add(button);
    });
    this.slotPicker = container;
  }

  private async act(action: 'feed' | 'mutate' | 'protect', slot: TraitSlot | undefined) {
    try {
      const response = await fetch('/api/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slot ? { action, slot } : { action }),
      });
      const data = (await response.json()) as ActResponse | { status: 'error'; message: string };
      if ('status' in data) {
        this.showToast(data.message);
        return;
      }
      this.creature = data.creature;
      this.stage = data.stage;
      this.actionsRemaining = data.actionsRemaining;
      this.refresh();
      this.showToast(data.message);
      this.pulseCreature();
    } catch (error) {
      console.error('Action failed:', error);
      this.showToast('Something went wrong. Try again.');
    }
  }

  private pulseCreature() {
    this.tweens.add({
      targets: this.creatureContainer,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 140,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  private showToast(message: string) {
    this.toastText.setText(message);
    this.toastText.setAlpha(1);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: 2600,
      duration: 500,
    });
  }

  private showRevealCard() {
    const c = this.creature;
    if (!c || !c.lastReveal) return;
    const reveal = c.lastReveal;
    const container = this.add.container(REF_W / 2, REF_H / 2);
    const dim = this.add
      .rectangle(0, 0, REF_W * 2, REF_H * 2, 0x000000, 0.6)
      .setInteractive();
    const card = this.add
      .rectangle(0, 0, 620, 340, 0x16212e)
      .setStrokeStyle(3, 0x79c0ff, 0.7);
    const title = this.add
      .text(0, -130, 'While you were away...', {
        fontFamily: 'Georgia, serif',
        fontSize: 30,
        color: '#e6edf3',
      })
      .setOrigin(0.5);
    const body = this.add
      .text(0, -10, reveal.summary.split(' • ').join('\n'), {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 20,
        color: '#a5b4c4',
        align: 'center',
        wordWrap: { width: 560 },
        lineSpacing: 10,
      })
      .setOrigin(0.5);
    const close = this.add
      .text(0, 130, 'SEE THE CREATURE', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 20,
        color: '#e6edf3',
        backgroundColor: '#2a6b9c',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => container.destroy());
    dim.on('pointerdown', () => container.destroy());
    container.add([dim, card, title, body, close]);
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 350 });
  }

  private layout(width: number, height: number) {
    this.cameras.resize(width, height);
    const zoom = Math.min(width / REF_W, height / REF_H);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(REF_W / 2, REF_H / 2);
  }

  private desaturate(color: number, saturation: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const gray = 0.3 * r + 0.59 * g + 0.11 * b;
    const nr = Math.round(gray + (r - gray) * saturation);
    const ng = Math.round(gray + (g - gray) * saturation);
    const nb = Math.round(gray + (b - gray) * saturation);
    return (nr << 16) | (ng << 8) | nb;
  }

  private shade(color: number, amount: number): number {
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const r = clamp(((color >> 16) & 0xff) + amount);
    const g = clamp(((color >> 8) & 0xff) + amount);
    const b = clamp((color & 0xff) + amount);
    return (r << 16) | (g << 8) | b;
  }
}
