// One expedition: authoritative simulation of the horde, weapons, pickups, level-ups, chests,
// bosses, downs/revives and the final result. Players' positions come from their clients
// (validated); everything else is decided here and streamed to clients 15x per second.
import {
  DT, PHASE, PS, PLAYER_RADIUS, BASE_MOVE_SPEED, VIEW_HX, VIEW_HZ, DESPAWN_RADIUS, REVIVE_RADIUS, REVIVE_TIME,
  LEVELUP_TIMEOUT, CHEST_TIME, MAX_WEAPONS, MAX_PASSIVES, xpForLevel, clamp,
} from '../shared/constants.js';
import { CHARACTERS } from '../shared/characters.js';
import {
  WEAPONS, PASSIVES, BASE_WEAPONS, PASSIVE_IDS, computeStats, weaponStats, maxLevel, orbitState,
  ORBIT_RADIUS, AURA_RADIUS, NOVA_RADIUS, CLEAVE_RADIUS,
} from '../shared/items.js';
import { ENEMIES, ENEMY_INDEX } from '../shared/enemies.js';
import { STAGES, TIMELINE, EVENTS } from '../shared/stages.js';
import { settingValue, DIFFICULTY } from '../shared/settings.js';
import { mulberry32, pickWeighted } from '../shared/rng.js';
import { encodeSnapshot, EF } from '../shared/protocol.js';

const MAX_ENEMY_R = 2.2;
const GEM_CAP = 450;
const r2 = (v) => Math.round(v * 100) / 100;

class Grid {
  constructor(cell = 2) {
    this.cell = cell;
    this.map = new Map();
    this.out = [];
  }
  key(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }
  rebuild(list) {
    this.map.clear();
    const c = this.cell;
    for (const e of list) {
      if (e.dead) continue;
      const k = this.key(Math.floor(e.x / c), Math.floor(e.z / c));
      let a = this.map.get(k);
      if (!a) this.map.set(k, (a = []));
      a.push(e);
    }
  }
  query(x, z, r) {
    const out = this.out;
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const a = this.map.get(this.key(cx, cz));
      if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
    }
    return out;
  }
}

export class Run {
  constructor(game, lobbyPlayers, settings) {
    this.game = game;
    this.settings = settings;
    this.stageIndex = settingValue(settings, 'stage');
    this.stage = STAGES[this.stageIndex] || STAGES[0];
    this.length = settingValue(settings, 'length') * 60;
    this.diff = DIFFICULTY[settingValue(settings, 'difficulty')] || DIFFICULTY[0];
    this.density = settingValue(settings, 'density');
    this.pickupMul = settingValue(settings, 'pickups');
    this.reviveOn = !!settingValue(settings, 'revive');
    this.seed = (Math.random() * 1e9) | 0;
    this.rand = mulberry32(this.seed);
    this.phase = PHASE.RUN;
    this.t = 0;
    this.overT = 0;
    this.result = null;
    this.players = new Map();
    this.enemies = [];
    this.enemyById = new Map();
    this.nextEnemyId = 1;
    this.grid = new Grid(2);
    this.projectiles = [];
    this.zones = [];
    this.eshots = [];
    this.waves = [];
    this.meteors = [];
    this.gems = new Map();
    this.overflowGem = null;
    this.pickups = new Map();
    this.nextId = 1;
    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.pendingLevels = 0;
    this.choices = new Map();
    this.levelT = 0;
    this.chest = null;
    this.spawnAcc = 0;
    this.eventIdx = 0;
    this.freezeT = 0;
    this.brazierT = 6;
    this.events = [];
    this.dmgNums = [];
    this.killList = [];
    this.gs = []; this.gm = []; this.gc = []; this.ps = []; this.pc = [];
    this.finalSpawned = false;

    const n = lobbyPlayers.length;
    lobbyPlayers.forEach((lp, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      const p = {
        id: lp.id, name: lp.name, char: lp.char, seat: lp.seat, clientId: lp.clientId, meta: lp.meta || {},
        x: n > 1 ? Math.cos(a) * 1.5 : 0, z: n > 1 ? Math.sin(a) * 1.5 : 0, fx: 1, dirx: 1, dirz: 0,
        state: PS.ALIVE, hp: 100, maxHp: 100, iframes: 1.5, reviveProg: 0,
        weapons: [], passives: {}, stats: null, ws: new Map(), pending: [],
        kills: 0, dmg: {}, gold: 0, lastPos: game.time, revival: 0,
      };
      this.players.set(p.id, p);
      this.addWeapon(p, CHARACTERS[p.char].weapon);
      this.recalc(p, true);
      p.revival = p.stats.revival;
    });
    this.xpNext = xpForLevel(1, this.players.size);
    for (const p of this.players.values()) this.syncInv(p);
    this.ev('warn', this.stage.name, this.stage.subtitle);
  }

  // ---------------------------------------------------------------- helpers
  ev(...a) { this.events.push(a); }
  id() { return this.nextId++; }
  alive() {
    const out = [];
    for (const p of this.players.values()) if (p.state === PS.ALIVE) out.push(p);
    return out;
  }
  frac() { return this.t / this.length; }
  coop() { return Math.max(1, this.players.size); }

  recalc(p, fill = false) {
    const prevMax = p.maxHp;
    p.stats = computeStats(p.char, p.passives, p.meta, this.level);
    p.maxHp = p.stats.maxHp;
    if (fill) p.hp = p.maxHp;
    else if (p.maxHp > prevMax) p.hp += p.maxHp - prevMax;
    p.hp = Math.min(p.hp, p.maxHp);
    p.ws.clear();
    for (const w of p.weapons) p.ws.set(w.id, weaponStats(w.id, w.lvl, p.stats));
  }

  addWeapon(p, id) {
    const w = { id, lvl: 1, timer: 0.4 + this.rand() * 0.4, t0: this.t, hits: new Map() };
    p.weapons.push(w);
    return w;
  }

  syncInv(p) {
    const s = p.stats;
    this.ev('inv', p.id, p.weapons.map((w) => [w.id, w.lvl, r2(w.t0)]), Object.entries(p.passives),
      { area: r2(s.area), speed: r2(s.speed), duration: r2(s.duration), amount: s.amount, magnet: r2(s.magnet), moveSpeed: r2(s.moveSpeed), cooldown: r2(s.cooldown), might: r2(s.might) });
  }

