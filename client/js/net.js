// WebSocket connection: JSON control messages + binary snapshots, server clock estimation and
// a snapshot buffer for interpolation.
import { decodeSnapshot } from '/shared/protocol.js';

export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.ws = null;
    this.snaps = [];
    this.offset = null; // server time - local time (s)
    this.jitter = 0.01;
    this.delay = 0.12;
    this.rtt = 0;
    this.connected = false;
    this.cid = 0;
  }

  connect(room, name) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      this.connected = true;
      this.opened = true;
      this.send({ t: 'hello', room, name });
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 1000);
    };
    this.ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        let s;
        try { s = decodeSnapshot(e.data); } catch (err) { console.error('bad snapshot', err); return; }
        if (s) this.onSnap(s);
        return;
      }
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') {
        const r = performance.now() - m.c;
        this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r;
        return;
      }
      if (m.t === 'welcome') this.cid = m.cid;
      const fn = this.h['on_' + m.t];
      if (fn) fn(m);
    };
    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      if (!this.opened) { if (this.h.onFail) this.h.onFail(); return; }
      if (this.h.onClose) this.h.onClose();
    };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  onSnap(s) {
    const now = performance.now() / 1000;
    s.time = s.json.time;
    const sample = s.time - now;
    if (this.offset === null || Math.abs(sample - this.offset) > 2) this.offset = sample;
    else {
      const diff = sample - this.offset;
      this.offset += diff > 0 ? diff * 0.2 : diff * 0.01;
      this.jitter = this.jitter * 0.95 + Math.abs(diff) * 0.05;
    }
    this.delay = Math.min(0.3, Math.max(0.1, 0.075 + this.jitter * 2.5));
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
    if (this.h.onSnapshot) this.h.onSnapshot(s);
  }

  latest() {
    return this.snaps[this.snaps.length - 1] || null;
  }

  serverNow() {
    return this.offset === null ? 0 : performance.now() / 1000 + this.offset;
  }

  renderTime() {
    return this.serverNow() - this.delay;
  }

  bracket(t) {
    const s = this.snaps;
    if (!s.length) return null;
    if (t <= s[0].time) return [s[0], s[0], 0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].time <= t) {
        const a = s[i], b = s[i + 1];
        if (!b) return [a, a, 0];
        return [a, b, (t - a.time) / Math.max(1e-6, b.time - a.time)];
      }
    }
    return [s[0], s[0], 0];
  }

  reset() {
    this.snaps = [];
  }
}
