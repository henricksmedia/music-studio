/**
 * Local-first Web Audio engine.
 * No cloud music APIs — synthesis only, driven by intent + human dimensions.
 */

import type { Dimensions, StemId } from "./types";

export type EngineParams = {
  intent: string;
  dimensions: Dimensions;
  seed: number;
};

function hashSeed(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough intent → musical lean without ML. */
function parseIntent(intent: string, d: Dimensions) {
  const t = intent.toLowerCase();
  let bpm = 90 + (d.pulse / 100) * 50;
  let root = 110; // A2-ish
  let scale: number[] = [0, 2, 3, 5, 7, 8, 10]; // minor-ish

  if (/trance|techno|electronic|cyborg|synth/.test(t)) {
    bpm = 118 + (d.pulse / 100) * 30;
    scale = [0, 2, 3, 5, 7, 8, 10];
  }
  if (/folk|acoustic|indie|lonely|dusk/.test(t)) {
    bpm = 78 + (d.pulse / 100) * 28;
    scale = [0, 2, 4, 5, 7, 9, 11]; // major-ish
  }
  if (/country|rock|road/.test(t)) {
    bpm = 100 + (d.pulse / 100) * 30;
    scale = [0, 2, 4, 5, 7, 9, 10];
  }
  if (/dark|night|void|haunt/.test(t)) {
    root = 98;
    scale = [0, 1, 3, 5, 7, 8, 10];
  }
  if (/bright|summer|joy|dance/.test(t)) {
    root = 130.81;
    scale = [0, 2, 4, 5, 7, 9, 11];
  }

  // Genre pull: organic ← → electronic
  bpm += ((d.genrePull - 50) / 50) * 12;
  return { bpm: Math.max(60, Math.min(160, bpm)), root, scale };
}


function noteFromScale(rootHz: number, scale: number[], degree: number) {
  const octave = Math.floor(degree / scale.length);
  const step = scale[((degree % scale.length) + scale.length) % scale.length];
  // approximate: assume root is near A2 (45 midi) — map via ratio
  const semitones = step + octave * 12;
  return rootHz * Math.pow(2, semitones / 12);
}

type LayerNodes = {
  gain: GainNode;
  stop: () => void;
};

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private layers: Partial<Record<StemId, LayerNodes>> = {};
  private playing = false;
  private params: EngineParams | null = null;
  private mute: Record<StemId, boolean> = {
    pulse: false,
    bass: false,
    texture: false,
    lead: false,
  };

  getAnalyser() {
    return this.analyser;
  }

  isPlaying() {
    return this.playing;
  }

  async ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  setMute(id: StemId, muted: boolean) {
    this.mute[id] = muted;
    const g = this.layers[id]?.gain;
    if (g && this.ctx) {
      g.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  stopAll() {
    Object.values(this.layers).forEach((l) => l?.stop());
    this.layers = {};
    this.playing = false;
  }

  async play(params: EngineParams) {
    const ctx = await this.ensure();
    this.stopAll();
    this.params = params;
    const { bpm, root, scale } = parseIntent(params.intent, params.dimensions);
    const d = params.dimensions;
    const rng = mulberry32(hashSeed(params.intent, params.seed));
    const beat = 60 / bpm;
    const now = ctx.currentTime + 0.05;

    // Space → delay + wet
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.12 + (d.space / 100) * 0.45;
    const delayGain = ctx.createGain();
    delayGain.gain.value = (d.space / 100) * 0.45;
    const feedback = ctx.createGain();
    feedback.gain.value = (d.space / 100) * 0.35;
    delay.connect(delayGain);
    delayGain.connect(this.master!);
    delay.connect(feedback);
    feedback.connect(delay);

    // Grit → waveshaper
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(1 + (d.grit / 100) * 40);
    shaper.oversample = "2x";
    const gritMix = ctx.createGain();
    gritMix.gain.value = Math.min(0.7, d.grit / 100);
    const clean = ctx.createGain();
    clean.gain.value = 1 - gritMix.gain.value * 0.5;

    const bus = ctx.createGain();
    bus.connect(clean);
    clean.connect(this.master!);
    bus.connect(shaper);
    shaper.connect(gritMix);
    gritMix.connect(this.master!);
    bus.connect(delay);

    // --- Pulse / kick-ish ---
    {
      const gain = ctx.createGain();
      gain.gain.value = this.mute.pulse ? 0 : 1;
      const layerOut = ctx.createGain();
      layerOut.gain.value = 0.55 + (d.drumFeel / 100) * 0.35;
      gain.connect(layerOut);
      layerOut.connect(bus);

      const timers: number[] = [];
      const schedule = () => {
        if (!this.playing) return;
        const t0 = ctx.currentTime;
        const dens = 0.35 + (d.drumFeel / 100) * 0.65;
        for (let i = 0; i < 8; i++) {
          const on = i % 2 === 0 || rng() < dens * 0.5;
          if (!on) continue;
          const when = t0 + i * beat;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = d.genrePull > 55 ? "sine" : "triangle";
          osc.frequency.setValueAtTime(90 + (d.bass / 100) * 40, when);
          osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
          g.gain.setValueAtTime(0.0001, when);
          g.gain.exponentialRampToValueAtTime(0.9, when + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
          osc.connect(g);
          g.connect(gain);
          osc.start(when);
          osc.stop(when + 0.2);
        }
        timers.push(
          window.setTimeout(schedule, beat * 8 * 1000 - 20) as unknown as number
        );
      };
      this.playing = true;
      schedule();
      this.layers.pulse = {
        gain,
        stop: () => timers.forEach((id) => clearTimeout(id)),
      };
    }

    // --- Bass ---
    {
      const gain = ctx.createGain();
      gain.gain.value = this.mute.bass ? 0 : 1;
      const layerOut = ctx.createGain();
      layerOut.gain.value = 0.25 + (d.bass / 100) * 0.55;
      gain.connect(layerOut);
      layerOut.connect(bus);

      const osc = ctx.createOscillator();
      osc.type = d.genrePull > 60 ? "sawtooth" : "triangle";
      const lfo = ctx.createOscillator();
      lfo.frequency.value = bpm / 60;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 8 + (d.pulse / 100) * 20;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.frequency.value = root / 2;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 180 + (d.bass / 100) * 420;
      filter.Q.value = 1 + (d.grit / 100) * 4;

      const env = ctx.createGain();
      // sidechain-ish ducking via LFO
      const duck = ctx.createOscillator();
      duck.frequency.value = bpm / 60;
      const duckGain = ctx.createGain();
      duckGain.gain.value = 0.15 + (d.drumFeel / 100) * 0.25;
      env.gain.value = 0.7;
      duck.connect(duckGain);
      duckGain.connect(env.gain);

      osc.connect(filter);
      filter.connect(env);
      env.connect(gain);
      osc.start(now);
      lfo.start(now);
      duck.start(now);

      this.layers.bass = {
        gain,
        stop: () => {
          try {
            osc.stop();
            lfo.stop();
            duck.stop();
          } catch {
            /* ignore */
          }
        },
      };
    }

    // --- Texture / hats (noise) ---
    {
      const gain = ctx.createGain();
      gain.gain.value = this.mute.texture ? 0 : 1;
      const layerOut = ctx.createGain();
      layerOut.gain.value = 0.12 + (d.drumFeel / 100) * 0.28;
      gain.connect(layerOut);
      layerOut.connect(bus);

      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = rng() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4000 - (d.space / 100) * 1500;

      const gate = ctx.createGain();
      gate.gain.value = 0;
      noise.connect(hp);
      hp.connect(gate);
      gate.connect(gain);
      noise.start(now);

      const timers: number[] = [];
      const pattern = () => {
        if (!this.playing) return;
        const t0 = ctx.currentTime;
        const steps = 16;
        for (let i = 0; i < steps; i++) {
          const open = i % 2 === 1 || (d.drumFeel > 60 && i % 4 === 2);
          const when = t0 + (i * beat) / 2;
          if (!open) continue;
          gate.gain.setValueAtTime(0.0001, when);
          gate.gain.exponentialRampToValueAtTime(0.4, when + 0.005);
          gate.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
        }
        timers.push(
          window.setTimeout(pattern, beat * 8 * 1000 - 20) as unknown as number
        );
      };
      pattern();

      this.layers.texture = {
        gain,
        stop: () => {
          timers.forEach((id) => clearTimeout(id));
          try {
            noise.stop();
          } catch {
            /* ignore */
          }
        },
      };
    }

    // --- Lead / character ---
    {
      const gain = ctx.createGain();
      gain.gain.value = this.mute.lead ? 0 : 1;
      const layerOut = ctx.createGain();
      layerOut.gain.value = 0.18 + (d.vocalCharacter / 100) * 0.22;
      gain.connect(layerOut);
      layerOut.connect(bus);

      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const blend = d.vocalCharacter / 100;
      osc.type = blend > 0.55 ? "sawtooth" : "sine";
      osc2.type = "triangle";
      osc2.detune.value = 6 + blend * 10;

      const degrees = [0, 2, 4, 5, 7, 4, 2, 0];
      const seqGain = ctx.createGain();
      seqGain.gain.value = 0;
      osc.connect(seqGain);
      osc2.connect(seqGain);
      seqGain.connect(gain);

      osc.frequency.value = noteFromScale(root, scale, 7);
      osc2.frequency.value = noteFromScale(root, scale, 7);
      osc.start(now);
      osc2.start(now);

      const timers: number[] = [];
      let step = 0;
      const tick = () => {
        if (!this.playing) return;
        const when = ctx.currentTime;
        const deg = degrees[step % degrees.length] + Math.floor(rng() * 3) - 1;
        const f = noteFromScale(root, scale, Math.max(0, deg + 7));
        osc.frequency.setTargetAtTime(f, when, 0.01);
        osc2.frequency.setTargetAtTime(f * 1.002, when, 0.01);
        seqGain.gain.cancelScheduledValues(when);
        seqGain.gain.setValueAtTime(0.0001, when);
        seqGain.gain.exponentialRampToValueAtTime(0.55, when + 0.03);
        seqGain.gain.exponentialRampToValueAtTime(0.15, when + beat * 0.8);
        step++;
        timers.push(
          window.setTimeout(tick, beat * 1000) as unknown as number
        );
      };
      tick();

      this.layers.lead = {
        gain,
        stop: () => {
          timers.forEach((id) => clearTimeout(id));
          try {
            osc.stop();
            osc2.stop();
          } catch {
            /* ignore */
          }
        },
      };
    }

    this.playing = true;
  }

  async update(params: EngineParams) {
    // Rebuild graph so nudges always reshape the piece coherently
    const was = this.playing;
    if (was) await this.play(params);
    else this.params = params;
  }

  pause() {
    this.stopAll();
  }

  /** Render ~4s of mix or a single stem to WAV Blob (offline). */
  async exportWav(stem: StemId | "mix", seconds = 4): Promise<Blob> {
    if (!this.params) throw new Error("Generate a piece first");
    const sampleRate = 44100;
    const length = Math.floor(sampleRate * seconds);
    const offline = new OfflineAudioContext(2, length, sampleRate);
    const params = this.params;
    const { bpm, root, scale } = parseIntent(params.intent, params.dimensions);
    const d = params.dimensions;
    const rng = mulberry32(hashSeed(params.intent, params.seed + 1));
    const beat = 60 / bpm;

    const master = offline.createGain();
    master.gain.value = 0.85;
    master.connect(offline.destination);

    const want = (id: StemId) => stem === "mix" || stem === id;

    if (want("pulse")) {
      for (let i = 0; i < Math.ceil(seconds / beat); i++) {
        if (i % 2 !== 0 && rng() > 0.4) continue;
        const when = i * beat;
        const osc = offline.createOscillator();
        const g = offline.createGain();
        osc.frequency.setValueAtTime(100, when);
        osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.8, when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
        osc.connect(g);
        g.connect(master);
        osc.start(when);
        osc.stop(when + 0.18);
      }
    }

    if (want("bass")) {
      const osc = offline.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = root / 2;
      const g = offline.createGain();
      g.gain.value = 0.3 + (d.bass / 100) * 0.4;
      osc.connect(g);
      g.connect(master);
      osc.start(0);
      osc.stop(seconds);
    }

    if (want("texture")) {
      const bufferSize = sampleRate * seconds;
      const buffer = offline.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const step = Math.floor((i / sampleRate / beat) * 2);
        const open = step % 2 === 1;
        data[i] = open ? (rng() * 2 - 1) * 0.15 : 0;
      }
      const src = offline.createBufferSource();
      src.buffer = buffer;
      const hp = offline.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      src.connect(hp);
      hp.connect(master);
      src.start(0);
    }

    if (want("lead")) {
      const degrees = [0, 2, 4, 5, 7, 4, 2, 0];
      for (let i = 0; i < Math.ceil(seconds / beat); i++) {
        const when = i * beat;
        const f = noteFromScale(root, scale, degrees[i % degrees.length] + 7);
        const osc = offline.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const g = offline.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.35, when + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, when + beat * 0.85);
        osc.connect(g);
        g.connect(master);
        osc.start(when);
        osc.stop(when + beat);
      }
    }

    const rendered = await offline.startRendering();
    return bufferToWav(rendered);
  }
}

function makeDistortionCurve(amount: number) {
  const n = 44100;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const samples = buffer.length;
  const blockAlign = (numChan * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numChan; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChan; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export const engine = new MusicEngine();