  nearestPlayer(x, z) {
    let best = null, bd = Infinity;
    for (const p of this.players.values()) {
      if (p.state !== PS.ALIVE) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // real enemies near a point, sorted by distance
  enemiesNear(x, z, r, n = 999) {
    const list = this.grid.query(x, z, r + MAX_ENEMY_R).filter((e) => !e.dead && !e.def.prop && (e.x - x) ** 2 + (e.z - z) ** 2 <= r * r);
    list.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
    return list.length > n ? list.slice(0, n) : list;
  }

  // ---------------------------------------------------------------- client input
  playerPos(id, x, z, dx, dz) {
    const p = this.players.get(id);
    if (!p || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const now = this.game.time;
    const el = clamp(now - p.lastPos, 0, 0.5);
    p.lastPos = now;
    if (p.state !== PS.ALIVE || this.phase !== PHASE.RUN) return;
    const max = BASE_MOVE_SPEED * p.stats.moveSpeed * el * 1.5 + 0.35;
    let mx = x - p.x, mz = z - p.z;
    const d = Math.hypot(mx, mz);
    if (d > max) { mx *= max / d; mz *= max / d; }
    p.x += mx;
    p.z += mz;
    if (Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > 0.1) {
      const l = Math.hypot(dx, dz);
      p.dirx = dx / l;
      p.dirz = dz / l;
      if (Math.abs(dx) > 0.15) p.fx = dx > 0 ? 1 : -1;
    }
  }

  removePlayer(id) {
    this.players.delete(id);
    this.choices.delete(id);
    if (this.phase === PHASE.LEVELUP) this.checkLevelDone();
  }

  // ---------------------------------------------------------------- main step
  step() {
    switch (this.phase) {
      case PHASE.RUN:
        this.stepRun();
        break;
      case PHASE.LEVELUP:
        this.levelT += DT;
        if (this.levelT > LEVELUP_TIMEOUT) {
          for (const [pid, c] of [...this.choices]) if (!c.picked) this.pick(pid, Math.floor(this.rand() * c.opts.length));
        }
        break;
      case PHASE.CHEST:
        this.chest.t -= DT;
        if (this.chest.t <= 0) {
          this.chest = null;
          this.phase = PHASE.RUN;
          this.maybeLevelUp();
        }
        break;
      case PHASE.OVER:
        this.overT += DT;
        break;
    }
  }

  stepRun() {
    this.t += DT;
    if (this.freezeT > 0) this.freezeT -= DT;
    this.grid.rebuild(this.enemies);
    this.spawning();
    this.updatePlayers();
    this.updateProjectiles();
    this.updateZones();
    this.updateMeteors();
    this.updateEnemies();
    this.updateEnemyShots();
    this.updateGems();
    this.cleanup();
    if (this.phase === PHASE.OVER) return;
    if (!this.alive().length) return this.finish('defeat');
    this.maybeLevelUp();
  }

  // ---------------------------------------------------------------- spawning
  spawnPoint(far = 0) {
    const al = this.alive();
    const p = al[Math.floor(this.rand() * al.length)] || { x: 0, z: 0, dirx: 0, dirz: 0 };
    let a = this.rand() * Math.PI * 2;
    // bias toward where the party is heading so the horde meets you
    if (this.rand() < 0.35 && Math.hypot(p.dirx, p.dirz) > 0.1) a = Math.atan2(p.dirz, p.dirx) + (this.rand() - 0.5) * 1.6;
    const k = 1.02 + this.rand() * 0.18 + far;
    return [p.x + Math.cos(a) * (VIEW_HX + 1.5) * k, p.z + Math.sin(a) * (VIEW_HZ + 1.5) * k];
  }

  hpMul() {
    return (1 + 2.4 * Math.min(1.2, this.frac())) * (1 + 0.65 * (this.coop() - 1)) * this.diff.hp;
  }

  spawnEnemy(typeId, x, z, opts = {}) {
    const def = ENEMIES[typeId];
    if (!def) return null;
    let id = this.nextEnemyId;
    for (let k = 0; k < 70000 && this.enemyById.has(id); k++) id = (id % 65535) + 1;
    this.nextEnemyId = (id % 65535) + 1;
    let hp = def.hp;
    if (def.boss) hp = def.hp * (1 + 0.65 * (this.coop() - 1)) * this.diff.hp * (1 + 0.5 * this.frac());
    else if (def.elite) hp = def.hp * this.hpMul() * 0.8;
    else if (!def.prop) hp = def.hp * this.hpMul();
    const e = {
      id, typeId, type: ENEMY_INDEX[typeId], def, x, z, kx: 0, kz: 0, hp, maxHp: hp,
      speed: def.speed * this.diff.speed * (0.92 + this.rand() * 0.16), r: def.r, mass: def.mass,
      flash: 0, frozen: 0, slow: 0, slowK: 1, atkCd: 0, target: null, retarget: 0, age: 0, left: false,
      phase: this.rand() * 10, abilityCd: 4, rangedCd: def.ranged ? def.ranged.cd * this.rand() : 0, dead: false,
      ...opts,
    };
    this.enemies.push(e);
    this.enemyById.set(id, e);
    return e;
  }

  maxEnemies() {
    return Math.min(720, Math.round((260 + 70 * this.coop()) * this.density));
  }

  spawning() {
    const f = this.frac();
    const seg = TIMELINE[Math.min(TIMELINE.length - 1, Math.floor(Math.min(0.999, f) * TIMELINE.length))];
    const roles = this.stage.roles;
    const cap = this.maxEnemies();
    const coopK = 1 + 0.35 * (this.coop() - 1);
    const lateK = f >= 1 ? 0.5 : 1;
    const minAlive = Math.round(seg.min * (1 + 0.4 * (this.coop() - 1)) * this.density * lateK);
    this.spawnAcc += seg.rate * coopK * this.density * lateK * DT;
    let burst = this.enemies.length < minAlive ? Math.min(8, minAlive - this.enemies.length) : 0;
    while ((this.spawnAcc >= 1 || burst > 0) && this.enemies.length < cap) {
      if (burst > 0) burst--;
      else this.spawnAcc -= 1;
      const role = pickWeighted(seg.mix, this.rand);
      const [x, z] = this.spawnPoint();
      this.spawnEnemy(roles[role], x, z);
    }
    if (this.spawnAcc > 4) this.spawnAcc = 4;
    while (this.eventIdx < EVENTS.length && f >= EVENTS[this.eventIdx].at) {
      this.runEvent(EVENTS[this.eventIdx]);
      this.eventIdx++;
    }
    // braziers to smash for goodies
    this.brazierT -= DT;
    if (this.brazierT <= 0) {
      this.brazierT = 22 / this.pickupMul;
      let props = 0;
      for (const e of this.enemies) if (e.def.prop) props++;
      if (props < 3 * this.coop()) {
        const [x, z] = this.spawnPoint(-0.35);
        this.spawnEnemy('brazier', x, z);
      }
    }
  }

  runEvent(evt) {
    const typeId = this.stage.roles[evt.role];
    const al = this.alive();
    if (!al.length) return;
    switch (evt.type) {
      case 'elite': {
        const [x, z] = this.spawnPoint();
        const e = this.spawnEnemy(typeId, x, z);
        if (e) this.ev('elite', e.id, e.type);
        break;
      }
      case 'boss':
      case 'final': {
        const [x, z] = this.spawnPoint(0.1);
        const e = this.spawnEnemy(typeId, x, z);
        if (e) {
          this.ev('boss', e.id, e.type, evt.type === 'final' ? 1 : 0);
          if (evt.type === 'final') this.finalSpawned = true;
        }
        break;
      }
      case 'swarm': {
        const p = al[Math.floor(this.rand() * al.length)];
        const a = this.rand() * Math.PI * 2;
        const dx = Math.cos(a), dz = Math.sin(a);
        const n = Math.round(evt.count * (1 + 0.3 * (this.coop() - 1)));
        for (let i = 0; i < n; i++) {
          const off = (this.rand() - 0.5) * 16;
          const back = 20 + this.rand() * 6;
          this.spawnEnemy(typeId, p.x - dx * back - dz * off, p.z - dz * back + dx * off, { swarm: [dx, dz], life: 14 });
        }
        this.ev('warn', 'A swarm approaches!', '');
        break;
      }
      case 'ring': {
        const p = al[Math.floor(this.rand() * al.length)];
        const n = Math.round(evt.count * (1 + 0.15 * (this.coop() - 1)));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawnEnemy(typeId, p.x + Math.cos(a) * 11, p.z + Math.sin(a) * 11, { ring: [p.x, p.z], life: 22 });
        }
        this.ev('warn', 'Encircled!', 'Break through the wall!');
        break;
      }
    }
  }

  // ---------------------------------------------------------------- players
  updatePlayers() {
    for (const p of this.players.values()) {
      if (p.iframes > 0) p.iframes -= DT;
      if (p.state === PS.DOWNED) {
        if (!this.reviveOn) continue;
        let helpers = 0, by = null;
        for (const q of this.players.values()) {
          if (q !== p && q.state === PS.ALIVE && Math.hypot(q.x - p.x, q.z - p.z) < REVIVE_RADIUS) { helpers++; by = q; }
        }
        if (helpers) p.reviveProg += (DT / REVIVE_TIME) * (1 + 0.5 * (helpers - 1));
        else p.reviveProg = Math.max(0, p.reviveProg - DT * 0.25);
        if (p.reviveProg >= 1) {
          p.state = PS.ALIVE;
          p.hp = Math.round(p.maxHp * 0.4);
          p.iframes = 2;
          p.reviveProg = 0;
          this.ev('up', p.id, by ? by.id : -1);
        }
        continue;
      }
      if (p.state !== PS.ALIVE) continue;
      if (p.stats.recovery > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.stats.recovery * DT);
      for (let i = p.pending.length - 1; i >= 0; i--) {
        if (this.t >= p.pending[i].at) {
          const s = p.pending[i];
          p.pending.splice(i, 1);
          this.doCleave(p, s.w, s.side);
        }
      }
      for (const w of p.weapons) this.tickWeapon(p, w);
    }
  }

  tickWeapon(p, w) {
    const ws = p.ws.get(w.id);
    if (!ws) return;
    if (ws.kind === 'aura') {
      w.timer -= DT;
      if (w.timer <= 0) {
        w.timer += ws.cd;
        const R = AURA_RADIUS * ws.area;
        let n = 0;
        for (const e of this.enemiesNear(p.x, p.z, R)) {
          this.hit(e, ws.dmg, p, w.id, e.x - p.x, e.z - p.z, ws.kb * 0.5);
          if (ws.slow) { e.slow = 0.5; e.slowK = 1 - ws.slow; }
          n++;
        }
        if (ws.heal && n) this.heal(p, ws.heal);
      }
      return;
    }
    if (ws.kind === 'orbit') {
      const st = orbitState(ws, w.t0, this.t);
      if (!st.active) return;
      const R = ORBIT_RADIUS * ws.area;
      const ang = this.t * 3.4 * ws.speed;
      const br = 0.6 * Math.max(1, ws.area * 0.9);
      for (let i = 0; i < ws.amount; i++) {
        const a = ang + (i / ws.amount) * Math.PI * 2;
        const bx = p.x + Math.cos(a) * R, bz = p.z + Math.sin(a) * R;
        for (const e of this.grid.query(bx, bz, br + MAX_ENEMY_R)) {
          if (e.dead || (e.x - bx) ** 2 + (e.z - bz) ** 2 > (br + e.r) ** 2) continue;
          if (this.t < (w.hits.get(e.id) || 0)) continue;
          w.hits.set(e.id, this.t + 0.45);
          this.hit(e, ws.dmg, p, w.id, e.x - p.x, e.z - p.z, ws.kb);
        }
      }
      if (w.hits.size > 500) for (const [k, v] of w.hits) if (v < this.t) w.hits.delete(k);
      return;
    }
    w.timer -= DT;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    switch (ws.kind) {
      case 'cleave':
        for (let i = 0; i < ws.amount; i++) p.pending.push({ at: this.t + i * 0.16, w, side: i % 2 ? -p.fx : p.fx });
        break;
      case 'bolt': {
        const targets = this.enemiesNear(p.x, p.z, 17, ws.amount);
        const speed = 15 * ws.speed;
        if (ws.fan) {
          const t0 = targets[0];
          const base = t0 ? Math.atan2(t0.z - p.z, t0.x - p.x) : Math.atan2(p.dirz, p.dirx);
          for (let i = 0; i < ws.amount; i++) {
            const a = base + (i - (ws.amount - 1) / 2) * 0.16;
            this.projectile(p, w.id, 'storm', p.x, p.z, Math.cos(a) * speed, Math.sin(a) * speed, 1.4, 0.35, ws);
          }
        } else {
          for (let i = 0; i < ws.amount; i++) {
            const t = targets[i % Math.max(1, targets.length)];
            let a = t ? Math.atan2(t.z - p.z, t.x - p.x) : Math.atan2(p.dirz, p.dirx) + (i - (ws.amount - 1) / 2) * 0.2;
            if (t && i >= targets.length) a += (this.rand() - 0.5) * 0.3;
            this.projectile(p, w.id, 'bolt', p.x, p.z, Math.cos(a) * speed, Math.sin(a) * speed, 1.3, 0.3, ws);
          }
        }
        break;
      }
      case 'fireball': {
        const pool = this.enemiesNear(p.x, p.z, 13, 30);
        for (let i = 0; i < ws.amount; i++) {
          const t = pool.length ? pool[Math.floor(this.rand() * pool.length)] : null;
          const a = t ? Math.atan2(t.z - p.z, t.x - p.x) : this.rand() * Math.PI * 2;
          const sp = 9 * ws.speed;
          this.projectile(p, w.id, 'orb', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 1.6, 0.4, ws, { explode: ws.explode * ws.area, pierce: 1 });
        }
        break;
      }
      case 'meteor': {
        const pool = this.enemiesNear(p.x, p.z, 15, 40);
        for (let i = 0; i < ws.amount; i++) {
          const t = pool.length ? pool[Math.floor(this.rand() * pool.length)] : null;
          const x = t ? t.x : p.x + (this.rand() - 0.5) * 16;
          const z = t ? t.z : p.z + (this.rand() - 0.5) * 12;
          const R = ws.explode * ws.area;
          const delay = 0.55 + i * 0.08;
          this.meteors.push({ x, z, r: R, at: this.t + delay, dmg: ws.dmg, owner: p, w: w.id, kb: ws.kb });
          this.ev('mt', r2(x), r2(z), r2(R), r2(delay));
        }
        break;
      }
      case 'knives': {
        const sp = 17 * ws.speed;
        const base = Math.atan2(p.dirz, p.dirx);
        for (let i = 0; i < ws.amount; i++) {
          const a = base + (i - (ws.amount - 1) / 2) * 0.09 + (this.rand() - 0.5) * 0.05;
          const off = (i - (ws.amount - 1) / 2) * 0.22;
          this.projectile(p, w.id, ws.evolved ? 'edge' : 'knife', p.x - Math.sin(base) * off, p.z + Math.cos(base) * off, Math.cos(a) * sp, Math.sin(a) * sp, 0.95, 0.28, ws);
        }
        break;
      }
      case 'flask': {
        const pool = this.enemiesNear(p.x, p.z, 9, 30);
        for (let i = 0; i < ws.amount; i++) {
          let tx, tz;
          const t = pool.length ? pool[Math.floor(this.rand() * pool.length)] : null;
          if (t) { tx = t.x + (this.rand() - 0.5); tz = t.z + (this.rand() - 0.5); }
          else {
            const a = this.rand() * Math.PI * 2, d = 3 + this.rand() * 4;
            tx = p.x + Math.cos(a) * d;
            tz = p.z + Math.sin(a) * d;
          }
          const flight = 0.55;
          const id = this.id();
          this.zones.push({ pending: true, id, at: this.t + flight, x: tx, z: tz, r: 1.6 * ws.area, life: 2.4 * ws.duration, tick: ws.tick, next: 0, dmg: ws.dmg, owner: p, w: w.id, slow: ws.slow, kind: ws.evolved ? 'plague' : 'acid' });
          this.ev('pj', id, 'flask', r2(p.x), r2(p.z), r2(tx), r2(tz), flight, p.id);
        }
        break;
      }
      case 'sigil': {
        const pool = this.enemiesNear(p.x, p.z, 15, 60);
        const used = new Set();
        for (let i = 0; i < ws.amount; i++) {
          let t = null;
          for (let k = 0; k < 6 && pool.length; k++) {
            const c = pool[Math.floor(this.rand() * pool.length)];
            if (!used.has(c)) { t = c; break; }
          }
          const x = t ? t.x : p.x + (this.rand() - 0.5) * 18;
          const z = t ? t.z : p.z + (this.rand() - 0.5) * 12;
          if (t) used.add(t);
          const R = 1.1 * ws.area;
          this.ev('zap', r2(x), r2(z), r2(R), ws.evolved ? 1 : 0);
          this.aoe(x, z, R, ws.dmg, p, w.id, ws.kb);
          if (ws.chain && t) {
            let from = t;
            for (let c = 0; c < ws.chain; c++) {
              const next = this.enemiesNear(from.x, from.z, 5, 6).find((e) => e !== from && !used.has(e));
              if (!next) break;
              used.add(next);
              this.ev('arc', r2(from.x), r2(from.z), r2(next.x), r2(next.z));
              this.hit(next, ws.dmg * 0.7, p, w.id, next.x - from.x, next.z - from.z, ws.kb);
              from = next;
            }
          }
        }
        break;
      }
      case 'nova': {
        const R = NOVA_RADIUS * ws.area;
        this.ev('nv', p.id, r2(R), ws.freeze ? 1 : 0);
        for (const e of this.enemiesNear(p.x, p.z, R)) {
          this.hit(e, ws.dmg, p, w.id, e.x - p.x, e.z - p.z, ws.kb);
          if (ws.freeze && !e.def.boss) e.frozen = Math.max(e.frozen, ws.freeze);
          else { e.slow = 1.5 * ws.duration; e.slowK = 1 - ws.slow; }
        }
        break;
      }
      case 'axe': {
        const base = Math.atan2(p.dirz, p.dirx);
        for (let i = 0; i < ws.amount; i++) {
          const a = base + (i - (ws.amount - 1) / 2) * 0.35;
          const sp = 13 * ws.speed;
          this.projectile(p, w.id, 'axe', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 3.2, 0.5 * ws.area, ws, { boomerang: true, tracked: true, rehit: 0.35 });
        }
        break;
      }
      case 'wisp': {
        const targets = this.enemiesNear(p.x, p.z, 16, ws.amount);
        for (let i = 0; i < ws.amount; i++) {
          const a = this.rand() * Math.PI * 2;
          const sp = 10 * ws.speed;
          this.projectile(p, w.id, 'wisp', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 2.6, 0.32, ws, { homing: targets[i % Math.max(1, targets.length)] || null, tracked: true });
        }
        break;
      }
    }
  }

  doCleave(p, w, side) {
    const ws = p.ws.get(w.id);
    if (!ws || p.state !== PS.ALIVE) return;
    const R = CLEAVE_RADIUS * ws.area;
    this.ev('sw', p.id, side, r2(R), ws.evolved ? 1 : 0);
    let hits = 0;
    for (const e of this.grid.query(p.x, p.z, R + MAX_ENEMY_R)) {
      if (e.dead) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      if (dx * side < -0.4 || Math.abs(dz) > R * 0.75 || dx * dx + dz * dz > (R + e.r) ** 2) continue;
      this.hit(e, e.def.prop ? 1 : ws.dmg, p, w.id, side, dz * 0.2, ws.kb);
      if (!e.def.prop) hits++;
    }
    if (ws.heal && hits) this.heal(p, Math.min(8, hits) * ws.heal);
  }

  projectile(p, w, kind, x, z, vx, vz, life, r, ws, extra = {}) {
    const pr = {
      id: this.id(), kind, w, owner: p, x, z, vx, vz, life, age: 0, r, dmg: ws.dmg, kb: ws.kb,
      pierce: extra.pierce ?? ws.pierce, hit: new Set(), hitT: new Map(), split: ws.split || 0, ...extra,
    };
    this.projectiles.push(pr);
    this.ev('pj', pr.id, kind, r2(x), r2(z), r2(vx), r2(vz), r2(life), p.id);
    return pr;
  }

  heal(p, amt) {
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + amt);
  }

  // ---------------------------------------------------------------- projectiles / zones / meteors
  updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.age += DT;
      let remove = pr.age >= pr.life;
      if (pr.boomerang) {
        // fly out, slow down, come back to the thrower
        const o = pr.owner;
        if (pr.age > 0.45) {
          const dx = o.x - pr.x, dz = o.z - pr.z, d = Math.hypot(dx, dz) || 1;
          const sp = Math.min(18, 6 + (pr.age - 0.45) * 22);
          pr.vx += ((dx / d) * sp - pr.vx) * Math.min(1, DT * 5);
          pr.vz += ((dz / d) * sp - pr.vz) * Math.min(1, DT * 5);
          if (d < 0.7 && pr.age > 0.7) remove = true;
        } else {
          pr.vx *= 1 - DT * 2.2;
          pr.vz *= 1 - DT * 2.2;
        }
      } else if (pr.homing !== undefined) {
        let t = pr.homing;
        if (!t || t.dead) t = pr.homing = this.enemiesNear(pr.x, pr.z, 12, 1)[0] || null;
        if (t) {
          const want = Math.atan2(t.z - pr.z, t.x - pr.x);
          const cur = Math.atan2(pr.vz, pr.vx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const turn = clamp(d, -7 * DT, 7 * DT);
          const sp = Math.hypot(pr.vx, pr.vz);
          pr.vx = Math.cos(cur + turn) * sp;
          pr.vz = Math.sin(cur + turn) * sp;
        }
      }
      pr.x += pr.vx * DT;
      pr.z += pr.vz * DT;
      if (!remove) {
        for (const e of this.grid.query(pr.x, pr.z, pr.r + MAX_ENEMY_R)) {
          if (e.dead || (e.x - pr.x) ** 2 + (e.z - pr.z) ** 2 > (pr.r + e.r) ** 2) continue;
          if (pr.rehit) {
            if ((pr.hitT.get(e.id) || 0) > this.t) continue;
            pr.hitT.set(e.id, this.t + pr.rehit);
          } else {
            if (pr.hit.has(e.id)) continue;
            pr.hit.add(e.id);
          }
          if (pr.explode) {
            this.explode(pr.x, pr.z, pr.explode, pr.dmg, pr.owner, pr.w, pr.kb, 'fire');
            pr.exploded = true;
            remove = true;
            break;
          }
          this.hit(e, pr.dmg, pr.owner, pr.w, pr.vx, pr.vz, pr.kb);
          if (pr.split && !pr.child) {
            for (let k = 0; k < pr.split; k++) {
              const a = Math.atan2(pr.vz, pr.vx) + (k ? 1 : -1) * 0.9;
              const c = this.projectile(pr.owner, pr.w, 'wisp', pr.x, pr.z, Math.cos(a) * 9, Math.sin(a) * 9, 1.2, 0.26, { dmg: pr.dmg * 0.5, kb: pr.kb, pierce: 1 }, { homing: null, tracked: true, child: true });
              c.hit.add(e.id);
            }
          }
          if (--pr.pierce <= 0 && !pr.rehit) {
            remove = true;
            break;
          }
        }
      }
      if (remove) {
        if (pr.explode && !pr.exploded) this.explode(pr.x, pr.z, pr.explode, pr.dmg, pr.owner, pr.w, pr.kb, 'fire');
        this.projectiles.splice(i, 1);
        this.ev('pd', pr.id);
      }
    }
  }

