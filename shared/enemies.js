// Enemy roster. `sprite` + `pal` pick the procedural pixel-art sprite on the client.
//  hp/speed/dmg/xp are base values. The server scales hp with run time, party size and difficulty.
//  r: body radius, mass: knockback resistance

const E = (o) => ({ r: 0.42, mass: 1, xp: 1, pal: 'base', ...o });

const BASE = {
  bat: E({ name: 'Dusk Bat', sprite: 'bat', hp: 5, speed: 3.6, dmg: 2, xp: 1, r: 0.35, mass: 0.4, fly: true }),
  slime: E({ name: 'Moss Slime', sprite: 'slime', hp: 10, speed: 2.0, dmg: 3, xp: 1, r: 0.45, mass: 0.8 }),
  skeleton: E({ name: 'Skeleton', sprite: 'skeleton', hp: 16, speed: 2.5, dmg: 4, xp: 2 }),
  ghost: E({ name: 'Wisp Ghost', sprite: 'ghost', hp: 12, speed: 3.1, dmg: 3, xp: 2, mass: 0.5, wavy: true, fly: true }),
  zombie: E({ name: 'Grave Walker', sprite: 'zombie', hp: 38, speed: 1.8, dmg: 5, xp: 3, r: 0.5, mass: 2 }),
  eyeball: E({ name: 'Gazer', sprite: 'eyeball', hp: 26, speed: 2.9, dmg: 5, xp: 3, r: 0.45, mass: 0.8, fly: true }),
  werewolf: E({ name: 'Werewolf', sprite: 'werewolf', hp: 70, speed: 3.7, dmg: 7, xp: 6, r: 0.6, mass: 2.5 }),
  imp: E({ name: 'Cinder Imp', sprite: 'imp', hp: 34, speed: 3.3, dmg: 6, xp: 4, fly: true }),
  cultist: E({ name: 'Cultist', sprite: 'cultist', hp: 50, speed: 1.7, dmg: 5, xp: 6, r: 0.45, mass: 1.5, ranged: { cd: 3.2, speed: 6.5, dmg: 8, range: 10 } }),
  thorn: E({ name: 'Thornvine', sprite: 'thorn', hp: 30, speed: 0.8, dmg: 4, xp: 1, r: 0.5, mass: 99, ring: true }),
  golem: E({ name: 'Ruin Golem', sprite: 'golem', hp: 700, speed: 1.5, dmg: 12, xp: 40, r: 1.0, mass: 10, elite: true }),
  wraith: E({ name: 'Wraith Knight', sprite: 'wraith', hp: 500, speed: 3.0, dmg: 11, xp: 35, r: 0.8, mass: 6, elite: true }),
  treant: E({ name: 'Elder Treant', sprite: 'treant', hp: 4500, speed: 1.9, dmg: 16, xp: 250, r: 1.6, mass: 60, boss: true, ability: 'roots' }),
  colossus: E({ name: 'Bone Colossus', sprite: 'colossus', hp: 10000, speed: 2.1, dmg: 20, xp: 400, r: 1.8, mass: 80, boss: true, ability: 'quake' }),
  wyrm: E({ name: 'Night Wyrm', sprite: 'wyrm', hp: 18000, speed: 2.9, dmg: 22, xp: 600, r: 1.8, mass: 90, boss: true, ability: 'charge' }),
  brazier: E({ name: 'Brazier', sprite: 'brazier', hp: 1, speed: 0, dmg: 0, xp: 0, r: 0.45, mass: 999, prop: true }),
  nightmother: E({ name: 'The Nightmother', sprite: 'nightmother', hp: 45000, speed: 2.4, dmg: 26, xp: 0, r: 2.0, mass: 999, boss: true, final: true, ability: 'orbs' }),
};

// Stage variants share behaviour but get a new palette + name
const VARIANTS = {
  icebat: ['bat', 'ice', 'Frost Bat'],
  snowslime: ['slime', 'ice', 'Snow Slime', { hp: 12 }],
  frostskel: ['skeleton', 'ice', 'Frost Skeleton'],
  iceghost: ['ghost', 'ice', 'Rime Spirit'],
  yeti: ['werewolf', 'ice', 'Yeti', { hp: 85, speed: 3.3 }],
  frostgolem: ['golem', 'ice', 'Glacier Golem'],
  icewraith: ['wraith', 'ice', 'Rime Knight'],
  frostwyrm: ['wyrm', 'ice', 'Frost Wyrm'],
  icetreant: ['treant', 'ice', 'Frostbark Ancient'],
  firebat: ['bat', 'fire', 'Ember Bat'],
  magmaslime: ['slime', 'fire', 'Magma Slime', { hp: 13 }],
  mummy: ['zombie', 'fire', 'Mummy', { hp: 44 }],
  hellhound: ['werewolf', 'fire', 'Hellhound', { speed: 4.0 }],
  bonecult: ['cultist', 'fire', 'Ash Cultist'],
  magmagolem: ['golem', 'fire', 'Magma Golem'],
  firewraith: ['wraith', 'fire', 'Cinder Knight'],
  firecolossus: ['colossus', 'fire', 'Ashen Colossus'],
  lavathorn: ['thorn', 'fire', 'Lava Thorn'],
  icethorn: ['thorn', 'ice', 'Ice Spike'],
};

export const ENEMIES = { ...BASE };
for (const [id, [base, pal, name, extra]] of Object.entries(VARIANTS)) {
  ENEMIES[id] = { ...BASE[base], pal, name, ...(extra || {}) };
}

export const ENEMY_IDS = Object.keys(ENEMIES);
export const ENEMY_INDEX = Object.fromEntries(ENEMY_IDS.map((id, i) => [id, i]));
