// Weapons, passive relics, evolutions and the stat math shared by server + client.
//
// Weapon kinds (behaviour is simulated on the server, drawn on the client):
//  cleave    arc slash in front (and behind) of you
//  bolt      fires at the nearest enemies
//  fireball  explodes on impact            meteor   falls from the sky onto enemies
//  aura      constant damage ring around you
//  knives    thrown where you're facing
//  flask     lobbed, leaves a damaging puddle
//  orbit     blades circling you for a while
//  sigil     lightning strikes random enemies
//  nova      expanding frost ring
//  axe       boomerang that returns to you
//  wisp      homing spirit bolts

import { CHARACTERS } from './characters.js';
import { POWERUPS } from './meta.js';

const L = (d, o = {}) => ({ d, ...o });

export const WEAPONS = {
  greatsword: {
    name: 'Greatsword', kind: 'cleave', desc: 'Cleaves the enemies in front of you.',
    base: { dmg: 14, cd: 1.3, area: 1, amount: 1, kb: 1.4, duration: 0.25 },
    levels: [L('Also cleaves behind you.', { amount: 1 }), L('Damage +5.', { dmg: 5 }), L('Area +15%.', { area: 0.15 }), L('Damage +6.', { dmg: 6 }),
      L('Area +15%.', { area: 0.15 }), L('Damage +6.', { dmg: 6 }), L('Damage +8, cooldown -0.1s.', { dmg: 8, cd: -0.1 })],
    evolve: { with: 'whetstone', into: 'dawnbreaker' },
  },
  boltcaster: {
    name: 'Boltcaster', kind: 'bolt', desc: 'Fires piercing bolts at the nearest enemies.',
    base: { dmg: 10, cd: 1.1, speed: 1, amount: 1, pierce: 1, kb: 0.6 },
    levels: [L('Fires 1 more bolt.', { amount: 1 }), L('Damage +4.', { dmg: 4 }), L('Pierces 1 more enemy.', { pierce: 1 }), L('Fires 1 more bolt.', { amount: 1 }),
      L('Damage +4, cooldown -0.1s.', { dmg: 4, cd: -0.1 }), L('Pierces 1 more enemy.', { pierce: 1 }), L('Fires 1 more bolt, damage +4.', { amount: 1, dmg: 4 })],
    evolve: { with: 'feather', into: 'stormvolley' },
  },
  fireball: {
    name: 'Ember Orb', kind: 'fireball', desc: 'Hurls fireballs that explode on impact.',
    base: { dmg: 18, cd: 1.6, area: 1, speed: 1, amount: 1, pierce: 1, explode: 1.5, kb: 1 },
    levels: [L('Damage +6.', { dmg: 6 }), L('Fires 1 more orb.', { amount: 1 }), L('Explosion area +15%.', { area: 0.15 }), L('Damage +8.', { dmg: 8 }),
      L('Fires 1 more orb.', { amount: 1 }), L('Explosion area +15%.', { area: 0.15 }), L('Damage +10, cooldown -0.2s.', { dmg: 10, cd: -0.2 })],
    evolve: { with: 'lantern', into: 'meteor' },
  },
  halo: {
    name: 'Holy Halo', kind: 'aura', desc: 'A sacred ring that burns nearby enemies.', noAmount: true,
    base: { dmg: 6, cd: 0.75, area: 1, kb: 0.5 },
    levels: [L('Area +20%.', { area: 0.2 }), L('Damage +3.', { dmg: 3 }), L('Ticks faster.', { cd: -0.08 }), L('Area +20%.', { area: 0.2 }),
      L('Damage +3.', { dmg: 3 }), L('Ticks faster.', { cd: -0.08 }), L('Area +20%, damage +3.', { area: 0.2, dmg: 3 })],
    evolve: { with: 'heart', into: 'sanctuary' },
  },
  knives: {
    name: 'Throwing Knives', kind: 'knives', desc: 'Rapidly throws knives where you are facing.',
    base: { dmg: 7, cd: 0.9, speed: 1, amount: 1, pierce: 1, kb: 0.4 },
    levels: [L('Throws 1 more knife.', { amount: 1 }), L('Throws 1 more knife, damage +3.', { amount: 1, dmg: 3 }), L('Throws 1 more knife.', { amount: 1 }), L('Pierces 1 more enemy.', { pierce: 1 }),
      L('Throws 1 more knife.', { amount: 1 }), L('Throws 1 more knife, damage +3.', { amount: 1, dmg: 3 }), L('Pierces 1 more, cooldown -0.15s.', { pierce: 1, cd: -0.15 })],
    evolve: { with: 'boots', into: 'thousandedges' },
  },
  flask: {
    name: 'Alchemist Flask', kind: 'flask', desc: 'Lobs flasks that leave a burning puddle.',
    base: { dmg: 9, cd: 3.0, area: 1, amount: 1, duration: 1, tick: 0.45, kb: 0.2 },
    levels: [L('1 more flask, area +10%.', { amount: 1, area: 0.1 }), L('Damage +4, duration +20%.', { dmg: 4, duration: 0.2 }), L('1 more flask.', { amount: 1 }), L('Area +20%.', { area: 0.2 }),
      L('Damage +4, duration +30%.', { dmg: 4, duration: 0.3 }), L('1 more flask.', { amount: 1 }), L('Damage +6, area +20%.', { dmg: 6, area: 0.2 })],
    evolve: { with: 'hourglass', into: 'plaguemire' },
  },
  chakram: {
    name: 'Dancing Chakram', kind: 'orbit', desc: 'Blades orbit around you for a while.',
    base: { dmg: 10, cd: 3.0, area: 1, speed: 1, amount: 1, duration: 1, kb: 0.8 },
    levels: [L('1 more blade.', { amount: 1 }), L('Faster spin, area +25%.', { speed: 0.3, area: 0.25 }), L('Lasts 0.5s longer, damage +4.', { duration: 0.17, dmg: 4 }), L('1 more blade.', { amount: 1 }),
      L('Faster spin, area +25%.', { speed: 0.3, area: 0.25 }), L('Lasts 0.5s longer, damage +4.', { duration: 0.17, dmg: 4 }), L('1 more blade.', { amount: 1 })],
    evolve: { with: 'spellbook', into: 'eternalwaltz' },
  },
  sigil: {
    name: 'Storm Sigil', kind: 'sigil', desc: 'Calls lightning down on random enemies.',
    base: { dmg: 20, cd: 2.2, area: 1, amount: 2, kb: 0.5 },
    levels: [L('1 more strike.', { amount: 1 }), L('Area +25%, damage +8.', { area: 0.25, dmg: 8 }), L('1 more strike.', { amount: 1 }), L('Area +25%, damage +8.', { area: 0.25, dmg: 8 }),
      L('1 more strike.', { amount: 1 }), L('Area +25%, damage +8.', { area: 0.25, dmg: 8 }), L('1 more strike, cooldown -0.3s.', { amount: 1, cd: -0.3 })],
    evolve: { with: 'clover', into: 'wrathofheaven' },
  },
  frost: {
    name: 'Frost Nova', kind: 'nova', desc: 'A ring of frost that chills enemies around you.', noAmount: true,
    base: { dmg: 12, cd: 3.0, area: 1, slow: 0.5, duration: 1, kb: 0.8 },
    levels: [L('Damage +5.', { dmg: 5 }), L('Area +20%.', { area: 0.2 }), L('Cooldown -0.3s.', { cd: -0.3 }), L('Damage +6, chill lasts longer.', { dmg: 6, duration: 0.5 }),
      L('Area +20%.', { area: 0.2 }), L('Cooldown -0.3s.', { cd: -0.3 }), L('Damage +8, area +20%.', { dmg: 8, area: 0.2 })],
    evolve: { with: 'plate', into: 'absolutezero' },
  },
  axe: {
    name: 'Hurl Axe', kind: 'axe', desc: 'Throws axes that fly out and return to you.',
    base: { dmg: 16, cd: 2.0, speed: 1, amount: 1, area: 1, pierce: 99, kb: 1.1 },
    levels: [L('Throws 1 more axe.', { amount: 1 }), L('Damage +6.', { dmg: 6 }), L('Area +20%.', { area: 0.2 }), L('Throws 1 more axe.', { amount: 1 }),
      L('Damage +6.', { dmg: 6 }), L('Faster, area +20%.', { speed: 0.25, area: 0.2 }), L('Throws 1 more axe, damage +8.', { amount: 1, dmg: 8 })],
    evolve: { with: 'quiver', into: 'twinreapers' },
  },
  wisp: {
    name: 'Spirit Wisp', kind: 'wisp', desc: 'Releases spirits that home in on enemies.',
    base: { dmg: 9, cd: 1.0, speed: 1, amount: 1, pierce: 1, kb: 0.5 },
    levels: [L('1 more wisp.', { amount: 1 }), L('Cooldown -0.15s.', { cd: -0.15 }), L('1 more wisp.', { amount: 1 }), L('Damage +5.', { dmg: 5 }),
      L('1 more wisp.', { amount: 1 }), L('Pierces 1 more enemy.', { pierce: 1 }), L('1 more wisp, damage +6.', { amount: 1, dmg: 6 })],
    evolve: { with: 'crown', into: 'soulchoir' },
  },

  // ---------------------------------------------------------------- evolutions (max level 1)
  dawnbreaker: {
    name: 'Dawnbreaker', kind: 'cleave', evolved: true, desc: 'Radiant cleaves on both sides. Heals 1 HP per enemy struck.',
    base: { dmg: 42, cd: 1.0, area: 1.55, amount: 2, kb: 2, heal: 1, duration: 0.3 }, levels: [],
  },
  stormvolley: {
    name: 'Storm Volley', kind: 'bolt', evolved: true, desc: 'A fan of storm bolts that pierce everything.',
    base: { dmg: 24, cd: 0.85, speed: 1.3, amount: 6, pierce: 99, kb: 0.8, fan: 1 }, levels: [],
  },
  meteor: {
    name: 'Meteor Fall', kind: 'meteor', evolved: true, desc: 'Calls meteors down onto the horde.',
    base: { dmg: 60, cd: 1.3, area: 1.3, amount: 4, explode: 2.6, kb: 2 }, levels: [],
  },
  sanctuary: {
    name: 'Sanctuary', kind: 'aura', evolved: true, noAmount: true, desc: 'A vast holy ward that heals you and slows foes.',
    base: { dmg: 16, cd: 0.5, area: 1.9, kb: 0.8, heal: 0.6, slow: 0.35 }, levels: [],
  },
  thousandedges: {
    name: 'Thousand Edges', kind: 'knives', evolved: true, desc: 'An endless storm of blades.',
    base: { dmg: 15, cd: 0.12, speed: 1.4, amount: 1, pierce: 3, kb: 0.4 }, levels: [],
  },
  plaguemire: {
    name: 'Plague Mire', kind: 'flask', evolved: true, desc: 'Vast toxic mires that slow and dissolve the horde.',
    base: { dmg: 22, cd: 2.4, area: 1.8, amount: 4, duration: 2, tick: 0.35, slow: 0.4, kb: 0.2 }, levels: [],
  },
  eternalwaltz: {
    name: 'Eternal Waltz', kind: 'orbit', evolved: true, desc: 'Blades dance around you forever.',
    base: { dmg: 24, cd: 0, area: 1.5, speed: 1.4, amount: 5, duration: 999, kb: 1.2 }, levels: [],
  },
  wrathofheaven: {
    name: 'Wrath of Heaven', kind: 'sigil', evolved: true, desc: 'Heaven answers. Bolts arc between foes.',
    base: { dmg: 45, cd: 1.4, area: 2, amount: 7, chain: 2, kb: 0.8 }, levels: [],
  },
  absolutezero: {
    name: 'Absolute Zero', kind: 'nova', evolved: true, noAmount: true, desc: 'A crushing wave of cold that freezes all.',
    base: { dmg: 30, cd: 2.4, area: 1.6, freeze: 2.2, duration: 1, kb: 1 }, levels: [],
  },
  twinreapers: {
    name: 'Twin Reapers', kind: 'axe', evolved: true, desc: 'Spinning reapers carve paths through the night.',
    base: { dmg: 40, cd: 1.4, speed: 1.2, amount: 6, area: 1.5, pierce: 99, kb: 1.4 }, levels: [],
  },
  soulchoir: {
    name: 'Soul Choir', kind: 'wisp', evolved: true, desc: 'A chorus of souls that splits on impact.',
    base: { dmg: 20, cd: 0.5, speed: 1.15, amount: 3, pierce: 2, split: 2, kb: 0.5 }, levels: [],
  },
};

