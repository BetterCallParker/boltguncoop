// Everything the server streams that isn't a traveler: the horde (interpolated between
// snapshots), experience gems and pickups (with magnet flight), projectiles and enemy shots,
// death puffs and floating damage numbers. All drawn through instanced sprite layers.
import * as THREE from 'three';
import { PPU } from '/shared/constants.js';
import { EF } from '/shared/protocol.js';
import { ENEMIES, ENEMY_IDS } from '/shared/enemies.js';
import { buildEnemyAtlas, buildFxAtlas, digitAtlas } from './monsters.js';
import { pixTexture } from './world.js';
import { blobShadowCanvas } from './sprites.js';
import { SpriteLayer, Particles } from './spritelayer.js';

const DEFS = ENEMY_IDS.map((id) => ENEMIES[id]);
const GEM_SIZE = [0, 0.62, 0.74, 0.92];
const GEM_GLOW = [null, [0.35, 0.6, 1.3], [0.4, 1.2, 0.5], [1.4, 0.35, 0.4]];
const PICKUP_SIZE = { chest: 1.25, roast: 0.9, coin: 0.7, bag: 0.9, lodestone: 0.9, freeze: 0.9, starfall: 0.9 };
const PROJ = {
  bolt: { rect: 'bolt', size: 1.0, dir: true, trail: [1, 0.9, 0.7], trailN: 0.035 },
  storm: { rect: 'storm', size: 1.15, dir: true, glow: [0.4, 0.7, 1.6], glowS: 1.3, trail: [0.5, 0.8, 1.6], trailN: 0.02 },
  knife: { rect: 'knife', size: 0.85, dir: true },
  edge: { rect: 'edge', size: 1.0, dir: true, glow: [1.2, 1.0, 0.5], glowS: 1.1 },
  orb: { rect: 'orb', size: 1.0, spin: 6, glow: [1.6, 0.7, 0.25], glowS: 2.0, trail: [1.4, 0.55, 0.15], trailN: 0.025, flame: true },
  axe: { rect: 'axe', size: 1.1, spin: -15 },
  wisp: { rect: 'wisp', size: 0.9, glow: [0.35, 0.85, 1.5], glowS: 1.4, trail: [0.4, 0.9, 1.4], trailN: 0.03 },
  flask: { rect: 'flask', size: 0.8, spin: 9 },
  hexorb: { rect: 'hexorb', size: 0.8, spin: 6, glow: [1.0, 0.4, 1.4], glowS: 1.4 },
  bone: { rect: 'bone', size: 0.8, dir: true },
  pellet: { rect: 'pellet', size: 0.5, dir: true, trail: [1, 0.85, 0.5], trailN: 0.05 },
  icespear: { rect: 'icespear', size: 1.0, dir: true, glow: [0.5, 0.9, 1.5], glowS: 1.1 },
  spear: { rect: 'spear', size: 1.45, dir: true },
  shuriken: { rect: 'shuriken', size: 0.8, spin: 22 },
  frostorb: { rect: 'frostorb', size: 1.1, spin: 3, glow: [0.5, 0.9, 1.6], glowS: 2.2, trail: [0.7, 0.95, 1.5], trailN: 0.04, snow: true },
  shard: { rect: 'shard', size: 0.55, dir: true, tint: [0.65, 0.9, 1.0] },
  ball: { rect: 'ball', size: 1.2, spin: 5, glow: [0.6, 0.85, 1.7], glowS: 2.6, crackle: true },
  spark: { rect: 'spark', size: 0.6, spin: 14, tint: [1, 0.95, 0.6], glow: [1.4, 1.2, 0.5], glowS: 1.0, trail: [1.2, 1.1, 0.5], trailN: 0.03 },
  bee: { rect: 'bee', size: 0.6, dir: true },
  feather: { rect: 'feather', size: 0.85, dir: true, glow: [0.7, 0.9, 1.4], glowS: 1.0 },
  hammer: { rect: 'hammer', size: 1.0, spin: -12, glow: [1.4, 1.1, 0.4], glowS: 1.4 },
  shell: { rect: 'shell', size: 0.7, dir: true, trail: [0.6, 0.55, 0.5], trailN: 0.04 },
  void: { rect: 'void', size: 1.0, spin: 1.5, glow: [0.8, 0.3, 1.4], glowS: 2.0, swirl: true },
  wind: { rect: 'wind', size: 1.0, spin: 9, swirl: true },
};
const SHOT = { orb: { rect: 'eorb', glow: [1.2, 0.35, 1.4] }, dark: { rect: 'dark', glow: [1.5, 0.3, 1.1] } };

