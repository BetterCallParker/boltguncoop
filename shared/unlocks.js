// Unlockables: achievements (tracked in each player's browser) unlock new classes and add new
// abilities to the level-up pool. Locked classes can also be bought outright with Guild gold.
import { CHARACTERS } from './characters.js';
import { WEAPONS, SHARED_WEAPONS } from './items.js';

// travelers available from the start
export const STARTER_CLASSES = ['aldric', 'sera', 'corvin', 'mira', 'vex', 'bram', 'lyra', 'toma'];

// shared abilities that must be unlocked before they appear on level-up
export const LOCKED_ABILITIES = {
  corpseburst: 'kills1k', hex: 'kills5k', ballightning: 'survive10', traps: 'chests10',
  fang: 'bloodbath', arclightning: 'level25', smite: 'firstwin', hive: 'gems5k', warcry: 'elites25',
};

// s = lifetime stats (see Guild): runs, wins, kills, gems, chests, evolutions, elites, bosses{},
//     bestLevel, bestTime, bestRunKills, maxWeapons, stageWins[], partyWins, stage
export const ACHIEVEMENTS = [
  { id: 'firstrun', name: 'First Steps', desc: 'Finish an expedition, win or lose.', goal: (s) => [s.runs, 1], cls: 'brakka' },
  { id: 'kills1k', name: 'Bone Collector', desc: 'Defeat 1,000 foes in total.', goal: (s) => [s.kills, 1000], cls: 'morwen', ability: 'corpseburst' },
  { id: 'kills5k', name: 'Gravedigger', desc: 'Defeat 5,000 foes in total.', goal: (s) => [s.kills, 5000], cls: 'sable', ability: 'hex' },
  { id: 'frostgate', name: 'Into the Cold', desc: 'Unlock Frostfang Peaks.', goal: (s) => [s.stage, 1], cls: 'ysolde' },
  { id: 'survive10', name: 'Survivor', desc: 'Survive for 10 minutes in one expedition.', goal: (s) => [Math.floor(s.bestTime / 60), 10], cls: 'daro', ability: 'ballightning' },
  { id: 'treant', name: 'Treefeller', desc: 'Defeat the Elder Treant.', goal: (s) => [s.bosses.treant || 0, 1], cls: 'hale' },
  { id: 'level25', name: 'Seasoned', desc: 'Reach level 25 in one expedition.', goal: (s) => [s.bestLevel, 25], cls: 'rook', ability: 'arclightning' },
  { id: 'runkills500', name: 'Shadow Step', desc: 'Defeat 500 foes in one expedition.', goal: (s) => [s.bestRunKills, 500], cls: 'nyx' },
  { id: 'chests10', name: 'Treasure Hunter', desc: 'Open 10 treasure chests in total.', goal: (s) => [s.chests, 10], cls: 'fennick', ability: 'traps' },
  { id: 'runs5', name: 'Old Hand', desc: 'Finish 5 expeditions.', goal: (s) => [s.runs, 5], cls: 'orla' },
  { id: 'colossus', name: 'Colossus Breaker', desc: 'Defeat the Bone Colossus.', goal: (s) => [s.bosses.colossus || 0, 1], cls: 'torvald' },
  { id: 'firstwin', name: 'Dawnbringer', desc: 'Survive the whole night and win an expedition.', goal: (s) => [s.wins, 1], cls: 'seraphine', ability: 'smite' },
  { id: 'evolve', name: 'Evolution', desc: 'Evolve an ability.', goal: (s) => [s.evolutions, 1], cls: 'ashka' },
  { id: 'gems5k', name: 'Gem Hoarder', desc: 'Collect 5,000 experience gems in total.', goal: (s) => [s.gems, 5000], cls: 'kestrel', ability: 'hive' },
  { id: 'wyrm', name: 'Wyrmslayer', desc: 'Defeat the Night Wyrm.', goal: (s) => [s.bosses.wyrm || 0, 1], cls: 'vael' },
  { id: 'elites25', name: 'Elite Hunter', desc: 'Defeat 25 elite monsters in total.', goal: (s) => [s.elites, 25], cls: 'anselm', ability: 'warcry' },
  { id: 'frostwin', name: 'Frostbitten', desc: 'Win on Frostfang Peaks.', goal: (s) => [s.stageWins[1] || 0, 1], cls: 'moss' },
  { id: 'level50', name: 'Legend', desc: 'Reach level 50 in one expedition.', goal: (s) => [s.bestLevel, 50], cls: 'ingrid' },
  { id: 'bloodbath', name: 'Bloodbath', desc: 'Defeat 20,000 foes in total.', goal: (s) => [s.kills, 20000], cls: 'ravel', ability: 'fang' },
  { id: 'arsenal', name: 'Full Arsenal', desc: 'Hold 6 abilities at once.', goal: (s) => [s.maxWeapons, 6], cls: 'caius' },
  { id: 'partywin', name: 'Encore', desc: 'Win an expedition with two or more travelers.', goal: (s) => [s.partyWins, 1], cls: 'quill' },
  { id: 'cryptwin', name: 'Eye of the Storm', desc: 'Win on Cinder Crypt.', goal: (s) => [s.stageWins[2] || 0, 1], cls: 'zephyra' },
];

export function freshLife() {
  return { runs: 0, wins: 0, kills: 0, gems: 0, chests: 0, evolutions: 0, elites: 0, bosses: {}, bestLevel: 0, bestTime: 0, bestRunKills: 0, maxWeapons: 0, stageWins: [0, 0, 0], partyWins: 0, stage: 0 };
}

export function achieved(a, life) {
  const [have, need] = a.goal(life);
  return have >= need;
}

// abilities this player may be offered (unlocked shared pool), from an untrusted client list
export function sanitizeUnlocks(list) {
  const out = new Set(SHARED_WEAPONS.filter((id) => !LOCKED_ABILITIES[id]));
  if (Array.isArray(list)) for (const id of list) if (LOCKED_ABILITIES[id] && WEAPONS[id]) out.add(id);
  return out;
}

export const CLASS_IDS = CHARACTERS.map((c) => c.id);