  explode(x, z, R, dmg, owner, w, kb, kind) {
    this.ev('ex', r2(x), r2(z), r2(R), kind);
    this.aoe(x, z, R, dmg, owner, w, kb);
  }

  aoe(x, z, R, dmg, owner, w, kb) {
    for (const e of [...this.grid.query(x, z, R + MAX_ENEMY_R)]) {
      if (e.dead || (e.x - x) ** 2 + (e.z - z) ** 2 > (R + e.r) ** 2) continue;
      this.hit(e, dmg, owner, w, e.x - x, e.z - z, kb);
    }
  }

  updateZones() {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.pending) {
        if (this.t < z.at) continue;
        z.pending = false;
        this.ev('zn', z.id, r2(z.x), r2(z.z), r2(z.r), r2(z.life), z.kind);
      }
      z.life -= DT;
      if (z.life <= 0) {
        this.zones.splice(i, 1);
        continue;
      }
      z.next -= DT;
      if (z.next > 0) continue;
      z.next = z.tick;
      for (const e of [...this.grid.query(z.x, z.z, z.r + MAX_ENEMY_R)]) {
        if (e.dead || (e.x - z.x) ** 2 + (e.z - z.z) ** 2 > (z.r + e.r * 0.5) ** 2) continue;
        this.hit(e, z.dmg, z.owner, z.w, 0, 0, 0);
        if (z.slow) { e.slow = 0.6; e.slowK = 1 - z.slow; }
      }
    }
  }

  updateMeteors() {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (this.t < m.at) continue;
      this.meteors.splice(i, 1);
      this.explode(m.x, m.z, m.r, m.dmg, m.owner, m.w, m.kb, 'meteor');
    }
  }

  // ---------------------------------------------------------------- damage
  hit(e, dmg, owner, w, dx, dz, kb) {
    if (e.dead) return;
    dmg = Math.max(1, dmg * (0.9 + this.rand() * 0.2));
    e.hp -= dmg;
    e.flash = 0.12;
    if (owner) owner.dmg[w] = (owner.dmg[w] || 0) + dmg;
    if (!e.def.prop) {
      if (this.dmgNums.length < 240) this.dmgNums.push([e.id, dmg, dmg >= 40]);
      if (kb && !e.def.boss && e.mass < 50) {
        const l = Math.hypot(dx, dz) || 1;
        const k = (kb * 5.5) / Math.max(0.5, e.mass);
        e.kx += (dx / l) * k;
        e.kz += (dz / l) * k;
      }
    }
    if (e.hp <= 0) this.kill(e, owner);
  }

  kill(e, owner) {
    e.dead = true;
    this.killList.push(e.id);
    const def = e.def;
    if (def.prop) {
      this.dropFromBrazier(e.x, e.z);
      return;
    }
    this.kills++;
    if (owner) owner.kills++;
    if (def.xp) this.dropGem(e.x, e.z, def.xp);
    if (def.elite || (def.boss && !def.final)) {
      this.spawnPickup('chest', e.x, e.z);
      if (def.boss) for (let i = 0; i < 6; i++) this.dropGem(e.x + (this.rand() - 0.5) * 3, e.z + (this.rand() - 0.5) * 3, Math.round(def.xp / 6));
    }
    if (def.final) {
      this.finish('victory');
      return;
    }
    const luck = owner ? owner.stats.luck : 1;
    const r = this.rand();
    if (r < 0.012 * luck * this.pickupMul) this.spawnPickup('coin', e.x, e.z);
    else if (r < 0.015 * luck * this.pickupMul) this.spawnPickup('bag', e.x, e.z);
    else if (r < 0.0165 * luck * this.pickupMul) this.spawnPickup('roast', e.x, e.z);
  }

  dropFromBrazier(x, z) {
    this.spawnPickup(pickWeighted([['roast', 34], ['bag', 18], ['coin', 14], ['lodestone', 13], ['freeze', 8], ['starfall', 8]], this.rand), x, z);
  }

  dropGem(x, z, v) {
    if (this.gems.size >= GEM_CAP) {
      if (!this.overflowGem || !this.gems.has(this.overflowGem.id)) {
        this.overflowGem = { id: this.id(), x, z, v: 0, tier: 3, mag: 0, spd: 0 };
        this.gems.set(this.overflowGem.id, this.overflowGem);
        this.gs.push([this.overflowGem.id, r2(x), r2(z), 3]);
      }
      this.overflowGem.v += v;
      return;
    }
    const g = { id: this.id(), x: x + (this.rand() - 0.5) * 0.4, z: z + (this.rand() - 0.5) * 0.4, v, tier: v >= 10 ? 3 : v >= 3 ? 2 : 1, mag: 0, spd: 0 };
    this.gems.set(g.id, g);
    this.gs.push([g.id, r2(g.x), r2(g.z), g.tier]);
  }

  spawnPickup(kind, x, z) {
    const pk = { id: this.id(), kind, x, z, mag: 0, spd: 0 };
    this.pickups.set(pk.id, pk);
    this.ps.push([pk.id, kind, r2(x), r2(z)]);
  }

  damagePlayer(p, dmg) {
    if (p.state !== PS.ALIVE || p.iframes > 0) return;
    const d = Math.max(1, Math.round(dmg * this.diff.dmg - p.stats.armor));
    p.hp -= d;
    p.iframes = 0.15;
    this.ev('hurt', p.id, d);
    if (p.hp > 0) return;
    if (p.revival > 0) {
      p.revival--;
      p.hp = Math.round(p.maxHp * 0.5);
      p.iframes = 2.5;
      this.ev('rv', p.id);
      for (const e of this.enemiesNear(p.x, p.z, 5)) this.hit(e, 80, p, 'revival', e.x - p.x, e.z - p.z, 3);
      return;
    }
    p.hp = 0;
    p.state = PS.DOWNED;
    p.reviveProg = 0;
    p.pending.length = 0;
    this.ev('dn', p.id, this.reviveOn ? 1 : 0);
  }

  // ---------------------------------------------------------------- enemies
  updateEnemies() {
    const frozenAll = this.freezeT > 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += DT;
      if (e.flash > 0) e.flash -= DT;
      if (e.atkCd > 0) e.atkCd -= DT;
      const def = e.def;
      if (def.prop) continue;
      if (e.life !== undefined) {
        e.life -= DT;
        if (e.life <= 0) { e.dead = true; e.silent = true; continue; }
      }
      if (e.kx || e.kz) {
        e.x += e.kx * DT;
        e.z += e.kz * DT;
        const k = Math.exp(-DT * 9);
        e.kx *= k;
        e.kz *= k;
        if (Math.abs(e.kx) + Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
      }
      if (e.frozen > 0) { e.frozen -= DT; continue; }
      if (frozenAll && !def.boss) continue;
      let sp = e.speed;
      if (e.slow > 0) { e.slow -= DT; sp *= e.slowK; }
      if (--e.retarget <= 0 || !e.target || e.target.state !== PS.ALIVE) {
        e.target = this.nearestPlayer(e.x, e.z);
        e.retarget = 8 + (e.id % 8);
      }
      const t = e.target;
      let mx = 0, mz = 0;
      if (e.swarm) {
        mx = e.swarm[0];
        mz = e.swarm[1];
        sp *= 1.25;
      } else if (e.ring) {
        const dx = e.ring[0] - e.x, dz = e.ring[1] - e.z, d = Math.hypot(dx, dz) || 1;
        if (d > 2.5) { mx = dx / d; mz = dz / d; }
      } else if (t) {
        const dx = t.x - e.x, dz = t.z - e.z, d = Math.hypot(dx, dz) || 1;
        mx = dx / d;
        mz = dz / d;
        if (def.wavy) {
          const wv = Math.sin(e.age * 3 + e.phase) * 0.6;
          mx -= mz * wv;
          mz += (dx / d) * wv;
        }
        if (def.ranged) {
          if (d < def.ranged.range * 0.7) { mx *= -0.4; mz *= -0.4; }
          e.rangedCd -= DT;
          if (e.rangedCd <= 0 && d < def.ranged.range * 1.3) {
            e.rangedCd = def.ranged.cd;
            const s = def.ranged.speed;
            this.enemyShot('orb', e.x, e.z, (dx / d) * s, (dz / d) * s, def.ranged.dmg, 3, 0.35);
          }
        }
        // left far behind the party? reappear ahead of it (keeps the pressure on)
        if (d > DESPAWN_RADIUS && !def.boss) {
          const [nx, nz] = this.spawnPoint();
          e.x = nx;
          e.z = nz;
          continue;
        }
        if (def.boss) this.bossAbility(e, t, d);
        if (e.charging > 0) {
          e.charging -= DT;
          mx = e.cdx;
          mz = e.cdz;
          sp *= 3.2;
        } else if (e.telegraph > 0) {
          e.telegraph -= DT;
          sp = 0;
          if (e.telegraph <= 0) e.charging = 1.1;
        }
      }
      e.x += mx * sp * DT;
      e.z += mz * sp * DT;
      if (Math.abs(mx) > 0.05) e.left = mx < 0;
    }
    // separation (neighbours only)
    for (const e of this.enemies) {
      if (e.dead || e.def.prop || e.def.fly) continue;
      let n = 0;
      for (const o of this.grid.query(e.x, e.z, e.r + 0.6)) {
        if (o === e || o.dead || o.def.prop || o.def.fly) continue;
        const dx = e.x - o.x, dz = e.z - o.z;
        const rr = e.r + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = ((rr - d) / d) * 0.5;
        const wE = o.mass / (e.mass + o.mass);
        e.x += dx * push * wE;
        e.z += dz * push * wE;
        if (++n > 6) break;
      }
    }
    // contact damage
    for (const e of this.enemies) {
      if (e.dead || e.def.prop || e.atkCd > 0 || e.frozen > 0) continue;
      for (const p of this.players.values()) {
        if (p.state !== PS.ALIVE) continue;
        const rr = e.r + PLAYER_RADIUS;
        if ((p.x - e.x) ** 2 + (p.z - e.z) ** 2 < rr * rr) {
          this.damagePlayer(p, e.def.dmg * (1 + 0.5 * this.frac()));
          e.atkCd = 0.6;
          break;
        }
      }
    }
  }

  bossAbility(e, t, d) {
    e.abilityCd -= DT;
    if (e.abilityCd > 0) return;
    switch (e.def.ability) {
      case 'roots': {
        e.abilityCd = 7;
        const n = 12;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawnEnemy(this.stage.roles.thorn, t.x + Math.cos(a) * 5, t.z + Math.sin(a) * 5, { ring: [t.x, t.z], life: 9 });
        }
        this.ev('ab', e.id, 'roots');
        break;
      }
      case 'quake': {
        e.abilityCd = 5.5;
        const id = this.id();
        this.waves.push({ id, x: e.x, z: e.z, r: 0.5, speed: 7, max: 11, hit: new Set(), dmg: e.def.dmg * 0.9 });
        this.ev('wave', id, r2(e.x), r2(e.z), 7, 11);
        break;
      }
      case 'charge': {
        e.abilityCd = 5;
        const l = d || 1;
        e.cdx = (t.x - e.x) / l;
        e.cdz = (t.z - e.z) / l;
        e.telegraph = 0.85;
        this.ev('tg', e.id, r2(e.cdx), r2(e.cdz), 0.85);
        break;
      }
      case 'orbs': {
        e.abilityCd = 3.2;
        const n = 14;
        const off = this.rand() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          this.enemyShot('dark', e.x, e.z, Math.cos(a) * 5.5, Math.sin(a) * 5.5, e.def.dmg * 0.7, 4, 0.45);
        }
        if (this.rand() < 0.35) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.spawnEnemy(this.stage.roles.ghost, e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3);
          }
        }
        this.ev('ab', e.id, 'orbs');
        break;
      }
    }
  }

  enemyShot(kind, x, z, vx, vz, dmg, life, r) {
    const s = { id: this.id(), kind, x, z, vx, vz, dmg, life, r };
    this.eshots.push(s);
    this.ev('es', s.id, kind, r2(x), r2(z), r2(vx), r2(vz), r2(life));
  }

  updateEnemyShots() {
    if (this.freezeT > 0) return;
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const s = this.eshots[i];
      s.life -= DT;
      s.x += s.vx * DT;
      s.z += s.vz * DT;
      let gone = s.life <= 0;
      if (!gone) {
        for (const p of this.players.values()) {
          if (p.state !== PS.ALIVE) continue;
          if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 < (s.r + PLAYER_RADIUS) ** 2) {
            this.damagePlayer(p, s.dmg);
            gone = true;
            break;
          }
        }
      }
      if (gone) {
        this.eshots.splice(i, 1);
        this.ev('ed', s.id);
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.speed * DT;
      for (const p of this.players.values()) {
        if (p.state !== PS.ALIVE || w.hit.has(p.id)) continue;
        if (Math.abs(Math.hypot(p.x - w.x, p.z - w.z) - w.r) < 0.6) {
          w.hit.add(p.id);
          this.damagePlayer(p, w.dmg);
        }
      }
      if (w.r >= w.max) this.waves.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- gems & pickups
  updateGems() {
    const al = this.alive();
    for (const g of [...this.gems.values()]) this.attract(g, al, true);
    for (const pk of [...this.pickups.values()]) this.attract(pk, al, false);
  }

  attract(o, al, isGem) {
    if (!o.mag) {
      for (const p of al) {
        const R = o.kind === 'chest' ? 0.9 : p.stats.magnet;
        if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < R * R) {
          if (o.kind === 'chest') {
            if (this.phase === PHASE.RUN) this.openChest(p, o);
            return;
          }
          o.mag = p.id;
          o.spd = 2;
          if (isGem) this.gm.push([o.id, p.id]);
          else this.pc.push([o.id, p.id, 0]);
          break;
        }
      }
      return;
    }
    const p = this.players.get(o.mag);
    if (!p || p.state !== PS.ALIVE) {
      o.mag = 0;
      return;
    }
    o.spd = Math.min(26, o.spd + DT * 40);
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d < 0.5) {
      if (isGem) this.collectGem(o, p);
      else this.collectPickup(o, p);
      return;
    }
    const step = Math.min(d, o.spd * DT);
    o.x += (dx / d) * step;
    o.z += (dz / d) * step;
  }

  collectGem(g, p) {
    this.gems.delete(g.id);
    this.xp += g.v * p.stats.growth;
    this.gc.push([g.id, p.id]);
  }

  collectPickup(pk, p) {
    this.pickups.delete(pk.id);
    this.pc.push([pk.id, p.id, 1]);
    switch (pk.kind) {
      case 'roast': this.heal(p, 30); break;
      case 'coin': p.gold += Math.round(1 * p.stats.greed); break;
      case 'bag': p.gold += Math.round(10 * p.stats.greed); break;
      case 'lodestone':
        for (const g of this.gems.values()) if (!g.mag) { g.mag = p.id; g.spd = 6; this.gm.push([g.id, p.id]); }
        break;
      case 'freeze': this.freezeT = 6; break;
      case 'starfall':
        for (const e of this.enemiesNear(p.x, p.z, 22)) this.hit(e, e.def.boss ? 300 : e.hp + 1, p, 'starfall', 0, 0, 0);
        break;
    }
    this.ev('pu', p.id, pk.kind);
  }

  // ---------------------------------------------------------------- level ups
  maybeLevelUp() {
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level, this.players.size);
      this.pendingLevels++;
      for (const p of this.players.values()) {
        const before = p.maxHp;
        this.recalc(p);
        if (p.maxHp !== before) this.syncInv(p);
      }
    }
    if (this.pendingLevels > 0 && this.phase === PHASE.RUN) this.startLevelUp();
  }

  startLevelUp() {
    this.phase = PHASE.LEVELUP;
    this.levelT = 0;
    this.choices.clear();
    const lvl = this.level - this.pendingLevels + 1;
    this.ev('lvl', lvl);
    for (const p of this.players.values()) {
      const opts = this.rollOptions(p);
      this.choices.set(p.id, { opts, picked: false });
      this.game.sendTo(p.clientId, { t: 'choices', id: p.id, opts, level: lvl });
    }
    if (!this.choices.size) this.checkLevelDone();
  }

  rollOptions(p) {
    const pool = [];
    const owned = new Set(p.weapons.map((w) => w.id));
    for (const w of p.weapons) if (w.lvl < maxLevel(w.id)) pool.push([{ k: 'w', id: w.id, lvl: w.lvl + 1 }, 3]);
    if (p.weapons.length < MAX_WEAPONS) {
      for (const id of BASE_WEAPONS) {
        const evolvedOwned = WEAPONS[id].evolve && owned.has(WEAPONS[id].evolve.into);
        if (!owned.has(id) && !evolvedOwned) pool.push([{ k: 'w', id, lvl: 1, new: true }, 1.6]);
      }
    }
    for (const [id, lvl] of Object.entries(p.passives)) if (lvl < PASSIVES[id].max) pool.push([{ k: 'p', id, lvl: lvl + 1 }, 2.4]);
    if (Object.keys(p.passives).length < MAX_PASSIVES) for (const id of PASSIVE_IDS) if (!p.passives[id]) pool.push([{ k: 'p', id, lvl: 1, new: true }, 1.3]);
    const n = this.rand() < Math.min(0.6, (p.stats.luck - 1) * 0.6 + 0.08) ? 4 : 3;
    const out = [];
    while (out.length < n && pool.length) {
      const idx = pickWeighted(pool.map((x, i) => [i, x[1]]), this.rand);
      out.push(pool[idx][0]);
      pool.splice(idx, 1);
    }
    if (!out.length) out.push({ k: 'gold', v: 25 }, { k: 'heal', v: 40 });
    return out;
  }

  pick(id, i) {
    const c = this.choices.get(id);
    const p = this.players.get(id);
    if (!c || c.picked || !p || this.phase !== PHASE.LEVELUP) return;
    const opt = c.opts[clamp(i | 0, 0, c.opts.length - 1)];
    c.picked = true;
    this.applyUpgrade(p, opt);
    this.ev('pick', p.id, opt.k, opt.id || '', opt.lvl || 0);
    this.checkLevelDone();
  }

  applyUpgrade(p, opt) {
    if (opt.k === 'w') {
      const w = p.weapons.find((x) => x.id === opt.id);
      if (w) w.lvl = Math.min(maxLevel(w.id), w.lvl + 1);
      else if (p.weapons.length < MAX_WEAPONS) this.addWeapon(p, opt.id);
    } else if (opt.k === 'p') {
      p.passives[opt.id] = Math.min(PASSIVES[opt.id].max, (p.passives[opt.id] || 0) + 1);
    } else if (opt.k === 'gold') p.gold += opt.v;
    else if (opt.k === 'heal') this.heal(p, opt.v);
    this.recalc(p);
    this.syncInv(p);
  }

  checkLevelDone() {
    if (this.phase !== PHASE.LEVELUP) return;
    for (const c of this.choices.values()) if (!c.picked) return;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    this.choices.clear();
    this.phase = PHASE.RUN;
    if (this.pendingLevels > 0) this.startLevelUp();
  }

  // ---------------------------------------------------------------- chests
  openChest(p, pk) {
    this.pickups.delete(pk.id);
    this.pc.push([pk.id, p.id, 1]);
    const rewards = [];
    for (const w of p.weapons) {
      const evo = WEAPONS[w.id].evolve;
      if (evo && w.lvl >= maxLevel(w.id) && p.passives[evo.with]) {
        w.id = evo.into;
        w.lvl = 1;
        w.t0 = this.t;
        w.hits.clear();
        rewards.push({ k: 'w', id: evo.into, lvl: 1, evo: 1 });
        break;
      }
    }
    if (!rewards.length) {
      const r = this.rand() / Math.max(1, p.stats.luck * 0.9);
      const n = r < 0.08 ? 5 : r < 0.3 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const cands = [];
        for (const w of p.weapons) if (w.lvl < maxLevel(w.id)) cands.push({ k: 'w', id: w.id });
        for (const [id, lvl] of Object.entries(p.passives)) if (lvl < PASSIVES[id].max) cands.push({ k: 'p', id });
        if (!cands.length) break;
        const c = cands[Math.floor(this.rand() * cands.length)];
        if (c.k === 'w') {
          const w = p.weapons.find((x) => x.id === c.id);
          w.lvl++;
          rewards.push({ k: 'w', id: c.id, lvl: w.lvl });
        } else {
          p.passives[c.id]++;
          rewards.push({ k: 'p', id: c.id, lvl: p.passives[c.id] });
        }
      }
    }
    const gold = Math.round((15 + this.rand() * 35) * p.stats.greed);
    p.gold += gold;
    this.recalc(p);
    this.syncInv(p);
    this.ev('chest', p.id, rewards, gold);
    this.phase = PHASE.CHEST;
    this.chest = { t: CHEST_TIME + rewards.length * 0.35 };
  }

  // ---------------------------------------------------------------- end of run
  cleanup() {
    let any = false;
    for (const e of this.enemies) if (e.dead) { any = true; break; }
    if (!any) return;
    this.enemies = this.enemies.filter((e) => {
      if (!e.dead) return true;
      this.enemyById.delete(e.id);
      if (e.silent) this.killList.push(e.id);
      return false;
    });
  }

  finish(result) {
    if (this.phase === PHASE.OVER) return;
    this.phase = PHASE.OVER;
    this.result = result;
    this.overT = 0;
    const minutes = Math.floor(this.t / 60);
    const stats = [...this.players.values()].map((p) => {
      const bonus = this.level * 4 + minutes * 12 + (result === 'victory' ? 250 : 0);
      p.gold += Math.round(bonus * p.stats.greed);
      const dmg = Object.entries(p.dmg).sort((a, b) => b[1] - a[1]).map(([w, d]) => [w, Math.round(d)]);
      return { id: p.id, name: p.name, char: p.char, kills: p.kills, gold: p.gold, dmg, total: dmg.reduce((s, x) => s + x[1], 0), weapons: p.weapons.map((w) => [w.id, w.lvl]), passives: Object.entries(p.passives) };
    });
    this.ev('over', result, stats, Math.round(this.t), this.level, this.kills);
  }

  // ---------------------------------------------------------------- networking
  fullState() {
    return {
      t: 'state',
      players: [...this.players.values()].map((p) => ({ id: p.id, weapons: p.weapons.map((w) => [w.id, w.lvl, r2(w.t0)]), passives: Object.entries(p.passives) })),
      gems: [...this.gems.values()].map((g) => [g.id, r2(g.x), r2(g.z), g.tier]),
      pickups: [...this.pickups.values()].map((k) => [k.id, k.kind, r2(k.x), r2(k.z)]),
      zones: this.zones.filter((z) => !z.pending).map((z) => [z.id, r2(z.x), r2(z.z), r2(z.r), r2(z.life), z.kind]),
    };
  }

  snapshot() {
    let ox = 0, oz = 0, n = 0;
    for (const p of this.players.values()) { ox += p.x; oz += p.z; n++; }
    if (n) { ox /= n; oz /= n; }
    const enemies = [];
    const bars = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      let f = 0;
      if (e.flash > 0) f |= EF.FLASH;
      if (e.left) f |= EF.LEFT;
      if (e.frozen > 0 || (this.freezeT > 0 && !e.def.boss)) f |= EF.FROZEN;
      if (e.def.elite) f |= EF.ELITE;
      if (e.def.boss) f |= EF.BOSS;
      if (e.slow > 0) f |= EF.SLOW;
      if (e.age < 0.4) f |= EF.SPAWN;
      enemies.push({ id: e.id, type: e.type, flags: f, x: e.x, z: e.z });
      if (e.def.elite || e.def.boss) bars.push([e.id, Math.max(0, e.hp / e.maxHp)]);
    }
    const tp = [];
    for (const pr of this.projectiles) if (pr.tracked) tp.push([pr.id, r2(pr.x), r2(pr.z)]);
    const json = {
      time: Math.round(this.game.time * 1000) / 1000,
      ph: this.phase,
      rt: r2(this.t),
      len: this.length,
      stage: this.stageIndex,
      lv: this.level,
      xp: Math.floor(this.xp),
      xn: this.xpNext,
      k: this.kills,
      fz: this.freezeT > 0 ? 1 : 0,
      p: [...this.players.values()].map((p) => [p.id, r2(p.x), r2(p.z), p.fx, Math.ceil(p.hp), p.maxHp, p.state, Math.round(p.reviveProg * 100), p.iframes > 0.3 ? 1 : 0, p.gold, p.kills]),
      ev: this.events,
      gs: this.gs, gm: this.gm, gc: this.gc, ps: this.ps, pc: this.pc, tp,
      waiting: this.phase === PHASE.LEVELUP ? [...this.choices].filter(([, c]) => !c.picked).map(([id]) => id) : undefined,
      lt: this.phase === PHASE.LEVELUP ? Math.max(0, Math.ceil(LEVELUP_TIMEOUT - this.levelT)) : undefined,
      res: this.phase === PHASE.OVER ? this.result : undefined,
    };
    const buf = encodeSnapshot({ tick: this.game.tick, ox, oz, enemies, bars, dmg: this.dmgNums, kills: this.killList, json });
    this.events = [];
    this.dmgNums = [];
    this.killList = [];
    this.gs = []; this.gm = []; this.gc = []; this.ps = []; this.pc = [];
    return buf;
  }
}
