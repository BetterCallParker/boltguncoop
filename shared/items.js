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
import { BALANCE } from './balance.js';

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

// ------------------------------------------------------------------ the wider arsenal
// New abilities are built from templates: `kind` picks the behaviour the server simulates,
// `vis` the look on the client, and the level-up track comes from a template scaled to the
// ability's base damage. Each one evolves (max level + its relic + a treasure chest).
const TRACKS = {
  proj: (a) => [{ amount: 1 }, { dmg: a }, { pierce: 1 }, { amount: 1 }, { dmg: a, cd: -0.1 }, { speed: 0.2, dmg: a }, { amount: 1, dmg: a }],
  area: (a) => [{ dmg: a }, { amount: 1 }, { area: 0.15 }, { dmg: a }, { amount: 1 }, { area: 0.15 }, { dmg: a, cd: -0.2 }],
  aura: (a) => [{ area: 0.2 }, { dmg: a }, { cd: -0.1 }, { area: 0.2 }, { dmg: a }, { duration: 0.25 }, { area: 0.2, dmg: a }],
  summon: (a) => [{ amount: 1 }, { dmg: a }, { amount: 1 }, { speed: 0.2, dmg: a }, { amount: 1 }, { dmg: a }, { amount: 1, dmg: a }],
  zone: (a) => [{ amount: 1 }, { dmg: a, duration: 0.2 }, { area: 0.2 }, { amount: 1 }, { dmg: a }, { duration: 0.3 }, { dmg: a, area: 0.2 }],
  beam: (a) => [{ dmg: a }, { duration: 0.25 }, { amount: 1 }, { dmg: a }, { area: 0.25 }, { cd: -0.3 }, { dmg: a, amount: 1 }],
  chain: (a) => [{ chain: 1 }, { dmg: a }, { amount: 1 }, { chain: 1 }, { dmg: a }, { cd: -0.2 }, { amount: 1, chain: 2 }],
  nova: (a) => [{ dmg: a }, { area: 0.2 }, { cd: -0.3 }, { dmg: a }, { area: 0.2 }, { cd: -0.3 }, { dmg: a, area: 0.2 }],
  shield: () => [{ amount: 10 }, { cd: -0.5 }, { amount: 10 }, { amount: 15 }, { cd: -0.5 }, { amount: 15 }, { amount: 20, cd: -0.5 }],
  thorns: (a) => [{ dmg: a }, { area: 0.2 }, { dmg: a }, { kb: 0.5 }, { dmg: a }, { area: 0.2 }, { dmg: a * 2 }],
  corpse: (a) => [{ chance: 0.05 }, { dmg: a }, { area: 0.15 }, { chance: 0.05 }, { dmg: a }, { area: 0.15 }, { chance: 0.1, dmg: a }],
  leech: () => [{ heal: 0.01 }, { cap: 1 }, { heal: 0.01 }, { cap: 1 }, { heal: 0.01 }, { cap: 2 }, { heal: 0.02, cap: 2 }],
  trail: (a) => [{ dmg: a }, { area: 0.2 }, { duration: 0.25 }, { dmg: a }, { cd: -0.05 }, { area: 0.2 }, { dmg: a, duration: 0.25 }],
};

