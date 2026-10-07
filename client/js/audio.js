// Procedural audio (WebAudio): synthesized combat + UI sounds and a small orchestral
// sequencer for the soundtrack (town waltz, field battle per stage, boss, final hour, victory
// fanfare, defeat lament). Everything runs through a shared hall reverb and a soft limiter.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// throttles (seconds) so a horde of hits doesn't become noise
const GAP = {
  hit: 0.045, kill: 0.04, gem: 0.028, slash: 0.05, shoot: 0.06, knife: 0.05, fire: 0.08, boom: 0.06, meteor: 0.1, whoosh: 0.15,
  splash: 0.1, zap: 0.06, frost: 0.1, axe: 0.1, wisp: 0.08, toss: 0.1, hurt: 0.12, coin: 0.05, crack: 0.08, orbs: 0.4, roar: 0.4, quake: 0.3,
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.last = new Map();
    this.track = null;
    this.stage = 0;
    this.want = null;
    this.volume = { master: 0.55, music: 0.55, sfx: 0.8 };
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.volume.master;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      this.master.connect(comp);
      comp.connect(c.destination);
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.impulse(2.8, 2.2);
      this.revIn = c.createGain();
      this.revIn.gain.value = 0.5;
      this.revIn.connect(this.reverb);
      this.reverb.connect(this.master);
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = this.volume.sfx;
      this.sfxBus.connect(this.master);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      this.musicRev = c.createGain();
      this.musicRev.gain.value = 0.55;
      this.musicBus.connect(this.musicRev);
      this.musicRev.connect(this.revIn);
      this.noiseBuf = this.makeNoise();
      this.timer = setInterval(() => this.schedule(), 40);
      if (this.want) this.music(this.want[0], this.want[1]);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }

  makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ---------------------------------------------------------------- primitives
  osc(t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.2, attack = 0.005, release = null, out = null, rev = 0, detune = 0, vib = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 5.2;
      lg.gain.value = freq * vib;
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.6);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    if (release) {
      g.gain.setValueAtTime(Math.max(0.0002, gain), t + Math.max(attack, dur - release));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out || this.sfxBus);
    if (rev) { const s = c.createGain(); s.gain.value = rev; g.connect(s); s.connect(this.revIn); }
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noise(t, dur, { type = 'bandpass', freq = 1000, freqEnd = null, q = 1, gain = 0.2, attack = 0.002, out = null, rev = 0 } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out || this.sfxBus);
    if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r); r.connect(this.revIn); }
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // kept for the lobby code
  tone(t, dur, o) { this.osc(t, dur, o); }

  // ---------------------------------------------------------------- sounds
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const gap = GAP[name];
    if (gap) {
      const l = this.last.get(name) || 0;
      if (t - l < gap) return;
      this.last.set(name, t);
    }
    const v = opts.local === false ? 0.45 : 1;
    const O = (d, o) => this.osc(t + (o.at || 0), d, { ...o, gain: (o.gain || 0.2) * v });
    const N = (d, o) => this.noise(t + (o.at || 0), d, { ...o, gain: (o.gain || 0.2) * v });
    switch (name) {
      // UI
      case 'move': O(0.06, { type: 'triangle', freq: 880, gain: 0.07 }); break;
      case 'confirm': O(0.12, { type: 'triangle', freq: 660, gain: 0.11 }); O(0.22, { type: 'triangle', freq: 990, gain: 0.11, at: 0.07, rev: 0.3 }); break;
      case 'back': O(0.12, { type: 'triangle', freq: 520, freqEnd: 330, gain: 0.09 }); break;
      case 'open': O(0.18, { type: 'sine', freq: 440, freqEnd: 880, gain: 0.1 }); break;
      case 'buy': [784, 988, 1175].forEach((f, i) => O(0.3, { type: 'triangle', freq: f, gain: 0.09, at: i * 0.06, rev: 0.3 })); break;
      case 'deny': O(0.15, { type: 'square', freq: 160, gain: 0.05 }); break;
      case 'join': [523, 659, 784].forEach((f, i) => O(0.35, { type: 'triangle', freq: f, gain: 0.09, at: i * 0.08, rev: 0.4 })); break;
      // weapons
      case 'slash': N(0.18, { type: 'bandpass', freq: 2600, freqEnd: 500, q: 1.4, gain: 0.22 }); O(0.1, { freq: 160, freqEnd: 70, gain: 0.12 }); break;
      case 'shoot': O(0.09, { type: 'triangle', freq: 980, freqEnd: 420, gain: 0.08 }); N(0.04, { type: 'highpass', freq: 3000, gain: 0.06 }); break;
      case 'knife': N(0.07, { type: 'bandpass', freq: 5200, freqEnd: 2600, q: 2, gain: 0.1 }); break;
      case 'fire': N(0.3, { type: 'lowpass', freq: 1400, freqEnd: 300, gain: 0.14 }); O(0.25, { freq: 220, freqEnd: 110, gain: 0.08 }); break;
      case 'toss': N(0.15, { type: 'bandpass', freq: 700, freqEnd: 1400, q: 1.5, gain: 0.08 }); break;
      case 'axe': N(0.25, { type: 'bandpass', freq: 500, freqEnd: 1800, q: 2.5, gain: 0.1 }); break;
      case 'wisp': O(0.18, { freq: 720, freqEnd: 1180, gain: 0.06, rev: 0.4 }); break;
      case 'boom': N(0.55, { type: 'lowpass', freq: 700, freqEnd: 90, gain: 0.32 }); O(0.4, { freq: 110, freqEnd: 38, gain: 0.3 }); break;
      case 'meteor': N(0.9, { type: 'lowpass', freq: 900, freqEnd: 60, gain: 0.4, rev: 0.4 }); O(0.7, { freq: 90, freqEnd: 30, gain: 0.38 }); break;
      case 'whoosh': N(0.5, { type: 'bandpass', freq: 300, freqEnd: 1600, q: 3, gain: 0.08 }); break;
      case 'splash': N(0.22, { type: 'bandpass', freq: 1300, freqEnd: 600, q: 2, gain: 0.12 }); O(0.15, { freq: 420, freqEnd: 820, gain: 0.05, at: 0.05 }); break;
      case 'zap': N(0.16, { type: 'highpass', freq: 2400, gain: 0.2 }); O(0.12, { type: 'square', freq: 110, freqEnd: 60, gain: 0.07 }); N(0.4, { type: 'lowpass', freq: 400, gain: 0.12, at: 0.04, rev: 0.5 }); break;
      case 'frost': [2093, 2637, 3136].forEach((f, i) => O(0.4, { freq: f, gain: 0.05, at: i * 0.03, rev: 0.6 })); N(0.3, { type: 'highpass', freq: 5000, gain: 0.08 }); break;
      // combat feedback
      case 'hit': N(0.035, { type: 'bandpass', freq: 1700 + Math.random() * 600, q: 2, gain: 0.09 }); break;
      case 'kill': O(0.08, { freq: 340 + Math.random() * 80, freqEnd: 90, gain: 0.07 }); break;
      case 'crack': N(0.2, { type: 'bandpass', freq: 900, q: 1, gain: 0.2 }); O(0.08, { type: 'square', freq: 420, gain: 0.05 }); break;
      case 'gem': {
        const st = Math.min(opts.step || 0, 24);
        const f = midi(84 + [0, 2, 4, 7, 9][st % 5] + 12 * Math.floor(st / 5) * 0.5);
        O(0.14, { freq: Math.min(f, 4200), gain: 0.06, rev: 0.2 });
        O(0.09, { freq: Math.min(f * 2, 8000), gain: 0.02 });
        break;
      }
      case 'heal': [72, 76, 79, 84].forEach((n, i) => O(0.3, { freq: midi(n), gain: 0.07, at: i * 0.05, rev: 0.5 })); break;
      case 'coin': O(0.06, { type: 'square', freq: 1320, gain: 0.04 }); O(0.14, { type: 'square', freq: 1760, gain: 0.04, at: 0.05 }); break;
      case 'hurt': O(0.16, { type: 'sawtooth', freq: 180, freqEnd: 70, gain: 0.12 }); N(0.12, { type: 'lowpass', freq: 900, gain: 0.15 }); break;
      case 'down': [64, 60, 55].forEach((n, i) => O(0.5, { type: 'triangle', freq: midi(n), gain: 0.1, at: i * 0.16, rev: 0.5 })); break;
      case 'revive': [67, 71, 74, 79, 83].forEach((n, i) => O(0.6, { freq: midi(n), gain: 0.08, at: i * 0.06, rev: 0.7 })); break;
      case 'levelup': {
        [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => O(0.35, { type: 'triangle', freq: midi(n), gain: 0.08, at: i * 0.045, rev: 0.5 }));
        [72, 76, 79].forEach((n) => O(1.2, { freq: midi(n), gain: 0.06, at: 0.32, attack: 0.05, rev: 0.8 }));
        break;
      }
      case 'chest': for (let i = 0; i < 14; i++) N(0.07, { type: 'lowpass', freq: 500, gain: 0.08 + i * 0.012, at: i * 0.075 }); break;
      case 'chestopen': {
        [60, 64, 67, 72].forEach((n) => O(1.4, { type: 'triangle', freq: midi(n), gain: 0.08, attack: 0.01, rev: 0.8 }));
        for (let i = 0; i < 10; i++) O(0.2, { freq: midi(84 + [0, 4, 7, 12, 16][i % 5]), gain: 0.04, at: 0.1 + i * 0.05, rev: 0.6 });
        N(0.4, { type: 'highpass', freq: 6000, gain: 0.08 });
        break;
      }
      case 'evolve': O(1.2, { type: 'sawtooth', freq: 220, freqEnd: 880, gain: 0.05, attack: 0.3, rev: 0.7 }); [69, 73, 76, 81].forEach((n) => O(1.6, { freq: midi(n), gain: 0.07, at: 1, rev: 0.8 })); break;
      case 'lodestone': O(0.8, { type: 'sine', freq: 110, freqEnd: 440, gain: 0.12, vib: 0.02 }); break;
      case 'freeze': [3136, 2637, 2349, 1976].forEach((f, i) => O(0.6, { freq: f, gain: 0.06, at: i * 0.06, rev: 0.9 })); break;
      case 'starfall': for (let i = 0; i < 12; i++) O(0.25, { freq: midi(96 - i * 2), gain: 0.04, at: i * 0.04, rev: 0.7 }); this.play('meteor'); break;
      // threats
      case 'horn': [[50, 0], [57, 0.45], [55, 0.9]].forEach(([n, at]) => { this.brass(t + at, at > 0.8 ? 1.4 : 0.42, midi(n), 0.12); this.brass(t + at, at > 0.8 ? 1.4 : 0.42, midi(n - 12), 0.08); }); this.drum(t, 0.3); this.drum(t + 0.9, 0.35); break;
      case 'elite': this.brass(t, 0.5, midi(50), 0.1); this.brass(t + 0.2, 0.6, midi(53), 0.1); break;
      case 'warn': this.drum(t, 0.25); this.drum(t + 0.22, 0.25); this.drum(t + 0.6, 0.32); break;
      case 'roar': N(0.7, { type: 'lowpass', freq: 380, freqEnd: 140, q: 4, gain: 0.3 }); O(0.6, { type: 'sawtooth', freq: 70, freqEnd: 50, gain: 0.08 }); break;
      case 'quake': N(0.9, { type: 'lowpass', freq: 180, gain: 0.4 }); O(0.8, { freq: 45, gain: 0.25 }); break;
      case 'orbs': N(0.6, { type: 'bandpass', freq: 400, freqEnd: 1200, q: 6, gain: 0.1, rev: 0.6 }); break;
      case 'bossdie': this.play('meteor'); [50, 57, 62, 66, 69].forEach((n, i) => O(2, { type: 'triangle', freq: midi(n), gain: 0.06, at: 0.3 + i * 0.08, rev: 0.9 })); break;
    }
  }

  brass(t, dur, f, gain, out) {
    const c = this.ctx;
    const o = c.createOscillator(), o2 = c.createOscillator();
    o.type = o2.type = 'sawtooth';
    o.frequency.value = f;
    o2.frequency.value = f;
    o2.detune.value = 7;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = 1.2;
    fl.frequency.setValueAtTime(f * 1.2, t);
    fl.frequency.linearRampToValueAtTime(f * 5, t + 0.08);
    fl.frequency.exponentialRampToValueAtTime(f * 2.4, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); o2.connect(fl); fl.connect(g);
    g.connect(out || this.sfxBus);
    const r = c.createGain(); r.gain.value = 0.35; g.connect(r); r.connect(this.revIn);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  drum(t, gain, out, pitch = 70) {
    this.osc(t, 0.45, { freq: pitch * 1.6, freqEnd: pitch * 0.6, gain, out, rev: 0.3 });
    this.noise(t, 0.12, { type: 'lowpass', freq: 600, gain: gain * 0.5, out });
  }

  setVolumes(master, music, sfx) {
    this.volume.master = master * 0.7;
    this.volume.music = music * 0.75;
    this.volume.sfx = sfx;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volume.master, now, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volume.sfx, now, 0.05);
    if (this.song && !this.pending) {
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setTargetAtTime(Math.max(0.0001, this.volume.music * (this.song.vol || 1)), now, 0.05);
    }
  }

  // ---------------------------------------------------------------- music
  music(name, stage = 0) {
    this.want = [name, stage];
    if (!this.ctx) return;
    if (this.track === name && this.stage === stage && !this.pending) return;
    if (this.pending && this.pending.name === name && this.pending.stage === stage) return;
    const c = this.ctx, g = this.musicBus.gain;
    const now = c.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0.0001, now + 0.7);
    this.pending = { name, stage, at: now + 0.75 };
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    if (this.pending && now >= this.pending.at) {
      const { name, stage } = this.pending;
      this.pending = null;
      this.track = name;
      this.stage = stage;
      this.song = name && SONGS[name] ? SONGS[name](stage) : null;
      this.bar = 0;
      this.barT = now + 0.1;
      const g = this.musicBus.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0.0001, now);
      g.linearRampToValueAtTime(this.volume.music * (this.song ? this.song.vol || 1 : 1), now + 1.2);
    }
    const s = this.song;
    if (!s) return;
    if (this.barT < now - 0.5) this.barT = now + 0.05; // tab was asleep: don't burst-schedule
    while (this.barT < now + 0.35) {
      if (s.once && this.bar >= s.bars) { this.song = null; return; }
      const beat = 60 / s.bpm;
      for (const n of s.bar(this.bar % s.bars, this.bar)) this.note(this.barT + n[1] * beat, n[0], n[2], n[3] * beat, n[4] || 0.5);
      this.barT += s.beats * beat;
      this.bar++;
    }
  }

  // inst, time, midi note, duration (s), velocity
  note(t, inst, n, dur, vel) {
    const out = this.musicBus;
    const f = midi(n);
    switch (inst) {
      case 'harp':
        this.osc(t, Math.max(0.6, dur), { type: 'triangle', freq: f, gain: 0.07 * vel, attack: 0.004, out });
        this.osc(t, 0.5, { freq: f * 2, gain: 0.02 * vel, attack: 0.002, out });
        break;
      case 'pluck': this.osc(t, 0.35, { type: 'triangle', freq: f, gain: 0.06 * vel, attack: 0.003, out }); break;
      case 'flute': this.osc(t, dur, { type: 'sine', freq: f, gain: 0.07 * vel, attack: 0.06, release: Math.min(0.3, dur * 0.4), out, vib: 0.006 }); this.osc(t, dur, { type: 'triangle', freq: f * 2, gain: 0.008 * vel, attack: 0.08, release: 0.2, out }); break;
      case 'oboe': this.osc(t, dur, { type: 'sawtooth', freq: f, gain: 0.022 * vel, attack: 0.04, release: Math.min(0.25, dur * 0.4), out: this.padFilter(2600), vib: 0.005 }); break;
      case 'strings':
        for (const d of [-8, 0, 7]) this.osc(t, dur, { type: 'sawtooth', freq: f, detune: d, gain: 0.012 * vel, attack: Math.min(0.4, dur * 0.3), release: Math.min(0.5, dur * 0.4), out: this.padFilter() });
        break;
      case 'stac': for (const d of [-6, 6]) this.osc(t, Math.min(0.2, dur), { type: 'sawtooth', freq: f, detune: d, gain: 0.018 * vel, attack: 0.01, out: this.padFilter(2400) }); break;
      case 'choir': for (const d of [-5, 0, 5]) this.osc(t, dur, { type: 'sine', freq: f, detune: d, gain: 0.03 * vel, attack: Math.min(0.5, dur * 0.35), release: Math.min(0.6, dur * 0.4), out, vib: 0.004 }); this.osc(t, dur, { type: 'triangle', freq: f * 2, gain: 0.006 * vel, attack: 0.4, release: 0.4, out }); break;
      case 'organ': for (const m of [1, 2, 3]) this.osc(t, dur, { type: 'sine', freq: f * m, gain: (0.03 / m) * vel, attack: 0.02, release: 0.1, out }); break;
      case 'bass': this.osc(t, Math.min(dur, 0.6), { type: 'triangle', freq: f, gain: 0.12 * vel, attack: 0.01, out }); break;
      case 'brass': this.brass(t, dur, f, 0.06 * vel, out); break;
      case 'bell': this.osc(t, 1.4, { freq: f, gain: 0.05 * vel, attack: 0.002, out }); this.osc(t, 0.8, { freq: f * 2.76, gain: 0.015 * vel, attack: 0.002, out }); break;
      case 'timp': this.osc(t, 0.6, { freq: f, freqEnd: f * 0.8, gain: 0.2 * vel, attack: 0.004, out }); this.noise(t, 0.08, { type: 'lowpass', freq: 400, gain: 0.08 * vel, out }); break;
      case 'kick': this.osc(t, 0.25, { freq: 120, freqEnd: 45, gain: 0.22 * vel, attack: 0.002, out }); break;
      case 'snare': this.noise(t, 0.14, { type: 'bandpass', freq: 1900, q: 0.8, gain: 0.08 * vel, out }); this.osc(t, 0.08, { type: 'triangle', freq: 220, freqEnd: 160, gain: 0.04 * vel, out }); break;
      case 'hat': this.noise(t, 0.04, { type: 'highpass', freq: 7000, gain: 0.03 * vel, out }); break;
      case 'cym': this.noise(t, 1.2, { type: 'highpass', freq: 5000, gain: 0.05 * vel, out }); break;
    }
  }

  padFilter(freq = 1500) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = 0.5;
    f.connect(this.musicBus);
    return f;
  }
}

