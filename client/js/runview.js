// The run as this client sees it. The world is played back from server snapshots about 100 ms
// in the past (smooth interpolation, events fire when their snapshot is reached), while the
// local travelers move instantly under the player's hands and report their position to the
// server, which validates it. Everything streamed is routed to entities, weapon effects, the
// HUD and audio from here.
import * as THREE from 'three';
import { PHASE, PS, BASE_MOVE_SPEED, SEAT_COLORS } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { WEAPONS, PASSIVES, weaponStats } from '/shared/items.js';
import { ENEMIES, ENEMY_IDS } from '/shared/enemies.js';
import { STAGES } from '/shared/stages.js';
import { settingValue } from '/shared/settings.js';
import { TravelerView } from './actors.js';
import { Entities } from './entities.js';
import { WeaponFX } from './weaponfx.js';
import { Hud } from './hud.js';
import { iconURL } from './icons.js';
import { portraitCanvas } from './sprites.js';

const SEND_DT = 1 / 30;
const RUN_PHASES = new Set([PHASE.RUN, PHASE.LEVELUP, PHASE.CHEST, PHASE.OVER]);
const CAM_H = 21, CAM_Z = 18.5;
const pURL = new Map();
const portraitURL = (ci) => {
  if (!pURL.has(ci)) pURL.set(ci, portraitCanvas(ci, 2).toDataURL());
  return pURL.get(ci);
};

export function isRunPhase(ph) {
  return RUN_PHASES.has(ph);
}