export function screenAngle(vx, vz) {
  return Math.atan2(-vz * 0.82, vx);
}

export class Entities {
  constructor(R) {
    this.R = R;
    this.scene = R.scene;
    // atlases
    const ea = buildEnemyAtlas();
    this.etypes = ea.types;
    this.minionTypes = ea.minions;
    this.etex = pixTexture(ea.canvas);
    const fa = buildFxAtlas();
    this.fx = fa.rects;
    this.ftex = pixTexture(fa.canvas);
    const blobTex = new THREE.CanvasTexture(blobShadowCanvas(32));
    blobTex.magFilter = blobTex.minFilter = THREE.NearestFilter;
    const dig = digitAtlas();
    this.dtex = pixTexture(dig.toCanvas());
    this.digits = [];
    for (let d = 0; d < 10; d++) this.digits.push({ u: (d * 7) / 70, v: 0, du: 7 / 70, dv: 1 });

    // layers
    this.enemyL = new SpriteLayer(this.etex, 1000, { lit: true, shadow: true, emissive: 0.22 });
    this.blobL = new SpriteLayer(blobTex, 1400, { anchor: 'center', tilt: Math.PI / 2, renderOrder: 1 });
    this.blobL.mat.depthWrite = false;
    this.itemL = new SpriteLayer(this.ftex, 1100, { lit: true, shadow: false, emissive: 0.55 });
    this.projL = new SpriteLayer(this.ftex, 900, { dither: true, anchor: 'center' });
    this.glowL = new SpriteLayer(this.ftex, 1200, { blending: 'add', anchor: 'center', billboard: true, renderOrder: 4 });
    this.flatL = new SpriteLayer(this.ftex, 400, { blending: 'add', anchor: 'center', tilt: Math.PI / 2, renderOrder: 1 });
    this.flatL.mat.depthWrite = false;
    this.glowL.mat.depthWrite = false;
    this.scene.add(this.enemyL.mesh, this.blobL.mesh, this.itemL.mesh, this.projL.mesh, this.glowL.mesh, this.flatL.mesh);
    // crisp overlay (drawn after post-processing): damage numbers + health pips
    this.digitL = new SpriteLayer(this.dtex, 1600, { anchor: 'center', billboard: true, depthTest: false });
    this.uiL = new SpriteLayer(this.ftex, 300, { anchor: 'center', billboard: true, depthTest: false });
    R.overlay.add(this.uiL.mesh, this.digitL.mesh);
    this.particles = new Particles(this.scene, this.ftex, this.fx);

    this.seen = new Map(); // enemy id -> { born, type, x, z, y, h, squash, flash, frame }
    this.corpses = [];
    this.gems = new Map();
    this.pickups = new Map();
    this.projs = new Map();
    this.shots = new Map();
    this.nums = [];
    this.bars = new Map();
    this.animT = 0;
    this.frameNo = 0;
    this.hooks = { kill: null, gem: null, pickup: null, bossKill: null };
  }

  // ---------------------------------------------------------------- snapshot payloads
  // applied once, when render time reaches the snapshot
  applySnap(s, ctx) {
    const j = s.json;
    this.bars = s.bars;
    for (const [id, amt, big] of s.dmg) {
      const e = this.seen.get(id);
      if (!e) continue;
      e.flash = 0.11;
      e.squash = 0.1;
      this.number(e.x + (Math.random() - 0.5) * 0.5, e.y + e.h * 0.75, e.z, amt, big ? 'big' : 'hit');
    }
    for (const id of s.kills) {
      const e = this.seen.get(id);
      if (!e) continue;
      this.seen.delete(id);
      this.death(e);
    }
    if (j.gs) for (const [id, x, z, tier] of j.gs) this.gems.set(id, { x, z, tier, mag: 0, spd: 0, born: this.animT, seed: Math.random() * 6, gone: 0 });
    if (j.gm) for (const [id, pid] of j.gm) { const g = this.gems.get(id); if (g) { g.mag = pid; g.spd = 2; } }
    if (j.gc) for (const [id, pid] of j.gc) {
      const g = this.gems.get(id);
      this.gems.delete(id);
      if (g && this.hooks.gem) this.hooks.gem(pid, g.tier);
      const p = ctx.playerPos(pid);
      if (p) this.particles.burst(3, { kind: 'star', x: p.x, y: 0.9, z: p.z, life: 0.35, size: 0.28, size1: 0.05, r: GEM_GLOW[g ? g.tier : 1][0], g: GEM_GLOW[g ? g.tier : 1][1], b: GEM_GLOW[g ? g.tier : 1][2], speed: 2, up: 2 });
    }
    if (j.ps) for (const [id, kind, x, z] of j.ps) this.pickups.set(id, { kind, x, z, mag: 0, spd: 0, born: this.animT, seed: Math.random() * 6 });
    if (j.pc) for (const [id, pid, got] of j.pc) {
      const k = this.pickups.get(id);
      if (!k) continue;
      if (got) {
        this.pickups.delete(id);
        if (this.hooks.pickup) this.hooks.pickup(pid, k.kind, k);
      } else { k.mag = pid; k.spd = 2; }
    }
  }

