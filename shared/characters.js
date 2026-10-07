// The eight playable Travelers. `look` drives the procedural pixel-art sprite on the client.
//  bonus:  starting stat bonuses (see stats.js for what each stat means)
//  growth: extra bonus gained every 10 levels (up to 5 times)

export const CHARACTERS = [
  {
    id: 'aldric', name: 'Aldric', title: 'The Oathbound Knight', weapon: 'greatsword',
    desc: 'A sworn shield of the fallen kingdom. Slow to fall, quick to cleave.',
    perk: '+20 Max HP, +1 Armor. +10 Max HP every 10 levels.',
    bonus: { maxHp: 20, armor: 1 }, growth: { stat: 'maxHp', amount: 10 },
    look: { outfit: 'armor', skin: '#f1c7a1', hair: '#8a5a2b', hairStyle: 'short', main: '#4f6fa8', dark: '#2d3f66', accent: '#d9b44a', head: 'helm', cape: '#a8323a', build: 'broad', weapon: 'sword' },
  },
  {
    id: 'sera', name: 'Sera', title: 'The Bolt Huntress', weapon: 'boltcaster',
    desc: 'She has never missed a shot she meant to take. Her boltcaster sings in the dark.',
    perk: '+10% Projectile Speed. +5% Might every 10 levels.',
    bonus: { speed: 0.1 }, growth: { stat: 'might', amount: 0.05 },
    look: { outfit: 'leather', skin: '#e8b48c', hair: '#c9762f', hairStyle: 'ponytail', main: '#4e7d3a', dark: '#2f4d24', accent: '#b8864a', head: 'hood', cape: '#355e2a', build: 'slim', weapon: 'crossbow' },
  },
  {
    id: 'corvin', name: 'Corvin', title: 'The Ember Scholar', weapon: 'fireball',
    desc: 'Expelled from the academy for "excessive enthusiasm". Mostly regarding fire.',
    perk: '+10% Area. +5% Area every 10 levels.',
    bonus: { area: 0.1 }, growth: { stat: 'area', amount: 0.05 },
    look: { outfit: 'robe', skin: '#f3d0b0', hair: '#d8d8e8', hairStyle: 'long', main: '#7b3f9e', dark: '#4a2462', accent: '#f0a830', head: 'wizard', cape: null, build: 'slim', weapon: 'staff' },
  },
  {
    id: 'mira', name: 'Mira', title: 'The Dawn Cleric', weapon: 'halo',
    desc: 'A healer of the Sunspire. Her prayers burn the unholy and mend the faithful.',
    perk: '+0.4 HP Recovery, +10 Max HP. +0.1 Recovery every 10 levels.',
    bonus: { recovery: 0.4, maxHp: 10 }, growth: { stat: 'recovery', amount: 0.1 },
    look: { outfit: 'robe', skin: '#f6d7bd', hair: '#f2dc8c', hairStyle: 'long', main: '#f2efe6', dark: '#b9b2a2', accent: '#e0b440', head: 'circlet', cape: '#d9c48a', build: 'slim', weapon: 'censer' },
  },
  {
    id: 'vex', name: 'Vex', title: 'The Shadow Thief', weapon: 'knives',
    desc: 'Stole a crown, a castle and a dragon egg. Now steals time from the horde.',
    perk: '+12% Move Speed, +20% Luck. +3% Move Speed every 10 levels.',
    bonus: { moveSpeed: 0.12, luck: 0.2 }, growth: { stat: 'moveSpeed', amount: 0.03 },
    look: { outfit: 'jacket', skin: '#d9a07a', hair: '#2b2b38', hairStyle: 'messy', main: '#3a3550', dark: '#211e30', accent: '#c23b3b', head: 'bandana', cape: '#2a2440', build: 'slim', weapon: 'daggers' },
  },
  {
    id: 'bram', name: 'Bram', title: 'The Apothecary', weapon: 'flask',
    desc: 'Every brew is an experiment. Some of them even work as intended.',
    perk: '+20% Duration. +5% Duration every 10 levels.',
    bonus: { duration: 0.2 }, growth: { stat: 'duration', amount: 0.05 },
    look: { outfit: 'apron', skin: '#e0b090', hair: '#5a3a22', hairStyle: 'beard', main: '#8a6a3a', dark: '#5a4224', accent: '#5fbf6a', head: 'goggles', cape: null, build: 'broad', weapon: 'flask' },
  },
  {
    id: 'lyra', name: 'Lyra', title: 'The Blade Dancer', weapon: 'chakram',
    desc: 'Her dance was meant for royal courts. It works just as well on the undead.',
    perk: '-8% Cooldown. -2% Cooldown every 10 levels.',
    bonus: { cooldown: -0.08 }, growth: { stat: 'cooldown', amount: -0.02 },
    look: { outfit: 'dancer', skin: '#c98a62', hair: '#b0303a', hairStyle: 'bun', main: '#d0455a', dark: '#8a2638', accent: '#f2c84a', head: 'veil', cape: '#f2c84a', build: 'slim', weapon: 'fans' },
  },
  {
    id: 'toma', name: 'Toma', title: 'The Storm Merchant', weapon: 'sigil',
    desc: 'Sells lightning in bottles. The bottles are extra. The lightning is free.',
    perk: '+30% Greed, +25% Magnet. +10% Greed every 10 levels.',
    bonus: { greed: 0.3, magnet: 0.25 }, growth: { stat: 'greed', amount: 0.1 },
    look: { outfit: 'coat', skin: '#eac09a', hair: '#3a2a20', hairStyle: 'short', main: '#2f6f73', dark: '#1d4649', accent: '#e8c45a', head: 'tophat', cape: '#6a3a2a', build: 'round', weapon: 'tome' },
  },
];

export const CHAR_INDEX = Object.fromEntries(CHARACTERS.map((c, i) => [c.id, i]));