// [id, name, kind, vis, unit, track, desc, base, evolve-with, evo id, evo name, evo desc, evo changes, class]
const ARSENAL = [
  // ---- shared pool (anyone can find these on level-up)
  ['corpseburst', 'Corpse Burst', 'corpse', 'bone', 'burst', 'corpse', 'Foes slain near you may explode, hurting the horde around them.', { dmg: 16, area: 1, chance: 0.25, range: 7 }, 'crown', 'graveblast', 'Grave Detonation', 'Most deaths near you explode, and blasts can set off more blasts.', { chance: 0.35, dmgX: 1.8, area: 0.4, chainBurst: 1 }],
  ['bonearmor', 'Bone Armor', 'shield', 'bone', 'shield', 'shield', 'A barrier of bone soaks up damage, then regrows if you avoid hits for a while.', { amount: 20, cd: 6 }, 'plate', 'bulwark', 'Ossified Bulwark', 'A huge barrier that regrows fast and bursts outward when broken.', { amount: 60, cd: -2, burst: 40 }],
  ['brambles', 'Bramble Mail', 'thorns', 'thorn', 'lash', 'thorns', 'When something hits you, thorns lash every foe around you.', { dmg: 20, area: 1, cd: 0.6, kb: 1.5 }, 'heart', 'briarfortress', 'Briar Fortress', 'Thorns lash out on their own every second and on every hit.', { dmgX: 1.6, area: 0.3, pulse: 1 }],
  ['sparks', 'Spark Swarm', 'spark', 'spark', 'spark', 'proj', 'Erratic sparks crackle out in random directions and zig-zag through the horde.', { dmg: 8, cd: 1.0, amount: 3, speed: 1, duration: 1, pierce: 2, kb: 0.2 }, 'feather', 'stormswarm', 'Storm Swarm', 'A storm of sparks that pierce everything.', { amount: 4, pierce: 98, dmgX: 1.3 }],
  ['hailstorm', 'Hailstorm', 'rain', 'hail', 'hailstone', 'area', 'Hail hammers down around a group of foes, slowing them.', { dmg: 10, cd: 3.2, area: 1, amount: 8, duration: 1, slow: 0.3 }, 'hourglass', 'endlesswinter', 'Endless Winter', 'Twice the hail, over a wider area, freezing foes solid.', { amount: 10, area: 0.5, dmgX: 1.4, freeze: 1 }],
  ['ballightning', 'Ball Lightning', 'ball', 'ball', 'orb', 'proj', 'A slow orb of lightning that shocks every foe it drifts past.', { dmg: 9, cd: 2.6, speed: 1, amount: 1, area: 1, duration: 1, kb: 0 }, 'spellbook', 'thunderhead', 'Thunderhead', 'Huge thunder orbs that shock twice as often.', { amount: 1, area: 0.6, dmgX: 1.4, zapX: 0.5 }],
  ['traps', 'Blast Traps', 'mine', 'trap', 'trap', 'zone', 'Drops traps at your feet that explode when foes step close.', { dmg: 30, cd: 2.4, amount: 1, area: 1, duration: 1 }, 'quiver', 'minefield', 'Minefield', 'Scatters many traps whose blasts chain together.', { amount: 3, dmgX: 1.5, area: 0.3 }],
  ['hex', 'Hex Circle', 'zone', 'hex', 'circle', 'zone', 'Curses the ground under foes: anything inside is slowed and takes 50% more damage from everyone.', { dmg: 4, cd: 4, area: 1, amount: 1, duration: 1, tick: 0.5, slow: 0.25, hex: 0.5 }, 'clover', 'doommark', 'Doom Mark', 'Larger curses that double the damage foes take.', { area: 0.5, hex: 0.5, amount: 1 }],
  ['groundslam', 'Ground Slam', 'nova', 'quake', 'slam', 'nova', 'Slams the earth, damaging and stunning everything around you.', { dmg: 22, cd: 3.4, area: 0.85, stun: 0.6, kb: 2.2 }, 'boots', 'earthquake', 'Earthquake', 'A massive quake that stuns for longer.', { area: 0.5, dmgX: 1.6, stun: 0.6 }],
  ['icelance', 'Ice Lance', 'bolt', 'icespear', 'lance', 'proj', 'Hurls lances of ice that pierce a line of foes and chill them.', { dmg: 14, cd: 1.5, speed: 1, amount: 1, pierce: 3, kb: 0.4, slow: 0.4 }, 'feather', 'glacialspike', 'Glacial Spike', 'Lances that pierce everything and freeze on hit.', { pierce: 96, dmgX: 1.5, freeze: 0.8, amount: 1 }],
  ['fang', 'Vampire Fang', 'leech', 'blood', 'bite', 'leech', 'Some of the damage you deal comes back to you as health.', { heal: 0.02, cap: 3 }, 'goblet', 'crimsonthirst', 'Crimson Thirst', 'Much stronger life steal, and overflow becomes a blood shield.', { heal: 0.04, cap: 6 }],
  ['bladeward', 'Blade Ward', 'orbit', 'sword', 'blade', 'summon', 'Swords circle around you for a while, cutting anything they touch.', { dmg: 12, cd: 3.2, area: 1, speed: 1, amount: 2, duration: 1, kb: 1 }, 'whetstone', 'swordhalo', 'Sword Halo', 'A permanent halo of swords.', { amount: 2, dmgX: 1.6, cdSet: 0, duration: 999 }],
  ['hive', 'Hive Swarm', 'wisp', 'bee', 'bee', 'proj', 'Releases bees that chase down foes.', { dmg: 4, cd: 1.6, speed: 1.2, amount: 4, pierce: 1, kb: 0.1 }, 'herb', 'queensfury', "Queen's Fury", 'An angry swarm that never stops coming.', { amount: 4, dmgX: 1.6, cdX: 0.6 }],
  ['warcry', 'War Cry', 'nova', 'shout', 'cry', 'nova', 'A roar that stuns nearby foes and gives the whole party +25% damage for 4 seconds.', { dmg: 10, cd: 6, area: 1.2, stun: 0.8, buff: 0.25, kb: 1.4 }, 'crown', 'kingsbellow', "King's Bellow", 'A deafening roar: longer stun and +50% party damage.', { stun: 0.6, buff: 0.25, area: 0.4 }],
  ['cinderpath', 'Cinder Path', 'trail', 'fire', 'flame', 'trail', 'You leave a trail of fire wherever you walk.', { dmg: 6, cd: 0.35, area: 1, duration: 1, tick: 0.4 }, 'boots', 'firewalker', 'Firewalker', 'A blazing trail that burns hotter and lasts longer.', { dmgX: 1.8, area: 0.4, duration: 0.6 }],
  ['arclightning', 'Arc Lightning', 'chain', 'lightning', 'arc', 'chain', 'Lightning leaps from you to a foe, then jumps between nearby foes.', { dmg: 14, cd: 1.8, amount: 1, chain: 3, range: 8 }, 'lantern', 'stormcrown', 'Storm Crown', 'Three bolts leap out at once, jumping much further.', { amount: 2, chain: 4, dmgX: 1.4 }],
  ['smite', 'Smite', 'sigil', 'holy', 'strike', 'area', 'Pillars of holy light slam down on foes.', { dmg: 24, cd: 2.8, area: 1.2, amount: 1, kb: 1 }, 'ankh', 'divinewrath', 'Divine Wrath', 'Many pillars at once that also heal allies standing near them.', { amount: 3, dmgX: 1.5, healAllies: 4 }],
  // ---- class signatures (only that class has them)
  ['whirl', 'Whirling Fury', 'spin', 'axe', 'spin', 'aura', 'Spin with your axes, shredding everything around you while it lasts.', { dmg: 9, cd: 2.4, duration: 1, area: 1, tick: 0.25, kb: 0.8 }, 'boots', 'endlesstempest', 'Endless Tempest', 'A nearly endless spin that drags foes into the blades.', { cdSet: 0.6, duration: 1, area: 0.5, dmgX: 1.5, pull: 3 }, 'brakka'],
  ['bonesplinter', 'Bone Splinters', 'scatter', 'bone', 'shard', 'proj', 'A spray of bone shards toward the nearest foe that pierces through.', { dmg: 7, cd: 1.1, amount: 5, speed: 1, pierce: 2, spread: 0.7, life: 0.65, kb: 0.4 }, 'spellbook', 'ossuarystorm', 'Ossuary Storm', 'A storm of shards in every direction.', { amount: 7, pierce: 4, dmgX: 1.4, spreadSet: 6.28 }, 'morwen'],
  ['raisedead', 'Raise Dead', 'summon', 'skeleton', 'skeleton', 'summon', 'Raises skeletons that fight beside you and return when destroyed.', { dmg: 8, cd: 4, amount: 2, speed: 1, atk: 0.8 }, 'crown', 'legionofbone', 'Legion of Bone', 'An army of tougher skeletons.', { amount: 4, dmgX: 2 }, 'sable'],
  ['frostorb', 'Frost Orb', 'orb', 'frostorb', 'orb', 'proj', 'A slow orb that sprays ice shards in all directions as it flies.', { dmg: 10, cd: 2.6, speed: 1, amount: 1, area: 1, duration: 1, emit: 0.18, slow: 0.35, kb: 0.2 }, 'hourglass', 'heartofwinter', 'Heart of Winter', 'Bigger orbs whose shards freeze foes.', { amount: 1, dmgX: 1.4, freeze: 0.8, emitX: 0.6 }, 'ysolde'],
  ['tempestpalm', 'Tempest Palm', 'chain', 'lightning', 'arc', 'chain', 'A palm strike of lightning that leaps from foe to foe.', { dmg: 12, cd: 1.2, amount: 1, chain: 4, range: 6.5 }, 'clover', 'stormlotus', 'Storm Lotus', 'Lightning blooms out in many chains at once.', { amount: 2, chain: 4, dmgX: 1.4 }, 'daro'],
  ['hammers', 'Sanctified Hammers', 'spiral', 'hammer', 'hammer', 'proj', 'Holy hammers spiral outward from you.', { dmg: 14, cd: 2.2, amount: 2, area: 1, duration: 1, speed: 1, kb: 1.2 }, 'heart', 'hammerofdawn', 'Hammer of Dawn', 'An endless spiral of golden hammers.', { amount: 3, dmgX: 1.5, cdX: 0.6 }, 'hale'],
  ['arrowrain', 'Arrow Rain', 'rain', 'arrow', 'arrow', 'area', 'Arrows rain down on the thickest pack of foes.', { dmg: 9, cd: 2.4, area: 1, amount: 10, duration: 1 }, 'quiver', 'thousandarrows', 'Thousand Arrows', 'The sky darkens with arrows.', { amount: 16, area: 0.4, dmgX: 1.3 }, 'rook'],
  ['shuriken', 'Ricochet Stars', 'ricochet', 'shuriken', 'star', 'chain', 'Throwing stars that bounce from foe to foe.', { dmg: 10, cd: 1.1, speed: 1, amount: 1, chain: 3, kb: 0.3 }, 'whetstone', 'shadowlotus', 'Shadow Lotus', 'Stars that keep bouncing far longer.', { amount: 2, chain: 6, dmgX: 1.4 }, 'nyx'],
  ['sentry', 'Clockwork Sentry', 'summon', 'turret', 'turret', 'summon', 'Builds turrets that shoot the nearest foe, then wind down after a while.', { dmg: 7, cd: 6, amount: 1, duration: 1, atk: 0.5, range: 9 }, 'plate', 'siegebattery', 'Siege Battery', 'Heavy turrets that fire explosive shells.', { amount: 1, dmgX: 1.8, explode: 1.4 }, 'fennick'],
  ['wolves', 'Spirit Wolves', 'summon', 'wolf', 'wolf', 'summon', 'Spirit wolves hunt down foes around you.', { dmg: 10, cd: 5, amount: 2, speed: 1.3, atk: 0.6 }, 'herb', 'moonhowl', 'Moonhowl Pack', 'A larger, fiercer pack whose bites heal you.', { amount: 2, dmgX: 1.7, lifebite: 1 }, 'orla'],
  ['rupture', 'Rupture', 'fissure', 'earth', 'eruption', 'area', 'Splits the earth in a line toward foes, erupting along it.', { dmg: 18, cd: 2.4, amount: 6, area: 1, speed: 1 }, 'lantern', 'worldsplitter', 'Worldsplitter', 'Three fissures tear the ground at once.', { amount: 4, dmgX: 1.5, lines: 3 }, 'torvald'],
  ['holycross', 'Holy Cross', 'beam', 'holy', 'beam', 'beam', 'Beams of light burst from you in a cross.', { dmg: 7, cd: 3.2, amount: 4, area: 1, duration: 1, tick: 0.2, range: 9, mode: 'cross' }, 'ankh', 'judgement', 'Judgement', 'Eight beams of light that slowly turn.', { amount: 4, dmgX: 1.4, rotate: 1 }, 'seraphine'],
  ['dragonbreath', "Dragon's Breath", 'cone', 'fire', 'flame', 'beam', 'Breathes a cone of fire where you face.', { dmg: 6, cd: 2.2, area: 1, duration: 1, tick: 0.18, arc: 0.9, range: 5 }, 'lantern', 'inferno', 'Inferno', 'A wider, longer, hotter torrent of flame.', { arc: 0.6, dmgX: 1.6, duration: 0.6, area: 0.3 }, 'ashka'],
  ['talons', 'Talon Swarm', 'wisp', 'feather', 'talon', 'proj', 'Spectral birds dive at foes.', { dmg: 6, cd: 1.3, speed: 1.3, amount: 3, pierce: 1, kb: 0.3 }, 'magnet', 'skyfall', 'Skyfall Flock', 'A flock that never stops diving.', { amount: 4, dmgX: 1.5, cdX: 0.6, pierce: 2 }, 'kestrel'],
  ['gravitywell', 'Gravity Well', 'vortex', 'void', 'well', 'zone', 'Opens a slow rift that pulls foes in and crushes them.', { dmg: 6, cd: 4.5, amount: 1, area: 1, duration: 1, speed: 1, pull: 3, tick: 0.3 }, 'hourglass', 'eventhorizon', 'Event Horizon', 'A vast rift with a crushing pull.', { area: 0.6, pull: 3, dmgX: 1.6, duration: 0.5 }, 'vael'],
  ['sunlance', 'Sunlance', 'beam', 'sun', 'beam', 'beam', 'A searing beam of sunlight locks onto the nearest foe.', { dmg: 9, cd: 2.0, amount: 1, area: 1, duration: 1, tick: 0.15, range: 11, mode: 'nearest' }, 'crown', 'solarverdict', 'Solar Verdict', 'Several sunlances at once that burn longer.', { amount: 2, dmgX: 1.5, duration: 0.5 }, 'anselm'],
  ['miasma', 'Miasma', 'trail', 'plague', 'cloud', 'trail', 'You leave a toxic cloud wherever you walk that slows foes.', { dmg: 5, cd: 0.3, area: 1.1, duration: 1.2, tick: 0.35, slow: 0.25 }, 'herb', 'pestilence', 'Pestilence', 'A spreading plague that lingers far longer.', { dmgX: 1.8, area: 0.5, duration: 0.8 }, 'moss'],
  ['javelin', 'Valkyrie Javelin', 'bolt', 'spear', 'javelin', 'proj', 'Hurls a heavy javelin that pierces everything in its path.', { dmg: 26, cd: 1.8, speed: 1.1, amount: 1, pierce: 99, kb: 2, size: 1.3 }, 'whetstone', 'spearofvalhalla', 'Spear of Valhalla', 'Javelins that explode with lightning where they land.', { amount: 1, dmgX: 1.5, explode: 1.6 }, 'ingrid'],
  ['bloodnova', 'Blood Nova', 'nova', 'blood', 'nova', 'nova', 'A wave of blood magic that heals you for every foe it hits.', { dmg: 16, cd: 2.6, area: 0.8, heal: 0.5, kb: 1 }, 'heart', 'crimsonrite', 'Crimson Rite', 'A huge crimson wave with much stronger healing.', { area: 0.4, dmgX: 1.6, heal: 0.5 }, 'ravel'],
  ['scattergun', 'Scatter Musket', 'scatter', 'pellet', 'pellet', 'proj', 'A short-range blast of pellets with strong knockback.', { dmg: 9, cd: 1.4, amount: 6, speed: 1.4, pierce: 1, spread: 0.55, life: 0.38, kb: 1.6 }, 'feather', 'dragonsroar', "Dragon's Roar", 'Explosive pellets in a wide blast.', { amount: 4, dmgX: 1.4, explode: 0.9 }, 'caius'],
  ['anthem', 'Battle Anthem', 'nova', 'song', 'verse', 'nova', 'A song that damages foes and heals and empowers allies nearby (+15% damage for 3s).', { dmg: 8, cd: 3.5, area: 1.15, buff: 0.15, healAllies: 2 }, 'clover', 'symphony', 'Symphony of War', 'An anthem that rallies the whole party (+35% damage, more healing).', { buff: 0.2, healAllies: 3, area: 0.4 }, 'quill'],
  ['cyclone', 'Cyclone', 'vortex', 'wind', 'cyclone', 'zone', 'Whips up cyclones that race across the field dragging foes along.', { dmg: 7, cd: 3.0, amount: 1, area: 0.65, duration: 0.9, speed: 3, pull: 1.5, tick: 0.25 }, 'boots', 'maelstrom', 'Maelstrom', 'Twin raging cyclones.', { amount: 1, area: 0.3, dmgX: 1.5, pull: 1.5 }, 'zephyra'],
];