  // full state for a client that connects mid-run
  applyState(m) {
    for (const [id, x, z, tier] of m.gems || []) this.gems.set(id, { x, z, tier, mag: 0, spd: 0, born: -9, seed: Math.random() * 6, gone: 0 });
    for (const [id, kind, x, z] of m.pickups || []) this.pickups.set(id, { kind, x, z, mag: 0, spd: 0, born: -9, seed: Math.random() * 6 });
  }

  // ---------------------------------------------------------------- events
  projectile(e, snapTime) {
    const [, id, kind] = e;
    if (kind === 'flask') {
      const [, , , px, pz, tx, tz, flight, pid] = e;
      this.projs.set(id, { kind, x: px, z: pz, sx: px, sz: pz, tx, tz, t0: snapTime - 0.033, life: flight, pid, flask: true, rot: 0, trailT: 0 });
      return;
    }
    const [, , , x, z, vx, vz, life, pid, r] = e;
    this.projs.set(id, { kind, x, z, sx: x, sz: z, vx, vz, t0: snapTime - 0.033, life, pid, r: r || 0.3, rot: Math.random() * 6, trailT: 0, off: null });
  }

  projectileGone(id) {
    const p = this.projs.get(id);
    if (!p) return;
    this.projs.delete(id);
    if (p.flask) return;
    const def = PROJ[p.kind] || PROJ.bolt;
    if (def.dir || p.kind === 'wisp') {
      const c = def.glow || [1, 0.95, 0.8];
      this.particles.burst(4, { kind: 'spark', x: p.x, y: 0.8, z: p.z, life: 0.22, size: 0.3, size1: 0.05, r: c[0], g: c[1], b: c[2], speed: 3, up: 1.5 });
    }
  }

  shot(e, snapTime) {
    const [, id, kind, x, z, vx, vz, life] = e;
    this.shots.set(id, { kind, x, z, sx: x, sz: z, vx, vz, t0: snapTime - 0.033, life });
  }

  shotGone(id) {
    const s = this.shots.get(id);
    if (!s) return;
    this.shots.delete(id);
    const c = (SHOT[s.kind] || SHOT.orb).glow;
    this.particles.burst(5, { kind: 'dot', x: s.x, y: 0.8, z: s.z, life: 0.3, size: 0.4, size1: 0.05, r: c[0], g: c[1], b: c[2], speed: 2.5, up: 1 });
  }

  number(x, y, z, val, style) {
    if (this.showNumbers === false && style !== 'hurt' && style !== 'heal') return;
    if (this.nums.length > 260) this.nums.shift();
    this.nums.push({ x, y, z, val: String(Math.round(val)), t: 0, style });
  }

  enemyPos(id) {
    return this.seen.get(id) || null;
  }

