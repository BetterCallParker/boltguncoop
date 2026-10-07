// Octopath-style traveler sprites, painted procedurally.
// Each body part is a small shaded volume (ellipsoid / tapered cylinder / plate) lit from the
// upper-left, quantised to a 4-tone hue-shifted ramp, then inked with interior contour lines and
// a coloured silhouette outline. Three views (front, side, back) with idle + 4-frame walk cycles.
import { Pix, ramp, shade, mix } from './pixel.js';
import { CHARACTERS } from '/shared/characters.js';

export const FW = 32;
export const FH = 40;
export const VIEW_BASE = { front: 0, side: 6, back: 12 };
export const TF = { hurt: 18, cheer: 19, down: 20 };
export const NFRAMES = 21;

const LX = -0.52, LY = -0.66, LZ = 0.54; // light direction (upper-left, toward viewer)
const EYE = '#231a2e';
const METAL = ramp('#b8c2d6');
const WOOD = ramp('#8a5a32');
const BOOT = ramp('#5a3e2a');
const LEATHER = ramp('#6a4a30');

function skinRamp(hex) {
  return { hi: mix(shade(hex, 1.12), '#fff2e0', 0.25), base: hex, mid: mix(shade(hex, 0.86), '#c0504a', 0.16), dark: mix(shade(hex, 0.66), '#7a2a3a', 0.25) };
}

class Doll {
  constructor() {
    this.p = new Pix(FW, FH);
    this.ids = new Int16Array(FW * FH).fill(-1);
    this.parts = [];
  }

  part(r, o = {}) {
    this.parts.push({ r, contour: o.contour ?? true, soft: !!o.soft });
    return this.parts.length - 1;
  }

  tone(r, s) {
    return s > 0.62 ? r.hi : s > 0.16 ? r.base : s > -0.3 ? r.mid : r.dark;
  }

  put(x, y, col, id) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= FW || y >= FH) return;
    this.p.set(x, y, col);
    if (id !== undefined) this.ids[y * FW + x] = id;
  }

  // shaded ellipsoid
  ell(cx, cy, rx, ry, r, o = {}) {
    const id = this.part(r, o);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        if (o.clip && !o.clip(x, y)) continue;
        const nz = Math.sqrt(1 - d2);
        const s = dx * LX + dy * LY + nz * LZ + (o.bias || 0);
        this.put(x, y, o.flat || this.tone(r, s), id);
      }
    }
    return id;
  }

  // tapered vertical-ish cylinder from (x0,y0,hw0) to (x1,y1,hw1)
  cyl(x0, y0, hw0, x1, y1, hw1, r, o = {}) {
    const id = this.part(r, o);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    for (let y = Math.floor(ya); y <= Math.ceil(yb); y++) {
      const t = yb === ya ? 0 : (y + 0.5 - y0) / (y1 - y0);
      if (t < -0.05 || t > 1.05) continue;
      const tc = Math.min(1, Math.max(0, t));
      const c = x0 + (x1 - x0) * tc, hw = hw0 + (hw1 - hw0) * tc;
      for (let x = Math.floor(c - hw); x <= Math.ceil(c + hw); x++) {
        const nx = (x + 0.5 - c) / hw;
        if (Math.abs(nx) > 1) continue;
        if (o.clip && !o.clip(x, y)) continue;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
        const s = nx * LX + (o.ny || 0) * LY + nz * LZ + (o.bias || 0) + (o.vgrad || 0) * (0.5 - tc);
        this.put(x, y, this.tone(r, s), id);
      }
    }
    return id;
  }

  // flat polygon plate with a top-light gradient
  poly(pts, r, o = {}) {
    const id = this.part(r, o);
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const [x, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      const yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) {
          const u = (x + 0.5 - minX) / Math.max(1, maxX - minX) * 2 - 1;
          const v = (y + 0.5 - minY) / Math.max(1, maxY - minY);
          const s = (o.base ?? 0.35) + u * LX * (o.curve ?? 0.9) - v * (o.vgrad ?? 0.35) + (o.bias || 0);
          this.put(x, y, this.tone(r, s), id);
        }
      }
    }
    return id;
  }

  box(x, y, w, h, r, o = {}) {
    return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], r, o);
  }

  dot(x, y, col) {
    this.put(x, y, col);
  }

  // interior ink: the front part gets a dark line where it overlaps a part behind it
  finish(outline = true) {
    const src = new Int16Array(this.ids);
    const at = (x, y) => (x < 0 || y < 0 || x >= FW || y >= FH ? -1 : src[y * FW + x]);
    const marks = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const a = src[y * FW + x];
      if (a < 0) continue;
      const pa = this.parts[a];
      if (!pa.contour) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const b = at(x + dx, y + dy);
        if (b >= 0 && b < a && this.parts[b].contour) {
          marks.push([x, y, pa.soft ? pa.r.mid : pa.r.dark]);
          break;
        }
      }
    }
    for (const [x, y, c] of marks) this.p.set(x, y, c);
    if (outline) this.p.outline('#140c1a', 0.2);
    return this.p;
  }
}

