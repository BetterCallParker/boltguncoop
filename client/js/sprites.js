// Procedural pixel-art: travelers (paper-doll), props, ground textures. Everything is drawn in
// code at 16 px per world unit, then shown in 3D with nearest-neighbour filtering (HD-2D style).
import { Pix, ramp, shade, mix, noise2 } from './pixel.js';
import { CHARACTERS } from '/shared/characters.js';

export { travelerSheet, portraitCanvas, fullSpriteCanvas, frameIndex, FW, FH, TF, VIEW_BASE } from './travelers.js';

const METAL = ramp('#b9c2d6');
const WOOD = ramp('#8a5a32');

// ------------------------------------------------------------------ props
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function leafClumps(p, shapes, pal, r, n, rmin = 2.5, rmax = 4.5) {
  // base fill
  for (const [cx, cy, rx, ry] of shapes) p.ellipse(cx, cy, rx, ry, pal.dark);
  const inside = (x, y) => shapes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  // clumps lit from the upper-left: more highlights toward the top
  const pts = [];
  for (let i = 0; i < n; i++) {
    const s = shapes[Math.floor(r() * shapes.length)];
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = s[0] + Math.cos(a) * s[2] * d * 0.92, y = s[1] + Math.sin(a) * s[3] * d * 0.92;
    pts.push([x, y, rmin + r() * (rmax - rmin)]);
  }
  pts.sort((a, b) => a[1] - b[1]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, cy, , ry] of shapes) { minY = Math.min(minY, cy - ry); maxY = Math.max(maxY, cy + ry); }
  for (const [x, y, rr] of pts) {
    const t = (y - minY) / (maxY - minY);
    const col = t < 0.35 ? pal.base : t < 0.7 ? pal.mid : pal.mid;
    p.ellipse(x, y, rr, rr * 0.85, col);
    // highlight crescent
    for (let yy = Math.floor(y - rr); yy <= y; yy++) for (let xx = Math.floor(x - rr); xx <= x; xx++) {
      const dx = (xx + 0.5 - x) / rr, dy = (yy + 0.5 - y) / (rr * 0.85);
      const d2 = dx * dx + dy * dy;
      if (d2 <= 1 && d2 > 0.45 && inside(xx, yy) && dx + dy < -0.6) p.set(xx, yy, t < 0.5 ? pal.hi : pal.base);
    }
  }
}