function buildArsenal() {
  for (const [id, name, kind, vis, unit, track, desc, base, withRelic, evoId, evoName, evoDesc, evoMods, cls] of ARSENAL) {
    const a = Math.max(1, Math.round((base.dmg || 10) * 0.4));
    const levels = (TRACKS[track] || TRACKS.area)(a);
    WEAPONS[id] = { name, kind, vis, unit, desc, base, levels, evolve: { with: withRelic, into: evoId }, cls: cls || null, noAmount: kind === 'shield' || kind === 'leech' || kind === 'corpse' || kind === 'thorns' };
    // the evolution starts from the fully levelled ability, then applies its changes
    const top = { ...base };
    for (const lv of levels) for (const [k, v] of Object.entries(lv)) if (typeof v === 'number') top[k] = (top[k] || 0) + v;
    const eb = { ...top };
    for (const [k, v] of Object.entries(evoMods || {})) {
      if (k === 'dmgX') eb.dmg = Math.round((eb.dmg || 0) * v);
      else if (k === 'cdX') eb.cd = Math.round((eb.cd || 1) * v * 100) / 100;
      else if (k === 'cdSet') eb.cd = v;
      else if (k === 'spreadSet') eb.spread = v;
      else if (k === 'emitX') eb.emit = Math.round((eb.emit || 0.2) * v * 100) / 100;
      else if (k === 'zapX') eb.zap = v;
      else if (typeof v === 'number' && k !== 'lines' && k !== 'rotate' && k !== 'pulse' && k !== 'chainBurst' && k !== 'lifebite' && k !== 'burst' && k !== 'healAllies' && k !== 'explode' && k !== 'freeze' && k !== 'zap') eb[k] = (eb[k] || 0) + v;
      else eb[k] = v;
    }
    if (eb.cd !== undefined) eb.cd = Math.max(0, eb.cd);
    WEAPONS[evoId] = { name: evoName, kind, vis, unit, evolved: true, desc: evoDesc, base: eb, levels: [], cls: cls || null, noAmount: WEAPONS[id].noAmount };
  }
  // the original arsenal: each original traveler's starting weapon is theirs alone, the rest are shared
  const SIG = { greatsword: 'aldric', boltcaster: 'sera', fireball: 'corvin', halo: 'mira', knives: 'vex', flask: 'bram', chakram: 'lyra', sigil: 'toma' };
  const EVO_OF = {};
  for (const [id, w] of Object.entries(WEAPONS)) if (w.evolve) EVO_OF[w.evolve.into] = id;
  for (const [id, w] of Object.entries(WEAPONS)) {
    const root = EVO_OF[id] || id;
    if (SIG[root]) w.cls = SIG[root];
    if (!w.vis) w.vis = w.kind;
    if (!w.unit) w.unit = { cleave: 'slash', bolt: 'bolt', fireball: 'orb', aura: 'ring', knives: 'knife', flask: 'flask', orbit: 'blade', sigil: 'strike', nova: 'nova', axe: 'axe', wisp: 'wisp', meteor: 'meteor' }[w.kind] || 'projectile';
  }
}
buildArsenal();

