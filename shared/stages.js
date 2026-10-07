// Stages: theme + which enemy fills each role. The wave timeline is shared and stretched to the
// run length the host picked (segment i covers [i/20, (i+1)/20) of the run).

export const STAGES = [
  {
    id: 'verdant', name: 'Verdant Ruins', subtitle: 'An old kingdom swallowed by the forest.',
    ground: 'grass', props: 'forest', ambient: 'fireflies', music: 0,
    roles: {
      bat: 'bat', slime: 'slime', skeleton: 'skeleton', ghost: 'ghost', zombie: 'zombie', eyeball: 'eyeball',
      werewolf: 'werewolf', imp: 'imp', cultist: 'cultist', thorn: 'thorn', elite1: 'golem', elite2: 'wraith',
      boss1: 'treant', boss2: 'colossus', boss3: 'wyrm', final: 'nightmother',
    },
  },
  {
    id: 'frost', name: 'Frostfang Peaks', subtitle: 'The wind howls with the voices of the lost.',
    ground: 'snow', props: 'frost', ambient: 'snow', music: 1,
    roles: {
      bat: 'icebat', slime: 'snowslime', skeleton: 'frostskel', ghost: 'iceghost', zombie: 'zombie', eyeball: 'eyeball',
      werewolf: 'yeti', imp: 'imp', cultist: 'cultist', thorn: 'icethorn', elite1: 'frostgolem', elite2: 'icewraith',
      boss1: 'icetreant', boss2: 'colossus', boss3: 'frostwyrm', final: 'nightmother',
    },
  },
  {
    id: 'crypt', name: 'Cinder Crypt', subtitle: 'Where the old kings burn and do not rest.',
    ground: 'stone', props: 'crypt', ambient: 'embers', music: 2,
    roles: {
      bat: 'firebat', slime: 'magmaslime', skeleton: 'skeleton', ghost: 'ghost', zombie: 'mummy', eyeball: 'eyeball',
      werewolf: 'hellhound', imp: 'imp', cultist: 'bonecult', thorn: 'lavathorn', elite1: 'magmagolem', elite2: 'firewraith',
      boss1: 'treant', boss2: 'firecolossus', boss3: 'wyrm', final: 'nightmother',
    },
  },
];

// 20 segments. mix: [role, weight], rate: spawns per second, min: keep at least this many alive
export const TIMELINE = [
  { mix: [['bat', 3], ['slime', 2]], rate: 1.5, min: 14 },
  { mix: [['bat', 3], ['slime', 2], ['skeleton', 1]], rate: 1.9, min: 20 },
  { mix: [['skeleton', 3], ['bat', 2], ['slime', 1]], rate: 2.3, min: 26 },
  { mix: [['skeleton', 3], ['ghost', 2], ['bat', 1]], rate: 2.7, min: 32 },
  { mix: [['ghost', 3], ['skeleton', 2], ['zombie', 1]], rate: 3.0, min: 36 },
  { mix: [['zombie', 2], ['ghost', 2], ['eyeball', 2]], rate: 3.2, min: 40 },
  { mix: [['eyeball', 3], ['zombie', 2], ['skeleton', 1]], rate: 3.6, min: 46 },
  { mix: [['zombie', 2], ['eyeball', 2], ['werewolf', 1]], rate: 4.0, min: 52 },
  { mix: [['werewolf', 2], ['ghost', 2], ['zombie', 1]], rate: 4.4, min: 58 },
  { mix: [['werewolf', 2], ['imp', 2], ['eyeball', 1]], rate: 4.8, min: 64 },
  { mix: [['imp', 3], ['werewolf', 2], ['cultist', 1]], rate: 5.2, min: 70 },
  { mix: [['imp', 2], ['cultist', 1], ['zombie', 2]], rate: 5.6, min: 76 },
  { mix: [['werewolf', 3], ['cultist', 1], ['ghost', 2]], rate: 6.0, min: 82 },
  { mix: [['imp', 3], ['werewolf', 2], ['cultist', 1]], rate: 6.5, min: 90 },
  { mix: [['werewolf', 2], ['imp', 2], ['eyeball', 2], ['cultist', 1]], rate: 7.0, min: 100 },
  { mix: [['werewolf', 3], ['imp', 2], ['cultist', 2]], rate: 7.5, min: 110 },
  { mix: [['werewolf', 3], ['zombie', 2], ['imp', 2], ['cultist', 1]], rate: 8.0, min: 120 },
  { mix: [['werewolf', 3], ['imp', 3], ['cultist', 2]], rate: 8.6, min: 130 },
  { mix: [['werewolf', 4], ['imp', 3], ['cultist', 2], ['ghost', 1]], rate: 9.2, min: 145 },
  { mix: [['werewolf', 4], ['imp', 3], ['cultist', 3]], rate: 10, min: 160 },
];

// One-off events at fractions of the run
export const EVENTS = [
  { at: 0.12, type: 'elite', role: 'elite1' },
  { at: 0.2, type: 'swarm', role: 'bat', count: 34 },
  { at: 0.25, type: 'boss', role: 'boss1' },
  { at: 0.33, type: 'elite', role: 'elite2' },
  { at: 0.4, type: 'ring', role: 'thorn', count: 44 },
  { at: 0.45, type: 'swarm', role: 'ghost', count: 30 },
  { at: 0.5, type: 'boss', role: 'boss2' },
  { at: 0.58, type: 'elite', role: 'elite1' },
  { at: 0.63, type: 'elite', role: 'elite2' },
  { at: 0.66, type: 'ring', role: 'thorn', count: 52 },
  { at: 0.7, type: 'swarm', role: 'bat', count: 48 },
  { at: 0.75, type: 'boss', role: 'boss3' },
  { at: 0.82, type: 'elite', role: 'elite1' },
  { at: 0.86, type: 'ring', role: 'thorn', count: 60 },
  { at: 0.9, type: 'elite', role: 'elite2' },
  { at: 0.93, type: 'swarm', role: 'eyeball', count: 50 },
  { at: 1.0, type: 'final', role: 'final' },
];