// ------------------------------------------------------------------ poses
function poseFor(view, name) {
  const P = { view, bob: 0, footL: 0, footR: 0, stride: 0, swing: 0, lean: 0, shut: false, cheer: false, hurt: false };
  switch (name) {
    case 'idle1': P.bob = 1; break;
    case 'walk0': P.footL = 1; P.footR = -1; P.stride = 2.5; P.swing = 1; break;
    case 'walk1': P.bob = -1; break;
    case 'walk2': P.footL = -1; P.footR = 1; P.stride = -2.5; P.swing = -1; break;
    case 'walk3': P.bob = -1; break;
    case 'hurt': P.hurt = true; P.shut = true; P.lean = -1; P.bob = 1; break;
    case 'cheer': P.cheer = true; P.bob = -1; P.footL = 0; break;
  }
  return P;
}

// ------------------------------------------------------------------ the painter
function paint(look, P) {
  const D = new Doll();
  const cx = 16;
  const skin = skinRamp(look.skin);
  const hair = ramp(look.hair);
  const main = ramp(look.main);
  const dark = ramp(look.dark);
  const acc = ramp(look.accent);
  const cape = look.cape ? ramp(look.cape) : null;
  const wide = look.build === 'broad' ? 1 : look.build === 'round' ? 1 : 0;
  const robe = look.outfit === 'robe';
  const coat = look.outfit === 'coat';
  const pants = look.outfit === 'dancer' ? main : look.outfit === 'armor' ? dark : ramp(shade(look.dark, 0.9));
  const by = P.bob; // upper-body bob
  const hx = P.lean; // head lean
  const view = P.view;
  const front = view === 'front', back = view === 'back', side = view === 'side';
  const torsoTop = 18 + by, torsoBot = 27 + by;
  const shW = 5.2 + wide, waW = 4.3 + wide;

  // ---------------------------------------------------------------- back layers
  // cape behind (front/side), long back hair, veil
  if (cape && !back) {
    if (side) D.poly([[13, torsoTop], [17, torsoTop], [14.5 - P.stride * 0.3, 35], [8.5 - P.stride * 0.6, 35.5]], cape, { base: 0.1 });
    else D.poly([[cx - shW - 0.5, torsoTop + 0.5], [cx + shW + 0.5, torsoTop + 0.5], [cx + shW + 2.4, 35], [cx - shW - 2.4, 35]], cape, { base: -0.05, curve: 0.6 });
  }
  if (look.head === 'veil' && !back) D.poly([[cx - 6, 8 + by], [cx + 6, 8 + by], [cx + 7.5, 25], [cx - 7.5, 25]], ramp(mix(look.cape || '#f2c84a', '#ffffff', 0.4)), { base: 0.3 });
  if (look.hairStyle === 'long' && !back) D.box(cx - 6.5 + (side ? -1 : 0), 13 + by, side ? 6 : 13, 11, hair, { base: -0.1 });
  if (look.hairStyle === 'ponytail' && side) D.cyl(11, 10 + by, 1.6, 9 - P.stride * 0.2, 21 + by, 1.2, hair, { bias: -0.1 });

  // ---------------------------------------------------------------- legs + boots
  const legs = () => {
    if (side) {
      const legBack = () => {
        const x = 16 - P.stride * 0.5;
        if (!robe) D.cyl(16, 27.5 + by, 1.7, x, 34.5, 1.5, pants, { bias: -0.35 });
        D.ell(x + 1, 36.3, 2.6, 1.7, BOOT, { bias: -0.3 });
      };
      const legFront = () => {
        const x = 16 + P.stride * 0.5;
        if (!robe) D.cyl(16.3, 27.5 + by, 1.8, x, 34.5, 1.6, pants);
        D.ell(x + 1.1, 36.3, 2.7, 1.8, BOOT);
      };
      legBack();
      legFront();
      return;
    }
    for (const [sx, foot] of [[-1, P.footL], [1, P.footR]]) {
      const x = cx + sx * 2.3;
      const len = 34.5 + foot * 0.6;
      if (!robe) D.cyl(x, 27 + by, 1.8, x + sx * 0.2, len, 1.5, pants, { bias: sx > 0 ? -0.08 : 0 });
      D.ell(x + sx * 0.3, 36.2 + foot * 0.7, 2.3, 1.8 + (foot > 0 ? 0.2 : 0), BOOT);
    }
  };

  // ---------------------------------------------------------------- arms
  const armL = () => armAt(-1);
  const armR = () => armAt(1);
  const sleeve = look.outfit === 'armor' ? METAL : look.outfit === 'dancer' ? skin : look.outfit === 'apron' ? ramp(shade(look.main, 1.1)) : main;
  function armAt(sx) {
    if (P.cheer) {
      const x = cx + sx * (shW + 0.5);
      D.cyl(x, torsoTop + 1, 1.6, x + sx * 1.2, 8 + by, 1.4, sleeve);
      D.ell(x + sx * 1.3, 6.5 + by, 1.6, 1.6, skin, { soft: true });
      return;
    }
    if (side) {
      const front = sx > 0;
      const sw = (front ? -1 : 1) * P.stride * 0.55;
      const x0 = front ? 16.6 : 15.2;
      D.cyl(x0, torsoTop + 0.8, 1.6, x0 + sw, 26 + by, 1.4, sleeve, { bias: front ? 0 : -0.4 });
      D.ell(x0 + sw + 0.2, 27 + by, 1.5, 1.5, skin, { soft: true, bias: front ? 0 : -0.3 });
      return;
    }
    const sw = P.swing * sx * (front || back ? 1 : 0);
    const x = cx + sx * (shW + 1.1);
    const hurt = P.hurt ? sx * 1.5 : 0;
    D.cyl(x, torsoTop + 0.8, 1.7, x + sx * 0.4 + hurt, 25.6 + by - sw * 0.6, 1.4, sleeve, { bias: sx > 0 ? -0.12 : 0.05 });
    D.ell(x + sx * 0.5 + hurt, 26.8 + by - sw * 0.6, 1.6, 1.5, skin, { soft: true });
    if (look.outfit === 'dancer') D.dot(x + sx * 0.5, 24 + by, acc.hi);
  }

  // ---------------------------------------------------------------- torso + outfit
  const torso = () => {
    const tw0 = side ? 3.9 : shW, tw1 = side ? 3.3 : waW;
    const tx = side ? 16 : cx;
    const tr = look.outfit === 'armor' && !back ? METAL : main;
    D.cyl(tx, torsoTop, tw0, tx, torsoBot, tw1, tr, { vgrad: 0.25 });
    if (robe) D.cyl(tx, 24 + by, side ? 4 : waW + 0.4, tx + (side ? -0.5 : 0), 37, side ? 5.6 : 7.4, main, { vgrad: 0.35, bias: -0.05 });
    if (coat) D.poly(side ? [[13, 25 + by], [19, 25 + by], [18.5, 35], [11 - P.stride * 0.3, 35]] : [[cx - waW - 0.5, 25 + by], [cx + waW + 0.5, 25 + by], [cx + waW + 2, 35], [cx - waW - 2, 35]], main, { base: 0.15 });
    if (back) {
      if (cape) D.poly([[cx - shW - 0.6, torsoTop], [cx + shW + 0.6, torsoTop], [cx + shW + 2.2, 35], [cx - shW - 2.2, 35]], cape, { base: 0.25, curve: 0.8 });
      return;
    }
    switch (look.outfit) {
      case 'armor':
        if (!side) {
          D.box(cx - 1.6, torsoTop + 2, 3.2, 11, main, { base: 0.4 });
          D.box(cx - 1.6, torsoTop + 2, 3.2, 1, acc, { base: 0.6 });
          D.ell(cx - shW + 0.2, torsoTop + 1, 2.6, 2.1, METAL, { bias: 0.1 });
          D.ell(cx + shW - 0.2, torsoTop + 1, 2.6, 2.1, METAL);
        } else D.ell(16.5, torsoTop + 1, 2.8, 2.1, METAL);
        D.box(side ? 12.3 : cx - waW - 0.5, torsoBot - 1.2, side ? 7.4 : (waW + 0.5) * 2, 1.3, LEATHER, { base: 0.2 });
        D.dot(side ? 18 : cx, torsoBot - 1, acc.hi);
        break;
      case 'leather':
        if (!side) {
          for (let k = 0; k < 10; k++) D.dot(cx - 4 + k * 0.8, torsoTop + 1 + k, LEATHER.mid);
          D.ell(cx, torsoTop + 0.3, 3, 1.3, ramp(look.cape || look.accent), { contour: false });
        }
        D.box(side ? 12.4 : cx - waW, torsoBot - 1.3, side ? 7.2 : waW * 2, 1.2, LEATHER, { base: 0.25 });
        D.dot(side ? 18.5 : cx, torsoBot - 1, acc.hi);
        break;
      case 'robe':
        if (!side) {
          D.box(cx - 0.5, torsoTop + 1, 1, 18, acc, { base: 0.5, contour: false });
          D.box(cx - waW - 0.4, 24 + by, (waW + 0.4) * 2, 1.2, acc, { base: 0.4 });
        }
        D.box(side ? 10.6 : cx - 7.4, 35.6, side ? 11 : 14.8, 1.2, acc, { base: 0.4, contour: false });
        D.ell(side ? 17 : cx, torsoTop + 0.5, 3.2, 1.4, acc, { contour: false });
        break;
      case 'jacket':
        if (!side) D.box(cx - 0.4, torsoTop + 2, 0.8, 8, dark, { base: -0.5, contour: false });
        D.ell(side ? 16.6 : cx, torsoTop + 0.6, side ? 3.2 : 4, 1.8, acc);
        D.poly(side ? [[13, torsoTop + 1], [15, torsoTop + 1], [13 - P.stride * 0.3, torsoTop + 7], [11.6 - P.stride * 0.4, torsoTop + 6]] : [[cx - 3.5, torsoTop + 1], [cx - 1.5, torsoTop + 1], [cx - 2, torsoTop + 7], [cx - 3.8, torsoTop + 6.5]], acc, { base: 0.1 });
        D.box(side ? 12.4 : cx - waW, torsoBot - 1.3, side ? 7.2 : waW * 2, 1.2, ramp('#2a2232'), { base: 0.1 });
        break;
      case 'apron':
        D.poly(side ? [[16, torsoTop + 3], [19.6, torsoTop + 3], [20, 33], [16.4, 33]] : [[cx - 3.6, torsoTop + 3], [cx + 3.6, torsoTop + 3], [cx + 4.6, 33], [cx - 4.6, 33]], ramp('#e2d6b8'), { base: 0.4 });
        if (!side) {
          D.box(cx - 3, 27 + by, 2.6, 2, ramp('#cbbd98'), { base: 0.2 });
          D.dot(cx - 2, 27 + by, acc.base);
          D.dot(cx + 3, 25 + by, acc.hi);
        }
        break;
      case 'dancer':
        D.box(side ? 12.3 : cx - waW, torsoTop + 4.4 + by * 0, side ? 7.4 : waW * 2, 2.2, skin, { base: 0.35, soft: true });
        D.box(side ? 12.3 : cx - waW - 0.4, torsoTop + 6.4, side ? 7.4 : (waW + 0.4) * 2, 1.3, acc, { base: 0.5 });
        if (!side) for (const sx of [-1, 1]) D.ell(cx + sx * 2.6, 30.5, 2.7, 4.2, main, { bias: sx > 0 ? -0.1 : 0 });
        else D.ell(16.5 + P.stride * 0.2, 30.5, 3.2, 4.2, main);
        D.dot(cx - 1, torsoTop + 1, acc.hi);
        break;
      case 'coat':
        if (!side) {
          D.box(cx - 1.4, torsoTop + 0.5, 2.8, 9, ramp('#efe4cc'), { base: 0.4 });
          for (const yy of [torsoTop + 3, torsoTop + 5.5, torsoTop + 8]) D.dot(cx + 2, yy, acc.hi);
        } else D.box(17.6, torsoTop + 0.5, 1.6, 8, ramp('#efe4cc'), { base: 0.4 });
        D.box(side ? 12.4 : cx - waW - 0.3, torsoBot - 1.5, side ? 7.2 : (waW + 0.3) * 2, 1.1, acc, { base: 0.1, contour: false });
        break;
    }
  };

  // ---------------------------------------------------------------- head
  const head = () => {
    const hcx = (side ? 15.4 : cx) + hx;
    const hcy = 11.5 + by;
    // hair cap
    if (look.head === 'hood') {
      D.ell(hcx + (side ? -0.4 : 0), hcy + 0.2, 7.3, 7.5, ramp(look.cape || look.main), { bias: 0 });
    } else {
      D.ell(hcx, hcy, side ? 6.3 : 6.6, 6.8, hair);
      if (look.hairStyle === 'messy') for (const [ox, oy] of [[-4.2, -5.6], [-0.8, -6.6], [3.2, -5.8]]) D.ell(hcx + ox, hcy + oy, 1.8, 1.6, hair);
      if (look.hairStyle === 'bun') D.ell(hcx + (side ? -3 : 0), hcy - 6.6, 2.7, 2.3, hair);
    }
    if (back) {
      if (look.hairStyle === 'long') {
        D.cyl(hcx, hcy + 1, 6.2, hcx, hcy + 12.5, 4.4, hair, { vgrad: 0.5 });
        for (let k = -3; k <= 3; k += 2) D.dot(hcx + k, hcy + 9 + (k % 4 === 0 ? 1 : 0), hair.mid);
      }
      if (look.hairStyle === 'ponytail') D.cyl(hcx, hcy + 2, 1.7, hcx, hcy + 11, 1.2, hair);
      headwear(hcx, hcy);
      return;
    }
    // face
    const fcx = side ? hcx + 2.1 : hcx;
    const fcy = hcy + 1.8;
    D.ell(fcx, fcy, side ? 4.0 : 4.6, 4.5, skin, { soft: true, bias: 0.12 });
    if (side) D.dot(hcx - 0.4, hcy + 2.2, skin.mid);
    // bangs + side locks
    if (look.head !== 'hood' && look.head !== 'helm') {
      const bang = side
        ? [[hcx - 2, hcy - 4.8], [hcx + 5.4, hcy - 4.2], [hcx + 5.6, hcy - 1.6], [hcx + 3.4, hcy - 2.6], [hcx + 1.2, hcy - 1], [hcx - 2, hcy - 1.6]]
        : [[hcx - 5.2, hcy - 4.4], [hcx + 5.2, hcy - 4.4], [hcx + 5.3, hcy - 0.6], [hcx + 3.2, hcy - 1.8], [hcx + 1.4, hcy - 0.4], [hcx - 0.6, hcy - 1.9], [hcx - 2.8, hcy - 0.5], [hcx - 5.3, hcy - 0.8]];
      D.poly(bang, hair, { base: 0.42, vgrad: 0.6 });
      if (!side) {
        D.box(hcx - 5.6, hcy - 1, 1.4, 4.5, hair, { base: 0.1 });
        D.box(hcx + 4.2, hcy - 1, 1.4, 4.5, hair, { base: -0.2 });
      }
      if (look.hairStyle === 'long' && !side) {
        D.cyl(hcx - 5.3, hcy, 1.6, hcx - 5.8, hcy + 11, 1.7, hair, { bias: 0.05 });
        D.cyl(hcx + 5.3, hcy, 1.6, hcx + 5.8, hcy + 11, 1.7, hair, { bias: -0.1 });
      }
    }
    // hair shine (anime "angel ring")
    if (look.head !== 'hood' && look.head !== 'helm' && look.head !== 'tophat' && look.head !== 'wizard') {
      for (let a = 3.6; a < 4.75; a += 0.18) D.dot(hcx + Math.cos(a) * 4.2, hcy - 1.4 + Math.sin(a) * 4.0, mix(hair.hi, '#ffffff', 0.35));
    }
    // face details
    if (side) {
      if (P.shut) D.dot(fcx + 1.4, fcy - 0.3, EYE);
      else { D.dot(fcx + 1.4, fcy - 0.9, EYE); D.dot(fcx + 1.4, fcy + 0.1, EYE); }
      D.dot(fcx + 2.6, fcy + 1.4, skin.mid);
      D.dot(fcx + 0.6, fcy + 1.2, mix(look.skin, '#ff7070', 0.35));
    } else {
      for (const ex of [-2, 2]) {
        if (P.shut) { D.dot(fcx + ex - 0.5, fcy, EYE); D.dot(fcx + ex + 0.5, fcy, EYE); }
        else { D.dot(fcx + ex, fcy - 0.6, EYE); D.dot(fcx + ex, fcy + 0.4, EYE); }
      }
      D.dot(fcx - 3, fcy + 1.6, mix(look.skin, '#ff7070', 0.32));
      D.dot(fcx + 3, fcy + 1.6, mix(look.skin, '#ff7070', 0.32));
      if (look.hairStyle !== 'beard') D.dot(fcx, fcy + 2.6, P.cheer ? skin.dark : skin.mid);
    }
    if (look.hairStyle === 'beard') {
      D.poly(side ? [[fcx - 1.5, fcy + 1], [fcx + 3.5, fcy + 1], [fcx + 3, fcy + 4.6], [fcx, fcy + 5.4]] : [[fcx - 4, fcy + 1.2], [fcx + 4, fcy + 1.2], [fcx + 3, fcy + 4.8], [fcx, fcy + 5.8], [fcx - 3, fcy + 4.8]], hair, { base: 0.25 });
      if (!side) for (let k = -2; k <= 2; k++) D.dot(fcx + k, fcy + 1.6, hair.dark);
    }
    if (look.head === 'hood') {
      const hc = ramp(look.cape || look.main);
      if (side) D.poly([[hcx - 3, hcy - 6.5], [hcx + 4.8, hcy - 5.4], [hcx + 5.4, hcy - 2.4], [hcx + 1, hcy - 3.2], [hcx - 2.6, hcy - 1]], hc, { base: 0.4 });
      else {
        D.poly([[hcx - 6, hcy - 5], [hcx + 6, hcy - 5], [hcx + 5.2, hcy - 1.6], [hcx - 5.2, hcy - 1.6]], hc, { base: 0.45 });
        D.box(hcx - 6.4, hcy - 2, 1.6, 8, hc, { base: 0.2 });
        D.box(hcx + 4.8, hcy - 2, 1.6, 8, hc, { base: -0.1 });
        D.poly([[hcx - 4.6, hcy - 1.7], [hcx + 4.6, hcy - 1.7], [hcx + 3.8, hcy - 0.6], [hcx - 3.8, hcy - 0.6]], hair, { base: 0.4 });
      }
    }
    headwear(hcx, hcy);
  };

  function headwear(hcx, hcy) {
    switch (look.head) {
      case 'helm':
        D.ell(hcx + (side ? -0.3 : 0), hcy - 1.2, side ? 6.6 : 7, 5.8, METAL, { clip: (x, y) => y < hcy - 0.6 || (!back && (side ? x < hcx - 1 : Math.abs(x + 0.5 - hcx) > 4.2)) || back, bias: 0.05 });
        if (!back) D.box(hcx - (side ? 3 : 7), hcy - 1.4, side ? 9.4 : 14, 1.1, acc, { base: 0.5, contour: false });
        D.ell(hcx - (side ? 1 : 0), hcy - 7.4, 1.4, 2.4, ramp(look.cape || look.accent));
        D.cyl(hcx - (side ? 1 : 0), hcy - 7.4, 1.1, hcx - (side ? 4 : 2), hcy - 3.5, 0.8, ramp(look.cape || look.accent), { bias: -0.2 });
        break;
      case 'wizard': {
        const w = main;
        D.ell(hcx + (side ? 0.5 : 0), hcy - 3.6, side ? 8.2 : 8.8, 2.1, w, { bias: -0.1 });
        D.poly(side
          ? [[hcx - 4.5, hcy - 4.4], [hcx + 4.5, hcy - 4.4], [hcx + 0.5, hcy - 11.5], [hcx - 3.5, hcy - 13], [hcx - 6, hcy - 12]]
          : [[hcx - 5, hcy - 4.4], [hcx + 5, hcy - 4.4], [hcx + 1.4, hcy - 11.2], [hcx - 2.5, hcy - 13.2], [hcx - 5.5, hcy - 12.4], [hcx - 2.6, hcy - 10.5]], w, { base: 0.35 });
        D.box(hcx - (side ? 4.3 : 4.8), hcy - 5.6, side ? 8.6 : 9.6, 1.3, acc, { base: 0.4 });
        if (!back) D.dot(hcx + (side ? 2 : 1), hcy - 5.1, '#fff4c0');
        break;
      }
      case 'circlet':
        if (!back) {
          D.box(hcx - (side ? 2 : 5), hcy - 3.4, side ? 7.2 : 10, 0.9, acc, { base: 0.6, contour: false });
          D.dot(hcx + (side ? 3.6 : 0), hcy - 3.2, '#7fe0ff');
        }
        break;
      case 'bandana':
        D.box(hcx - (side ? 6 : 6.4), hcy - 3.8, side ? 11.6 : 12.8, 2, acc, { base: 0.35 });
        D.poly(side ? [[hcx - 6, hcy - 3], [hcx - 9, hcy - 1 + P.stride * 0.2], [hcx - 8.5, hcy + 1], [hcx - 5.5, hcy - 1.6]] : [[hcx + 5.6, hcy - 3.4], [hcx + 8.4, hcy - 1.6], [hcx + 7.8, hcy + 0.8], [hcx + 5.2, hcy - 1.6]], acc, { base: 0.05 });
        break;
      case 'goggles':
        D.box(hcx - (side ? 6 : 6.4), hcy - 4.3, side ? 11.6 : 12.8, 1.2, LEATHER, { base: 0.1 });
        if (!back) for (const ox of side ? [2.4] : [-2.4, 2.4]) {
          D.ell(hcx + ox, hcy - 4, 1.7, 1.4, acc, { bias: 0.15 });
          D.dot(hcx + ox - 0.6, hcy - 4.4, '#ffffff');
        }
        break;
      case 'veil':
        D.box(hcx - (side ? 5.5 : 6), hcy - 4.4, side ? 10.6 : 12, 1, acc, { base: 0.5, contour: false });
        if (!back) for (let k = -4; k <= 4; k += 2) D.dot(hcx + k + (side ? 1 : 0), hcy - 3.2, acc.hi);
        D.dot(hcx + (side ? 2 : 0), hcy - 5.4, '#ff5a7a');
        break;
      case 'tophat': {
        const t = ramp(look.dark);
        D.ell(hcx + (side ? 0.6 : 0), hcy - 4.2, side ? 7.2 : 7.6, 1.6, t, { bias: -0.15 });
        D.cyl(hcx, hcy - 12.2, 4.4, hcx, hcy - 4.6, 4.6, t, { vgrad: 0.2 });
        D.box(hcx - 4.5, hcy - 6.4, 9, 1.3, acc, { base: 0.4 });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- weapon
  const weapon = () => {
    const sx = side ? 1 : back ? -1 : 1;
    let hxp = side ? 16.8 + P.stride * -0.55 : cx + sx * (shW + 1.6);
    let hyp = side ? 27 + by : 26.8 + by - P.swing * sx * 0.6;
    if (P.cheer) { hxp = cx + shW + 1.8; hyp = 6.5 + by; }
    switch (look.weapon) {
      case 'sword':
        if (back && !P.cheer) {
          for (let k = 0; k < 13; k++) D.put(cx - 5 + k * 0.85, 19 + by + k, k < 2 ? acc.base : METAL.base, 0);
          break;
        }
        if (P.cheer) { D.cyl(hxp, hyp - 10, 0.8, hxp, hyp, 0.8, METAL); D.box(hxp - 2, hyp, 4, 1, acc, { base: 0.5 }); break; }
        D.cyl(hxp + 0.6, hyp + 1, 0.9, hxp + 2.2, hyp + 11, 0.7, METAL, { bias: 0.15 });
        D.box(hxp - 1.2, hyp + 0.4, 3.6, 1, acc, { base: 0.6 });
        break;
      case 'crossbow':
        if (side) {
          D.box(hxp - 3, hyp - 1.6, 9, 1.6, WOOD, { base: 0.3 });
          D.cyl(hxp + 4.5, hyp - 5.5, 0.7, hxp + 4.5, hyp + 2.5, 0.7, ramp('#5a3a22'));
        } else {
          D.box(cx - 3, 24.4 + by, 11 * sx, 1.6, WOOD, { base: 0.3 });
          D.cyl(cx + 7 * sx, 21 + by, 0.8, cx + 7 * sx, 28.5 + by, 0.8, ramp('#5a3a22'));
          D.dot(cx + 8.5 * sx, 25 + by, METAL.hi);
        }
        break;
      case 'staff':
        D.cyl(hxp + 0.5, hyp - 17, 0.75, hxp + 0.5, Math.min(37, hyp + 9), 0.75, WOOD);
        D.ell(hxp + 0.5, hyp - 18.4, 1.9, 1.9, ramp('#ffb03a'), { bias: 0.4 });
        D.dot(hxp, hyp - 19, '#fff8d0');
        break;
      case 'censer':
        D.dot(hxp + 0.5, hyp + 1.4, acc.mid);
        D.dot(hxp + 0.8, hyp + 2.4, acc.mid);
        D.ell(hxp + 1, hyp + 4.6, 1.9, 2.2, acc, { bias: 0.1 });
        D.dot(hxp + 1, hyp + 4.6, '#fff6c0');
        break;
      case 'daggers':
        D.cyl(hxp + 0.5, hyp + 0.5, 0.7, hxp + 2.4, hyp + 5, 0.5, METAL, { bias: 0.2 });
        if (!side) D.cyl(cx - shW - 1.4, 26.6 + by, 0.6, cx - shW - 2.6, 31 + by, 0.5, METAL, { bias: 0.2 });
        break;
      case 'flask':
        D.ell(hxp + 0.6, hyp + 1.4, 1.7, 2.1, ramp('#cfeee0'), { bias: 0.25 });
        D.ell(hxp + 0.6, hyp + 2.2, 1.4, 1.2, acc, { bias: 0.1, contour: false });
        D.dot(hxp + 0.6, hyp - 1, WOOD.base);
        break;
      case 'fans': {
        const fcx = hxp + (P.cheer ? 0 : sx * 1.5), fcy = hyp - (P.cheer ? 2 : 1);
        for (let a = -2.4; a <= 0.4; a += 0.05) {
          for (let r = 1; r <= 5.2; r += 0.5) {
            const col = Math.floor((a + 3) * 5) % 2 ? acc.base : main.base;
            const xx = fcx + Math.cos(a) * r * sx, yy = fcy + Math.sin(a) * r;
            D.put(xx, yy, r > 4.6 ? acc.hi : col, 0);
          }
        }
        break;
      }
      case 'tome':
        if (side) D.box(hxp - 1, hyp - 4, 4, 5, ramp(look.dark), { base: 0.2 });
        else D.box(cx + sx * 2 - 2, 22 + by, 5, 5.5, ramp(look.dark), { base: 0.25 });
        D.dot(side ? hxp + 1 : cx + sx * 2 + 0.5, side ? hyp - 1.5 : 24.5 + by, acc.hi);
        break;
    }
  };

  // ---------------------------------------------------------------- draw order per view
  if (side) {
    armL(); // back arm
    legs();
    torso();
    head();
    if (look.weapon !== 'staff') armR();
    weapon();
    if (look.weapon === 'staff') armR();
  } else if (back) {
    weapon();
    legs();
    torso();
    armL();
    armR();
    head();
  } else {
    legs();
    if (look.weapon === 'staff') weapon();
    torso();
    armL();
    armR();
    head();
    if (look.weapon !== 'staff') weapon();
  }
  return D.finish();
}

function rotateDown(src) {
  const p = new Pix(FW, FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const c = src.get(x, y);
    if (!c) continue;
    const nx = y - 6, ny = FW - 1 - x + 14;
    if (nx >= 0 && nx < FW && ny < FH) p.set(nx, ny, c);
  }
  return p;
}

const FRAMES = [];
for (const v of ['front', 'side', 'back']) for (const n of ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3']) FRAMES.push([v, n]);
FRAMES.push(['front', 'hurt'], ['front', 'cheer']);

const cache = new Map();
export function travelerSheet(charIdx) {
  if (cache.has(charIdx)) return cache.get(charIdx);
  const look = CHARACTERS[charIdx].look;
  const sheet = new Pix(FW * NFRAMES, FH);
  let idle = null;
  FRAMES.forEach(([v, n], i) => {
    const fr = paint(look, poseFor(v, n));
    if (i === 0) idle = fr;
    sheet.blit(fr, i * FW, 0);
  });
  sheet.blit(rotateDown(idle), TF.down * FW, 0);
  const out = { canvas: sheet.toCanvas(), frames: NFRAMES, pix: sheet };
  cache.set(charIdx, out);
  return out;
}

export function frameIndex(view, state, t) {
  if (state === 'down') return TF.down;
  if (state === 'hurt') return TF.hurt;
  if (state === 'cheer') return Math.floor(t * 3) % 2 ? TF.cheer : VIEW_BASE.front;
  const base = VIEW_BASE[view] ?? 0;
  if (state === 'walk') return base + 2 + (Math.floor(t * 8) % 4);
  return base + (Math.floor(t * 2.2) % 2);
}

export function portraitCanvas(charIdx, scale = 4) {
  const s = travelerSheet(charIdx).pix;
  const crop = new Pix(20, 20);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const c = s.get(6 + x, 2 + y);
    if (c) crop.set(x, y, c);
  }
  return crop.toCanvas(scale);
}

export function fullSpriteCanvas(charIdx, frame = 0, scale = 4) {
  const s = travelerSheet(charIdx).pix;
  const one = new Pix(FW, FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const c = s.get(frame * FW + x, y);
    if (c) one.set(x, y, c);
  }
  return one.toCanvas(scale);
}
