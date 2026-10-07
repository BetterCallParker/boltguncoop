// One expedition: authoritative simulation of the horde, weapons, pickups, level-ups, chests,
// bosses, downs/revives and the final result. Players' positions come from their clients
// (validated); everything else is decided here and streamed to clients 15x per second.
import {
  DT, PHASE, PS, PLAYER_RADIUS, BASE_MOVE_SPEED, VIEW_HX, VIEW_HZ, DESPAWN_RADIUS, REVIVE_RADIUS, REVIVE_TIME,
  LEVELUP_TIMEOUT, CHEST_TIME, MAX_WEAPONS, MAX_PASSIVES, xpForLevel, clamp,
} from '../shared/constants.js';
import { CHARACTERS } from '../shared/characters.js';
import {
  WEAPONS, PASSIVES, BASE_WEAPONS, SHARED_WEAPONS, PASSIVE_IDS, computeStats, weaponStats, maxLevel, orbitState,
  ORBIT_RADIUS, AURA_RADIUS, NOVA_RADIUS, CLEAVE_RADIUS,
} from '../shared/items.js';
import { ENEMIES, ENEMY_INDEX } from '../shared/enemies.js';
import { STAGES, TIMELINE, EVENTS } from '../shared/stages.js';
import { settingValue, DIFFICULTY } from '../shared/settings.js';
import { mulberry32, pickWeighted } from '../shared/rng.js';
import { encodeSnapshot, EF } from '../shared/protocol.js';
import { BALANCE } from '../shared/balance.js';
import { sanitizeUnlocks } from '../shared/unlocks.js';