// abilities anyone can be offered on level-up (class signatures excluded)
export const SHARED_WEAPONS = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].evolved && !WEAPONS[k].cls);
export const BASE_WEAPONS = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].evolved);

export const PASSIVES = {
  whetstone: { name: 'Whetstone', stat: 'might', per: 0.1, max: 5 },
  feather: { name: 'Feather Charm', stat: 'speed', per: 0.1, max: 5 },
  lantern: { name: 'Ember Lantern', stat: 'area', per: 0.1, max: 5 },
  heart: { name: 'Heart Crystal', stat: 'hpPct', per: 0.2, max: 5 },
  boots: { name: 'Windstep Boots', stat: 'moveSpeed', per: 0.1, max: 5 },
  hourglass: { name: 'Sand Hourglass', stat: 'duration', per: 0.1, max: 5 },
  spellbook: { name: 'Arcane Tome', stat: 'cooldown', per: -0.08, max: 5 },
  clover: { name: 'Fourleaf Clover', stat: 'luck', per: 0.1, max: 5 },
  plate: { name: 'Iron Plate', stat: 'armor', per: 1, max: 5 },
  quiver: { name: 'Bottomless Quiver', stat: 'amount', per: 1, max: 2 },
  crown: { name: "Sage's Crown", stat: 'growth', per: 0.08, max: 5 },
  magnet: { name: 'Lodestone Charm', stat: 'magnet', per: 0.25, max: 5 },
  herb: { name: 'Moonpetal Herb', stat: 'recovery', per: 0.2, max: 5 },
  goblet: { name: "Miser's Goblet", stat: 'greed', per: 0.15, max: 5 },
  ankh: { name: 'Phoenix Ankh', stat: 'revival', per: 1, max: 1 },
};