export const BASE_WEAPONS = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].evolved);

export const PASSIVES = {
  whetstone: { name: 'Whetstone', desc: 'Might +10%.', stat: 'might', per: 0.1, max: 5 },
  feather: { name: 'Feather Charm', desc: 'Projectile speed +10%.', stat: 'speed', per: 0.1, max: 5 },
  lantern: { name: 'Ember Lantern', desc: 'Area +10%.', stat: 'area', per: 0.1, max: 5 },
  heart: { name: 'Heart Crystal', desc: 'Max HP +20%.', stat: 'hpPct', per: 0.2, max: 5 },
  boots: { name: 'Windstep Boots', desc: 'Move speed +10%.', stat: 'moveSpeed', per: 0.1, max: 5 },
  hourglass: { name: 'Sand Hourglass', desc: 'Duration +10%.', stat: 'duration', per: 0.1, max: 5 },
  spellbook: { name: 'Arcane Tome', desc: 'Cooldown -8%.', stat: 'cooldown', per: -0.08, max: 5 },
  clover: { name: 'Fourleaf Clover', desc: 'Luck +10%.', stat: 'luck', per: 0.1, max: 5 },
  plate: { name: 'Iron Plate', desc: 'Armor +1.', stat: 'armor', per: 1, max: 5 },
  quiver: { name: 'Bottomless Quiver', desc: 'Amount +1.', stat: 'amount', per: 1, max: 2 },
  crown: { name: "Sage's Crown", desc: 'Experience +8%.', stat: 'growth', per: 0.08, max: 5 },
  magnet: { name: 'Lodestone Charm', desc: 'Pickup range +25%.', stat: 'magnet', per: 0.25, max: 5 },
  herb: { name: 'Moonpetal Herb', desc: 'Recovers +0.2 HP per second.', stat: 'recovery', per: 0.2, max: 5 },
};

