// Offline play: the same authoritative Game the Node server runs, hosted inside the browser.
// Speaks the exact message protocol of Net (JSON control messages + binary snapshots), so the
// rest of the client can't tell the difference. Used for the instant demo and as a fallback
// when no camp server is reachable; couch co-op with controllers works the same way.
import { Game } from '../../server/game.js';
import { decodeSnapshot } from '/shared/protocol.js';
import { DT, SNAP_EVERY, TICK_RATE, MAX_PLAYERS } from '/shared/constants.js';

const CID = 1;

export class LocalNet {
  constructor(handlers) {
    this.h = handlers;
    this.snaps = [];
    this.offset = 0;
    this.delay = 0.1;
    this.rtt = 0;
    this.connected = false;
    this.cid = 0;
    this.offline = true;
    this.queue = [];
  }

  connect() {
    this.game = new Game('SOLO', { sendTo: (cid, msg) => this.post(msg) });
    this.game.setHost(CID);
    this.connected = true;
    this.mine = new Set();
    this.last = performance.now();
    this.acc = 0;
    this.tick = 0;
    this.timer = setInterval(() => this.step(), 4);
    this.post({ t: 'welcome', cid: CID, room: 'SOLO', tickRate: TICK_RATE, maxPlayers: MAX_PLAYERS });
  }

  // server -> client, delivered asynchronously like a socket would
  post(msg) {
    this.queue.push(msg);
    if (this.queue.length === 1) queueMicrotask(() => this.flush());
  }

  flush() {
    const q = this.queue;
    this.queue = [];
    for (const m of q) {
      if (m.t === 'welcome') this.cid = m.cid;
      const fn = this.h['on_' + m.t];
      if (fn) fn(m);
    }
  }

  // client -> server: mirrors the message switch in server/index.js
  send(msg) {
    const g = this.game;
    if (!g || !msg) return;
    switch (msg.t) {
      case 'join': {
        const res = g.addPlayer(CID, msg.name, msg.c, msg.meta);
        if (!res.ok) this.post({ t: 'nojoin', slot: msg.slot, why: res.why });
        else {
          this.mine.add(res.id);
          this.post({ t: 'joined', slot: msg.slot, id: res.id });
        }
        break;
      }
      case 'leave': if (this.mine.delete(msg.id)) g.removePlayer(msg.id); break;
      case 'char': if (this.mine.has(msg.id)) g.setCharacter(msg.id, msg.c); break;
      case 'ready': if (this.mine.has(msg.id)) g.toggleReady(msg.id, msg.v); break;
      case 'meta': if (this.mine.has(msg.id)) g.setMeta(msg.id, msg.ranks); break;
      case 'set': g.setSetting(CID, String(msg.key), msg.val); break;
      case 'pos':
        if (Array.isArray(msg.d)) for (const row of msg.d) if (this.mine.has(row[0])) g.playerPos(row[0], row[1], row[2], row[3], row[4]);
        break;
      case 'pick': if (this.mine.has(msg.id)) g.pick(msg.id, msg.i); break;
      case 'lobby': g.backToLobby(CID); break;
    }
  }

  step() {
    const now = performance.now();
    this.acc += (now - this.last) / 1000;
    this.last = now;
    if (this.acc > 0.25) this.acc = 0.25;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tick++;
      this.game.step();
      if (this.game.rosterDirty) {
        this.game.rosterDirty = false;
        this.post(this.game.roster());
      }
      if (this.tick % SNAP_EVERY === 0) {
        const buf = this.game.snapshot();
        if (buf) this.onSnap(decodeSnapshot(buf));
      }
    }
  }

  onSnap(s) {
    s.time = s.json.time;
    this.offset = s.time - performance.now() / 1000 + DT;
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
    if (this.h.onSnapshot) this.h.onSnapshot(s);
  }

  latest() {
    return this.snaps[this.snaps.length - 1] || null;
  }

  serverNow() {
    return performance.now() / 1000 + this.offset;
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
