// 16x16 pixel icons for weapons, relics and pickups (used by the HUD, level-up cards and the world).
import { Pix, ramp, shade } from './pixel.js';

const METAL = ramp('#c3cbdc');
const GOLD = ramp('#e8c050');
const WOOD = ramp('#8a5a32');

function sword(p, blade = METAL, hilt = GOLD) {
  p.line(4, 12, 12, 4, blade.hi);
  p.line(5, 12, 13, 4, blade.base);
  p.line(4, 11, 12, 3, blade.hi);
  p.set(13, 3, blade.hi);
  p.line(2, 10, 6, 14, hilt.base);
  p.line(2, 14, 4, 12, WOOD.base);
  p.set(1, 15, hilt.hi);
}

function crossbow(p, c = WOOD, s = '#efe6cc') {
  p.rect(2, 7, 12, 2, c.base);
  p.rect(2, 8, 12, 1, c.mid);
  p.line(10, 1, 13, 7, c.dark);
  p.line(10, 15, 13, 9, c.dark);
  p.line(10, 1, 6, 7, s);
  p.line(10, 15, 6, 9, s);
  p.rect(13, 7, 2, 2, METAL.hi);
}

function orb(p, c1, c2, c3) {
  p.ellipse(8, 8, 6, 6, c1);
  p.ellipse(7, 7, 4, 4, c2);
  p.ellipse(6, 6, 2, 2, c3);
}

function knife(p, x, y, dx, dy) {
  p.line(x, y, x + dx * 4, y + dy * 4, METAL.hi);
  p.line(x - dx, y - dy, x - dx * 2, y - dy * 2, '#a8483a');
}

function bottle(p, liquid, glass = '#d8f4ff') {
  p.rect(6, 2, 4, 2, WOOD.base);
  p.rect(6, 4, 4, 2, glass);
  p.ellipse(8, 10.5, 5, 4.5, glass);
  p.ellipse(8, 11.5, 4, 3, liquid);
  p.set(6, 9, '#ffffff');
  p.set(5, 10, '#ffffff');
}

function ring(p, c, r1 = 6, r2 = 3.5) {
  p.ellipse(8, 8, r1, r1, c.base);
  p.ellipse(8, 8, r2, r2, null);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (Math.hypot(x + 0.5 - 8, y + 0.5 - 8) < r2) p.clear(x, y);
  }
  p.ellipse(6, 5, 1.5, 1, c.hi);
}

function bolt(p, c = '#ffe45a', c2 = '#fff8c0') {
  p.poly([[9, 1], [3, 9], [7, 9], [5, 15], [13, 6], [9, 6], [11, 1]], c);
  p.line(9, 2, 5, 8, c2);
}

function flake(p, c = '#bfe8ff', c2 = '#ffffff') {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    p.line(Math.round(8 + Math.cos(a) * 6), Math.round(8 + Math.sin(a) * 6), Math.round(8 - Math.cos(a) * 6), Math.round(8 - Math.sin(a) * 6), c);
  }
  p.rect(7, 7, 2, 2, c2);
  for (const [x, y] of [[8, 2], [8, 13], [3, 5], [13, 5], [3, 11], [13, 11]]) p.set(x, y, c2);
}

function axe(p, head = METAL) {
  p.line(4, 14, 11, 3, WOOD.base);
  p.line(5, 14, 12, 3, WOOD.mid);
  p.poly([[9, 2], [14, 3], [15, 8], [12, 9], [10, 6]], head.base);
  p.line(14, 3, 15, 8, head.hi);
}

function wisp(p, c = '#7ad8ff', c2 = '#e0f8ff') {
  p.poly([[8, 2], [12, 8], [11, 13], [8, 14], [5, 13], [4, 8]], c);
  p.poly([[8, 6], [10, 10], [8, 12], [6, 10]], c2);
  p.set(3, 4, c);
  p.set(13, 5, c);
}