export class RunView {
  constructor({ R, world, net, input, audio, guild, local, app, toast, view, options }) {
    Object.assign(this, { R, world, net, input, audio, guild, local, app, toast, view, options });
    this.active = false;
    this.hud = new Hud({ send: (m) => net.send(m), sfx: (n) => audio.play(n) });
    this.hud.onAction = (a) => { if (a === 'lobby') net.send({ t: 'lobby' }); };
    this.v3 = new THREE.Vector3();
    this.cam = {
      project: (x, y, z) => {
        const v = this.v3.set(x, y, z).project(this.R.camera);
        const on = v.z < 1 && v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1;
        return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight, on];
      },
    };
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    if (this.active) return;
    this.active = true;
    const R = this.R;
    this.stageIndex = settingValue(this.app.settings, 'stage') || 0;
    this.world.setStage(this.stageIndex);
    this.ents = new Entities(R);
    this.fx = new WeaponFX(R, this.ents, {
      shake: (a, x, z) => this.shake(a, x, z),
      flash: (c, a) => this.flash(c, a),
    });
    this.ents.hooks.kill = (e, def) => this.onKill(e, def);
    this.ents.hooks.gem = (pid) => this.onGem(pid);
    this.ents.hooks.pickup = (pid, kind, k) => this.onPickupGone(pid, kind, k);
    this.players = new Map();
    for (const r of this.app.roster.values()) this.addPlayer(r);
    this.lastTick = -1;
    this.snapState = null; // latest processed snapshot json
    this.sendAcc = 0;
    this.focus = new THREE.Vector3();
    this.focusInit = false;
    this.zoom = 1;
    this.trauma = 0;
    this.flashV = 0;
    this.hurtV = 0;
    this.freezeT = 0;
    this.bossId = 0;
    this.bossType = -1;
    this.overAt = 0;
    this.goldBanked = false;
    this.lastHitSfx = 0;
    this.gemStreak = 0;
    this.gemStreakT = 0;
    this.runT = 0;
    this.phase = PHASE.RUN;
    this.hud.build(this.players, this.local);
    this.hud.ctx = { players: this.players, local: this.local };
    this.hud.show(true);
    this.audio.music('battle', this.stageIndex);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    for (const P of this.players.values()) { this.R.scene.remove(P.view.root); P.view.dispose(); }
    this.players.clear();
    this.fx.clear();
    this.ents.dispose();
    this.ents = null;
    this.fx = null;
    this.world.dynamicLights = [];
    this.hud.hideLevelUp();
    this.hud.hideChest();
    this.hud.show(false);
    this.net.reset();
    const g = this.R.grade.uniforms;
    g.flash.value = 0; g.hurt.value = 0; g.desat.value = 0;
  }

  addPlayer(r) {
    if (this.players.has(r.id)) return this.players.get(r.id);
    const view = new TravelerView(r.char);
    this.R.scene.add(view.root);
    const P = {
      id: r.id, name: r.name, char: r.char, seat: r.seat, color: SEAT_COLORS[r.seat] || '#ffffff', view,
      local: this.local.has(r.id), x: 0, z: 0, sx: 0, sz: 0, px: 0, pz: 0, init: false, mx: 0, mz: 0,
      state: PS.ALIVE, hp: 100, maxHp: 100, revive: 0, iframes: 0, gold: 0, kills: 0, hurtT: 0,
      inv: null, weapons: [], moveSpeed: 1,
    };
    this.players.set(r.id, P);
    return P;
  }

  removePlayer(id) {
    const P = this.players.get(id);
    if (!P) return;
    this.R.scene.remove(P.view.root);
    P.view.dispose();
    this.players.delete(id);
    this.hud.removePlayer(id);
  }

  onRoster() {
    if (!this.active) return;
    for (const P of this.players.values()) P.local = this.local.has(P.id);
  }

  onChoices(m) {
    if (!this.active) return;
    this.hud.showChoices(m, this.players, this.local);
  }

  onState(m) {
    if (!this.active) return;
    this.ents.applyState(m);
    for (const row of m.players || []) {
      const P = this.players.get(row.id);
      if (P) this.applyInv(P, row.weapons, row.passives, null);
    }
  }

  // ---------------------------------------------------------------- snapshots
  process(s) {
    const j = s.json;
    const prevPh = this.phase;
    this.snapState = j;
    this.phase = j.ph;
    if (j.stage !== undefined && j.stage !== this.stageIndex) {
      this.stageIndex = j.stage;
      this.world.setStage(j.stage);
    }
    const ctx = this.ctx || this.makeCtx(0, 0, null, 0);
    this.ents.applySnap(s, ctx);
    if (s.dmg.length) this.audio.play('hit');
    for (const row of j.p) {
      const P = this.players.get(row[0]);
      if (!P) continue;
      P.hp = row[4]; P.maxHp = row[5];
      const st = row[6];
      if (st !== P.state && st === PS.DOWNED) P.view.flash = 0;
      P.state = st;
      P.revive = row[7]; P.iframes = row[8]; P.gold = row[9]; P.kills = row[10];
      P.shield = row[11] || 0; P.respawnIn = row[12] || 0;
      P.boneHP = row[13] || 0; P.boneMax = row[14] || 0; P.buffed = row[15] || 0;
    }
    for (const e of j.ev) this.event(e, s);
    if (prevPh === PHASE.LEVELUP && j.ph !== PHASE.LEVELUP) this.hud.hideLevelUp();
    if (j.fz && this.freezeT < 0.2) this.freezeT = 0.25;
  }

  applyInv(P, weapons, passives, stats) {
    P.inv = { weapons, passives, stats: stats || (P.inv && P.inv.stats) || null };
    if (stats) P.moveSpeed = stats.moveSpeed || 1;
    const st = P.inv.stats || { might: 1, cooldown: 1, area: 1, speed: 1, duration: 1, amount: 0 };
    P.weapons = weapons.filter(([id]) => WEAPONS[id]).map(([id, lvl, t0]) => ({ id, lvl, t0, ws: weaponStats(id, lvl, st) }));
  }

  // ---------------------------------------------------------------- events
  event(e, s) {
    const P = (id) => this.players.get(id);
    const ents = this.ents, fx = this.fx, hud = this.hud, A = this.audio;
    switch (e[0]) {
      case 'inv': {
        const p = P(e[1]);
        if (p) this.applyInv(p, e[2], e[3], e[4]);
        break;
      }
      case 'sw': {
        const p = P(e[1]);
        if (p) { fx.cleave(p.x, p.z, e[2], e[3], e[4]); A.play('slash', { local: p.local }); }
        break;
      }
      case 'pj':
        ents.projectile(e, s.time);
        A.play(e[2] === 'flask' ? 'toss' : e[2] === 'orb' ? 'fire' : e[2] === 'axe' ? 'axe' : e[2] === 'wisp' ? 'wisp' : e[2] === 'knife' || e[2] === 'edge' ? 'knife' : 'shoot', { local: this.isLocal(e[8]) });
        break;
      case 'pd': ents.projectileGone(e[1]); break;
      case 'ex': fx.explosion(e[1], e[2], e[3], e[4]); A.play(e[4] === 'meteor' ? 'meteor' : 'boom'); break;
      case 'mt': fx.meteorIncoming(e[1], e[2], e[3], e[4]); A.play('whoosh'); break;
      case 'zn': fx.zone(e[1], e[2], e[3], e[4], e[5], e[6]); A.play('splash'); break;
      case 'zap': fx.zap(e[1], e[2], e[3], e[4], e[5]); A.play(e[5] === 'holy' ? 'heal' : 'zap'); break;
      case 'spin': { const p = P(e[1]); if (p) { fx.spin(e[1], e[2], e[3], e[4], e[5]); A.play('whoosh'); } break; }
      case 'beam': fx.beam(e[1], e[2], e[3], e[4], e[5], e[6], e[7]); A.play('zap'); break;
      case 'cone': fx.cone(e[1], e[2], e[3], e[4], e[5], e[6]); A.play('fire'); break;
      case 'rain': fx.rain(e[1], e[2], e[3], e[4], e[5]); A.play('whoosh'); break;
      case 'fis': fx.fissure(e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8], e[9]); A.play('quake'); break;
      case 'mine': fx.mine(e[1], e[2], e[3], e[4]); break;
      case 'md': fx.mineGone(e[1]); break;
      case 'summon': fx.summonPuff(e[3], e[4], e[2]); A.play('wisp'); break;
      case 'unsummon': break;
      case 'buff': fx.buff(e[1], e[2], e[3]); A.play('levelup'); break;
      case 'blk': { const p = P(e[1]); if (p) { fx.sparkleAt(p.x, p.z, [1, 0.95, 0.8], 5); if (p.local) A.play('crack'); } break; }
      case 'arc': fx.arc(e[1], e[2], e[3], e[4]); break;
      case 'nv': {
        const p = P(e[1]);
        if (p) { fx.nova(p.x, p.z, e[2], e[3], e[4]); A.play(e[4] === 'quake' || e[4] === 'shout' ? 'quake' : e[4] === 'thorn' || e[4] === 'bone' ? 'slash' : e[4] === 'song' ? 'heal' : 'frost'); }
        break;
      }
      case 'es': ents.shot(e, s.time); break;
      case 'ed': ents.shotGone(e[1]); break;
      case 'wave': fx.quake(e[2], e[3], e[4], e[5]); A.play('quake'); break;
      case 'tg': fx.telegraph(e[1], e[2], e[3], e[4], ents.enemyPos(e[1])); A.play('roar'); break;
      case 'boss': {
        this.bossId = e[1];
        this.bossType = e[2];
        const def = ENEMIES[ENEMY_IDS[e[2]]];
        hud.banner(def ? def.name : 'A great foe', e[3] ? 'The endless night takes form. Survive until dawn!' : 'A great foe draws near!', 3.6);
        A.play('horn');
        A.music(e[3] ? 'final' : 'boss', this.stageIndex);
        for (const L of this.local.values()) this.input.rumble(L.slot, 0.8, 0.4, 500);
        this.shake(0.3);
        break;
      }
      case 'elite': {
        const def = ENEMIES[ENEMY_IDS[e[2]]];
        hud.feed(`<b>${def ? def.name : 'An elite'}</b> has appeared!`);
        A.play('elite');
        break;
      }
      case 'ab':
        if (e[2] === 'roots') { hud.feed('<b>Roots</b> erupt from the earth!'); A.play('quake'); }
        else if (e[2] === 'orbs') A.play('orbs');
        break;
      case 'warn': hud.banner(e[1], e[2]); A.play('warn'); break;
      case 'hurt': {
        const p = P(e[1]);
        if (!p) break;
        p.view.hit();
        p.hurtT = 0.18;
        ents.number(p.x, 2.2, p.z, e[2], 'hurt');
        if (p.local) {
          const L = this.local.get(p.id);
          if (L) this.input.rumble(L.slot, Math.min(1, 0.35 + e[2] * 0.03), 0.3, 130);
          this.hurtV = Math.min(0.75, this.hurtV + 0.2 + e[2] * 0.012);
          this.shake(0.12 + Math.min(0.25, e[2] * 0.01));
          A.play('hurt');
        }
        break;
      }
      case 'dn': {
        const p = P(e[1]);
        if (!p) break;
        A.play('down');
        hud.feed(`<b>${p.name}</b> has fallen!${e[2] ? ' Hold out and they return in 30 seconds.' : ''}`);
        break;
      }
      case 'up': {
        const p = P(e[1]), by = P(e[2]);
        if (!p) break;
        if (e[3] !== undefined) {
          // back on their feet next to an ally
          p.x = p.sx = e[3]; p.z = p.sz = e[4];
          p.view.root.position.set(p.x, 0, p.z);
        }
        fx.sparkleAt(p.x, p.z, [1.4, 1.3, 0.6], 16);
        fx.holyBurst(p.x, p.z, 2.2);
        A.play('revive');
        hud.feed(`<b>${p.name}</b> is back in the fight!`);
        break;
      }
      case 'rv': {
        const p = P(e[1]);
        if (p) { fx.holyBurst(p.x, p.z, 5); A.play('revive'); hud.feed(`<b>${p.name}</b> rises again!`); }
        break;
      }
      case 'lvl':
        for (const p of this.players.values()) if (p.state === PS.ALIVE) fx.levelPillar(p.x, p.z);
        for (const L of this.local.values()) this.input.rumble(L.slot, 0.2, 0.5, 220);
        A.play('levelup');
        break;
      case 'pick': {
        const p = P(e[1]);
        if (!p) break;
        const [, , k, id, lvl] = e;
        if (k === 'w' && WEAPONS[id]) hud.pop(p.id, id, `${WEAPONS[id].name} ${lvl > 1 ? 'Lv ' + lvl : '- New!'}`);
        else if (k === 'p' && PASSIVES[id]) hud.pop(p.id, id, `${PASSIVES[id].name} ${lvl > 1 ? 'Lv ' + lvl : '- New!'}`);
        else if (k === 'gold') hud.pop(p.id, 'bag', 'Gold!');
        else if (k === 'heal') hud.pop(p.id, 'roast', 'Healed!');
        break;
      }
      case 'chest': {
        const p = P(e[1]);
        hud.chest(p, e[2], e[3], p ? p.local : false);
        A.play('chest');
        if (e[2].some((r) => r.evo)) setTimeout(() => A.play('evolve'), 1300);
        if (p) fx.sparkleAt(p.x, p.z, [1.5, 1.2, 0.5], 20);
        break;
      }
      case 'pu': this.pickupEffect(P(e[1]), e[2]); break;
      case 'over': this.over(e[1], e[2], e[3], e[4], e[5]); break;
    }
  }

  isLocal(pid) {
    const p = this.players.get(pid);
    return !!(p && p.local);
  }

  pickupEffect(p, kind) {
    const A = this.audio;
    if (!p) return;
    switch (kind) {
      case 'roast': this.fx.sparkleAt(p.x, p.z, [0.5, 1.5, 0.6], 12); this.ents.number(p.x, 2.3, p.z, 30, 'heal'); A.play('heal'); break;
      case 'coin': A.play('coin', { local: p.local }); break;
      case 'bag': this.ents.number(p.x, 2.3, p.z, 10, 'gold'); A.play('coin', { local: p.local }); break;
      case 'lodestone': this.fx.nova(p.x, p.z, 3, 0); A.play('lodestone'); this.hud.feed(`<b>${p.name}</b> found a Lodestone!`); break;
      case 'freeze': this.freezeT = 6; this.flash(0xbfe6ff, 0.35); A.play('freeze'); this.hud.feed(`<b>${p.name}</b> froze time!`); break;
      case 'starfall': this.flash(0xffffff, 0.7); this.shake(0.5); A.play('starfall'); this.starfall(p); this.hud.feed(`<b>${p.name}</b> called down a Starfall!`); break;
    }
  }

  starfall(p) {
    for (let i = 0; i < 40; i++) {
      const x = p.x + (Math.random() - 0.5) * 30, z = p.z + (Math.random() - 0.5) * 22;
      setTimeout(() => {
        if (!this.active) return;
        this.ents.particles.spawn({ kind: 'star', x: x + 3, y: 9, z: z - 2, vx: -6, vy: -18, life: 0.5, size: 0.7, size1: 0.3, r: 1.5, g: 1.4, b: 0.9, floor: false });
        setTimeout(() => this.active && this.fx.burstGlow(x, z, 2.5, [1.3, 1.2, 0.8], 0.2), 480);
      }, i * 25);
    }
  }

  onKill(e, def) {
    if (def.boss) {
      this.shake(0.8);
      this.flash(0xffffff, 0.5);
      this.fx.explosion(e.x, e.z, 4, 'meteor');
      this.audio.play('bossdie');
      if (e && this.bossId) { this.bossId = 0; this.audio.music('battle', this.stageIndex); }
      this.hud.feed(`<b>${def.name}</b> has been vanquished!`);
    } else if (def.elite) {
      this.shake(0.3);
      this.audio.play('boom');
    } else if (def.prop) {
      this.audio.play('crack');
    } else this.audio.play('kill');
  }

  onGem(pid) {
    const p = this.players.get(pid);
    if (!p || !p.local) return;
    this.gemStreak = this.gemStreakT > 0 ? this.gemStreak + 1 : 0;
    this.gemStreakT = 0.35;
    this.audio.play('gem', { step: this.gemStreak });
  }

  onPickupGone(pid, kind, k) {
    if (kind === 'chest') return;
    const p = this.players.get(pid);
    if (p) this.fx.sparkleAt(k.x, k.z, [1.4, 1.2, 0.6], 6);
  }

  over(result, stats, t, level, kills) {
    this.overAt = performance.now() / 1000;
    if (!this.goldBanked) {
      this.goldBanked = true;
      for (const st of stats) if (this.local.has(st.id)) this.guild.addGold(st.gold);
      if (result === 'victory' && this.local.size && this.guild.unlockStage(this.stageIndex + 1)) {
        const next = STAGES[this.stageIndex + 1];
        if (next) setTimeout(() => this.toast(`New stage unlocked: ${next.name}!`, 6000), 1500);
      }
    }
    this.hud.results(result, stats, t, level, kills, { players: this.players, local: this.local, isHost: this.app.host === this.net.cid });
    this.audio.music(result === 'victory' ? 'victory' : 'defeat', this.stageIndex);
    this.audio.play(result === 'victory' ? 'victory' : 'defeat');
    if (result === 'victory') this.flash(0xfff4d0, 0.6);
  }

  // ---------------------------------------------------------------- feel
  shake(a, x, z) {
    a *= this.options ? this.options.s.shake : 1;
    if (x !== undefined) {
      const d = Math.hypot(x - this.focus.x, z - this.focus.z);
      if (d > 18) return;
      a *= 1 - d / 18;
    }
    this.trauma = Math.min(1, this.trauma + a);
  }

  flash(color, a) {
    this.R.grade.uniforms.flashColor.value.setHex(color);
    this.flashV = Math.max(this.flashV, a);
  }

  makeCtx(dt, rt, br, time) {
    return {
      dt, rt, br, time, paused: this.phase !== PHASE.RUN,
      playerPos: (pid) => this.players.get(pid) || null,
      playerColor: (pid) => { const P = this.players.get(pid); return P ? (P.col || (P.col = new THREE.Color(P.color))) : null; },
      ownerOffset: (pid) => {
        const P = this.players.get(pid);
        return P && P.local && P.init ? { x: P.x - P.sx, z: P.z - P.sz } : null;
      },
    };
  }

  // ---------------------------------------------------------------- per frame
  update(dt, time) {
    if (!this.active) return;
    const net = this.net;
    const rt = net.renderTime();
    // play back every snapshot whose moment has come, in order
    for (const s of net.snaps) {
      if (s.tick <= this.lastTick) continue;
      if (s.time > rt) break;
      this.process(s);
      this.lastTick = s.tick;
    }
    const br = net.bracket(rt);
    const ctx = this.ctx = this.makeCtx(dt, rt, br, time);
    if (br) {
      const [A, B, f] = br;
      this.runT = A.json.rt + (B.json.rt - A.json.rt) * f;
      this.updatePlayers(dt, time, A, B, f);
    }
    this.handleInput(dt);
    // camera
    this.updateCamera(dt, time);
    // effects + entities
    this.ents.begin();
    this.fx.update({
      dt, time, runT: this.runT, paused: ctx.paused, reviveOn: settingValue(this.app.settings, 'revive') !== 0,
      players: [...this.players.values()].map((P) => ({ id: P.id, x: P.x, z: P.z, state: P.state, revive: P.revive, color: P.color, weapons: P.weapons })),
      enemyPos: (id) => this.ents.enemyPos(id),
    });
    for (const P of this.players.values()) {
      // seat-colored ring + overlay HP pip under each traveler
      const pulse = P.local ? 0.7 : 0.45;
      const c = P.col || (P.col = new THREE.Color(P.color));
      this.ents.flatL.push(P.x, 0.04, P.z, 1.15, 1.0, this.ents.fx.ring, false, c.r * pulse, c.g * pulse, c.b * pulse, 1);
      if (P.boneHP > 0 && P.state === PS.ALIVE) {
        const k = 0.35 + 0.45 * (P.boneHP / Math.max(1, P.boneMax));
        this.ents.glowL.push(P.x, 1.1, P.z, 2.6, 2.6, this.ents.fx.ring, false, 0.95 * k, 0.9 * k, 0.75 * k, 1);
      }
      if (P.shield > 0 && P.state === PS.ALIVE) {
        // respawn shield: a golden dome that flickers out in its last second
        const k = P.shield < 1 ? (Math.floor(time * 12) % 2 ? 0.35 : 0.8) : 0.8;
        this.ents.glowL.push(P.x, 1.15, P.z, 3.0, 3.0, this.ents.fx.ring, false, 1.3 * k, 1.05 * k, 0.45 * k, 1);
        this.ents.glowL.push(P.x, 1.15, P.z, 3.2, 3.2, this.ents.fx.glow, false, 0.35 * k, 0.28 * k, 0.1 * k, 1);
        this.ents.flatL.push(P.x, 0.05, P.z, 2.6, 2.2, this.ents.fx.ring, false, 1.2 * k, 0.95 * k, 0.4 * k, 1);
      }
      if (P.state === PS.ALIVE && P.hp < P.maxHp) {
        const f = Math.max(0, P.hp / P.maxHp);
        this.ents.uiL.push(P.x, -0.1, P.z + 0.55, 1.0, 0.13, this.ents.fx.px, false, 0.05, 0.03, 0.08, 0.85);
        this.ents.uiL.push(P.x - (0.92 * (1 - f)) / 2, -0.1, P.z + 0.55, 0.92 * f, 0.07, this.ents.fx.px, false, 0.95, 0.22, 0.25, 1);
      }
    }
    this.ents.showNumbers = !this.options || this.options.s.numbers;
    this.ents.update(ctx);
    this.ents.end();
    // world: lighting, day -> night over the run, lanterns
    const len = this.snapState ? this.snapState.len : 900;
    const tod = 0.06 + 0.86 * Math.min(1, this.runT / Math.max(1, len));
    this.world.setTimeOfDay(tod);
    const night = Math.max(0, (tod - 0.45) / 0.55);
    const lights = [];
    const lp = [...this.players.values()].sort((a, b) => (b.local ? 1 : 0) - (a.local ? 1 : 0));
    for (const P of lp) {
      if (P.state === PS.SPECTATE) continue;
      lights.push({ x: P.x, y: 1.7, z: P.z + 0.4, color: 0xffb46a, intensity: 0.5 + night * 2.6, range: 6 + night * 4, flicker: 0.12, dynamic: true });
    }
    this.world.dynamicLights = [...lights.slice(0, 3), ...this.fx.lights().slice(0, 3), ...lights.slice(3)];
    this.world.update(dt, time, this.focus.x, this.focus.z);
    // screen grade: flashes, hurt pulse, frozen time
    const g = this.R.grade.uniforms;
    this.flashV = Math.max(0, this.flashV - dt * 2.2);
    this.hurtV = Math.max(0, this.hurtV - dt * 2.2);
    if (this.freezeT > 0) this.freezeT -= dt;
    g.flash.value = this.flashV;
    g.hurt.value = this.hurtV;
    g.desat.value += ((this.freezeT > 0 ? 0.65 : 0) - g.desat.value) * Math.min(1, dt * 6);
    if (this.gemStreakT > 0) this.gemStreakT -= dt;
    // HUD
    this.updateHud(dt, tod);
  }

  updatePlayers(dt, time, A, B, f) {
    if (!A.pIdx) A.pIdx = new Map(A.json.p.map((r) => [r[0], r]));
    if (!B.pIdx) B.pIdx = new Map(B.json.p.map((r) => [r[0], r]));
    const latest = this.net.latest();
    if (latest && !latest.pIdx) latest.pIdx = new Map(latest.json.p.map((r) => [r[0], r]));
    // players who left the run
    for (const id of [...this.players.keys()]) if (!B.pIdx.has(id) && !A.pIdx.has(id) && this.snapState) this.removePlayer(id);
    for (const P of this.players.values()) {
      const a = A.pIdx.get(P.id), b = B.pIdx.get(P.id);
      if (!a && !b) continue;
      const ra = a || b, rb = b || a;
      P.sx = ra[1] + (rb[1] - ra[1]) * f;
      P.sz = ra[2] + (rb[2] - ra[2]) * f;
      P.px = P.x; P.pz = P.z;
      const srv = latest && latest.pIdx.get(P.id);
      if (P.local) {
        if (!P.init && srv) { P.x = srv[1]; P.z = srv[2]; P.init = true; }
        const st = srv ? srv[6] : P.state;
        if (st !== PS.ALIVE && srv) {
          // downed: the server holds the body where it fell
          P.x += (srv[1] - P.x) * Math.min(1, dt * 10);
          P.z += (srv[2] - P.z) * Math.min(1, dt * 10);
        } else if (srv) {
          const dx = srv[1] - P.x, dz = srv[2] - P.z;
          if (dx * dx + dz * dz > 9) { P.x += dx * Math.min(1, dt * 4); P.z += dz * Math.min(1, dt * 4); }
        }
      } else {
        P.x = P.sx;
        P.z = P.sz;
        P.init = true;
      }
      // animation
      const v = P.view;
      v.root.position.set(P.x, 0, P.z);
      let state = 'idle';
      if (P.state === PS.DOWNED) state = 'down';
      else if (P.hurtT > 0) { P.hurtT -= dt; state = 'hurt'; }
      else {
        let mx, mz;
        if (P.local) { mx = P.mx; mz = P.mz; }
        else { mx = (P.x - P.px) / Math.max(dt, 1e-3); mz = (P.z - P.pz) / Math.max(dt, 1e-3); if (Math.hypot(mx, mz) < 0.8) mx = mz = 0; }
        if (mx || mz) { v.faceDir(mx, mz); state = 'walk'; }
        else if (this.phase === PHASE.OVER && this.snapState && this.snapState.res === 'victory') state = 'cheer';
      }
      v.update(this.phase === PHASE.RUN || state === 'cheer' ? dt : 0, state, state === 'walk' ? 1.15 : 1);
      v.sprite.visible = !(P.iframes && P.state === PS.ALIVE && Math.floor(time * 18) % 2 === 0);
    }
  }

  handleInput(dt) {
    const latest = this.net.latest();
    this.pausedBy = latest && latest.json.pz ? latest.json.pz : null;
    const menu = this.options && this.options.open;
    const running = this.app.phase === PHASE.RUN && this.phase !== PHASE.OVER && !this.pausedBy && !menu;
    const levelOpen = this.hud.choice.size > 0;
    const ids = [...this.local.keys()];
    // level-up cards / results take the menu inputs
    for (const id of ids) {
      if (menu) break;
      const L = this.local.get(id);
      const m = this.input.menu(L.slot);
      if (levelOpen) this.hud.levelInput(id, m, this.players, this.local);
      else if (this.phase === PHASE.OVER && (m.confirm || m.start) && this.app.host === this.net.cid) this.net.send({ t: 'lobby' });
    }
    // movement (predicted locally, reported at 30 Hz)
    const alive = [];
    for (const id of ids) {
      const P = this.players.get(id);
      if (!P || !P.init) continue;
      const L = this.local.get(id);
      let [mx, mz] = running && P.state === PS.ALIVE ? this.input.move(L.slot) : [0, 0];
      P.mx = mx; P.mz = mz;
      if (mx || mz) {
        const sp = BASE_MOVE_SPEED * (P.moveSpeed || 1);
        P.x += mx * sp * dt;
        P.z += mz * sp * dt;
      }
      if (P.state === PS.ALIVE) alive.push(P);
    }
    // couch co-op: everyone on this screen stays within the shared view
    if (alive.length > 1) {
      const z = (this.view ? this.view.zoom : 1) * this.zoom;
      const hx = 10.5 * z * Math.min(1.25, window.innerWidth / window.innerHeight / 1.78), up = 6.5 * z, down = 5.2 * z;
      for (const P of alive) {
        P.x = Math.min(this.focus.x + hx, Math.max(this.focus.x - hx, P.x));
        P.z = Math.min(this.focus.z + down, Math.max(this.focus.z - up, P.z));
      }
    }
    this.sendAcc += dt;
    if (this.sendAcc >= SEND_DT) {
      this.sendAcc %= SEND_DT;
      const d = [];
      for (const P of alive) d.push([P.id, Math.round(P.x * 100) / 100, Math.round(P.z * 100) / 100, Math.round(P.mx * 100) / 100, Math.round(P.mz * 100) / 100]);
      if (d.length && running) this.net.send({ t: 'pos', d });
    }
  }

  updateCamera(dt, time) {
    let n = 0, x = 0, z = 0;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    const take = (P) => { n++; x += P.x; z += P.z; minx = Math.min(minx, P.x); maxx = Math.max(maxx, P.x); minz = Math.min(minz, P.z); maxz = Math.max(maxz, P.z); };
    for (const P of this.players.values()) if (P.local && P.init && P.state === PS.ALIVE) take(P);
    if (!n) for (const P of this.players.values()) if (P.local && P.init && settingValue(this.app.settings, 'revive') !== 0) take(P);
    if (!n) for (const P of this.players.values()) if (P.init && P.state === PS.ALIVE) take(P);
    if (!n) for (const P of this.players.values()) if (P.init) take(P);
    if (n) {
      x /= n; z /= n;
      if (!this.focusInit) { this.focus.set(x, 0, z); this.focusInit = true; }
      const k = 1 - Math.exp(-dt * 7);
      this.focus.x += (x - this.focus.x) * k;
      this.focus.z += (z - this.focus.z) * k;
      const spread = Math.max(maxx - minx, (maxz - minz) * 1.4);
      const want = 1 + Math.max(0, Math.min(0.25, (spread - 12) * 0.025));
      this.zoom += (want - this.zoom) * Math.min(1, dt * 2);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const sh = this.trauma * this.trauma;
    const ox = (Math.sin(time * 47.3) + Math.sin(time * 31.1)) * 0.25 * sh;
    const oz = (Math.sin(time * 39.7) + Math.sin(time * 23.9)) * 0.2 * sh;
    const cam = this.R.camera;
    const f = this.focus;
    const zm = this.zoom * (this.view ? this.view.zoom : 1);
    this.world.zoom = zm;
    cam.position.set(f.x + ox, CAM_H * zm, f.z + CAM_Z * zm + oz);
    cam.lookAt(f.x + ox, 0, f.z - 0.6 + oz);
    this.R.setTilt(0.5, 0.2, 4.2);
  }

  updateHud(dt, tod) {
    const j = this.snapState;
    if (!j) return;
    let boss = null;
    if (this.bossId) {
      const frac = this.ents.bars.get(this.bossId);
      const def = ENEMIES[ENEMY_IDS[this.bossType]];
      if (frac !== undefined && def) boss = { name: def.name, frac };
      else if (frac === undefined && !this.ents.enemyPos(this.bossId)) { this.bossId = 0; }
    }
    // notice for local travelers who are down
    let notice = '';
    if (this.pausedBy && !(this.options && this.options.open)) notice = `<b>Paused by ${this.pausedBy.replace(/[<>&]/g, '')}</b> &middot; press Esc or View for options and Resume`;
    const locals = [...this.players.values()].filter((P) => P.local);
    const revive = settingValue(this.app.settings, 'revive') !== 0;
    if (notice) { /* paused */ } else if (locals.length && locals.every((P) => P.state !== PS.ALIVE) && this.phase !== PHASE.OVER) {
      const secs = Math.max(...locals.map((P) => P.respawnIn || 0));
      notice = revive ? `<b>You have fallen!</b> You return in <b>${secs}s</b> if your party holds out.` : '<b>You have fallen.</b> Watching over the party&hellip;';
    } else if (!locals.length && this.phase !== PHASE.OVER && !notice) notice = 'Spectating the expedition &middot; you can join the next one from camp';
    // off-screen markers: other travelers, chests, the boss
    const markers = [];
    for (const P of this.players.values()) if (!P.local && P.init) markers.push({ x: P.x, z: P.z, color: P.color, icon: portraitURL(P.char) });
    for (const k of this.ents.pickups.values()) if (k.kind === 'chest') markers.push({ x: k.x, z: k.z, color: '#f6dc94', icon: iconURL('chest', 2) });
    if (this.bossId) {
      const e = this.ents.enemyPos(this.bossId);
      if (e) markers.push({ x: e.x, z: e.z, color: '#ff5a5a', icon: iconURL('skull', 2) });
    }
    this.hud.update(dt, {
      rt: j.rt, len: j.len, level: j.lv, xp: j.xp, xn: j.xn, kills: j.k, tod, players: this.players, local: this.local,
      boss, notice, cam: this.cam, markers, waiting: j.waiting, lt: j.lt,
    });
    if (this.phase === PHASE.OVER && this.overAt) this.hud.resultsTick(Math.max(0, Math.ceil(40 - (performance.now() / 1000 - this.overAt))));
  }
}

export { CHARACTERS, STAGES };
