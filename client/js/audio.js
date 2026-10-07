// Procedural audio (WebAudio). UI sounds for now; combat + music are filled in with the run.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.last = new Map();
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.2, attack = 0.005 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'move': this.tone(t, 0.06, { type: 'triangle', freq: 880, gain: 0.08 }); break;
      case 'confirm': this.tone(t, 0.12, { type: 'triangle', freq: 660, gain: 0.12 }); this.tone(t + 0.07, 0.2, { type: 'triangle', freq: 990, gain: 0.12 }); break;
      case 'back': this.tone(t, 0.12, { type: 'triangle', freq: 520, freqEnd: 330, gain: 0.1 }); break;
      case 'open': this.tone(t, 0.18, { type: 'sine', freq: 440, freqEnd: 880, gain: 0.1 }); break;
      case 'buy': [784, 988, 1175].forEach((f, i) => this.tone(t + i * 0.06, 0.25, { type: 'triangle', freq: f, gain: 0.1 })); break;
      case 'deny': this.tone(t, 0.15, { type: 'square', freq: 160, gain: 0.06 }); break;
      case 'join': [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.08, 0.3, { type: 'triangle', freq: f, gain: 0.1 })); break;
    }
  }
}