export function treeSprite(kind = 'oak', seed = 1, palette = 'summer') {
  const r = rnd(seed * 7919 + 13);
  if (kind === 'pine') {
    const p = new Pix(40, 64);
    const snow = palette === 'snow';
    const g = ramp(snow ? '#3f6b5a' : '#3e6a34');
    p.rect(18, 50, 4, 14, WOOD.mid);
    p.rect(18, 50, 1, 14, WOOD.dark);
    const tiers = [[20, 6, 7, 16], [20, 16, 11, 26], [20, 27, 15, 38], [20, 38, 18, 52]];
    for (const [cx, top, hw, bot] of tiers) {
      p.poly([[cx, top], [cx + hw, bot], [cx - hw, bot]], g.mid);
      p.poly([[cx, top], [cx - 1, top + 2], [cx - hw + 2, bot - 1], [cx - hw, bot]], g.base);
      for (let x = cx - hw + 1; x < cx + hw; x += 2) p.set(x, bot - 1 + (x % 4 === 0 ? 0 : -1), g.dark);
      if (snow) {
        for (let x = cx - hw + 1; x < cx; x++) if (r() < 0.8) p.set(x, top + Math.round((x - (cx - hw)) * -((bot - top) / hw)) + (bot - top), '#f4f8ff');
        p.poly([[cx, top], [cx - 3, top + 4], [cx + 2, top + 4]], '#eef4ff');
      }
    }
    p.outline();
    return p;
  }
  if (kind === 'dead') {
    const p = new Pix(40, 56);
    const bark = ramp(palette === 'snow' ? '#6a6070' : '#4a3a3a');
    p.rect(18, 24, 4, 32, bark.base);
    p.rect(18, 24, 1, 32, bark.dark);
    p.line(19, 30, 9, 16, bark.base);
    p.line(20, 30, 10, 16, bark.mid);
    p.line(21, 26, 31, 12, bark.base);
    p.line(20, 22, 22, 6, bark.base);
    p.line(12, 19, 7, 18, bark.mid);
    p.line(29, 15, 34, 13, bark.mid);
    p.rect(15, 53, 10, 3, bark.dark);
    p.outline();
    return p;
  }
  if (kind === 'bush') {
    const p = new Pix(28, 18);
    const g = ramp(palette === 'snow' ? '#4a7a6a' : '#4e7a34');
    leafClumps(p, [[14, 11, 12, 7], [9, 8, 6, 5], [19, 8, 6, 5]], g, r, 18, 2, 3.5);
    if (r() < 0.6 && palette !== 'snow') for (let i = 0; i < 4; i++) p.set(4 + Math.floor(r() * 20), 6 + Math.floor(r() * 8), r() < 0.5 ? '#ff6a8a' : '#fff0a0');
    p.outline();
    return p;
  }
  // round oak
  const p = new Pix(48, 64);
  const g = ramp(palette === 'autumn' ? '#c8742c' : '#5e8a32');
  p.rect(21, 38, 6, 26, WOOD.base);
  p.rect(21, 38, 2, 26, WOOD.mid);
  p.rect(25, 38, 2, 26, WOOD.dark);
  p.poly([[18, 64], [21, 58], [27, 58], [30, 64]], WOOD.mid);
  for (let y = 42; y < 62; y += 3) p.set(23 + (y % 2), y, WOOD.dark);
  p.line(24, 44, 31, 36, WOOD.base);
  p.line(23, 46, 16, 38, WOOD.base);
  leafClumps(p, [[24, 24, 18, 14], [12, 31, 10, 8], [36, 31, 10, 8], [24, 13, 12, 9], [16, 18, 8, 7], [32, 18, 8, 7]], g, r, 46, 3, 5);
  p.outline();
  p.rim(0.1, 0.08);
  return p;
}

export function grassTuft(seed = 1, color = '#6e8a3a') {
  const r = rnd(seed);
  const p = new Pix(10, 8);
  const g = ramp(color);
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(r() * 8), h = 3 + Math.floor(r() * 5);
    const lean = r() < 0.5 ? -1 : 1;
    for (let y = 0; y < h; y++) p.set(x + (y > h * 0.6 ? lean : 0), 7 - y, y > h - 2 ? g.hi : y > h / 2 ? g.base : g.mid);
  }
  return p;
}

export function flowerSprite(seed = 1) {
  const r = rnd(seed);
  const p = new Pix(8, 8);
  const cols = ['#ff7a9a', '#fff0a0', '#9ad0ff', '#ffffff', '#c89aff'];
  const c = cols[Math.floor(r() * cols.length)];
  p.rect(3, 4, 1, 4, '#3f7a3a');
  p.set(2, 6, '#4f9a48');
  p.set(3, 2, c); p.set(2, 3, c); p.set(4, 3, c); p.set(3, 4, c);
  p.set(3, 3, '#ffd23a');
  return p;
}

// Campfire: 4 flicker frames side by side (32x32 each)
export function campfireSheet() {
  const sheet = new Pix(128, 32);
  for (let f = 0; f < 4; f++) {
    const p = new Pix(32, 32);
    const r = rnd(f * 31 + 7);
    // stones
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      p.ellipse(16 + Math.cos(a) * 10, 27 + Math.sin(a) * 3.2, 2.4, 1.8, i % 2 ? '#8a8494' : '#a29cac');
    }
    // logs
    p.line(8, 28, 23, 24, WOOD.dark);
    p.line(8, 27, 23, 23, WOOD.base);
    p.line(23, 28, 9, 24, WOOD.mid);
    p.line(23, 27, 9, 23, WOOD.base);
    // flames
    const flame = (cx, base, h, w, col) => {
      p.poly([[cx - w, base], [cx + w, base], [cx + w * 0.4 + (r() - 0.5) * 2, base - h * 0.6], [cx + (r() - 0.5) * 3, base - h], [cx - w * 0.5, base - h * 0.55]], col);
    };
    flame(16, 26, 18 + r() * 4, 7, '#ff6a1f');
    flame(14 + r() * 2, 26, 13 + r() * 3, 5, '#ff9a2a');
    flame(17, 26, 9 + r() * 3, 3.5, '#ffd24a');
    flame(16, 25, 5 + r() * 2, 2, '#fff4c0');
    for (let i = 0; i < 3; i++) p.set(10 + Math.floor(r() * 12), 4 + Math.floor(r() * 8), '#ffb43a');
    sheet.blit(p, f * 32, 0);
  }
  return sheet;
}