export const PASSIVE_IDS = Object.keys(PASSIVES);

// What every stat means, in plain words (used by level-up cards, relic tooltips and the Guild)
export const STATS = {
  might: { name: 'Might', what: 'damage of all your abilities', fmt: 'pct' },
  speed: { name: 'Projectile Speed', what: 'how fast your projectiles fly', fmt: 'pct' },
  area: { name: 'Area', what: 'size of slashes, explosions, auras and puddles', fmt: 'pct' },
  hpPct: { name: 'Max Health', what: 'how much damage you can take before falling', fmt: 'pct' },
  maxHp: { name: 'Max Health', what: 'how much damage you can take before falling', fmt: 'num' },
  moveSpeed: { name: 'Move Speed', what: 'how fast you walk', fmt: 'pct' },
  duration: { name: 'Duration', what: 'how long your effects last (puddles, orbits, beams, summons)', fmt: 'pct' },
  cooldown: { name: 'Cooldown', what: 'time between casts (lower is faster)', fmt: 'pct' },
  luck: { name: 'Luck', what: 'better chest rewards, a 4th level-up choice and more drops', fmt: 'pct' },
  armor: { name: 'Armor', what: 'damage blocked from every hit you take', fmt: 'num' },
  amount: { name: 'Amount', what: 'extra projectiles, strikes and summons for every ability', fmt: 'num' },
  growth: { name: 'Growth', what: 'experience gained from gems', fmt: 'pct' },
  magnet: { name: 'Magnet', what: 'how far away gems and pickups fly to you', fmt: 'pct' },
  recovery: { name: 'Recovery', what: 'health regained every second', fmt: 'hps' },
  greed: { name: 'Greed', what: 'gold gained from coins and chests', fmt: 'pct' },
  revival: { name: 'Revival', what: 'get back up once on your own when you fall', fmt: 'num' },
};