  death(e) {
    const def = DEFS[e.type];
    if (!def) return;
    const r = this.etypes[e.type].rects[e.frame || 0];
    this.corpses.push({ type: e.type, rect: r, x: e.x, y: e.y, z: e.z, w: e.w, h: e.h, flip: e.flip, t: 0, big: def.boss || def.elite });
    if (def.prop) {
      this.particles.burst(10, { kind: 'flame', x: e.x, y: 0.8, z: e.z, life: 0.6, size: 0.45, size1: 0.1, r: 1.6, g: 0.7, b: 0.2, speed: 2.5, up: 3, grav: 4 });
      this.particles.burst(6, { kind: 'smoke', add: false, x: e.x, y: 0.6, z: e.z, life: 0.8, size: 0.6, size1: 0.2, r: 0.4, g: 0.35, b: 0.35, speed: 1.2, up: 1.5, drag: 2 });
    } else {
      const s = def.boss ? 3 : def.elite ? 2 : 1;
      const tint = def.pal === 'ice' ? [0.75, 0.9, 1] : def.pal === 'fire' ? [0.75, 0.5, 0.4] : [0.62, 0.52, 0.72];
      this.particles.burst(4 + s * 4, { kind: 'smoke', add: false, x: e.x, y: e.y + e.h * 0.3, z: e.z, jitter: e.w * 0.4, life: 0.55 + s * 0.15, size: 0.55 * s, size1: 0.12, r: tint[0], g: tint[1], b: tint[2], a: 1, a1: 0, speed: 1.4 * s, up: 1.6, drag: 3 });
      this.particles.burst(3 + s * 3, { kind: 'spark', x: e.x, y: e.y + e.h * 0.4, z: e.z, life: 0.3, size: 0.32, size1: 0.05, r: 1.3, g: 1.1, b: 0.8, speed: 3.5 * s, up: 2.5 });
    }
    if (this.hooks.kill) this.hooks.kill(e, def);
  }

  // ---------------------------------------------------------------- per frame
  begin() {
    this.enemyL.begin(); this.blobL.begin(); this.itemL.begin(); this.projL.begin();
    this.glowL.begin(); this.flatL.begin(); this.digitL.begin(); this.uiL.begin();
  }

  end() {
    this.enemyL.end(); this.blobL.end(); this.itemL.end(); this.projL.end();
    this.glowL.end(); this.flatL.end(); this.digitL.end(); this.uiL.end();
  }

  // ctx: { rt, br:[a,b,f], dt, time, paused, playerPos(pid), localOffset(pid) }
  update(ctx) {
    const { dt, rt, br, time, paused } = ctx;
    if (!paused) this.animT += dt;
    this.frameNo++;
    if (br) this.drawEnemies(br, rt, dt, time);
    if (br) this.drawMinions(br, time, ctx);
    this.drawCorpses(dt);
    this.drawGems(ctx);
    this.drawPickups(ctx);
    this.drawProjectiles(ctx);
    this.drawShots(ctx);
    this.drawNumbers(dt);
    this.particles.update(dt);
  }