// Standing lantern post (lights the camp + stage)
export function lanternPost() {
  const p = new Pix(12, 40);
  p.rect(5, 10, 2, 30, '#3a3040');
  p.rect(5, 10, 1, 30, '#5a5060');
  p.rect(3, 38, 6, 2, '#3a3040');
  p.rect(2, 6, 8, 2, '#3a3040');
  p.rect(3, 2, 6, 5, '#ffd27a');
  p.rect(4, 3, 4, 3, '#fff4c8');
  p.rect(3, 1, 6, 1, '#3a3040');
  p.outline();
  return p;
}

// ------------------------------------------------------------------ textures (tileable)
export function groundTexture(kind = 'grass', size = 256, seed = 3) {
  const p = new Pix(size, size);
  const n = noise2(seed), n2 = noise2(seed + 9);
  const r = rnd(seed * 101);
  const pal = {
    grass: ['#4a5e2a', '#566a30', '#627636', '#6e823c', '#7c8e44'],
    snow: ['#b9c8e0', '#c8d6ea', '#d8e3f2', '#e6eef8', '#f4f8ff'],
    stone: ['#3a3444', '#463f52', '#524a5e', '#5e566a', '#6a6276'],
    dirt: ['#7a6444', '#88704c', '#957c54', '#a2885c', '#ae9464'],
  }[kind];
  const P = size / 16; // noise period in cells
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = n((x / size) * P, (y / size) * P, P) * 0.65 + n2((x / size) * P * 3, (y / size) * P * 3, P * 3) * 0.35;
      if (kind === 'stone') v = v * 0.6 + 0.2;
      let idx = Math.min(4, Math.floor(v * 5));
      if (Pix.dither(x, y, v * 5 - idx) && idx < 4) idx++;
      p.set(x, y, pal[idx]);
    }
  }
  if (kind === 'grass') {
    // dense little blades: dark root, mid stem, sunlit tip
    for (let i = 0; i < size * 9; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      const lit = r() < 0.45;
      p.set(x, (y + 2) % size, '#3e4e22');
      p.set(x, (y + 1) % size, lit ? '#7e9040' : '#5e7030');
      p.set(x + (r() < 0.5 ? 0 : 1), y, lit ? '#a8b45a' : '#6e8236');
    }
    for (let i = 0; i < size / 6; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      const c = ['#f4e8b0', '#ffffff', '#d8a0c8', '#b8b0e8'][Math.floor(r() * 4)];
      p.set(x, y, c);
      p.set((x + 1) % size, y, shade(c, 0.85));
    }
    for (let i = 0; i < size / 10; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      p.set(x, y, '#8a8494');
      p.set((x + 1) % size, y, '#a29cac');
    }
  } else if (kind === 'snow') {
    for (let i = 0; i < size * 2; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      p.set(x, y, r() < 0.5 ? '#ffffff' : '#a8b8d4');
    }
  } else if (kind === 'stone') {
    // flagstones with mortar lines
    const T = size / 8;
    for (let ty = 0; ty < 8; ty++) {
      const off = (ty % 2) * (T / 2);
      for (let x = 0; x < size; x++) p.set(x, ty * T, '#24202e');
      for (let tx = 0; tx < 8; tx++) {
        const xx = (tx * T + off) % size;
        for (let y = ty * T; y < (ty + 1) * T; y++) p.set(xx, y, '#24202e');
        for (let y = ty * T + 1; y < (ty + 1) * T; y++) p.set((xx + 1) % size, y, '#6e667a');
      }
    }
    for (let i = 0; i < size / 2; i++) p.set(Math.floor(r() * size), Math.floor(r() * size), r() < 0.5 ? '#2c2836' : '#4a6a3a');
  } else if (kind === 'dirt') {
    for (let i = 0; i < size; i++) p.set(Math.floor(r() * size), Math.floor(r() * size), r() < 0.5 ? '#5a3e2a' : '#b89060');
  }
  return p;
}

