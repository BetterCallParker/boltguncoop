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

// Placeholder look for travelers whose pixel art isn't painted yet (gray, unadorned). Give a class
// `sheet: 'art/<id>.png'` (21 frames of 32x40, same layout as the painted travelers) to use your art.
const GRAY = (weapon = null, build = 'slim') => ({ outfit: 'leather', skin: '#b4b4b4', hair: '#7a7a7a', hairStyle: 'short', main: '#8f8f8f', dark: '#626262', accent: '#c4c4c4', head: null, cape: null, build, weapon, placeholder: true });

// unlock: an achievement id (see shared/unlocks.js); price: Guild gold to unlock it outright
const C = (id, name, title, weapon, desc, perk, bonus, growth, look, price) => ({ id, name, title, weapon, desc, perk, bonus, growth, look, price });
CHARACTERS.push(
  C('brakka', 'Brakka', 'The Whirling Berserker', 'whirl', 'A storm of axes and fury from the northern clans. The horde comes to him; it does not leave.',
    '+30 Max HP, +10% Might. +5% Might every 10 levels.', { maxHp: 30, might: 0.1 }, { stat: 'might', amount: 0.05 }, GRAY('sword', 'broad'), 1200),
  C('morwen', 'Morwen', 'The Bone Weaver', 'bonesplinter', 'She reads the future in bones, and throws the ones that disagree.',
    '+10% Projectile Speed, +10% Duration. +5% Area every 10 levels.', { speed: 0.1, duration: 0.1 }, { stat: 'area', amount: 0.05 }, GRAY('staff'), 1500),
  C('sable', 'Sable', 'The Gravecaller', 'raisedead', 'The dead answer her call, and they are surprisingly polite about it.',
    '+20% Duration, +10% Growth. +1 Amount at level 30.', { duration: 0.2, growth: 0.1 }, { stat: 'duration', amount: 0.05 }, GRAY('tome'), 2000),
  C('ysolde', 'Ysolde', 'The Frost Witch', 'frostorb', 'Winter follows her like a loyal hound.',
    '+15% Area, +10 Max HP. +5% Area every 10 levels.', { area: 0.15, maxHp: 10 }, { stat: 'area', amount: 0.05 }, GRAY('staff'), 1500),
  C('daro', 'Daro', 'The Tempest Monk', 'tempestpalm', 'Twenty years of meditation, focused into one very loud palm strike.',
    '+15% Move Speed, -5% Cooldown. -2% Cooldown every 10 levels.', { moveSpeed: 0.15, cooldown: -0.05 }, { stat: 'cooldown', amount: -0.02 }, GRAY(null), 1800),
  C('hale', 'Hale', 'The Templar', 'hammers', 'Sworn to the Dawn Order, he carries more hammers than strictly necessary.',
    '+2 Armor, +20 Max HP. +1 Armor every 10 levels.', { armor: 2, maxHp: 20 }, { stat: 'armor', amount: 1 }, GRAY('sword', 'broad'), 1800),
  C('rook', 'Rook', 'The Warden Ranger', 'arrowrain', 'Guards the old forest roads. Has never once lost an arrow he wanted back.',
    '+10% Area, +15% Luck. +5% Luck every 10 levels.', { area: 0.1, luck: 0.15 }, { stat: 'luck', amount: 0.05 }, GRAY('crossbow'), 1500),
  C('nyx', 'Nyx', 'The Night Assassin', 'shuriken', 'There is no record of her. That is how she likes it.',
    '+15% Move Speed, +10% Might. +3% Move Speed every 10 levels.', { moveSpeed: 0.15, might: 0.1 }, { stat: 'moveSpeed', amount: 0.03 }, GRAY('daggers'), 2000),
  C('fennick', 'Fennick', 'The Clockwork Engineer', 'sentry', 'If it ticks, he built it. If it explodes, he meant to.',
    '+20% Duration, +1 Armor. +5% Duration every 10 levels.', { duration: 0.2, armor: 1 }, { stat: 'duration', amount: 0.05 }, GRAY('flask', 'round'), 1800),
  C('orla', 'Orla', 'The Moon Druid', 'wolves', 'Raised by wolves. Literally. They still visit.',
    '+0.3 HP Recovery, +10% Move Speed. +0.1 Recovery every 10 levels.', { recovery: 0.3, moveSpeed: 0.1 }, { stat: 'recovery', amount: 0.1 }, GRAY('staff'), 1500),
  C('torvald', 'Torvald', 'The Earthshaker', 'rupture', 'When he stamps his foot, mountains apologize.',
    '+40 Max HP, +10% Area. +10 Max HP every 10 levels.', { maxHp: 40, area: 0.1 }, { stat: 'maxHp', amount: 10 }, GRAY('sword', 'broad'), 2200),
  C('seraphine', 'Seraphine', 'The Lightbringer', 'holycross', 'A paladin of the Sunspire who walks into the dark on purpose.',
    '+20 Max HP, +10% Might. +5% Might every 10 levels.', { maxHp: 20, might: 0.1 }, { stat: 'might', amount: 0.05 }, GRAY('censer'), 2400),
  C('ashka', 'Ashka', 'The Pyromancer', 'dragonbreath', 'Learned fire from a dragon. Learned manners from nobody.',
    '+15% Might, -10 Max HP. +5% Might every 10 levels.', { might: 0.15, maxHp: -10 }, { stat: 'might', amount: 0.05 }, GRAY('staff'), 2400),
  C('kestrel', 'Kestrel', 'The Falconer', 'talons', 'Her birds see everything. She mostly listens to the gossip.',
    '+20% Projectile Speed, +25% Magnet. +5% Projectile Speed every 10 levels.', { speed: 0.2, magnet: 0.25 }, { stat: 'speed', amount: 0.05 }, GRAY('crossbow'), 2000),
  C('vael', 'Vael', 'The Void Seer', 'gravitywell', 'Stared into the abyss. The abyss looked away first.',
    '+20% Area, +10% Duration. +5% Area every 10 levels.', { area: 0.2, duration: 0.1 }, { stat: 'area', amount: 0.05 }, GRAY('tome'), 2800),
  C('anselm', 'Anselm', 'The Exorcist', 'sunlance', 'Has banished four hundred demons and one very persistent salesman.',
    '+10% Might, +0.2 HP Recovery. +5% Might every 10 levels.', { might: 0.1, recovery: 0.2 }, { stat: 'might', amount: 0.05 }, GRAY('censer'), 2600),
  C('moss', 'Moss', 'The Plague Doctor', 'miasma', 'The mask is for your protection, not his.',
    '+25% Duration, +10% Move Speed. +5% Duration every 10 levels.', { duration: 0.25, moveSpeed: 0.1 }, { stat: 'duration', amount: 0.05 }, GRAY('flask'), 2600),
  C('ingrid', 'Ingrid', 'The Valkyrie', 'javelin', 'Chooses who falls in battle. Mostly the other side.',
    '+20 Max HP, +1 Armor, +10% Might. +5% Might every 10 levels.', { maxHp: 20, armor: 1, might: 0.1 }, { stat: 'might', amount: 0.05 }, GRAY('sword'), 3000),
  C('ravel', 'Ravel', 'The Blood Mage', 'bloodnova', 'Pays for his magic in blood. Usually someone else\'s.',
    '+30 Max HP, +0.5 HP Recovery, -5% Might. +10 Max HP every 10 levels.', { maxHp: 30, recovery: 0.5, might: -0.05 }, { stat: 'maxHp', amount: 10 }, GRAY('tome'), 3000),
  C('caius', 'Caius', 'The Gunslinger', 'scattergun', 'Carries a musket built from a cannon. Somehow it is still legal.',
    '+10% Might, +10% Luck. +5% Might every 10 levels.', { might: 0.1, luck: 0.1 }, { stat: 'might', amount: 0.05 }, GRAY('crossbow'), 3200),
  C('quill', 'Quill', 'The Battle Bard', 'anthem', 'Every great battle needs a soundtrack. He brought his own.',
    '+20% Growth, +20% Greed. +5% Growth every 10 levels.', { growth: 0.2, greed: 0.2 }, { stat: 'growth', amount: 0.05 }, GRAY('fans'), 3200),
  C('zephyra', 'Zephyra', 'The Windwalker', 'cyclone', 'Never stands still. Has not sat down since she was six.',
    '+20% Move Speed, +10% Projectile Speed. +3% Move Speed every 10 levels.', { moveSpeed: 0.2, speed: 0.1 }, { stat: 'moveSpeed', amount: 0.03 }, GRAY('fans'), 3500),
);

export const CHAR_INDEX = Object.fromEntries(CHARACTERS.map((c, i) => [c.id, i]));