// ------------------------------------------------------------------ songs
// A song: { bpm, beats per bar, bars, bar(i) -> [[inst, beat, midi, beats, vel], ...] }
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const TRI = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], sus: [0, 5, 7] };
const tones = (ch) => TRI[ch[1]].map((x) => ch[0] + x);

// a melody that walks over chord tones and passing notes, bar by bar (deterministic per seed)
function melody(chords, beats, seed, { lo = 72, hi = 86, rhythm, scale }) {
  const R = rng(seed);
  const out = [];
  let prev = (lo + hi) >> 1;
  chords.forEach((ch, bi) => {
    const notes = [];
    const pattern = rhythm[Math.floor(R() * rhythm.length)];
    let t = 0;
    for (const len of pattern) {
      const ct = tones(ch);
      const strong = t === 0 || (beats === 4 && t === 2);
      const pool = strong || R() < 0.55 ? ct : scale;
      let cand = [];
      for (let o = -24; o <= 24; o += 12) for (const n of pool) cand.push(n + o);
      cand = cand.filter((n) => n >= lo && n <= hi);
      cand.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
      const pick = cand[Math.min(cand.length - 1, Math.floor(R() * R() * 4))];
      if (R() < 0.12 && t > 0) { t += len; continue; } // a breath
      notes.push([pick, t, len]);
      prev = pick;
      t += len;
    }
    out[bi] = notes;
  });
  return out;
}