export const PASSIVE_IDS = Object.keys(PASSIVES);

// Which evolution a weapon would become (and what it needs)
export function evolutionFor(weaponId) {
  const def = WEAPONS[weaponId];
  return def && def.evolve ? def.evolve : null;
}

export function maxLevel(weaponId) {
  return WEAPONS[weaponId].evolved ? 1 : WEAPONS[weaponId].levels.length + 1;
}

// ------------------------------------------------------------------ stats
export const BASE_STATS = {
  maxHp: 100, hpPct: 0, recovery: 0, armor: 0, moveSpeed: 1, might: 1, area: 1, speed: 1, duration: 1,
  amount: 0, cooldown: 1, luck: 1, growth: 1, greed: 1, magnet: 1.8, revival: 0,
};
const PCT_STATS = new Set(['moveSpeed', 'might', 'area', 'speed', 'duration', 'cooldown', 'luck', 'growth', 'greed']);

// char: character index; passives: {id: level}; meta: {powerupId: rank}; level: team level
export function computeStats(char, passives = {}, meta = {}, level = 1) {
  const s = { ...BASE_STATS };
  let magnetPct = 0;
  const add = (stat, v) => {
    if (stat === 'magnet') magnetPct += v;
    else s[stat] = (s[stat] || 0) + v;
  };
  const ch = CHARACTERS[char] || CHARACTERS[0];
  for (const [k, v] of Object.entries(ch.bonus)) add(k, v);
  const times = Math.min(5, Math.floor(level / 10));
  if (times > 0) add(ch.growth.stat, ch.growth.amount * times);
  for (const [id, lvl] of Object.entries(passives)) {
    const p = PASSIVES[id];
    if (p) add(p.stat, p.per * lvl);
  }
  for (const pu of POWERUPS) {
    const r = Math.min(pu.max, Math.max(0, (meta && meta[pu.id]) | 0));
    if (r) add(pu.stat, pu.per * r);
  }
  s.maxHp = Math.round(s.maxHp * (1 + s.hpPct));
  s.magnet = BASE_STATS.magnet * (1 + magnetPct);
  s.cooldown = Math.max(0.4, s.cooldown);
  for (const k of PCT_STATS) s[k] = Math.max(0.1, s[k]);
  return s;
}

