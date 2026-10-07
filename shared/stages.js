import { BALANCE } from './balance.js';
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

// The wave timeline and special events live in the balance file so they are easy to tune.
export const TIMELINE = BALANCE.spawn.timeline;
export const EVENTS = BALANCE.events;