export function stoneBrickTexture(size = 64, tint = '#8a8494', seed = 5) {
  const p = new Pix(size, size);
  const r = rnd(seed);
  const base = ramp(tint);
  p.rect(0, 0, size, size, '#3a3444');
  const bh = 8, bw = 16;
  for (let row = 0; row < size / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < size / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const c = [base.base, base.mid, base.hi][Math.floor(r() * 3)];
      for (let yy = 1; yy < bh; yy++) for (let xx = 1; xx < bw; xx++) {
        const px = x + xx;
        if (px < 0 || px >= size) continue;
        p.set(px, y + yy, yy === 1 ? base.hi : yy === bh - 1 ? base.dark : c);
      }
      if (r() < 0.35) for (let k = 0; k < 4; k++) p.set(x + 2 + Math.floor(r() * 12), y + bh - 2 - Math.floor(r() * 2), '#4f8a42');
    }
  }
  return p;
}

export function woodTexture(size = 32, tint = '#8a5a32') {
  const p = new Pix(size, size);
  const w = ramp(tint);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.sin(x * 0.9 + Math.sin(y * 0.3) * 2) * 0.5 + 0.5;
    p.set(x, y, v > 0.75 ? w.dark : v > 0.4 ? w.mid : w.base);
  }
  for (let x = 0; x < size; x += 8) for (let y = 0; y < size; y++) p.set(x, y, w.dark);
  return p;
}

export function clothTexture(size = 32, a = '#c94a3a', b = '#e8d8b0') {
  const p = new Pix(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const stripe = Math.floor(x / 8) % 2;
    let c = stripe ? a : b;
    if (y % 4 === 0) c = shade(c, 0.9);
    p.set(x, y, c);
  }
  return p;
}

// soft round glow (for lights, auras, pickups)
export function glowCanvas(size = 64, color = '#ffd27a') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(0.35, color + '88');
  grd.addColorStop(1, color + '00');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export function blobShadowCanvas(size = 32) {
  const p = new Pix(size, size / 2);
  const cx = size / 2, cy = size / 4;
  for (let y = 0; y < size / 2; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot((x + 0.5 - cx) / (size / 2), (y + 0.5 - cy) / (size / 4));
    if (d < 1) p.set(x, y, [20, 12, 30, Math.round((d < 0.7 ? 0.5 : 0.5 * (1 - (d - 0.7) / 0.3)) * 255)]);
  }
  return p.toCanvas();
}

// ------------------------------------------------------------------ HD-2D set dressing textures
// Irregular cobblestones (tileable Voronoi cells with mortar + top-left lit bevels)
export function cobbleTexture(size = 128, tint = '#9a8a74', seed = 4, cells = 22) {
  const r = rnd(seed);
  const n = cells; // cells per side (22 -> stones ~6px, about a third of a unit)
  const pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + 0.15 + r() * 0.7) * (size / n), (j + 0.15 + r() * 0.7) * (size / n), r()]);
  const base = ramp(tint);
  const tones = [mix(base.hi, tint, 0.4), base.base, base.base, mix(base.mid, tint, 0.35), shade(tint, 0.94), mix(tint, '#7a8a5a', 0.18)];
  const p = new Pix(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0;
      for (const q of pts) {
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const qx = q[0] + ox * size, qy = q[1] + oy * size;
          const d = (x - qx) ** 2 + (y - qy) ** 2;
          if (d < d1) { d2 = d1; d1 = d; best = q; bx = qx; by = qy; } else if (d < d2) d2 = d;
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (edge < 1.0) { p.set(x, y, mix(tint, '#2e261e', 0.62)); continue; }
      let c = tones[Math.floor(best[2] * tones.length)];
      const lx = x - bx, ly = y - by;
      if (edge < 2.0 && lx + ly < 0) c = shade(c, 1.14);
      else if (edge < 2.0 && lx + ly > 0) c = shade(c, 0.8);
      if (Pix.dither(x, y, 0.08) && r() < 0.5) c = shade(c, 0.9);
      p.set(x, y, c);
    }
  }
  // moss in the cracks
  for (let i = 0; i < size; i++) {
    const x = Math.floor(r() * size), y = Math.floor(r() * size);
    const c = p.get(x, y);
    if (c && c[0] < 70) p.set(x, y, '#4a6a32');
  }
  return p;
}