const MAX_ENEMY_R = 2.2;
const GEM_CAP = 450;
// evolved monster tiers (index 1..3): health, damage, experience, speed, size
const TB = BALANCE.monsters.tiers;
const TIER_HP = [0, ...TB.hp];
const TIER_DMG = [0, ...TB.dmg];
const TIER_XP = [0, ...TB.xp];
const TIER_SPEED = [0, ...TB.speed];
const TIER_R = [0, ...TB.size];
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
    this.paused = null;
    this.impacts = []; // scheduled area hits (arrow rain, fissures)
    this.beams = []; // active beams and flame cones
    this.mines = [];
    this.minions = [];
    this.burstDepth = 0;

    const n = lobbyPlayers.length;
    lobbyPlayers.forEach((lp, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      const p = {
        id: lp.id, name: lp.name, char: lp.char, seat: lp.seat, clientId: lp.clientId, meta: lp.meta || {},
        x: n > 1 ? Math.cos(a) * 1.5 : 0, z: n > 1 ? Math.sin(a) * 1.5 : 0, fx: 1, dirx: 1, dirz: 0,
        state: PS.ALIVE, hp: 100, maxHp: 100, iframes: 1.5, reviveProg: 0, respawnT: 0, shieldT: 0,
        weapons: [], passives: {}, stats: null, ws: new Map(), pending: [],
        kills: 0, dmg: {}, gold: 0, lastPos: game.time, revival: 0,
        unlocks: sanitizeUnlocks(lp.unlocks), shieldHP: 0, shieldMax: 0, lastHurt: -99, buffUntil: 0, buffK: 0, leechBudget: 0, thornT: 0, trail: null,
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
    // passive abilities hook into damage, kills and hits
    p.hooks = {};
    for (const w of p.weapons) {
      const ws = p.ws.get(w.id);
      if (ws && (ws.kind === 'shield' || ws.kind === 'thorns' || ws.kind === 'corpse' || ws.kind === 'leech')) p.hooks[ws.kind] = { w, ws };
    }
    const sh = p.hooks.shield;
    p.shieldMax = sh ? Math.round(sh.ws.amount) : 0;
    if (!sh) p.shieldHP = 0;
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
    if (p.state !== PS.ALIVE || this.phase !== PHASE.RUN || this.paused) return;
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
    this.updateImpacts();
    this.updateBeams();
    this.updateMines();
    this.updateMinions();
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

  // the horde starts soft and peaks around the final boss (shared/balance.js)
  hpMul() {
    const M = BALANCE.monsters;
    const f = Math.min(1.2, this.frac());
    return (1 + M.hpGrowth * Math.pow(f, M.hpCurve)) * (1 + M.coopHp * (this.coop() - 1)) * this.diff.hp;
  }

  dmgMul() {
    const M = BALANCE.monsters;
    return 1 + M.dmgGrowth * Math.pow(Math.min(1.2, this.frac()), M.dmgCurve);
  }

  // evolved monsters: tier 2 from tier2Start, tier 3 from tier3Start
  rollTier() {
    const M = BALANCE.monsters;
    const f = this.frac();
    if (f < M.tier2Start) return 1;
    if (f < M.tier3Start) return this.rand() < ((f - M.tier2Start) / (M.tier3Start - M.tier2Start)) * M.tier2Share ? 2 : 1;
    return this.rand() < (f - M.tier3Start) / Math.max(0.01, 1 - M.tier3Start) ? 3 : 2;
  }

  spawnEnemy(typeId, x, z, opts = {}) {
    const def = ENEMIES[typeId];
    if (!def) return null;
    let id = this.nextEnemyId;
    for (let k = 0; k < 70000 && this.enemyById.has(id); k++) id = (id % 65535) + 1;
    this.nextEnemyId = (id % 65535) + 1;
    let hp = def.hp;
    const tier = def.boss || def.elite || def.prop || opts.ring ? 1 : this.rollTier();
    if (def.boss) hp = def.hp * (1 + BALANCE.monsters.bossCoopHp * (this.coop() - 1)) * this.diff.hp * (1 + 0.5 * this.frac());
    else if (def.elite) hp = def.hp * this.hpMul() * 0.8;
    else if (!def.prop) hp = def.hp * this.hpMul() * TIER_HP[tier];
    const e = {
      id, typeId, type: ENEMY_INDEX[typeId], def, x, z, kx: 0, kz: 0, hp, maxHp: hp, tier,
      speed: def.speed * this.diff.speed * (0.92 + this.rand() * 0.16) * TIER_SPEED[tier], r: def.r * TIER_R[tier], mass: def.mass * TIER_R[tier],
      flash: 0, frozen: 0, slow: 0, slowK: 1, atkCd: 0, target: null, retarget: 0, age: 0, left: false,
      phase: this.rand() * 10, abilityCd: 4, rangedCd: def.ranged ? def.ranged.cd * this.rand() : 0, dead: false,
      ...opts,
    };
    this.enemies.push(e);
    this.enemyById.set(id, e);
    return e;
  }

  maxEnemies() {
    const S = BALANCE.spawn;
    return Math.min(S.maxCap, Math.round((S.maxBase + S.maxPerPlayer * (this.coop() - 1)) * this.density));
  }

  spawning() {
    const f = this.frac();
    const seg = TIMELINE[Math.min(TIMELINE.length - 1, Math.floor(Math.min(0.999, f) * TIMELINE.length))];
    const roles = this.stage.roles;
    const cap = this.maxEnemies();
    const S = BALANCE.spawn;
    const coopK = 1 + S.coopRate * (this.coop() - 1);
    const lateK = f >= 1 ? 0.5 : 1;
    const minAlive = Math.round(seg.min * S.minScale * (1 + S.coopMin * (this.coop() - 1)) * this.density * lateK);
    this.spawnAcc += seg.rate * S.rateScale * coopK * this.density * lateK * DT;
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
      this.brazierT = BALANCE.pickups.brazierEvery / this.pickupMul;
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
        // a fallen traveler returns after a countdown, as long as someone is still standing
        if (!this.reviveOn) continue;
        const total = BALANCE.players.respawnSeconds;
        if (this.alive().length) p.respawnT -= DT;
        p.reviveProg = Math.min(1, Math.max(0, 1 - p.respawnT / total));
        if (p.respawnT <= 0) this.respawn(p);
        continue;
      }
      if (p.shieldT > 0) p.shieldT -= DT;
      if (p.state !== PS.ALIVE) continue;
      const hk = p.hooks || {};
      if (hk.shield && p.shieldHP < p.shieldMax && this.t - p.lastHurt > hk.shield.ws.cd) p.shieldHP = p.shieldMax;
      if (hk.thorns && hk.thorns.ws.pulse && this.t >= p.thornT) this.thorns(p, hk.thorns);
      if (hk.leech) p.leechBudget = Math.min(hk.leech.ws.cap || 3, p.leechBudget + (hk.leech.ws.cap || 3) * DT);
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
    switch (ws.kind) {
      case 'shield': case 'thorns': case 'corpse': case 'leech':
        return; // passive: handled by the damage hooks
      case 'spin': return this.tickSpin(p, w, ws);
      case 'summon': return this.tickSummon(p, w, ws);
      case 'trail': return this.tickTrail(p, w, ws);
    }
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
    if (this.castNew(p, w, ws)) return;
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
          const vis = ws.vis && ws.vis !== 'bolt' ? ws.vis : 'bolt';
          for (let i = 0; i < ws.amount; i++) {
            const t = targets[i % Math.max(1, targets.length)];
            let a = t ? Math.atan2(t.z - p.z, t.x - p.x) : Math.atan2(p.dirz, p.dirx) + (i - (ws.amount - 1) / 2) * 0.2;
            if (t && i >= targets.length) a += (this.rand() - 0.5) * 0.3;
            this.projectile(p, w.id, vis, p.x, p.z, Math.cos(a) * speed, Math.sin(a) * speed, 1.3, 0.3 * (ws.size || 1), ws, { slowHit: ws.slow, freezeHit: ws.freeze, explode: ws.explode ? ws.explode * ws.area : 0 });
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
      case 'zone':
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
          const zkind = ws.kind === 'zone' ? ws.vis : ws.evolved ? 'plague' : 'acid';
          this.zones.push({ pending: true, id, at: this.t + flight, x: tx, z: tz, r: 1.6 * ws.area, life: 2.4 * ws.duration, tick: ws.tick, next: 0, dmg: ws.dmg, owner: p, w: w.id, slow: ws.slow, hex: ws.hex || 0, kind: zkind });
          this.ev('pj', id, ws.kind === 'zone' ? 'hexorb' : 'flask', r2(p.x), r2(p.z), r2(tx), r2(tz), flight, p.id);
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
          this.ev('zap', r2(x), r2(z), r2(R), ws.evolved ? 1 : 0, ws.vis === 'holy' ? 'holy' : 'storm');
          this.aoe(x, z, R, ws.dmg, p, w.id, ws.kb);
          if (ws.healAllies) for (const q of this.alive()) if ((q.x - x) ** 2 + (q.z - z) ** 2 < (R + 1.5) ** 2) this.heal(q, ws.healAllies);
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
        const vis = ws.vis && ws.vis !== 'nova' ? ws.vis : 'frost';
        this.ev('nv', p.id, r2(R), ws.freeze ? 1 : 0, vis);
        let n = 0;
        for (const e of this.enemiesNear(p.x, p.z, R)) {
          this.hit(e, ws.dmg, p, w.id, e.x - p.x, e.z - p.z, ws.kb);
          n++;
          if ((ws.freeze || ws.stun) && !e.def.boss) e.frozen = Math.max(e.frozen, ws.freeze || ws.stun);
          else if (ws.slow) { e.slow = 1.5 * ws.duration; e.slowK = 1 - ws.slow; }
        }
        if (ws.heal && n) this.heal(p, Math.min(30, n * ws.heal));
        if (ws.buff || ws.healAllies) {
          for (const q of this.alive()) {
            if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 > (R + 2) ** 2) continue;
            if (ws.buff) { q.buffK = Math.max(q.buffUntil > this.t ? q.buffK : 0, ws.buff); q.buffUntil = this.t + 4 * ws.duration; }
            if (ws.healAllies) this.heal(q, ws.healAllies);
          }
          if (ws.buff) this.ev('buff', p.id, r2(R + 2), r2(4 * ws.duration));
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
          this.projectile(p, w.id, ws.vis && ws.vis !== 'wisp' ? ws.vis : 'wisp', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 2.6, 0.32, ws, { homing: targets[i % Math.max(1, targets.length)] || null, tracked: true });
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- the wider arsenal
  aimAt(p, range = 14) {
    const t = this.enemiesNear(p.x, p.z, range, 1)[0];
    return t ? Math.atan2(t.z - p.z, t.x - p.x) : Math.atan2(p.dirz, p.dirx);
  }

  // abilities that fire on a cooldown; returns true when it handled the kind
  castNew(p, w, ws) {
    switch (ws.kind) {
      case 'scatter': {
        const base = this.aimAt(p, 13);
        const n = ws.amount, spread = ws.spread || 0.7;
        const sp = 14 * ws.speed;
        for (let i = 0; i < n; i++) {
          const a = spread >= 6 ? base + (i / n) * Math.PI * 2 : base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0) + (this.rand() - 0.5) * 0.1;
          const s2 = sp * (0.85 + this.rand() * 0.3);
          this.projectile(p, w.id, ws.vis, p.x, p.z, Math.cos(a) * s2, Math.sin(a) * s2, ws.life || 0.6, 0.26, ws, { explode: ws.explode ? ws.explode * ws.area : 0 });
        }
        return true;
      }
      case 'orb': {
        const base = this.aimAt(p, 12);
        for (let i = 0; i < ws.amount; i++) {
          const a = base + (i - (ws.amount - 1) / 2) * 0.5;
          const sp = 3.4 * ws.speed;
          this.projectile(p, w.id, 'frostorb', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 2.4 * ws.duration, 0.45 * Math.sqrt(ws.area), ws,
            { tracked: true, pierce: 9999, rehit: 0.5, emit: ws.emit || 0.18, emitT: 0, emitA: this.rand() * 6, shard: { dmg: ws.dmg * 0.7, freeze: ws.freeze, slow: ws.slow } });
        }
        return true;
      }
      case 'ball': {
        const base = this.aimAt(p, 12);
        for (let i = 0; i < ws.amount; i++) {
          const a = base + (i - (ws.amount - 1) / 2) * 0.6 + (this.rand() - 0.5) * 0.3;
          const sp = 2.6 * ws.speed;
          this.projectile(p, w.id, 'ball', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 3 * ws.duration, 0.5, ws,
            { tracked: true, pierce: 9999, rehit: 9999, zapR: 1.8 * ws.area, zapEvery: 0.32 * (1 - (ws.zap || 0)), zapT: 0, dmgHit: 0 });
        }
        return true;
      }
      case 'spark': {
        for (let i = 0; i < ws.amount; i++) {
          const a = this.rand() * Math.PI * 2;
          const sp = 7 * ws.speed;
          this.projectile(p, w.id, 'spark', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 1.6 * ws.duration, 0.3, ws, { tracked: true, wander: 1 });
        }
        return true;
      }
      case 'ricochet': {
        const targets = this.enemiesNear(p.x, p.z, 14, ws.amount);
        for (let i = 0; i < ws.amount; i++) {
          const t = targets[i % Math.max(1, targets.length)];
          const a = t ? Math.atan2(t.z - p.z, t.x - p.x) : this.rand() * Math.PI * 2;
          const sp = 13 * ws.speed;
          this.projectile(p, w.id, 'shuriken', p.x, p.z, Math.cos(a) * sp, Math.sin(a) * sp, 2.2, 0.3, ws, { tracked: true, pierce: 9999, bounces: ws.chain });
        }
        return true;
      }
      case 'spiral': {
        const a0 = this.rand() * Math.PI * 2;
        for (let i = 0; i < ws.amount; i++) {
          this.projectile(p, w.id, 'hammer', p.x, p.z, 0, 0, 2.6 * ws.duration, 0.45 * Math.sqrt(ws.area), ws,
            { tracked: true, pierce: 9999, rehit: 0.4, spiral: { a0: a0 + (i / ws.amount) * Math.PI * 2, rMax: 5 * ws.area, turns: 1.5 * ws.speed } });
        }
        return true;
      }
      case 'chain': {
        const starts = this.enemiesNear(p.x, p.z, ws.range || 8, ws.amount);
        const used = new Set();
        for (const t of starts) {
          if (used.has(t)) continue;
          used.add(t);
          this.ev('arc', r2(p.x), r2(p.z), r2(t.x), r2(t.z));
          this.hit(t, ws.dmg, p, w.id, t.x - p.x, t.z - p.z, 0.4);
          let from = t, d = ws.dmg;
          for (let c = 0; c < ws.chain; c++) {
            const next = this.enemiesNear(from.x, from.z, 4.5, 6).find((e) => e !== from && !used.has(e));
            if (!next) break;
            used.add(next);
            d *= 0.9;
            this.ev('arc', r2(from.x), r2(from.z), r2(next.x), r2(next.z));
            this.hit(next, d, p, w.id, next.x - from.x, next.z - from.z, 0.4);
            from = next;
          }
        }
        return true;
      }
      case 'rain': {
        const pool = this.enemiesNear(p.x, p.z, 13, 25);
        const c = pool.length ? pool[Math.floor(this.rand() * Math.min(pool.length, 8))] : null;
        const cx = c ? c.x : p.x + (this.rand() - 0.5) * 8, cz = c ? c.z : p.z + (this.rand() - 0.5) * 6;
        const R = 2.4 * ws.area, n = ws.amount, span = 0.8 * ws.duration;
        const pts = [];
        for (let i = 0; i < n; i++) {
          const a = this.rand() * Math.PI * 2, rr = R * Math.sqrt(this.rand());
          const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, at = 0.35 + (i / n) * span + this.rand() * 0.05;
          this.impacts.push({ at: this.t + at, x, z, r: 0.8 * Math.sqrt(ws.area), dmg: ws.dmg, owner: p, w: w.id, slow: ws.slow, freeze: ws.freeze });
          pts.push(r2(x), r2(z), r2(at));
        }
        this.ev('rain', ws.vis, r2(R), r2(cx), r2(cz), pts);
        return true;
      }
      case 'fissure': {
        const base = this.aimAt(p, 12);
        const lines = ws.lines || 1;
        const r = 1.0 * Math.sqrt(ws.area), gap = 1.15 * Math.sqrt(ws.area), dt = 0.07 / ws.speed;
        for (let l = 0; l < lines; l++) {
          const a = base + (lines > 1 ? (l / (lines - 1) - 0.5) * 1.1 : 0);
          const dx = Math.cos(a), dz = Math.sin(a);
          for (let i = 1; i <= ws.amount; i++) this.impacts.push({ at: this.t + i * dt, x: p.x + dx * i * gap, z: p.z + dz * i * gap, r, dmg: ws.dmg, owner: p, w: w.id, kb: 1.2 });
          this.ev('fis', ws.vis, r2(p.x), r2(p.z), r2(dx), r2(dz), ws.amount, r2(gap), r2(dt), r2(r));
        }
        return true;
      }
      case 'beam': {
        const len = (ws.range || 9) * Math.sqrt(ws.area);
        let angles = [];
        if (ws.mode === 'cross') {
          const n = ws.amount;
          const off = this.rand() * 0.3;
          for (let i = 0; i < n; i++) angles.push(off + (i / n) * Math.PI * 2);
        } else {
          const ts = this.enemiesNear(p.x, p.z, len, ws.amount);
          angles = ts.map((t) => Math.atan2(t.z - p.z, t.x - p.x));
          while (angles.length < ws.amount) angles.push(Math.atan2(p.dirz, p.dirx) + angles.length * 0.4);
        }
        const dur = 1.0 * ws.duration;
        this.beams.push({ owner: p, w: w.id, angles, len, width: 0.45 * ws.area, until: this.t + dur, t0: this.t, tick: ws.tick, next: 0, dmg: ws.dmg, rot: ws.rotate ? 0.9 : 0, cone: 0 });
        this.ev('beam', p.id, ws.vis, angles.map(r2), r2(len), r2(0.45 * ws.area), r2(dur), ws.rotate ? 0.9 : 0);
        return true;
      }
      case 'cone': {
        const len = (ws.range || 5) * ws.area;
        const a = this.aimAt(p, len + 2);
        const dur = 1.4 * ws.duration;
        this.beams.push({ owner: p, w: w.id, angles: [a], len, width: 0, until: this.t + dur, t0: this.t, tick: ws.tick, next: 0, dmg: ws.dmg, rot: 0, cone: (ws.arc || 0.9) / 2, aim: true });
        this.ev('cone', p.id, ws.vis, r2(a), r2(len), r2(ws.arc || 0.9), r2(dur));
        return true;
      }
      case 'vortex': {
        for (let i = 0; i < ws.amount; i++) {
          let x = p.x, z = p.z, vx, vz;
          const R = (ws.vis === 'wind' ? 1.6 : 2.6) * ws.area;
          if (ws.vis === 'void') {
            const pool = this.enemiesNear(p.x, p.z, 11, 20);
            const c = pool.length ? pool[Math.floor(this.rand() * pool.length)] : null;
            x = c ? c.x : p.x + (this.rand() - 0.5) * 8;
            z = c ? c.z : p.z + (this.rand() - 0.5) * 6;
            const a = this.rand() * Math.PI * 2;
            vx = Math.cos(a) * 0.7 * ws.speed; vz = Math.sin(a) * 0.7 * ws.speed;
          } else {
            const a = this.aimAt(p, 12) + (i - (ws.amount - 1) / 2) * 0.8;
            vx = Math.cos(a) * 5 * ws.speed; vz = Math.sin(a) * 5 * ws.speed;
          }
          this.projectile(p, w.id, ws.vis, x, z, vx, vz, (ws.vis === 'wind' ? 3.2 : 4) * ws.duration, R, ws,
            { tracked: true, pierce: 9999, rehit: 9999, vortex: { R, pull: ws.pull || 2, tick: ws.tick || 0.3, next: 0 }, wander: ws.vis === 'wind' ? 0.6 : 0.15 });
        }
        return true;
      }
      case 'mine': {
        for (let i = 0; i < ws.amount; i++) {
          const a = this.rand() * Math.PI * 2, d = i === 0 ? 0.4 : 1 + this.rand() * 1.5;
          const id = this.id();
          const m = { id, x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, arm: this.t + 0.45, until: this.t + 10 * ws.duration, r: 2.2 * Math.sqrt(ws.area), dmg: ws.dmg, owner: p, w: w.id, chainy: !!ws.evolved };
          this.mines.push(m);
          this.ev('mine', id, r2(m.x), r2(m.z), ws.evolved ? 1 : 0);
        }
        if (this.mines.length > 60) this.detonate(this.mines[0]);
        return true;
      }
    }
    return false;
  }

  // a spinning storm of blades around the player while it lasts
  tickSpin(p, w, ws) {
    const R = 2.4 * ws.area;
    if (w.spinUntil > this.t) {
      w.tickT = (w.tickT || 0) - DT;
      if (w.tickT <= 0) {
        w.tickT = ws.tick;
        for (const e of this.enemiesNear(p.x, p.z, R)) this.hit(e, ws.dmg, p, w.id, e.x - p.x, e.z - p.z, ws.kb);
      }
      if (ws.pull) for (const e of this.enemiesNear(p.x, p.z, R * 1.7)) {
        if (e.def.boss) continue;
        const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
        if (d > R * 0.6) { e.x += (dx / d) * ws.pull * DT; e.z += (dz / d) * ws.pull * DT; }
      }
      if (w.spinUntil - this.t <= DT) w.timer = ws.cd;
      return;
    }
    w.timer -= DT;
    if (w.timer > 0) return;
    const dur = 2.2 * ws.duration;
    w.spinUntil = this.t + dur;
    w.tickT = 0;
    this.ev('spin', p.id, ws.vis, r2(R), r2(dur), ws.evolved ? 1 : 0);
  }

  // skeletons, wolves and turrets: summoned one at a time up to the ability's amount
  tickSummon(p, w, ws) {
    const mine = this.minions.filter((m) => m.w === w && !m.dead);
    if (mine.length >= ws.amount) { w.timer = Math.min(w.timer, ws.cd * 0.5); return; }
    w.timer -= DT;
    if (w.timer > 0) return;
    w.timer = ws.vis === 'turret' ? ws.cd : Math.min(1.2, ws.cd * 0.4);
    const a = this.rand() * Math.PI * 2;
    const m = {
      id: this.id(), vis: ws.vis, w, owner: p, x: p.x + Math.cos(a) * 1.2, z: p.z + Math.sin(a) * 1.2, left: false, atkT: 0.5, target: null,
      until: ws.vis === 'turret' ? this.t + 10 * ws.duration : Infinity, slot: mine.length,
    };
    this.minions.push(m);
    this.ev('summon', m.id, ws.vis, r2(m.x), r2(m.z), ws.evolved ? 1 : 0);
  }

  // fire / plague left behind wherever the player walks
  tickTrail(p, w, ws) {
    w.timer -= DT;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    if (w.lx !== undefined && (p.x - w.lx) ** 2 + (p.z - w.lz) ** 2 < 0.25) return;
    w.lx = p.x;
    w.lz = p.z;
    const z = { id: this.id(), x: p.x, z: p.z, r: 0.9 * ws.area, life: 2.4 * ws.duration, tick: ws.tick, next: 0, dmg: ws.dmg, owner: p, w: w.id, slow: ws.slow, kind: ws.vis };
    this.zones.push(z);
    this.ev('zn', z.id, r2(z.x), r2(z.z), r2(z.r), r2(z.life), z.kind);
  }

  thorns(p, hook) {
    const ws = hook.ws;
    p.thornT = this.t + (ws.pulse ? 1 : ws.cd || 0.6);
    const R = 3 * ws.area;
    this.ev('nv', p.id, r2(R), 0, 'thorn');
    for (const e of this.enemiesNear(p.x, p.z, R)) this.hit(e, ws.dmg, p, hook.w.id, e.x - p.x, e.z - p.z, ws.kb);
  }

  updateImpacts() {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const m = this.impacts[i];
      if (this.t < m.at) continue;
      this.impacts.splice(i, 1);
      for (const e of [...this.grid.query(m.x, m.z, m.r + MAX_ENEMY_R)]) {
        if (e.dead || (e.x - m.x) ** 2 + (e.z - m.z) ** 2 > (m.r + e.r) ** 2) continue;
        this.hit(e, m.dmg, m.owner, m.w, e.x - m.x, e.z - m.z, m.kb || 0.3);
        if (m.freeze && !e.def.boss) e.frozen = Math.max(e.frozen, m.freeze);
        else if (m.slow) { e.slow = 1; e.slowK = 1 - m.slow; }
      }
    }
  }

  // beams (lines from the caster) and cones; both follow the caster while they last
  updateBeams() {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      const p = b.owner;
      if (this.t >= b.until || p.state !== PS.ALIVE) { this.beams.splice(i, 1); continue; }
      b.next -= DT;
      if (b.next > 0) continue;
      b.next = b.tick;
      const hitSet = new Set();
      for (const e of this.enemiesNear(p.x, p.z, b.len + 1)) {
        const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
        for (const a0 of b.angles) {
          const a = a0 + b.rot * (this.t - b.t0);
          if (b.cone) {
            let da = Math.atan2(dz, dx) - a;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            if (Math.abs(da) > b.cone || d > b.len) continue;
          } else {
            const along = dx * Math.cos(a) + dz * Math.sin(a);
            const across = Math.abs(-dx * Math.sin(a) + dz * Math.cos(a));
            if (along < 0 || along > b.len || across > b.width + e.r) continue;
          }
          hitSet.add(e);
          break;
        }
      }
      for (const e of hitSet) this.hit(e, b.dmg, p, b.w, e.x - p.x, e.z - p.z, 0.25);
    }
  }

  updateMines() {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.gone) { this.mines.splice(i, 1); continue; }
      if (this.t >= m.until) { this.mines.splice(i, 1); this.ev('md', m.id); continue; }
      if (this.t < m.arm) continue;
      if (this.grid.query(m.x, m.z, 1.4).some((e) => !e.dead && !e.def.prop && (e.x - m.x) ** 2 + (e.z - m.z) ** 2 < (1 + e.r) ** 2)) this.detonate(m);
    }
  }

  detonate(m) {
    if (m.gone) return;
    m.gone = true;
    this.ev('md', m.id);
    this.explode(m.x, m.z, m.r, m.dmg, m.owner, m.w, 1.4, 'trap');
    if (m.chainy) for (const o of this.mines) if (!o.gone && (o.x - m.x) ** 2 + (o.z - m.z) ** 2 < m.r * m.r) o.arm = Math.min(o.arm, this.t), o.until = Math.min(o.until, this.t + 0.15);
  }

  updateMinions() {
    for (let i = this.minions.length - 1; i >= 0; i--) {
      const m = this.minions[i];
      const p = m.owner;
      const ws = p.ws.get(m.w.id);
      if (!ws || this.t >= m.until || !p.weapons.includes(m.w)) {
        this.minions.splice(i, 1);
        this.ev('unsummon', m.id);
        continue;
      }
      m.atkT -= DT;
      if (m.vis === 'turret') {
        if (m.atkT <= 0) {
          const t = this.enemiesNear(m.x, m.z, ws.range || 9, 1)[0];
          if (t) {
            m.atkT = ws.atk || 0.5;
            const a = Math.atan2(t.z - m.z, t.x - m.x), sp = 16;
            m.left = t.x < m.x;
            this.projectile(p, m.w.id, ws.explode ? 'shell' : 'bolt', m.x, m.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.9, 0.3, ws, { pierce: 1, explode: ws.explode ? ws.explode : 0 });
          }
        }
        continue;
      }
      // melee minions: hunt foes near their master, otherwise heel
      if (!m.target || m.target.dead || (m.target.x - p.x) ** 2 + (m.target.z - p.z) ** 2 > 100) {
        m.target = this.enemiesNear(m.x, m.z, 7, 1)[0] || null;
        if (m.target && (m.target.x - p.x) ** 2 + (m.target.z - p.z) ** 2 > 100) m.target = null;
      }
      const sp = (m.vis === 'wolf' ? 7 : 4.6) * ws.speed;
      let tx, tz;
      if (m.target) { tx = m.target.x; tz = m.target.z; }
      else { const a = this.t * 0.6 + m.slot * 2.1; tx = p.x + Math.cos(a) * 2; tz = p.z + Math.sin(a) * 2; }
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz) || 1;
      const reach = m.target ? 0.75 + m.target.r : 0.3;
      if (d > reach) {
        const st = Math.min(d - reach * 0.8, sp * DT);
        m.x += (dx / d) * st;
        m.z += (dz / d) * st;
        if (Math.abs(dx) > 0.05) m.left = dx < 0;
      } else if (m.target && m.atkT <= 0) {
        m.atkT = ws.atk || 0.7;
        this.hit(m.target, ws.dmg, p, m.w.id, dx, dz, 0.6);
        if (ws.lifebite) this.heal(p, 1);
      }
      if (d > 30) { m.x = p.x; m.z = p.z; }
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
    this.ev('pj', pr.id, kind, r2(x), r2(z), r2(vx), r2(vz), r2(life), p.id, r2(r));
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
      if (pr.spiral) {
        // hammers spiral outward around their thrower
        const o = pr.owner, k = Math.min(1, pr.age / pr.life);
        const rr = 0.6 + (pr.spiral.rMax - 0.6) * k, a = pr.spiral.a0 + k * pr.spiral.turns * Math.PI * 2;
        pr.vx = (o.x + Math.cos(a) * rr - pr.x) / DT;
        pr.vz = (o.z + Math.sin(a) * rr - pr.z) / DT;
      }
      if (pr.wander) {
        const a = Math.atan2(pr.vz, pr.vx) + (this.rand() - 0.5) * pr.wander * 1.6, sp = Math.hypot(pr.vx, pr.vz);
        pr.vx = Math.cos(a) * sp;
        pr.vz = Math.sin(a) * sp;
      }
      if (pr.emit) {
        pr.emitT -= DT;
        if (pr.emitT <= 0) {
          pr.emitT = pr.emit;
          for (let k = 0; k < 3; k++) {
            const a = pr.emitA + k * 2.094;
            this.projectile(pr.owner, pr.w, 'shard', pr.x, pr.z, Math.cos(a) * 10, Math.sin(a) * 10, 0.5, 0.22, { dmg: pr.shard.dmg, kb: 0.2, pierce: 1 }, { slowHit: pr.shard.slow, freezeHit: pr.shard.freeze });
          }
          pr.emitA += 0.55;
        }
      }
      if (pr.zapR) {
        pr.zapT -= DT;
        if (pr.zapT <= 0) {
          pr.zapT = pr.zapEvery;
          const near = this.enemiesNear(pr.x, pr.z, pr.zapR, 8);
          near.forEach((e, k) => {
            if (k < 2) this.ev('arc', r2(pr.x), r2(pr.z), r2(e.x), r2(e.z));
            this.hit(e, pr.dmg, pr.owner, pr.w, e.x - pr.x, e.z - pr.z, 0.1);
          });
        }
      }
      if (pr.vortex) {
        const V = pr.vortex;
        for (const e of this.enemiesNear(pr.x, pr.z, V.R * 1.6)) {
          if (e.def.boss) continue;
          const dx = pr.x - e.x, dz = pr.z - e.z, d = Math.hypot(dx, dz) || 1;
          if (d > 0.4) { e.x += (dx / d) * V.pull * DT; e.z += (dz / d) * V.pull * DT; }
        }
        V.next -= DT;
        if (V.next <= 0) {
          V.next = V.tick;
          for (const e of this.enemiesNear(pr.x, pr.z, V.R)) this.hit(e, pr.dmg, pr.owner, pr.w, 0, 0, 0);
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
          if (pr.explode && pr.pierce < 90) {
            this.explode(pr.x, pr.z, pr.explode, pr.dmg, pr.owner, pr.w, pr.kb, pr.kind === 'orb' ? 'fire' : 'spark');
            pr.exploded = true;
            remove = true;
            break;
          }
          this.hit(e, pr.dmg, pr.owner, pr.w, pr.vx, pr.vz, pr.kb);
          if (pr.explode) this.explode(e.x, e.z, pr.explode, pr.dmg * 0.6, pr.owner, pr.w, pr.kb, 'spark');
          if (pr.freezeHit && !e.def.boss) e.frozen = Math.max(e.frozen, pr.freezeHit);
          else if (pr.slowHit) { e.slow = 1.2; e.slowK = 1 - pr.slowHit; }
          if (pr.bounces !== undefined) {
            // ricochet to the next foe nearby
            const next = pr.bounces > 0 ? this.enemiesNear(e.x, e.z, 7, 8).find((n) => n !== e && !pr.hit.has(n.id)) : null;
            if (next) {
              pr.bounces--;
              const sp = Math.hypot(pr.vx, pr.vz) || 12, dx = next.x - pr.x, dz = next.z - pr.z, d = Math.hypot(dx, dz) || 1;
              pr.vx = (dx / d) * sp;
              pr.vz = (dz / d) * sp;
              pr.age = Math.min(pr.age, pr.life - 1.2);
            } else remove = true;
            break;
          }
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
        if (z.hex) { e.hexUntil = this.t + z.tick + 0.3; e.hexK = z.hex; }
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
    if (owner && owner.buffUntil > this.t) dmg *= 1 + owner.buffK;
    if (e.hexUntil > this.t) dmg *= 1 + e.hexK;
    dmg = Math.max(1, dmg * (0.9 + this.rand() * 0.2));
    const lh = owner && owner.hooks && owner.hooks.leech;
    if (lh && owner.leechBudget > 0 && !e.def.prop && owner.state === PS.ALIVE) {
      const h = Math.min(owner.leechBudget, dmg * lh.ws.heal);
      owner.leechBudget -= h;
      this.heal(owner, h);
    }
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
    for (const p of this.players.values()) {
      const hk = p.hooks && p.hooks.corpse;
      if (!hk || p.state !== PS.ALIVE || this.burstDepth >= (hk.ws.chainBurst ? 3 : 1)) continue;
      if ((p.x - e.x) ** 2 + (p.z - e.z) ** 2 > (hk.ws.range || 7) ** 2) continue;
      if (this.rand() > hk.ws.chance * Math.sqrt(p.stats.luck)) continue;
      this.burstDepth++;
      this.explode(e.x, e.z, 1.7 * hk.ws.area, hk.ws.dmg, p, hk.w.id, 1, 'bone');
      this.burstDepth--;
      break;
    }
    if (def.xp) this.dropGem(e.x, e.z, def.xp * TIER_XP[e.tier || 1]);
    if (def.elite || (def.boss && !def.final)) {
      this.spawnPickup('chest', e.x, e.z);
      if (def.boss) for (let i = 0; i < 6; i++) this.dropGem(e.x + (this.rand() - 0.5) * 3, e.z + (this.rand() - 0.5) * 3, Math.round(def.xp / 6));
    }
    if (def.final) {
      this.finish('victory');
      return;
    }
    const luck = (owner ? owner.stats.luck : 1) * this.pickupMul;
    const P = BALANCE.pickups;
    const r = this.rand();
    if (r < P.coin * luck) this.spawnPickup('coin', e.x, e.z);
    else if (r < (P.coin + P.bag) * luck) this.spawnPickup('bag', e.x, e.z);
    else if (r < (P.coin + P.bag + P.roast) * luck) this.spawnPickup('roast', e.x, e.z);
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

  respawn(p) {
    const B = BALANCE.players;
    let best = null, bd = Infinity;
    for (const q of this.players.values()) {
      if (q === p || q.state !== PS.ALIVE) continue;
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    if (best) { p.x = best.x + (this.rand() - 0.5) * 2; p.z = best.z + (this.rand() - 0.5) * 2; }
    p.state = PS.ALIVE;
    p.hp = Math.round(p.maxHp * B.respawnHp);
    p.iframes = B.respawnShield;
    p.shieldT = B.respawnShield;
    p.reviveProg = 0;
    p.respawnT = 0;
    this.ev('up', p.id, best ? best.id : -1, r2(p.x), r2(p.z));
    for (const e of this.enemiesNear(p.x, p.z, 3.5)) this.hit(e, 1, p, 'revival', e.x - p.x, e.z - p.z, 3);
  }

  damagePlayer(p, dmg) {
    if (p.state !== PS.ALIVE || p.iframes > 0) return;
    let d = Math.max(1, Math.round(dmg * this.diff.dmg - p.stats.armor));
    p.lastHurt = this.t;
    p.iframes = BALANCE.players.hitInvuln;
    const hk = p.hooks || {};
    if (hk.thorns && this.t >= p.thornT) this.thorns(p, hk.thorns);
    if (p.shieldHP > 0) {
      const a = Math.min(p.shieldHP, d);
      p.shieldHP -= a;
      d -= a;
      if (p.shieldHP <= 0 && hk.shield && hk.shield.ws.burst) {
        this.ev('nv', p.id, 3.5, 0, 'bone');
        for (const e of this.enemiesNear(p.x, p.z, 3.5)) this.hit(e, hk.shield.ws.burst, p, hk.shield.w.id, e.x - p.x, e.z - p.z, 2);
      }
      if (d <= 0) { this.ev('blk', p.id, a); return; }
    }
    p.hp -= d;
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
    p.respawnT = BALANCE.players.respawnSeconds;
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
          this.damagePlayer(p, e.def.dmg * TIER_DMG[e.tier || 1] * this.dmgMul());
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
      for (const id of SHARED_WEAPONS) {
        if (!p.unlocks.has(id)) continue;
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
      enemies.push({ id: e.id, type: e.type, tier: e.tier || 1, flags: f, x: e.x, z: e.z });
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
      p: [...this.players.values()].map((p) => [p.id, r2(p.x), r2(p.z), p.fx, Math.ceil(p.hp), p.maxHp, p.state, Math.round(p.reviveProg * 100), p.iframes > 0.3 ? 1 : 0, p.gold, p.kills, p.shieldT > 0 ? Math.ceil(p.shieldT * 10) / 10 : 0, p.state === PS.DOWNED ? Math.ceil(p.respawnT) : 0, Math.ceil(p.shieldHP), p.shieldMax, p.buffUntil > this.t ? 1 : 0]),
      mn: this.minions.length ? this.minions.map((m) => [m.id, m.vis, r2(m.x), r2(m.z), m.left ? 1 : 0, m.owner.id]) : undefined,
      ev: this.events,
      gs: this.gs, gm: this.gm, gc: this.gc, ps: this.ps, pc: this.pc, tp,
      waiting: this.phase === PHASE.LEVELUP ? [...this.choices].filter(([, c]) => !c.picked).map(([id]) => id) : undefined,
      lt: this.phase === PHASE.LEVELUP ? Math.max(0, Math.ceil(LEVELUP_TIMEOUT - this.levelT)) : undefined,
      res: this.phase === PHASE.OVER ? this.result : undefined,
      pz: this.paused ? this.paused.name : undefined,
    };
    const buf = encodeSnapshot({ tick: this.game.tick, ox, oz, enemies, bars, dmg: this.dmgNums, kills: this.killList, json });
    this.events = [];
    this.dmgNums = [];
    this.killList = [];
    this.gs = []; this.gm = []; this.gc = []; this.ps = []; this.pc = [];
    return buf;
  }
}