const DRAW = {
  greatsword: (p) => sword(p),
  dawnbreaker: (p) => { sword(p, ramp('#fff0a0'), GOLD); p.set(14, 2, '#ffffff'); p.set(12, 1, '#fff6c0'); },
  boltcaster: (p) => crossbow(p),
  stormvolley: (p) => { crossbow(p, ramp('#4a5a9a'), '#9ad8ff'); bolt(p, '#9ad8ff'); },
  fireball: (p) => { orb(p, '#ff6a1f', '#ffa43a', '#fff0a0'); p.set(2, 2, '#ff9a3a'); p.set(13, 3, '#ffd24a'); },
  meteor: (p) => { p.line(1, 1, 7, 7, '#ff9a3a'); p.line(2, 1, 8, 7, '#ffd24a'); p.ellipse(10, 10, 5, 5, '#6a4a3a'); p.ellipse(9, 9, 3, 3, '#ff6a1f'); },
  halo: (p) => ring(p, GOLD),
  sanctuary: (p) => { ring(p, ramp('#fff4c0'), 7, 4); p.ellipse(8, 8, 2, 2, '#ffffff'); },
  knives: (p) => { knife(p, 4, 12, 1, -1); knife(p, 8, 13, 0, -1); knife(p, 11, 12, -0.5, -1); },
  thousandedges: (p) => { for (let i = 0; i < 5; i++) knife(p, 2 + i * 3, 13 - (i % 2), 0.3 * (i - 2), -1); },
  flask: (p) => bottle(p, '#5fdc6a'),
  plaguemire: (p) => { bottle(p, '#9a5adc', '#e0d0ff'); p.set(7, 11, '#ffffff'); p.set(9, 11, '#ffffff'); },
  chakram: (p) => { ring(p, ramp('#f0c84a'), 6, 3); for (const [x, y] of [[8, 1], [15, 8], [8, 15], [1, 8]]) p.set(x, y, '#ffffff'); },
  eternalwaltz: (p) => { ring(p, ramp('#ff7a9a'), 7, 3); ring(p, GOLD, 4, 2); },
  sigil: (p) => { p.ellipse(8, 8, 7, 7, '#3a3a8a'); p.ellipse(8, 8, 6, 6, '#2a2a5a'); bolt(p); },
  wrathofheaven: (p) => { p.ellipse(8, 8, 7, 7, '#fff4c0'); bolt(p, '#ff5a5a', '#ffd0d0'); },
  frost: (p) => flake(p),
  absolutezero: (p) => { p.poly([[8, 1], [13, 8], [8, 15], [3, 8]], '#9ae4ff'); p.poly([[8, 3], [11, 8], [8, 13], [5, 8]], '#e8faff'); },
  axe: (p) => axe(p),
  twinreapers: (p) => { axe(p, ramp('#c03a4a')); p.poly([[2, 4], [6, 2], [7, 7], [4, 8]], '#c03a4a'); },
  wisp: (p) => wisp(p),
  soulchoir: (p) => { wisp(p, '#c08aff', '#f0e0ff'); p.ellipse(3, 12, 1.5, 1.5, '#c08aff'); p.ellipse(13, 12, 1.5, 1.5, '#c08aff'); },
  // relics
  whetstone: (p) => { p.poly([[2, 11], [6, 5], [14, 4], [11, 11]], '#8a8494'); p.line(6, 6, 13, 5, '#c8c2d2'); p.set(4, 10, '#5a5464'); },
  feather: (p) => { p.poly([[13, 2], [9, 3], [4, 9], [3, 13], [7, 11], [12, 6]], '#f4f0ff'); p.line(13, 2, 2, 14, '#b0a8c8'); },
  lantern: (p) => { p.rect(5, 2, 6, 2, '#3a3040'); p.rect(4, 4, 8, 9, '#3a3040'); p.rect(5, 5, 6, 7, '#ffc45a'); p.rect(6, 6, 4, 5, '#fff2b0'); p.rect(4, 13, 8, 2, '#3a3040'); },
  heart: (p) => { p.ellipse(5.5, 6, 3.5, 3.5, '#e8324a'); p.ellipse(10.5, 6, 3.5, 3.5, '#e8324a'); p.poly([[2, 7], [14, 7], [8, 14]], '#e8324a'); p.set(4, 5, '#ffb0c0'); p.set(5, 4, '#ffb0c0'); },
  boots: (p) => { p.rect(5, 2, 5, 9, '#7a4a2a'); p.rect(5, 10, 9, 4, '#7a4a2a'); p.rect(5, 2, 5, 1, '#c8a050'); p.rect(11, 9, 3, 1, '#ffffff'); p.line(2, 6, 4, 6, '#bfe8ff'); p.line(1, 9, 4, 9, '#bfe8ff'); },
  hourglass: (p) => { p.rect(3, 1, 10, 2, WOOD.base); p.rect(3, 13, 10, 2, WOOD.base); p.poly([[4, 3], [12, 3], [8, 8]], '#d8f4ff'); p.poly([[8, 8], [12, 13], [4, 13]], '#d8f4ff'); p.poly([[6, 11], [10, 11], [11, 13], [5, 13]], '#e8c050'); p.set(8, 8, '#e8c050'); },
  spellbook: (p) => { p.rect(3, 2, 10, 12, '#5a3a8a'); p.rect(12, 3, 2, 11, '#efe6cc'); p.rect(3, 2, 10, 1, GOLD.base); p.ellipse(8, 8, 2.5, 2.5, '#7ad8ff'); },
  clover: (p) => { for (const [x, y] of [[5.5, 5.5], [10.5, 5.5], [5.5, 10.5], [10.5, 10.5]]) p.ellipse(x, y, 3, 3, '#4fbf4a'); p.line(8, 8, 12, 15, '#3a8a3a'); p.set(5, 4, '#9aff8a'); },
  plate: (p) => { p.poly([[3, 3], [13, 3], [12, 11], [8, 15], [4, 11]], METAL.base); p.line(8, 4, 8, 13, METAL.dark); p.rect(4, 3, 4, 2, METAL.hi); },
  quiver: (p) => { p.rect(4, 5, 7, 10, '#8a5a32'); p.rect(4, 5, 7, 2, '#c8a050'); for (const x of [5, 7, 9]) { p.line(x, 1, x + 1, 5, '#efe6cc'); p.set(x, 1, '#e8324a'); } },
  crown: (p) => { p.poly([[2, 12], [2, 5], [5, 8], [8, 3], [11, 8], [14, 5], [14, 12]], GOLD.base); p.rect(2, 11, 13, 2, GOLD.mid); p.set(8, 7, '#e8324a'); p.set(5, 10, '#7ad8ff'); p.set(11, 10, '#7ad8ff'); },
  magnet: (p) => { p.ellipse(8, 7, 6, 6, '#d8324a'); p.ellipse(8, 7, 3, 3, null); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x + 0.5 - 8, y + 0.5 - 7) < 3 || y > 8 && x > 4 && x < 11) p.clear(x, y); p.rect(2, 8, 3, 6, '#d8324a'); p.rect(11, 8, 3, 6, '#d8324a'); p.rect(2, 12, 3, 2, METAL.hi); p.rect(11, 12, 3, 2, METAL.hi); },
  herb: (p) => { p.poly([[8, 1], [13, 7], [8, 14], [3, 7]], '#7ad86a'); p.line(8, 3, 8, 15, '#3a8a3a'); p.set(6, 6, '#c8ffb0'); p.ellipse(12, 3, 1.5, 1.5, '#e8f0ff'); },
  // pickups / misc
  gem1: (p) => { p.poly([[8, 2], [12, 8], [8, 14], [4, 8]], '#4a8aff'); p.poly([[8, 2], [8, 14], [4, 8]], '#8ac0ff'); p.set(7, 6, '#ffffff'); },
  gem2: (p) => { p.poly([[8, 2], [12, 8], [8, 14], [4, 8]], '#3fd06a'); p.poly([[8, 2], [8, 14], [4, 8]], '#9affb0'); p.set(7, 6, '#ffffff'); },
  gem3: (p) => { p.poly([[8, 1], [14, 8], [8, 15], [2, 8]], '#e8324a'); p.poly([[8, 1], [8, 15], [2, 8]], '#ff8a9a'); p.set(6, 6, '#ffffff'); },
  roast: (p) => { p.ellipse(9, 8, 5, 4.5, '#b8642a'); p.ellipse(8, 7, 3, 2.5, '#d8843a'); p.line(4, 11, 1, 14, '#f4ead8'); p.ellipse(1.5, 14.5, 1.5, 1.5, '#f4ead8'); },
  coin: (p) => { p.ellipse(8, 8, 5, 5, GOLD.base); p.ellipse(8, 8, 3.5, 3.5, GOLD.mid); p.rect(7, 5, 2, 6, GOLD.hi); },
  bag: (p) => { p.ellipse(8, 10, 6, 5, '#a87a3a'); p.rect(6, 3, 4, 3, '#a87a3a'); p.rect(5, 5, 6, 1, '#5a3a22'); p.ellipse(8, 10, 2.5, 2.5, GOLD.base); },
  lodestone: (p) => { p.poly([[4, 4], [12, 3], [14, 10], [8, 14], [2, 10]], '#5a5a8a'); p.line(5, 6, 11, 5, '#9a9ad8'); p.ellipse(8, 9, 2, 2, '#ff5a7a'); },
  freeze: (p) => { DRAW.hourglass(p); p.set(2, 2, '#bfe8ff'); p.set(13, 13, '#bfe8ff'); },
  starfall: (p) => { p.poly([[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]], '#ffe45a'); p.set(7, 6, '#ffffff'); },
  chest: (p) => { p.rect(2, 6, 12, 8, '#8a5a32'); p.rect(2, 4, 12, 3, '#a8703a'); p.rect(2, 9, 12, 1, GOLD.base); p.rect(7, 8, 2, 3, GOLD.hi); p.rect(2, 6, 1, 8, GOLD.mid); p.rect(13, 6, 1, 8, GOLD.mid); },
  skull: (p) => { p.ellipse(8, 7, 5, 5, '#efe6d8'); p.rect(5, 10, 6, 4, '#efe6d8'); p.rect(5, 6, 2, 2, '#241a34'); p.rect(9, 6, 2, 2, '#241a34'); p.set(7, 12, '#241a34'); p.set(9, 12, '#241a34'); },
  gold: (p) => DRAW.coin(p),
};

const cache = new Map();
export function iconPix(id) {
  if (cache.has(id)) return cache.get(id);
  const p = new Pix(16, 16);
  (DRAW[id] || DRAW.gem1)(p);
  p.outline('#120c1c', 0.25);
  p.rim(0.12, 0.1);
  cache.set(id, p);
  return p;
}

const urls = new Map();
export function iconURL(id, scale = 3) {
  const k = id + ':' + scale;
  if (!urls.has(k)) urls.set(k, iconPix(id).toCanvas(scale).toDataURL());
  return urls.get(k);
}

export { shade };