export function staveTexture(size = 32) {
  const p = new Pix(size, size);
  const w = ramp('#8a5a32');
  for (let x = 0; x < size; x++) {
    const plank = Math.floor(x / 5);
    const c = plank % 2 ? w.base : w.mid;
    for (let y = 0; y < size; y++) p.set(x, y, x % 5 === 0 ? w.dark : c);
  }
  for (const y0 of [4, size - 7]) for (let y = y0; y < y0 + 3; y++) for (let x = 0; x < size; x++) p.set(x, y, y === y0 ? '#9a9aa8' : '#5a5a68');
  return p;
}

export function crateTexture(size = 32) {
  const p = new Pix(size, size);
  const w = ramp('#a8743a');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) p.set(x, y, Math.floor(y / 6) % 2 ? w.base : w.mid);
  p.rect(0, 0, size, 3, w.dark);
  p.rect(0, size - 3, size, 3, w.dark);
  p.rect(0, 0, 3, size, w.dark);
  p.rect(size - 3, 0, 3, size, w.dark);
  p.line(2, 2, size - 3, size - 3, w.dark);
  p.line(3, 2, size - 2, size - 3, w.hi);
  return p;
}

export function terracottaTexture(size = 32) {
  const p = new Pix(size, size);
  const t = ramp('#b8643a');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) p.set(x, y, y < 4 ? t.hi : y > size - 6 ? t.mid : Pix.dither(x, y, 0.2) ? t.mid : t.base);
  for (let x = 0; x < size; x++) p.set(x, 10, t.dark);
  return p;
}

// produce / sacks / baskets as small billboard props
export function basketSprite(seed = 1) {
  const r = rnd(seed);
  const p = new Pix(18, 14);
  const fruit = ['#d83a3a', '#e8a83a', '#7ad84a', '#8a4ad8'][Math.floor(r() * 4)];
  p.ellipse(9, 6, 7, 3, fruit);
  for (let i = 0; i < 6; i++) p.ellipse(4 + r() * 10, 4 + r() * 3, 1.5, 1.5, shade(fruit, 1.25));
  p.poly([[1, 6], [17, 6], [15, 13], [3, 13]], '#b8864a');
  for (let x = 2; x < 16; x += 2) p.line(x, 7, x + 1, 12, '#8a5a2a');
  p.rect(1, 6, 16, 1, '#d8a868');
  p.outline();
  return p;
}

export function sackSprite() {
  const p = new Pix(14, 16);
  p.ellipse(7, 10, 6, 5.5, '#c8b088');
  p.rect(5, 2, 4, 4, '#c8b088');
  p.rect(4, 5, 6, 1, '#7a5a3a');
  p.ellipse(5, 9, 2, 3, '#e0cca8');
  p.outline();
  return p;
}