  drawEnemies(br, rt, dt, time) {
    const [A, B, f] = br;
    if (!B.idx) { B.idx = new Map(); for (const e of B.enemies) B.idx.set(e.id, e); }
    const fn = this.frameNo;
    const L = this.enemyL;
    for (let i = 0; i < A.enemies.length; i++) {
      const a = A.enemies[i];
      const b = B.idx.get(a.id);
      let x = a.x, z = a.z;
      if (b && b.type === a.type) {
        const dx = b.x - a.x, dz = b.z - a.z;
        if (dx * dx + dz * dz < 9) { x += dx * f; z += dz * f; }
        else if (f > 0.5) { x = b.x; z = b.z; }
      }
      const type = a.type;
      const def = DEFS[type];
      const T = this.etypes[type];
      if (!def || !T) continue;
      let s = this.seen.get(a.id);
      if (!s || s.type !== type) {
        s = { born: rt, type, x, z, y: 0, h: 1, w: 1, squash: 0, flash: 0, frame: 0, flip: false, fn };
        this.seen.set(a.id, s);
      }
      s.fn = fn;
      const flags = a.flags;
      const frozen = (flags & EF.FROZEN) !== 0;
      const fps = T.fps * ((flags & EF.SLOW) ? 0.5 : 1);
      const fr = frozen ? s.frame : Math.floor(this.animT * fps + a.id * 0.37) % T.rects.length;
      const rect = T.rects[fr];
      const tier = a.tier || 1;
      const scale = (def.boss ? 1.2 : 1) * TIER_SCALE[tier];
      let w = (rect.w / PPU) * scale, h = (rect.h / PPU) * scale;
      if (s.squash > 0) {
        s.squash -= dt;
        const k = Math.max(0, s.squash) / 0.1;
        w *= 1 + 0.14 * k;
        h *= 1 - 0.1 * k;
      }
      if (s.flash > 0) s.flash -= dt;
      const age = rt - s.born;
      const rise = Math.min(1, age / 0.35);
      let y = 0;
      if (def.fly) y = 0.35 + Math.sin(this.animT * 3 + a.id) * 0.12;
      else if (rise < 1 && age < 2) y = -(1 - rise) * h * 0.7;
      const flip = (flags & EF.LEFT) !== 0;
      const flash = (flags & EF.FLASH) || s.flash > 0 ? 1 : 0;
      const frost = frozen ? 1 : (flags & EF.SLOW) ? 0.35 : 0;
      s.x = x; s.z = z; s.y = Math.max(0, y); s.w = w; s.h = h; s.frame = fr; s.flip = flip;
      const tint = TIER_TINT[tier];
      L.push(x, y, z, w, h, rect, flip, tint[0], tint[1], tint[2], rise < 1 ? 0.3 + rise * 0.7 : 1, flash, frost, 0);
      if (tier === 3) {
        const pulse = 0.5 + 0.2 * Math.sin(time * 4 + a.id);
        this.flatL.push(x, 0.04, z, def.r * 2.6 * scale, def.r * 2.2 * scale, this.fx.ring, false, 0.9 * pulse, 0.12 * pulse, 0.5 * pulse, 1);
      }
      const bs = Math.max(0.9, def.r * 2.3) * (def.fly ? 0.75 : 1);
      this.blobL.push(x, 0.03, z + 0.05, bs, bs * 0.5, FULL, false, 1, 1, 1, 0.9 * rise);
      if (def.elite || def.boss) {
        const pulse = 0.55 + 0.25 * Math.sin(time * 5 + a.id);
        const rs = def.r * 2.6;
        const c = def.boss ? [1.2, 0.25, 0.5] : [1.1, 0.45, 0.15];
        this.flatL.push(x, 0.04, z, rs, rs * 0.85, this.fx.ring, false, c[0] * pulse, c[1] * pulse, c[2] * pulse, 1);
        const frac = this.bars.get(a.id);
        if (def.elite && frac !== undefined) {
          const by = y + h + 0.25, bw = 1.4;
          this.uiL.push(x, by, z, bw + 0.08, 0.16, this.fx.px, false, 0.05, 0.03, 0.08, 0.85);
          this.uiL.push(x - (bw * (1 - frac)) / 2, by, z, bw * frac, 0.09, this.fx.px, false, 0.95, 0.25, 0.25, 1);
        }
      }
    }
    // forget enemies not drawn for a while
    if (fn % 60 === 0) for (const [id, s] of this.seen) if (fn - s.fn > 90) this.seen.delete(id);
  }

  // summoned allies (skeletons, wolves, turrets), interpolated like the horde
  drawMinions(br, time, ctx) {
    const [A, B, f] = br;
    const la = A.json.mn, lb = B.json.mn;
    if (!la) return;
    if (lb && !B.mnIdx) B.mnIdx = new Map(lb.map((r) => [r[0], r]));
    for (const a of la) {
      const b = B.mnIdx && B.mnIdx.get(a[0]);
      let x = a[2], z = a[3];
      if (b) { x += (b[2] - a[2]) * f; z += (b[3] - a[3]) * f; }
      const T = this.minionTypes[a[1]] || this.minionTypes.skeleton;
      if (!T) continue;
      const fr = a[1] === 'turret' ? Math.floor(this.animT * T.fps) % T.rects.length : Math.floor(this.animT * T.fps + a[0] * 0.37) % T.rects.length;
      const rect = T.rects[fr];
      const sc = a[1] === 'skeleton' ? 0.85 : 1;
      const w = (rect.w / PPU) * sc, h = (rect.h / PPU) * sc;
      const tint = a[1] === 'skeleton' ? [0.75, 1.05, 1.15] : [1, 1, 1];
      this.enemyL.push(x, 0, z, w, h, rect, a[4] === 1, tint[0], tint[1], tint[2], 1, 0, 0, 0);
      this.blobL.push(x, 0.03, z + 0.04, w * 0.7, w * 0.35, FULL, false, 1, 1, 1, 0.7);
      const c = ctx.playerColor ? ctx.playerColor(a[5]) : null;
      if (c) this.flatL.push(x, 0.04, z, w * 0.9, w * 0.75, this.fx.ring, false, c.r * 0.5, c.g * 0.5, c.b * 0.5, 1);
      if (a[1] !== 'turret' && Math.random() < 0.05) this.particles.spawn({ kind: 'dot', x: x + (Math.random() - 0.5) * 0.6, y: 0.3 + Math.random() * h, z, vy: 0.6, life: 0.6, size: 0.18, size1: 0, r: 0.5, g: 0.9, b: 1.2, floor: false });
    }
  }

