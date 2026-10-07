// ============================================================================================
//  LANTERNBOUND BALANCE FILE - edit these numbers to tune the game.
//  The server and the offline demo both read this file. After editing:
//    - online play: restart the server (npm start)
//    - offline demo: rebuild it (npm run demo)
// ============================================================================================

export const BALANCE = {
  // ------------------------------------------------------------------------------------------
  // HORDE SIZE. A run is split into 20 equal stretches (45 seconds each in a 15 minute run).
  // For each stretch:
  //   rate = monsters spawned per second
  //   min  = if fewer monsters than this are alive, extra ones spawn right away
  //   mix  = which monsters appear and how often ([role, weight]); roles map to each stage's
  //          own monsters in shared/stages.js
  // ------------------------------------------------------------------------------------------
  spawn: {
    rateScale: 0.6, // multiplies every `rate` below (0.5 = half as many spawns, 1 = as written)
    minScale: 0.6, // multiplies every `min` below
    coopRate: 0.3, // each extra player adds this much to the spawn rate (0.3 = +30%)
    coopMin: 0.35, // each extra player adds this much to `min`
    maxBase: 220, // most monsters alive at once, solo ...
    maxPerPlayer: 60, // ... plus this many per extra player
    maxCap: 600, // hard cap whatever the party size
    timeline: [
      /*  0:00 */ { rate: 0.55, min: 6, mix: [['bat', 3], ['slime', 2]] },
      /*  0:45 */ { rate: 0.8, min: 9, mix: [['bat', 3], ['slime', 2], ['skeleton', 1]] },
      /*  1:30 */ { rate: 1.1, min: 13, mix: [['skeleton', 3], ['bat', 2], ['slime', 1]] },
      /*  2:15 */ { rate: 1.45, min: 17, mix: [['skeleton', 3], ['ghost', 2], ['bat', 1]] },
      /*  3:00 */ { rate: 1.8, min: 22, mix: [['ghost', 3], ['skeleton', 2], ['zombie', 1]] },
      /*  3:45 */ { rate: 2.2, min: 27, mix: [['zombie', 2], ['ghost', 2], ['eyeball', 2]] },
      /*  4:30 */ { rate: 2.6, min: 33, mix: [['eyeball', 3], ['zombie', 2], ['skeleton', 1]] },
      /*  5:15 */ { rate: 3.1, min: 40, mix: [['zombie', 2], ['eyeball', 2], ['werewolf', 1]] },
      /*  6:00 */ { rate: 3.6, min: 47, mix: [['werewolf', 2], ['ghost', 2], ['zombie', 1]] },
      /*  6:45 */ { rate: 4.2, min: 55, mix: [['werewolf', 2], ['imp', 2], ['eyeball', 1]] },
      /*  7:30 */ { rate: 4.8, min: 63, mix: [['imp', 3], ['werewolf', 2], ['cultist', 1]] },
      /*  8:15 */ { rate: 5.4, min: 72, mix: [['imp', 2], ['cultist', 1], ['zombie', 2]] },
      /*  9:00 */ { rate: 6.0, min: 82, mix: [['werewolf', 3], ['cultist', 1], ['ghost', 2]] },
      /*  9:45 */ { rate: 6.7, min: 92, mix: [['imp', 3], ['werewolf', 2], ['cultist', 1]] },
      /* 10:30 */ { rate: 7.4, min: 104, mix: [['werewolf', 2], ['imp', 2], ['eyeball', 2], ['cultist', 1]] },
      /* 11:15 */ { rate: 8.1, min: 116, mix: [['werewolf', 3], ['imp', 2], ['cultist', 2]] },
      /* 12:00 */ { rate: 8.9, min: 130, mix: [['werewolf', 3], ['zombie', 2], ['imp', 2], ['cultist', 1]] },
      /* 12:45 */ { rate: 9.7, min: 145, mix: [['werewolf', 3], ['imp', 3], ['cultist', 2]] },
      /* 13:30 */ { rate: 10.6, min: 160, mix: [['werewolf', 4], ['imp', 3], ['cultist', 2], ['ghost', 1]] },
      /* 14:15 */ { rate: 11.5, min: 178, mix: [['werewolf', 4], ['imp', 3], ['cultist', 3]] },
    ],
  },

  // ------------------------------------------------------------------------------------------
  // SPECIAL EVENTS at a fraction of the run (0.25 = a quarter of the way, 3:45 in 15 minutes).
  //   elite = one big monster that drops a treasure chest
  //   swarm = a stream of monsters crossing the field (count = how many)
  //   ring  = a wall of thorns closing around a player (count = how many)
  //   boss  = a boss with special attacks (drops a chest); final = the last boss of the night
  // ------------------------------------------------------------------------------------------
  events: [
    { at: 0.12, type: 'elite', role: 'elite1' },
    { at: 0.2, type: 'swarm', role: 'bat', count: 28 },
    { at: 0.25, type: 'boss', role: 'boss1' },
    { at: 0.33, type: 'elite', role: 'elite2' },
    { at: 0.4, type: 'ring', role: 'thorn', count: 40 },
    { at: 0.45, type: 'swarm', role: 'ghost', count: 26 },
    { at: 0.5, type: 'boss', role: 'boss2' },
    { at: 0.58, type: 'elite', role: 'elite1' },
    { at: 0.63, type: 'elite', role: 'elite2' },
    { at: 0.66, type: 'ring', role: 'thorn', count: 48 },
    { at: 0.7, type: 'swarm', role: 'bat', count: 40 },
    { at: 0.75, type: 'boss', role: 'boss3' },
    { at: 0.82, type: 'elite', role: 'elite1' },
    { at: 0.86, type: 'ring', role: 'thorn', count: 56 },
    { at: 0.9, type: 'elite', role: 'elite2' },
    { at: 0.93, type: 'swarm', role: 'eyeball', count: 44 },
    { at: 1.0, type: 'final', role: 'final' },
  ],

  // ------------------------------------------------------------------------------------------
  // MONSTER STRENGTH over the run. `f` = how far into the run (0 at the start, 1 at the end).
  //   health multiplier = 1 + hpGrowth * f ^ hpCurve   (curve above 1 = gentle start, steep end)
  //   damage multiplier = 1 + dmgGrowth * f ^ dmgCurve
  // ------------------------------------------------------------------------------------------
  monsters: {
    hpGrowth: 3.0,
    hpCurve: 1.7,
    dmgGrowth: 0.8,
    dmgCurve: 1.6,
    coopHp: 0.65, // each extra player gives monsters this much more health (0.65 = +65%)
    bossCoopHp: 0.65,
    // Evolved monsters: tier 2 starts appearing at tier2Start and makes up most spawns by tier3Start;
    // tier 3 grows from tier3Start until the end. Per tier: health, damage, xp, speed and size.
    tier2Start: 0.3,
    tier3Start: 0.65,
    tier2Share: 0.8,
    tiers: {
      hp: [1, 2.1, 3.8],
      dmg: [1, 1.3, 1.6],
      xp: [1, 2, 3],
      speed: [1, 1.06, 1.12],
      size: [1, 1.12, 1.25],
    },
  },

  // ------------------------------------------------------------------------------------------
  // EXPERIENCE needed for the next level (before the party-size bonus):
  //   levels  1-19: early + level * earlyStep
  //   levels 20-39: mid   + (level - 20) * midStep
  //   levels 40+  : late  + (level - 40) * lateStep
  // ------------------------------------------------------------------------------------------
  xp: {
    early: 4, earlyStep: 3.5,
    mid: 70, midStep: 5,
    late: 170, lateStep: 7,
    coop: 0.35, // each extra player needs this much more (0.35 = +35%), since XP is shared
  },

  // ------------------------------------------------------------------------------------------
  // PLAYERS
  // ------------------------------------------------------------------------------------------
  players: {
    magnet: 2.3, // pickup range in world units before upgrades
    hitInvuln: 0.15, // seconds of invulnerability after taking a hit
    respawnSeconds: 30, // a fallen traveler returns after this long if anyone is still standing
    respawnShield: 3, // seconds of invincibility (with a shield bubble) after coming back
    respawnHp: 0.6, // fraction of max health they return with
  },

  // ------------------------------------------------------------------------------------------
  // PICKUPS: chance per kill (before luck) and how often braziers appear
  // ------------------------------------------------------------------------------------------
  pickups: {
    coin: 0.012, bag: 0.003, roast: 0.0015,
    brazierEvery: 22, // seconds between braziers (divided by the host's Pickups setting)
  },
};