// vertical light beam texture (god rays)
export function beamCanvas(w = 64, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = y / (h - 1);
    const side = Math.pow(Math.sin(u * Math.PI), 2.2);
    const len = Math.pow(Math.sin(Math.min(1, v * 1.15) * Math.PI), 1.2) * (1 - v * 0.5);
    const a = side * len;
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 228; img.data[i + 2] = 170; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

// cooking pot hanging from a tripod over the fire
export function tripodSprite() {
  const p = new Pix(28, 30);
  const w = ramp('#7a5030');
  p.line(4, 29, 13, 2, w.mid);
  p.line(24, 29, 15, 2, w.base);
  p.line(14, 29, 14, 3, w.dark);
  p.rect(12, 1, 5, 2, w.dark);
  p.line(14, 3, 14, 11, '#3a3440');
  p.ellipse(14, 15, 5, 4, '#3a3a44');
  p.rect(9, 12, 11, 2, '#5a5a66');
  p.set(11, 14, '#7a7a88');
  p.outline();
  return p;
}

export function stumpLantern() {
  const p = new Pix(16, 22);
  const w = ramp('#8a6a44');
  p.ellipse(8, 17, 6, 2.5, w.base);
  p.rect(2, 17, 13, 5, w.mid);
  p.rect(2, 17, 3, 5, w.dark);
  p.ellipse(8, 17, 5, 2, '#c8a878');
  p.rect(5, 6, 6, 9, '#4a4a58');
  p.rect(6, 7, 4, 7, '#ffe6a0');
  p.rect(7, 8, 2, 5, '#fffbe0');
  p.rect(6, 3, 4, 3, '#4a4a58');
  p.rect(7, 1, 2, 2, '#4a4a58');
  p.outline();
  return p;
}

// soft leaf-cluster silhouettes (alpha only) used as invisible shadow casters -> dappled sunlight
export function canopyCanvas(size = 128, seed = 3) {
  const r = rnd(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * size * 0.42;
    g.beginPath();
    g.arc(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, 4 + r() * 10, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

// hexagonal bokeh highlight
export function bokehCanvas(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g.lineTo(Math.cos(a) * size * 0.44, Math.sin(a) * size * 0.44);
  }
  g.closePath();
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.44);
  grd.addColorStop(0, 'rgba(255,248,225,0.55)');
  grd.addColorStop(0.8, 'rgba(255,240,210,0.75)');
  grd.addColorStop(1, 'rgba(255,240,210,0.95)');
  g.fillStyle = grd;
  g.fill();
  return c;
}

export function waterTexture(size = 64, seed = 2) {
  const r = rnd(seed);
  const p = new Pix(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) p.set(x, y, Pix.dither(x, y, 0.3) ? '#2a6a6a' : '#2f7472');
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * size), y = Math.floor(r() * size), l = 2 + Math.floor(r() * 5);
    for (let k = 0; k < l; k++) p.set((x + k) % size, y, k === 0 || k === l - 1 ? '#5aa8a0' : '#8ad0c0');
  }
  return p;
}

// ------------------------------------------------------------------ open-field props (Octopath meadows)
// Tall layered pine with sunlit tips
export function pineSprite(seed = 1, snow = false) {
  const r = rnd(seed * 31 + 5);
  const p = new Pix(44, 84);
  const g = ramp(snow ? '#3f6b5a' : '#36602e');
  p.rect(20, 66, 4, 18, WOOD.mid);
  p.rect(20, 66, 1, 18, WOOD.dark);
  p.rect(23, 66, 1, 18, WOOD.dark);
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const cy = 8 + t * 62;
    const hw = 4 + t * 16 + (r() - 0.5) * 2;
    const h = 11 + t * 4;
    // drooping bough: dark base, lit top-left, needle tips
    p.poly([[22, cy - h * 0.55], [22 + hw, cy + h * 0.45], [22 + hw * 0.35, cy + h * 0.32], [22, cy + h * 0.5], [22 - hw * 0.35, cy + h * 0.32], [22 - hw, cy + h * 0.45]], g.dark);
    p.poly([[22, cy - h * 0.55], [22 + hw * 0.85, cy + h * 0.32], [22, cy + h * 0.25], [22 - hw * 0.9, cy + h * 0.32]], g.mid);
    p.poly([[22, cy - h * 0.55], [22 - hw * 0.15, cy + h * 0.05], [22 - hw * 0.8, cy + h * 0.28]], g.base);
    for (let k = 0; k < hw * 1.6; k++) {
      const x = 22 - hw + r() * hw * 2, y = cy + h * 0.38 - Math.abs(x - 22) * -0.02 + (r() - 0.5) * 2;
      p.set(x, y, r() < 0.5 ? g.dark : g.mid);
    }
    for (let k = 0; k < hw * 0.9; k++) {
      const x = 22 - hw * 0.8 + r() * hw * 0.9, y = cy - h * 0.2 + r() * h * 0.45;
      p.set(x, y, snow && r() < 0.6 ? '#eef4ff' : mix(g.hi, '#e8e070', 0.25));
    }
    if (snow) p.poly([[22, cy - h * 0.55], [22 - hw * 0.6, cy + h * 0.2], [22 - hw * 0.2, cy + h * 0.1]], '#e6eef8');
  }
  p.outline('#10140e', 0.25);
  return p;
}