  drawCorpses(dt) {
    let w = 0;
    for (const c of this.corpses) {
      c.t += dt;
      const dur = c.big ? 0.7 : 0.32;
      if (c.t >= dur) continue;
      this.corpses[w++] = c;
      const k = c.t / dur;
      this.enemyL.push(c.x, c.y + k * 0.3, c.z, c.w * (1 + k * 0.15), c.h * (1 - k * 0.25), c.rect, c.flip, 1, 1, 1, 1 - k, 1, 0, 0);
    }
    this.corpses.length = w;
  }

  drawGems(ctx) {
    const { dt, paused } = ctx;
    const t = this.animT;
    for (const [id, g] of this.gems) {
      if (g.mag && !paused) {
        const p = ctx.playerPos(g.mag);
        if (p) {
          g.spd = Math.min(26, g.spd + dt * 40);
          const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
          if (d < 0.45) { g.gone += dt; if (g.gone > 1) this.gems.delete(id); continue; }
          const st = Math.min(d, g.spd * dt);
          g.x += (dx / d) * st;
          g.z += (dz / d) * st;
        }
      }
      const age = t - g.born;
      const hop = age < 0.3 ? Math.sin((age / 0.3) * Math.PI) * 0.55 : 0;
      const y = 0.08 + hop + Math.sin(t * 3 + g.seed) * 0.06;
      const s = GEM_SIZE[g.tier] || 0.62;
      const tw = Math.sin(t * 4 + g.seed * 3) > 0.92 ? 0.6 : 0;
      this.itemL.push(g.x, y, g.z, s, s, this.fx['gem' + g.tier] || this.fx.gem1, false, 1, 1, 1, 1, tw, 0, 0);
      if (g.tier >= 3 || g.mag) {
        const c = GEM_GLOW[g.tier];
        this.glowL.push(g.x, y + s * 0.45, g.z, s * 1.8, s * 1.8, this.fx.glow, false, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 1);
      }
    }
  }

  drawPickups(ctx) {
    const { dt, paused, time } = ctx;
    const t = this.animT;
    for (const [id, k] of this.pickups) {
      if (k.mag && !paused) {
        const p = ctx.playerPos(k.mag);
        if (p) {
          k.spd = Math.min(26, k.spd + dt * 40);
          const dx = p.x - k.x, dz = p.z - k.z, d = Math.hypot(dx, dz);
          if (d > 0.45) {
            const st = Math.min(d, k.spd * dt);
            k.x += (dx / d) * st;
            k.z += (dz / d) * st;
          }
        }
      }
      const s = PICKUP_SIZE[k.kind] || 0.9;
      const bob = k.kind === 'chest' ? 0 : 0.12 + Math.sin(t * 2.6 + k.seed) * 0.1;
      this.itemL.push(k.x, bob, k.z, s, s, this.fx[k.kind] || this.fx.coin, false, 1, 1, 1, 1, 0, 0, 0);
      this.blobL.push(k.x, 0.03, k.z + 0.04, s * 0.9, s * 0.45, FULL, false, 1, 1, 1, 0.7);
      if (k.kind === 'chest') {
        const pulse = 0.75 + 0.25 * Math.sin(time * 3);
        this.glowL.push(k.x, 2.6, k.z, 1.3, 5.6, this.fx.glow, false, 0.9 * pulse, 0.7 * pulse, 0.25 * pulse, 1);
        this.glowL.push(k.x, 0.6, k.z, 2.4, 2.4, this.fx.glow, false, 0.6, 0.45, 0.15, 1);
        if (Math.random() < dt * 6) this.particles.spawn({ kind: 'star', x: k.x + (Math.random() - 0.5) * 1.2, y: 0.3, z: k.z + (Math.random() - 0.5) * 0.6, vy: 1.6, life: 1.2, size: 0.22, size1: 0, r: 1.4, g: 1.1, b: 0.5, floor: false });
      } else if (Math.random() < dt * 1.5) {
        this.particles.spawn({ kind: 'star', x: k.x + (Math.random() - 0.5) * 0.6, y: bob + s * 0.8, z: k.z, vy: 0.6, life: 0.6, size: 0.2, size1: 0, r: 1.3, g: 1.2, b: 0.9, floor: false });
      }
    }
  }

