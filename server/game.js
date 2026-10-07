// Authoritative co-op game room: lobby (character select + ready up + host settings) and the run.
import { DT, PHASE, PS, MAX_PLAYERS, LOBBY_SPAWNS, LOBBY_SPEED, clamp } from '../shared/constants.js';
import { CHARACTERS } from '../shared/characters.js';
import { defaultSettings, SETTINGS } from '../shared/settings.js';
import { sanitizeMeta } from '../shared/meta.js';
import { Run } from './run.js';

const COUNTDOWN = 3.2;

export class Game {
  constructor(code, io = {}) {
    this.code = code;
    this.io = io;
    this.players = new Map(); // id -> lobby player
    this.nextId = 1;
    this.phase = PHASE.LOBBY;
    this.phaseT = 0;
    this.settings = defaultSettings();
    this.hostClient = -1;
    this.rosterDirty = true;
    this.tick = 0;
    this.time = 0;
    this.run = null;
  }

  setHost(cid) {
    if (this.hostClient !== cid) {
      this.hostClient = cid;
      this.rosterDirty = true;
    }
  }

  // ---------------------------------------------------------------- lobby
  addPlayer(clientId, name, c, meta, unlocks) {
    if (this.players.size >= MAX_PLAYERS) return { ok: false, why: 'full' };
    if (this.phase !== PHASE.LOBBY && this.phase !== PHASE.COUNTDOWN) return { ok: false, why: 'busy' };
    const used = new Set([...this.players.values()].map((p) => p.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const id = this.nextId++;
    const cleanName = String(name || '').replace(/[^\w \-'.!?]/g, '').trim().slice(0, 14) || `Traveler ${seat + 1}`;
    const ci = Number.isInteger(c) && c >= 0 && c < CHARACTERS.length ? c : seat % CHARACTERS.length;
    const [lx, lz] = LOBBY_SPAWNS[seat] || [0, 0];
    this.players.set(id, { id, clientId, name: cleanName, char: ci, ready: false, seat, meta: sanitizeMeta(meta), unlocks: Array.isArray(unlocks) ? unlocks.slice(0, 64) : [], lx, lz, ldx: 0, ldz: 1, lt: this.time });
    if (this.phase === PHASE.COUNTDOWN) this.setPhase(PHASE.LOBBY);
    this.rosterDirty = true;
    return { ok: true, id };
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    if (this.run) this.run.removePlayer(id);
    this.rosterDirty = true;
  }

  setCharacter(id, c) {
    const p = this.players.get(id);
    if (!p || this.phase !== PHASE.LOBBY || p.ready) return;
    c |= 0;
    if (c < 0 || c >= CHARACTERS.length) return;
    p.char = c;
    this.rosterDirty = true;
  }

  toggleReady(id, v) {
    const p = this.players.get(id);
    if (!p || (this.phase !== PHASE.LOBBY && this.phase !== PHASE.COUNTDOWN)) return;
    p.ready = typeof v === 'boolean' ? v : !p.ready;
    if (!p.ready && this.phase === PHASE.COUNTDOWN) this.setPhase(PHASE.LOBBY);
    this.rosterDirty = true;
  }

  setMeta(id, ranks, unlocks) {
    const p = this.players.get(id);
    if (!p || this.phase !== PHASE.LOBBY) return;
    p.meta = sanitizeMeta(ranks);
    if (Array.isArray(unlocks)) p.unlocks = unlocks.slice(0, 64);
  }

  setSetting(clientId, key, val) {
    if (clientId !== this.hostClient || (this.phase !== PHASE.LOBBY && this.phase !== PHASE.COUNTDOWN)) return;
    const d = SETTINGS.find((x) => x.key === key);
    if (!d) return;
    const v = Number(val) | 0;
    if (v < 0 || v >= d.options.length) return;
    this.settings[key] = v;
    this.rosterDirty = true;
  }

  // any traveler can pause the expedition for everyone (Esc menu); it resumes when they close it
  setPause(clientId, v) {
    const run = this.run;
    if (!run || run.phase === PHASE.OVER) return;
    const mine = [...this.players.values()].filter((p) => p.clientId === clientId);
    if (!mine.length) return;
    if (v) run.paused = { cid: clientId, name: mine[0].name };
    else run.paused = null;
  }

  dropPause(clientId) {
    if (this.run && this.run.paused && this.run.paused.cid === clientId) this.run.paused = null;
  }

  abandon(clientId) {
    if (clientId !== this.hostClient || !this.run || this.run.phase === PHASE.OVER) return;
    this.run.paused = null;
    this.run.finish('defeat');
  }

  backToLobby(clientId) {
    if (clientId !== this.hostClient || this.phase !== PHASE.OVER) return;
    this.endRun();
  }

  setPhase(ph) {
    this.phase = ph;
    this.phaseT = 0;
    this.rosterDirty = true;
  }

  roster() {
    return {
      t: 'roster',
      host: this.hostClient,
      phase: this.phase,
      phaseT: this.phaseT,
      settings: this.settings,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, char: p.char, ready: p.ready, seat: p.seat, client: p.clientId })),
    };
  }

  // ---------------------------------------------------------------- simulation
  step() {
    this.tick++;
    this.time += DT;
    this.phaseT += DT;
    switch (this.phase) {
      case PHASE.LOBBY: {
        const list = [...this.players.values()];
        if (list.length && list.every((p) => p.ready)) this.setPhase(PHASE.COUNTDOWN);
        break;
      }
      case PHASE.COUNTDOWN:
        if (!this.players.size) this.setPhase(PHASE.LOBBY);
        else if (this.phaseT >= COUNTDOWN) this.startRun();
        break;
      default:
        if (this.run) {
          if (!this.run.paused || this.run.phase === PHASE.OVER) this.run.step();
          if (this.run.phase !== this.phase) {
            this.phase = this.run.phase;
            this.rosterDirty = true;
          }
          if (this.phase === PHASE.OVER && this.run.overT > 40) this.endRun();
          if (!this.players.size) this.endRun();
        }
    }
  }

  startRun() {
    this.run = new Run(this, [...this.players.values()], { ...this.settings });
    this.phase = PHASE.RUN;
    this.phaseT = 0;
    this.rosterDirty = true;
  }

  endRun() {
    this.run = null;
    for (const p of this.players.values()) {
      p.ready = false;
      [p.lx, p.lz] = LOBBY_SPAWNS[p.seat] || [0, 0];
      p.ldx = 0;
      p.ldz = 1;
    }
    this.setPhase(PHASE.LOBBY);
  }

  playerPos(id, x, z, fx, fz) {
    if (this.run) this.run.playerPos(id, +x, +z, +fx, +fz);
    else if (this.phase === PHASE.LOBBY || this.phase === PHASE.COUNTDOWN) this.lobbyPos(id, +x, +z, +fx, +fz);
  }

  // walking around camp: positions come from each client, loosely speed-checked
  lobbyPos(id, x, z, dx, dz) {
    const p = this.players.get(id);
    if (!p || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const el = clamp(this.time - p.lt, 0, 0.5);
    p.lt = this.time;
    const max = LOBBY_SPEED * el * 1.6 + 0.4;
    let mx = clamp(x, -30, 30) - p.lx, mz = clamp(z, -24, 20) - p.lz;
    const d = Math.hypot(mx, mz);
    if (d > max) { mx *= max / d; mz *= max / d; }
    p.lx += mx;
    p.lz += mz;
    if (Number.isFinite(dx) && Number.isFinite(dz)) { p.ldx = dx; p.ldz = dz; }
  }

  lobbyState() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return { t: 'lp', p: [...this.players.values()].map((p) => [p.id, r2(p.lx), r2(p.lz), r2(p.ldx), r2(p.ldz)]) };
  }

  pick(id, i) {
    if (this.run) this.run.pick(id, i | 0);
  }

  snapshot() {
    return this.run ? this.run.snapshot() : null;
  }

  sendTo(clientId, msg) {
    if (this.io.sendTo) this.io.sendTo(clientId, msg);
  }
}

export { clamp, PS };