export function gravestoneSprite(seed = 1) {
  const r = rnd(seed * 7 + 3);
  const p = new Pix(16, 22);
  const s = ramp('#8e9088');
  const round = r() < 0.6;
  p.rect(3, 6, 10, 15, s.base);
  if (round) p.ellipse(8, 6, 5, 4, s.base); else { p.rect(2, 4, 12, 3, s.base); p.rect(6, 1, 4, 4, s.base); }
  p.rect(3, 6, 2, 15, s.hi);
  p.rect(11, 6, 2, 15, s.mid);
  for (let y = 9; y < 15; y += 2) p.rect(5, y, 6, 1, s.dark);
  for (let i = 0; i < 9; i++) p.set(3 + Math.floor(r() * 10), 15 + Math.floor(r() * 6), r() < 0.5 ? '#5a7a3a' : '#7a9a44');
  p.rect(1, 20, 14, 2, '#4a5a2e');
  p.outline();
  return p;
}

export function tallGrassSprite(seed = 1) {
  const r = rnd(seed * 13 + 1);
  const p = new Pix(16, 14);
  const g = ramp('#7a8a3a');
  for (let i = 0; i < 9; i++) {
    const x = 1 + r() * 14, h = 6 + r() * 7;
    const lean = (r() - 0.5) * 3;
    for (let y = 0; y < h; y++) {
      const t = y / h;
      p.set(x + lean * t * t, 13 - y, t > 0.75 ? mix(g.hi, '#e8dc80', 0.3) : t > 0.4 ? g.base : g.mid);
    }
  }
  return p;
}

export function rockTexture(size = 32, seed = 2) {
  const r = rnd(seed);
  const p = new Pix(size, size);
  const st = ramp('#8a867a');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = r();
    p.set(x, y, v < 0.15 ? st.mid : v < 0.85 ? st.base : st.hi);
  }
  for (let i = 0; i < size * 3; i++) {
    const x = Math.floor(r() * size), y = Math.floor(r() * size * 0.55);
    p.set(x, y, r() < 0.5 ? '#5e7a36' : '#7e9440');
  }
  for (let i = 0; i < 6; i++) p.line(Math.floor(r() * size), Math.floor(r() * size), Math.floor(r() * size), Math.floor(r() * size), st.dark);
  return p;
}

// sandy path with flat stepping stones, ragged dithered edges (decal)
export function pathTexture(w = 64, h = 160, seed = 3) {
  const r = rnd(seed);
  const n = noise2(seed);
  const p = new Pix(w, h);
  const dirt = ['#8a7450', '#957e58', '#a08a62', '#7c6848'];
  for (let y = 0; y < h; y++) {
    const wob = (n(0.5, y / 18, 32) - 0.5) * 14;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - w / 2 - wob) / (w * 0.38);
      if (d > 1.05 || (d > 0.75 && !Pix.dither(x, y, (1.05 - d) / 0.3))) continue;
      p.set(x, y, dirt[Math.floor(n(x / 6, y / 6, 64) * 3.99)]);
    }
  }
  for (let i = 0; i < h / 7; i++) {
    const cy = 4 + i * 7 + (r() - 0.5) * 3;
    const cx = w / 2 + (n(0.5, cy / 18, 32) - 0.5) * 14 + (r() - 0.5) * 12;
    const rx = 3 + r() * 3, ry = 2 + r() * 1.5;
    p.ellipse(cx, cy, rx, ry, '#6e6a60');
    p.ellipse(cx - 0.4, cy - 0.4, rx - 0.8, ry - 0.7, '#9a968a');
    p.ellipse(cx - 1, cy - 0.8, rx * 0.4, ry * 0.4, '#b4b0a2');
  }
  return p;
}

// soft cloud of mist (alpha) for drifting fog banks
export function mistCanvas(size = 128, seed = 1) {
  const r = rnd(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = size * (0.2 + r() * 0.6), y = size * (0.3 + r() * 0.4), rad = size * (0.12 + r() * 0.2);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return c;
}