  drawProjectiles(ctx) {
    const { rt, dt, br, paused } = ctx;
    const tp = br ? br : null;
    let A = null, B = null, f = 0;
    if (tp) {
      [A, B, f] = tp;
      if (!A.tpIdx) A.tpIdx = new Map((A.json.tp || []).map((r) => [r[0], r]));
      if (!B.tpIdx) B.tpIdx = new Map((B.json.tp || []).map((r) => [r[0], r]));
    }
    for (const [id, p] of this.projs) {
      const def = PROJ[p.kind] || PROJ.bolt;
      const age = rt - p.t0;
      if (age > p.life + 0.25) { this.projs.delete(id); continue; }
      let x, z, y = 0.8;
      if (p.flask) {
        const k = Math.min(1, Math.max(0, age / p.life));
        x = p.sx + (p.tx - p.sx) * k;
        z = p.sz + (p.tz - p.sz) * k;
        y = 0.8 + Math.sin(k * Math.PI) * 2.4;
        if (k >= 1) { this.projs.delete(id); continue; }
      } else {
        const ta = A && A.tpIdx.get(id), tb = B && B.tpIdx.get(id);
        if (ta && tb) { x = ta[1] + (tb[1] - ta[1]) * f; z = ta[2] + (tb[2] - ta[2]) * f; }
        else if (ta) { x = ta[1]; z = ta[2]; }
        else { x = p.sx + p.vx * Math.max(0, age); z = p.sz + p.vz * Math.max(0, age); }
        // local throws start from where the thrower is drawn (prediction offset), blending out
        const off = ctx.ownerOffset ? ctx.ownerOffset(p.pid) : null;
        if (off && age < 0.3) { const k = 1 - age / 0.3; x += off.x * k; z += off.z * k; }
        if (ta && tb) { p.vx = (tb[1] - ta[1]) * 15; p.vz = (tb[2] - ta[2]) * 15; }
      }
      p.x = x; p.z = z;
      if (!paused) p.rot += (def.spin || 0) * dt;
      const rot = def.dir ? screenAngle(p.vx, p.vz) : p.rot;
      if (def.swirl) {
        // gravity wells and cyclones: a churning disc on the ground plus debris
        const R = p.r || 1.5;
        const c = p.kind === 'void' ? [0.7, 0.25, 1.2] : [0.75, 0.9, 1.05];
        this.flatL.push(x, 0.05, z, R * 2, R * 1.8, this.fx.ring, false, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 1, 0, 0, -this.animT * 3);
        this.flatL.push(x, 0.06, z, R * 1.3, R * 1.15, this.fx.ring, false, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1, 0, 0, this.animT * 5);
        if (!paused && Math.random() < dt * 30) {
          const a = Math.random() * 6.28, rr = R * (0.4 + Math.random() * 0.6);
          this.particles.spawn({ kind: p.kind === 'void' ? 'dot' : 'leaf', add: p.kind === 'void', x: x + Math.cos(a) * rr, y: 0.3 + Math.random(), z: z + Math.sin(a) * rr, vx: -Math.sin(a) * 4, vz: Math.cos(a) * 4, vy: p.kind === 'void' ? -0.5 : 1.5, life: 0.5, size: 0.3, size1: 0.05, r: c[0], g: c[1], b: c[2], drag: 2, floor: false });
        }
        if (p.kind === 'wind') { for (let k = 0; k < 3; k++) this.projL.push(x, 0.5 + k * 0.7, z, R * (0.8 + k * 0.35), R * 0.5, this.fx.wind, false, 1, 1, 1, 0.85, 0, 0, this.animT * (8 + k * 3)); }
        else this.projL.push(x, 0.6, z, R * 0.7, R * 0.7, this.fx.void, false, 1, 1, 1, 1, 0, 0, this.animT * 2);
        if (def.glow) this.glowL.push(x, 0.6, z, R * 2.2, R * 2.2, this.fx.glow, false, def.glow[0] * 0.4, def.glow[1] * 0.4, def.glow[2] * 0.4, 1);
        continue;
      }
      const tint = def.tint || [1, 1, 1];
      this.projL.push(x, y, z, def.size, def.size, this.fx[def.rect], false, tint[0], tint[1], tint[2], Math.min(1, age * 20 + 0.3), 0, 0, rot);
      if (def.glow) this.glowL.push(x, y, z, def.glowS, def.glowS, this.fx.glow, false, def.glow[0] * 0.55, def.glow[1] * 0.55, def.glow[2] * 0.55, 1);
      if (def.crackle && !paused && Math.random() < dt * 12) this.particles.spawn({ kind: 'spark', x: x + (Math.random() - 0.5) * 1.2, y: y + (Math.random() - 0.5), z: z + (Math.random() - 0.5) * 1.2, life: 0.12, size: 0.35, size1: 0.1, r: 0.8, g: 1.1, b: 1.8, floor: false });
      if (def.trail && !paused) {
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = def.trailN;
          const c = def.trail;
          this.particles.spawn({ kind: def.flame ? 'flame' : 'dot', x, y, z, vy: def.flame ? 0.8 : 0, life: def.flame ? 0.35 : 0.2, size: def.flame ? 0.45 : 0.32, size1: 0.05, r: c[0], g: c[1], b: c[2], a: 0.8, floor: false });
        }
      }
    }
  }

  drawShots(ctx) {
    const { rt, time } = ctx;
    for (const [id, s] of this.shots) {
      const age = rt - s.t0;
      if (age > s.life + 0.2) { this.shots.delete(id); continue; }
      const a = Math.max(0, age);
      s.x = s.sx + s.vx * a;
      s.z = s.sz + s.vz * a;
      const d = SHOT[s.kind] || SHOT.orb;
      const pulse = 0.85 + 0.15 * Math.sin(time * 18 + id);
      this.projL.push(s.x, 0.8, s.z, 0.8 * pulse, 0.8 * pulse, this.fx[d.rect], false, 1, 1, 1, 1, 0, 0, time * 4);
      this.glowL.push(s.x, 0.8, s.z, 1.5, 1.5, this.fx.glow, false, d.glow[0] * 0.5, d.glow[1] * 0.5, d.glow[2] * 0.5, 1);
    }
  }

  drawNumbers(dt) {
    let w = 0;
    for (const n of this.nums) {
      n.t += dt;
      const dur = n.style === 'big' || n.style === 'hurt' ? 0.85 : 0.65;
      if (n.t >= dur) continue;
      this.nums[w++] = n;
      const k = n.t / dur;
      const pop = n.t < 0.09 ? 1.6 - (n.t / 0.09) * 0.6 : 1;
      const sc = (n.style === 'big' ? 1.35 : n.style === 'hurt' ? 1.25 : n.style === 'heal' || n.style === 'gold' ? 1.1 : 1) * pop * 0.03;
      const y = n.y + k * 0.45;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const col = n.style === 'big' ? [1, 0.82, 0.25] : n.style === 'hurt' ? [1, 0.3, 0.3] : n.style === 'heal' ? [0.45, 1, 0.5] : n.style === 'gold' ? [1, 0.85, 0.3] : [1, 1, 1];
      const gw = 7 * sc, gh = 9 * sc;
      const len = n.val.length;
      for (let i = 0; i < len; i++) {
        const d = n.val.charCodeAt(i) - 48;
        if (d < 0 || d > 9) continue;
        this.digitL.push(n.x + (i - (len - 1) / 2) * gw * 0.86, y, n.z, gw, gh, this.digits[d], false, col[0], col[1], col[2], a);
      }
    }
    this.nums.length = w;
  }

  clear() {
    this.seen.clear();
    this.corpses.length = 0;
    this.gems.clear();
    this.pickups.clear();
    this.projs.clear();
    this.shots.clear();
    this.nums.length = 0;
    this.particles.clear();
    this.begin();
    this.end();
  }

  dispose() {
    this.scene.remove(this.enemyL.mesh, this.blobL.mesh, this.itemL.mesh, this.projL.mesh, this.glowL.mesh, this.flatL.mesh);
    this.R.overlay.remove(this.uiL.mesh, this.digitL.mesh);
    for (const l of [this.enemyL, this.blobL, this.itemL, this.projL, this.glowL, this.flatL, this.digitL, this.uiL]) l.dispose();
    this.particles.dispose(this.scene);
  }
}

const FULL = { u: 0, v: 0, du: 1, dv: 1 };
// evolved monsters: bigger, and tinted ember-red (tier 2) or void-violet (tier 3)
const TIER_SCALE = [1, 1, 1.15, 1.3];
const TIER_TINT = [[1, 1, 1], [1, 1, 1], [1.12, 0.86, 0.82], [0.86, 0.72, 1.12]];
