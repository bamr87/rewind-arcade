import type { AudioBus, ToneOptions } from './types';
import { storage } from './storage';

/**
 * A tiny WebAudio synth shared by every game. No audio files — each game builds
 * its own sound effects out of `tone()`. Mute state is global and persisted.
 */
class AudioBusImpl implements AudioBus {
  private ctx: AudioContext | null = null;
  muted: boolean;

  constructor() {
    this.muted = storage.getBool('muted', false);
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    storage.setBool('muted', muted);
  }

  tone(freq: number, opts: ToneOptions = {}) {
    const { dur = 0.1, type = 'sine', vol = 0.08, slideTo = 0, delay = 0 } = opts;
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Play a sequence of notes as a simple arpeggio. */
  arp(freqs: number[], opts: ToneOptions & { gap?: number } = {}) {
    const { gap = 0.08, ...rest } = opts;
    freqs.forEach((f, i) => this.tone(f, { ...rest, delay: (rest.delay ?? 0) + i * gap }));
  }
}

export const audio = new AudioBusImpl();
export type { AudioBusImpl };
