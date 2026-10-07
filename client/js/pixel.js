// Tiny pixel-art painter: draw with primitives into an RGBA buffer, then add selective
// outlines + rim shading so every procedural sprite shares the same hand-pixeled look.

const cache = new Map();
export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  let c = cache.get(hex);
  if (c) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  cache.set(hex, c);
  return c;
}

export function shade(hex, f) {
  const [r, g, b] = rgb(hex);
  const k = (v) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return '#' + [k(r), k(g), k(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}

// hue-shifted ramp (shadows lean cool/purple, highlights lean warm) like real pixel art palettes
export function ramp(hex) {
  return {
    hi: mix(shade(hex, 1.28), '#fff4d6', 0.18),
    base: hex,
    mid: mix(shade(hex, 0.8), '#3a2a5a', 0.12),
    dark: mix(shade(hex, 0.58), '#2a1a46', 0.25),
  };
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    this.ox = 0; // drawing offset (lets templates be shifted inside a bigger frame)
    this.oy = 0;
  }

  set(x, y, col) {
    x = (x + this.ox) | 0;
    y = (y + this.oy) | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !col) return;
    const c = rgb(col);
    const i = (y * this.w + x) * 4;
    if (c[3] === 255) {
      this.d[i] = c[0];
      this.d[i + 1] = c[1];
      this.d[i + 2] = c[2];
      this.d[i + 3] = 255;
    } else if (c[3] > 0) {
      const a = c[3] / 255;
      const da = this.d[i + 3] / 255;
      const oa = a + da * (1 - a);
      for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * a + this.d[i + k] * da * (1 - a)) / Math.max(1e-6, oa);
      this.d[i + 3] = oa * 255;
    }
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return this.d[i + 3] ? [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]] : null;
  }

  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }

  clear(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[(y * this.w + x) * 4 + 3] = 0;
  }

  rect(x, y, w, h, col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col);
  }

  // filled ellipse centered on (cx, cy) with radii (rx, ry); pixel-center sampling gives clean shapes
  ellipse(cx, cy, rx, ry, col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, col);
      }
    }
  }

  line(x0, y0, x1, y1, col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // filled polygon [[x,y],...]
  poly(pts, col) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      const yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, col);
      }
    }
  }

  // Selective outline: transparent pixels touching the sprite get a dark, hue-shifted version
  // of the neighbouring color (looks far better than flat black)
  outline(dark = '#1a1226', strength = 0.32) {
    const ox = this.ox, oy = this.oy;
    this.ox = this.oy = 0;
    const out = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 40) continue;
        let n = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = this.get(x + dx, y + dy);
          if (c && c[3] > 140) { n = c; break; }
        }
        if (n) out.push([x, y, n]);
      }
    }
    const D = rgb(dark);
    for (const [x, y, n] of out) {
      this.set(x, y, [
        Math.round(n[0] * strength + D[0] * (1 - strength)),
        Math.round(n[1] * strength + D[1] * (1 - strength)),
        Math.round(n[2] * strength + D[2] * (1 - strength)),
        255,
      ]);
    }
    this.ox = ox;
    this.oy = oy;
  }

  // Rim light from the upper-left, soft shadow on the lower-right edge
  rim(hi = 0.16, lo = 0.14) {
    const src = new Uint8ClampedArray(this.d);
    const A = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (src[i + 3] < 200) continue;
        const lit = A(x - 1, y) < 100 || A(x, y - 1) < 100;
        const dim = A(x + 1, y) < 100 || A(x, y + 1) < 100;
        if (lit && !dim) for (let k = 0; k < 3; k++) this.d[i + k] = src[i + k] + (255 - src[i + k]) * hi;
        else if (dim && !lit) for (let k = 0; k < 3; k++) this.d[i + k] = src[i + k] * (1 - lo);
      }
    }
  }

  // ordered (Bayer) dither helper: true where a pixel should take the second color
  static dither(x, y, t) {
    const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    return t * 16 > m[(y & 3) * 4 + (x & 3)] + 0.5;
  }

  flipX() {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const s = (y * this.w + x) * 4, t = (y * this.w + (this.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) p.d[t + k] = this.d[s + k];
    }
    return p;
  }

  // draw another Pix into this one at (ox, oy)
  blit(src, ox, oy) {
    ox -= this.ox;
    oy -= this.oy;
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.d[i + 3]) this.set(ox + x, oy + y, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
    }
  }

  toCanvas(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w * scale;
    c.height = this.h * scale;
    const g = c.getContext('2d');
    const img = new ImageData(new Uint8ClampedArray(this.d), this.w, this.h);
    if (scale === 1) g.putImageData(img, 0, 0);
    else {
      const t = document.createElement('canvas');
      t.width = this.w;
      t.height = this.h;
      t.getContext('2d').putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(t, 0, 0, c.width, c.height);
    }
    return c;
  }
}

// value noise for textures
export function noise2(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const v = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;
  const sm = (t) => t * t * (3 - 2 * t);
  // tileable over `period` cells
  return (x, y, period = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const p = (a) => ((a % period) + period) % period;
    const a = v(p(xi), p(yi)), b = v(p(xi + 1), p(yi)), c = v(p(xi), p(yi + 1)), d = v(p(xi + 1), p(yi + 1));
    const u = sm(xf), w = sm(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}
