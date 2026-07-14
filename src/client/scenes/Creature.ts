import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { ACTIONS_PER_DAY } from '../../shared/config';
import type {
  ActResponse,
  CreatureState,
  DayCounts,
  HealthStage,
  InitResponse,
  TraitSlot,
} from '../../shared/types';
import { TRAIT_SLOTS } from '../../shared/types';

const REF_W = 1024;
const REF_H = 768;
const PORTRAIT_REF_W = 640;

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
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarMax = 320;
  private healthLabel: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text;
  private instinctText: Phaser.GameObjects.Text;
  private todayText: Phaser.GameObjects.Text;
  private counts: DayCounts | null = null;
  private creatureContainer: Phaser.GameObjects.Container;
  private bobTween: Phaser.Tweens.Tween | null = null;
  private particles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private slotPicker: Phaser.GameObjects.Container | null = null;
  private actionButtons: {
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    index: number;
  }[] = [];
  private portrait = false;
  private viewTop = 0;
  private viewBottom = REF_H;
  private audioCtx: AudioContext | null = null;
  private hatched = false;
  private lineageButton: Phaser.GameObjects.Text | null = null;
  private lineagePanel: Phaser.GameObjects.Container | null = null;

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

    this.healthBarBg = this.add
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

    this.todayText = this.add
      .text(REF_W / 2, 178, '', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 16,
        color: '#7ee787',
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
      this.counts = data.counts;
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
    if (this.counts && !c.dead) {
      const mutates = Object.values(this.counts.mutateVotes).reduce(
        (a, b) => a + b,
        0
      );
      this.todayText.setText(
        `Today: ${this.counts.tenders} tending · ${this.counts.feeds} feeds · ${mutates} mutate votes · ${this.counts.protects} wards`
      );
    } else {
      this.todayText.setText('');
    }
    this.statusText.setText(
      c.dead
        ? 'This creature has passed on. Its lineage continues in a new post.'
        : `${this.actionsRemaining}/${ACTIONS_PER_DAY} actions left today - feed it, mutate it, or ward it`
    );
    if (c.lineage.length > 0 && !this.lineageButton) {
      this.lineageButton = this.add
        .text(REF_W / 2, 0, 'VIEW LINEAGE', {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: 15,
          color: '#e6edf3',
          backgroundColor: '#1f2c3a',
          padding: { x: 12, y: 6 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.lineageButton.on('pointerdown', () => this.toggleLineagePanel());
      this.layout(this.scale.width, this.scale.height);
    }
    this.drawCreature();
  }

  private toggleLineagePanel() {
    if (this.lineagePanel) {
      this.lineagePanel.destroy();
      this.lineagePanel = null;
      return;
    }
    const c = this.creature;
    if (!c) return;
    const lines = c.lineage.map(
      (a) =>
        `Gen ${a.generation}: ${a.name} - survived ${a.daysSurvived} days, passed on ${a.passedOnSlots.join(' + ')}`
    );
    lines.push(`Gen ${c.generation}: ${c.name} - ${c.dead ? 'passed on' : 'alive today'}`);
    const panelH = 120 + lines.length * 30;
    const container = this.add.container(REF_W / 2, REF_H / 2);
    const dim = this.add
      .rectangle(0, 0, REF_W * 2, REF_H * 2, 0x000000, 0.6)
      .setInteractive();
    const card = this.add
      .rectangle(0, 0, this.portrait ? 600 : 680, panelH, 0x16212e)
      .setStrokeStyle(3, 0x7ee787, 0.7);
    const title = this.add
      .text(0, -panelH / 2 + 36, 'The bloodline', {
        fontFamily: 'Georgia, serif',
        fontSize: 26,
        color: '#e6edf3',
      })
      .setOrigin(0.5);
    const body = this.add
      .text(0, 10, lines.join('\n'), {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 17,
        color: '#a5b4c4',
        align: 'center',
        wordWrap: { width: this.portrait ? 540 : 620 },
        lineSpacing: 12,
      })
      .setOrigin(0.5);
    dim.on('pointerdown', () => {
      container.destroy();
      this.lineagePanel = null;
    });
    container.add([dim, card, title, body]);
    this.lineagePanel = container;
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

    if (!this.hatched && !dead) {
      this.hatched = true;
      this.creatureContainer.setScale(0.1, 0.1);
      this.tweens.add({
        targets: this.creatureContainer,
        scaleX: 1,
        scaleY: 1,
        duration: 700,
        ease: 'Back.easeOut',
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
    const defs: { label: string; action: 'feed' | 'mutate' | 'protect'; color: number }[] = [
      { label: 'FEED', action: 'feed', color: 0x2e7d4f },
      { label: 'MUTATE', action: 'mutate', color: 0x6b4fa0 },
      { label: 'PROTECT', action: 'protect', color: 0x2a6b9c },
    ];
    defs.forEach((def, index) => {
      const bg = this.add
        .rectangle(REF_W / 2, REF_H - 110, 180, 62, def.color)
        .setStrokeStyle(2, 0xe6edf3, 0.4)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(REF_W / 2, REF_H - 110, def.label, {
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
      this.actionButtons.push({ bg, label, index });
    });
  }

  private showSlotPicker() {
    if (this.slotPicker) {
      this.slotPicker.destroy();
      this.slotPicker = null;
      return;
    }
    const pickerY = this.portrait ? this.viewBottom - 320 : this.viewBottom - 235;
    const pickerW = this.portrait ? 600 : 640;
    const container = this.add.container(REF_W / 2, pickerY);
    const bg = this.add
      .rectangle(0, 0, pickerW, this.portrait ? 150 : 84, 0x1f2c3a)
      .setStrokeStyle(2, 0x30363d);
    container.add(bg);
    const title = this.add
      .text(0, this.portrait ? -55 : -28, 'Which trait should mutate tonight?', {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: 16,
        color: '#a5b4c4',
      })
      .setOrigin(0.5);
    container.add(title);
    TRAIT_SLOTS.forEach((slot, i) => {
      const x = this.portrait ? -150 + (i % 2) * 300 : -240 + i * 160;
      const y = this.portrait ? (i < 2 ? -10 : 45) : 14;
      const button = this.add
        .text(x, y, slot.toUpperCase(), {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: 18,
          color: '#e6edf3',
          backgroundColor: '#6b4fa0',
          padding: { x: 20, y: 10 },
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

  private playTone(freqs: number[], duration = 0.12, type: OscillatorType = 'sine') {
    try {
      this.audioCtx ??= new AudioContext();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') void ctx.resume();
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const start = ctx.currentTime + i * duration;
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      });
    } catch {
      // audio is best-effort; never break gameplay over it
    }
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
        this.playTone([160], 0.18, 'square');
        this.showToast(data.message);
        return;
      }
      if (action === 'feed') this.playTone([523, 659, 784]);
      else if (action === 'mutate') this.playTone([392, 466], 0.14, 'triangle');
      else this.playTone([587, 880], 0.16);
      this.creature = data.creature;
      this.stage = data.stage;
      this.actionsRemaining = data.actionsRemaining;
      this.counts = data.counts;
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
    if (reveal.mutatedSlot) {
      this.cameras.main.shake(280, 0.004);
    }
    this.playTone(reveal.died ? [220, 165, 110] : [440, 554, 659], 0.16);
  }

  private layout(width: number, height: number) {
    this.cameras.resize(width, height);
    this.portrait = height > width;
    const refW = this.portrait ? PORTRAIT_REF_W : REF_W;
    const zoom = this.portrait
      ? width / refW
      : Math.min(width / REF_W, height / REF_H);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(REF_W / 2, REF_H / 2);

    const viewH = height / zoom;
    this.viewTop = REF_H / 2 - viewH / 2;
    this.viewBottom = REF_H / 2 + viewH / 2;
    const top = this.viewTop;
    const bottom = this.viewBottom;

    this.nameText.setY(top + 46);
    this.nameText.setFontSize(this.portrait ? 30 : 40);
    this.nameText.setWordWrapWidth(this.portrait ? 560 : 900);
    this.healthLabel.setY(top + (this.portrait ? 96 : 92));
    this.healthBarBg.setY(top + (this.portrait ? 126 : 120));
    this.healthBarFill.setY(top + (this.portrait ? 126 : 120));
    this.instinctText.setY(top + (this.portrait ? 160 : 150));
    this.instinctText.setWordWrapWidth(this.portrait ? 560 : 900);
    this.todayText.setY(top + (this.portrait ? 196 : 178));
    this.todayText.setWordWrapWidth(this.portrait ? 560 : 900);
    if (this.lineageButton) {
      this.lineageButton.setY(top + (this.portrait ? 234 : 212));
    }
    this.statusText.setY(bottom - 36);
    this.statusText.setWordWrapWidth(this.portrait ? 560 : 900);
    this.toastText.setY(bottom - (this.portrait ? 300 : 200));
    this.toastText.setWordWrapWidth(this.portrait ? 560 : 700);

    const buttonY = bottom - (this.portrait ? 110 : 110);
    const spacing = this.portrait ? 200 : 220;
    for (const { bg, label, index } of this.actionButtons) {
      const x = REF_W / 2 + (index - 1) * spacing;
      bg.setPosition(x, buttonY);
      bg.setSize(this.portrait ? 190 : 180, this.portrait ? 84 : 62);
      label.setPosition(x, buttonY);
      label.setFontSize(this.portrait ? 26 : 24);
    }

    if (this.slotPicker) {
      this.slotPicker.destroy();
      this.slotPicker = null;
    }
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