const SONGS = {
  // the Travelers' Camp: a gentle waltz (harp, strings, flute)
  town() {
    const prog = [[65, 'maj'], [62, 'min'], [70, 'maj'], [72, 'maj'], [65, 'maj'], [69, 'min'], [70, 'maj'], [72, 'sus'],
      [62, 'min'], [70, 'maj'], [65, 'maj'], [72, 'maj'], [70, 'maj'], [69, 'min'], [67, 'min'], [72, 'maj']];
    const F = [65, 67, 69, 70, 72, 74, 76];
    const mel = melody(prog, 3, 7, { lo: 74, hi: 89, rhythm: [[2, 1], [1, 1, 1], [3], [1.5, 0.5, 1], [2, 1]], scale: F });
    return {
      bpm: 92, beats: 3, bars: 16, vol: 0.9,
      bar(i) {
        const ch = prog[i], [a, b, c] = tones(ch);
        const ev = [['bass', 0, ch[0] - 24, 2.5, 0.6], ['harp', 1, a - 12, 1, 0.5], ['harp', 1.5, c - 12, 1, 0.35], ['harp', 2, b - 12, 1, 0.45], ['harp', 2.5, c - 12, 1, 0.3]];
        ev.push(['strings', 0, a, 3, 0.5], ['strings', 0, b, 3, 0.4], ['strings', 0, c, 3, 0.35]);
        if (i >= 4) for (const [n, t, l] of mel[i]) ev.push(['flute', t, n, l * 0.95, 0.75]);
        if (i % 4 === 3) ev.push(['bell', 2, c + 12, 1, 0.4]);
        return ev;
      },
    };
  },
  // out in the fields: a driving minor theme; each stage has its own key, tempo and lead voice
  battle(stage) {
    const key = [62, 64, 60][stage] || 62;
    const R = (d, q) => [key + d, q];
    const prog = [R(0, 'min'), R(-4, 'maj'), R(-2, 'maj'), R(-5, 'maj'), R(0, 'min'), R(-4, 'maj'), R(-7, 'min'), R(-5, 'maj'),
      R(-4, 'maj'), R(-2, 'maj'), R(0, 'min'), R(-7, 'min'), R(-4, 'maj'), R(-9, 'maj'), R(-2, 'maj'), R(-5, 'maj')];
    const scale = [0, 2, 3, 5, 7, 8, 10].map((x) => key + x);
    const mel = melody(prog, 4, 11 + stage, { lo: 72, hi: 88, rhythm: [[1.5, 0.5, 1, 1], [1, 1, 2], [0.5, 0.5, 1, 1, 1], [2, 1, 1], [1, 0.5, 0.5, 2]], scale });
    const lead = ['oboe', 'bell', 'organ'][stage] || 'oboe';
    const bpm = [128, 116, 122][stage] || 126;
    return {
      bpm, beats: 4, bars: 16, vol: 0.8,
      bar(i) {
        const ch = prog[i], [a, b, c] = tones(ch);
        const ev = [];
        for (let k = 0; k < 8; k++) ev.push(['bass', k * 0.5, ch[0] - 24 + (k % 4 === 3 ? 7 : 0), 0.5, k % 2 ? 0.55 : 0.8]);
        ev.push(['timp', 0, ch[0] - 24, 1, 0.9], ['timp', 2.5, ch[0] - 24, 1, 0.6]);
        ev.push(['snare', 1, 0, 0, 0.6], ['snare', 3, 0, 0, 0.7]);
        if (i % 2) ev.push(['snare', 3.5, 0, 0, 0.35]);
        for (let k = 0; k < 8; k++) ev.push(['hat', k * 0.5, 0, 0, k % 2 ? 0.5 : 0.8]);
        for (const t of [0, 0.75, 1.5, 2.5, 3]) ev.push(['stac', t, a, 0.25, 0.7], ['stac', t, c, 0.25, 0.6]);
        ev.push(['strings', 0, a - 12, 4, 0.5], ['strings', 0, b, 4, 0.35]);
        if (i >= 2) for (const [n, t, l] of mel[i]) ev.push([lead, t, n, l * 0.9, 0.8]);
        if (i === 0) ev.push(['cym', 0, 0, 0, 0.8]);
        return ev;
      },
    };
  },
  // a great foe: brass stabs over pounding drums
  boss(stage) {
    const key = ([62, 64, 60][stage] || 62) - 2;
    const prog = [[key, 'min'], [key + 1, 'maj'], [key, 'min'], [key - 1, 'dim'], [key, 'min'], [key + 3, 'maj'], [key + 1, 'maj'], [key - 2, 'maj']];
    const scale = [0, 1, 3, 5, 7, 8, 10].map((x) => key + x);
    const mel = melody(prog, 4, 23, { lo: 64, hi: 80, rhythm: [[1, 1, 2], [0.5, 0.5, 1, 2], [2, 2], [1.5, 0.5, 2]], scale });
    return {
      bpm: 148, beats: 4, bars: 8, vol: 0.85,
      bar(i) {
        const ch = prog[i], [a, b, c] = tones(ch);
        const ev = [];
        for (let k = 0; k < 8; k++) ev.push(['bass', k * 0.5, ch[0] - 24, 0.4, 0.9], ['kick', k * 0.5, 0, 0, k % 2 ? 0.5 : 0.9]);
        ev.push(['snare', 1, 0, 0, 0.9], ['snare', 3, 0, 0, 0.9], ['snare', 3.75, 0, 0, 0.5]);
        ev.push(['timp', 0, ch[0] - 24, 1, 1], ['timp', 1.5, ch[0] - 24, 1, 0.7]);
        ev.push(['brass', 0, a - 12, 0.7, 0.9], ['brass', 0, c - 12, 0.7, 0.8], ['brass', 2.5, b - 12, 0.4, 0.7], ['brass', 3, a - 12, 0.9, 0.85]);
        ev.push(['strings', 0, a, 4, 0.6], ['strings', 0, c, 4, 0.5]);
        for (const [n, t, l] of mel[i]) ev.push(['brass', t, n, l * 0.85, 0.7]);
        if (i % 4 === 0) ev.push(['cym', 0, 0, 0, 1]);
        return ev;
      },
    };
  },
  // the final hour: choir and organ over a slow, heavy march
  final() {
    const key = 57;
    const prog = [[key, 'min'], [key + 5, 'min'], [key + 3, 'maj'], [key - 2, 'maj'], [key, 'min'], [key + 8, 'maj'], [key + 7, 'maj'], [key + 7, 'sus']];
    return {
      bpm: 104, beats: 4, bars: 8, vol: 0.9,
      bar(i) {
        const ch = prog[i], [a, b, c] = tones(ch);
        const ev = [['choir', 0, a, 4, 0.8], ['choir', 0, b, 4, 0.7], ['choir', 0, c + 12, 4, 0.6], ['organ', 0, ch[0] - 24, 4, 0.8]];
        ev.push(['timp', 0, ch[0] - 24, 1, 1], ['timp', 1, ch[0] - 24, 1, 0.6], ['timp', 2, ch[0] - 24, 1, 0.9], ['timp', 3, ch[0] - 24, 1, 0.6], ['timp', 3.5, ch[0] - 24, 1, 0.6]);
        ev.push(['brass', 0, a - 12, 1.5, 0.8], ['brass', 2, c - 12, 1.8, 0.7]);
        if (i % 2 === 1) ev.push(['cym', 0, 0, 0, 0.8]);
        return ev;
      },
    };
  },
  victory() {
    const fan = [[0, 72], [0.33, 72], [0.66, 72], [1, 76], [2, 79], [3, 84]];
    return {
      bpm: 100, beats: 4, bars: 4, once: true, vol: 1,
      bar(i) {
        if (i === 0) return fan.map(([t, n]) => ['brass', t, n, t < 1 ? 0.3 : 1, 0.9]).concat([['timp', 0, 48, 1, 1], ['cym', 3, 0, 0, 1]]);
        if (i === 1) return [['brass', 0, 79, 3.5, 0.9], ['brass', 0, 76, 3.5, 0.8], ['brass', 0, 72, 3.5, 0.8], ['strings', 0, 60, 4, 0.8], ['timp', 0, 48, 1, 1], ['timp', 0.5, 48, 1, 0.6]];
        return [['harp', 0, 72, 1, 0.5], ['harp', 1, 76, 1, 0.5], ['harp', 2, 79, 1, 0.5], ['harp', 3, 84, 1, 0.5], ['strings', 0, 65 + (i - 2) * 2, 4, 0.6]];
      },
    };
  },
  defeat() {
    const prog = [[57, 'min'], [53, 'maj'], [55, 'maj'], [52, 'min']];
    return {
      bpm: 66, beats: 4, bars: 4, vol: 0.9,
      bar(i) {
        const ch = prog[i], [a, b, c] = tones(ch);
        return [['strings', 0, a - 12, 4, 0.6], ['strings', 0, c - 12, 4, 0.5], ['harp', 0, a, 1, 0.5], ['harp', 1, b, 1, 0.4], ['harp', 2, c, 1, 0.4], ['flute', 2, c + 12, 2, 0.5]];
      },
    };
  },
};