export function statValue(stat, v) {
  const f = (STATS[stat] || {}).fmt;
  if (f === 'pct') return Math.round(v * 100) + '%';
  if (f === 'hps') return (Math.round(v * 10) / 10) + ' HP/s';
  return String(Math.round(v * 10) / 10);
}

// "+10% Might: damage of all your abilities"
export function passiveDesc(id) {
  const p = PASSIVES[id];
  const st = STATS[p.stat] || { name: p.stat, what: '' };
  const f = st.fmt;
  const per = p.per;
  let amt;
  if (p.stat === 'cooldown') amt = `-${Math.round(-per * 100)}%`;
  else if (f === 'pct') amt = `+${Math.round(per * 100)}%`;
  else if (f === 'hps') amt = `+${per} HP/s`;
  else amt = `+${per}`;
  return `${amt} ${st.name}: ${st.what}.`;
}

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
  amount: 0, cooldown: 1, luck: 1, growth: 1, greed: 1, magnet: BALANCE.players.magnet, revival: 0,
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
    for (const [k, v] of Object.entries(def.levels[i])) if (k !== 'd' && typeof v === 'number') b[k] = (b[k] || 0) + v;
  }
  const cdBase = b.cd ?? 1;
  return {
    ...b, // special parameters (chance, pull, spread, emit, range, mode, buff ...) pass straight through
    kind: def.kind,
    vis: def.vis,
    dmg: (b.dmg || 0) * st.might,
    cd: (def.kind === 'orbit' && def.evolved) || cdBase <= 0 ? 0 : Math.max(0.08, cdBase * st.cooldown),
    area: (b.area || 1) * st.area,
    speed: (b.speed || 1) * st.speed,
    duration: (b.duration || 1) * st.duration,
    amount: def.noAmount ? (b.amount || 1) : Math.max(1, Math.round((b.amount || 1) + st.amount)),
    pierce: b.pierce || 1,
    kb: b.kb ?? 1,
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

// Plain-language lines describing one level of an ability (for level-up cards):
// [{ label, from, to }] comparing the previous level with this one, after the player's stats.
const LINE_DEFS = [
  ['dmg', 'Damage', (v) => String(Math.round(v))],
  ['amount', null, (v) => String(Math.round(v))],
  ['cd', 'Cooldown', (v) => (v <= 0 ? 'none' : v.toFixed(2) + 's')],
  ['area', 'Area', (v) => Math.round(v * 100) + '%'],
  ['pierce', 'Pierces', (v) => (v >= 90 ? 'everything' : String(Math.round(v)))],
  ['chain', 'Bounces', (v) => String(Math.round(v))],
  ['speed', 'Speed', (v) => Math.round(v * 100) + '%'],
  ['duration', 'Duration', (v) => Math.round(v * 100) + '%'],
  ['chance', 'Chance', (v) => Math.round(v * 100) + '%'],
  ['heal', 'Healing', (v) => (v < 1 ? Math.round(v * 100) + '%' : String(v))],
  ['cap', 'Max heal per second', (v) => String(v)],
  ['stun', 'Stun', (v) => v.toFixed(1) + 's'],
  ['slow', 'Slows by', (v) => Math.round(v * 100) + '%'],
  ['buff', 'Party damage bonus', (v) => '+' + Math.round(v * 100) + '%'],
];
const RELEVANT = {
  cleave: ['dmg', 'amount', 'cd', 'area'], bolt: ['dmg', 'amount', 'cd', 'pierce', 'speed'], fireball: ['dmg', 'amount', 'cd', 'area'],
  meteor: ['dmg', 'amount', 'cd', 'area'], knives: ['dmg', 'amount', 'cd', 'pierce'], flask: ['dmg', 'amount', 'cd', 'area', 'duration'],
  orbit: ['dmg', 'amount', 'cd', 'area', 'speed', 'duration'], sigil: ['dmg', 'amount', 'cd', 'area', 'chain'], nova: ['dmg', 'cd', 'area', 'stun', 'buff', 'heal'],
  axe: ['dmg', 'amount', 'cd', 'area'], wisp: ['dmg', 'amount', 'cd', 'pierce'], aura: ['dmg', 'cd', 'area', 'slow', 'heal'],
  spin: ['dmg', 'cd', 'area', 'duration'], scatter: ['dmg', 'amount', 'cd', 'pierce'], summon: ['dmg', 'amount', 'cd', 'speed', 'duration'],
  orb: ['dmg', 'amount', 'cd', 'area', 'duration'], chain: ['dmg', 'amount', 'cd', 'chain'], spiral: ['dmg', 'amount', 'cd', 'area'],
  rain: ['dmg', 'amount', 'cd', 'area'], ricochet: ['dmg', 'amount', 'cd', 'chain'], fissure: ['dmg', 'amount', 'cd', 'area'],
  beam: ['dmg', 'amount', 'cd', 'area', 'duration'], cone: ['dmg', 'cd', 'area', 'duration'], vortex: ['dmg', 'amount', 'cd', 'area', 'duration'],
  trail: ['dmg', 'cd', 'area', 'duration'], mine: ['dmg', 'amount', 'cd', 'area'], zone: ['dmg', 'amount', 'cd', 'area', 'duration'],
  spark: ['dmg', 'amount', 'cd', 'pierce'], ball: ['dmg', 'amount', 'cd', 'area'], shield: ['amount', 'cd'], thorns: ['dmg', 'area'],
  corpse: ['dmg', 'chance', 'area'], leech: ['heal', 'cap'],
};
export function abilityLines(id, level, st, compare = true) {
  const def = WEAPONS[id];
  if (!def) return [];
  const now = weaponStats(id, level, st);
  const prev = compare && level > 1 ? weaponStats(id, level - 1, st) : null;
  const keys = RELEVANT[def.kind] || ['dmg', 'cd'];
  const out = [];
  for (const [k, label, fmt] of LINE_DEFS) {
    if (!keys.includes(k)) continue;
    let v = now[k];
    if (k === 'amount' && def.kind === 'shield') { out.push({ label: 'Shield', from: prev ? String(prev.amount) : null, to: String(v) }); continue; }
    if (k === 'cd' && def.kind === 'shield') { out.push({ label: 'Regrows after', from: prev ? prev.cd.toFixed(1) + 's' : null, to: v.toFixed(1) + 's' }); continue; }
    if (v === undefined || (v === 0 && k !== 'cd')) continue;
    const lab = label || (def.unit ? def.unit[0].toUpperCase() + def.unit.slice(1) + 's' : 'Projectiles');
    const pv = prev ? prev[k] : undefined;
    out.push({ label: lab, from: prev && pv !== undefined && fmt(pv) !== fmt(v) ? fmt(pv) : null, to: fmt(v) });
  }
  return prev ? out.filter((l) => l.from !== null) : out;
}

// The levels an ability can reach and its evolution partner, for the codex / cards
export function evolutionHint(id) {
  const def = WEAPONS[id];
  if (!def || !def.evolve) return '';
  return `Evolves into ${WEAPONS[def.evolve.into].name} at Lv ${def.levels.length + 1} with ${PASSIVES[def.evolve.with].name} (open a treasure chest).`;
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