// Final numbers for one weapon at a level, after the owner's stats
export function weaponStats(id, level, st) {
  const def = WEAPONS[id];
  const b = { ...def.base };
  for (let i = 0; i < level - 1 && i < def.levels.length; i++) {
    for (const [k, v] of Object.entries(def.levels[i])) if (k !== 'd') b[k] = (b[k] || 0) + v;
  }
  return {
    kind: def.kind,
    dmg: b.dmg * st.might,
    cd: def.kind === 'orbit' && def.evolved ? 0 : Math.max(0.08, b.cd * st.cooldown),
    area: (b.area || 1) * st.area,
    speed: (b.speed || 1) * st.speed,
    duration: (b.duration || 1) * st.duration,
    amount: def.noAmount ? 1 : Math.max(1, Math.round((b.amount || 1) + st.amount)),
    pierce: b.pierce || 1,
    kb: b.kb || 1,
    explode: b.explode || 0,
    heal: b.heal || 0,
    slow: b.slow || 0,
    freeze: b.freeze || 0,
    chain: b.chain || 0,
    split: b.split || 0,
    tick: b.tick || 0.5,
    fan: b.fan || 0,
    evolved: !!def.evolved,
  };
}

// Orbit timing shared by server (hits) and client (drawing): is the ring out at time t?
export function orbitState(ws, t0, t) {
  const on = 3 * ws.duration;
  if (ws.cd <= 0) return { active: true, k: 1 };
  const cycle = on + ws.cd;
  const u = (((t - t0) % cycle) + cycle) % cycle;
  return { active: u < on, k: u < on ? Math.min(1, u / 0.25, (on - u) / 0.25) : 0 };
}

export const ORBIT_RADIUS = 2.2;
export const AURA_RADIUS = 2.1;
export const NOVA_RADIUS = 4.2;
export const CLEAVE_RADIUS = 2.7;
