// The lobby town: a terraced HD-2D village at dusk. Timber-framed houses with slate / clay roofs,
// lit windows, a cobbled plaza with a fountain and curved steps, a canal crossed by an arched
// stone bridge, balustrades, lanterns and market clutter. Everything is low-poly geometry wearing
// procedural pixel-art textures (16 px per world unit).
import * as THREE from 'three';
import { Pix, ramp, shade, mix } from './pixel.js';
import { cobbleTexture, stoneBrickTexture, woodTexture, clothTexture, waterTexture, basketSprite, sackSprite, treeSprite, lanternPost } from './sprites.js';

const PPU = 16;
const rnd = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

function tex(pix, wrap = false) {
  const t = new THREE.CanvasTexture(pix.toCanvas());
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// scale a geometry's UVs so a repeating texture keeps 16 px per world unit
function uvScale(g, sx, sy) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

// ------------------------------------------------------------------ house facade textures
const PLASTER = ['#efe2c4', '#e8d9b8', '#e4d4b0', '#ddcba4'];
function plaster(p, x0, y0, w, h, r, base = '#e8d9b8') {
  const pal = PLASTER.map((c) => mix(c, base, 0.5));
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const v = r();
    p.set(x, y, v < 0.08 ? pal[3] : v < 0.4 ? pal[1] : v < 0.85 ? pal[0] : pal[2]);
  }
}

function windowPx(p, e, x, y, lit, shutter, r, w = 10, h = 13) {
  const frame = '#3a2618';
  p.rect(x - 1, y - 1, w + 2, h + 2, frame);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    let c;
    if (lit) c = mix('#ffe7a0', '#ff9a3a', yy / h * 0.8 + (r() < 0.1 ? 0.15 : 0));
    else c = yy < 3 && xx > w / 2 ? '#5a7090' : mix('#2a3550', '#1a2038', yy / h);
    p.set(x + xx, y + yy, c);
    if (lit) e.set(x + xx, y + yy, mix('#ffd070', '#ff8a2a', yy / h));
  }
  p.rect(x + Math.floor(w / 2) - 1, y, 2, h, frame);
  p.rect(x, y + Math.floor(h / 2) - 1, w, 1, frame);
  if (lit) e.rect(x + Math.floor(w / 2) - 1, y, 2, h, '#000000');
  if (shutter) {
    const s = ramp(shutter);
    for (const sx of [x - 5, x + w + 1]) {
      p.rect(sx, y - 1, 4, h + 2, s.base);
      p.rect(sx, y - 1, 1, h + 2, s.hi);
      for (let yy = y; yy < y + h; yy += 3) p.rect(sx, yy, 4, 1, s.mid);
    }
  }
  // flower box
  p.rect(x - 1, y + h + 1, w + 2, 3, '#6a4428');
  for (let k = 0; k < w + 2; k++) if (r() < 0.75) p.set(x - 1 + k, y + h, r() < 0.5 ? ['#e8508a', '#c86ad8', '#f0f0f0', '#ff8a4a'][Math.floor(r() * 4)] : '#4a7a3a');
}

function doorPx(p, e, x, y, w = 14, h = 22, lamp = true) {
  const stone = ramp('#a09888');
  p.rect(x - 2, y - 2, w + 4, h + 2, stone.base);
  p.rect(x - 2, y - 2, w + 4, 1, stone.hi);
  const wood = ramp('#6a4428');
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const arch = yy < 4 && Math.hypot(xx - w / 2 + 0.5, (4 - yy) * 1.4) > w / 2;
    if (arch) continue;
    p.set(x + xx, y + yy, xx % 4 === 0 ? wood.dark : xx % 4 === 1 ? wood.hi : wood.base);
  }
  p.rect(x + 2, y + 7, w - 4, 1, '#3a3038');
  p.rect(x + 2, y + 15, w - 4, 1, '#3a3038');
  p.set(x + w - 4, y + 12, '#e8c050');
  if (lamp) {
    p.rect(x + w + 3, y + 2, 3, 4, '#3a3040');
    p.rect(x + w + 3, y + 3, 3, 2, '#ffe090');
    e.rect(x + w + 3, y + 3, 3, 2, '#ffc060');
  }
}

// facade: returns { map, emissive } canvases for a wall of w x h world units
function facade(w, h, opt, seed) {
  const r = rnd(seed);
  const W = Math.round(w * PPU), H = Math.round(h * PPU);
  const p = new Pix(W, H);
  const e = new Pix(W, H);
  e.rect(0, 0, W, H, '#000000');
  const timber = ramp(opt.timber || '#4a3020');
  // stone ground course
  const baseH = opt.stone ? H : 12;
  const st = ramp(opt.stoneTint || '#9a9284');
  for (let y = H - baseH; y < H; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor((H - y) / 6), off = (row % 2) * 7;
    const edgeY = (H - y) % 6 === 0, edgeX = (x + off) % 14 === 0;
    p.set(x, y, edgeY || edgeX ? st.dark : (x + off) % 14 < 2 ? st.hi : st.base);
  }
  if (!opt.stone) {
    plaster(p, 0, 0, W, H - baseH, r, opt.plaster);
    // timber frame: posts, floor beams, braces
    const floors = opt.floors || 2;
    const fh = (H - baseH) / floors;
    for (let f = 0; f <= floors; f++) p.rect(0, Math.round(f * fh) - (f === floors ? 2 : 0), W, 2, timber.base);
    const bays = Math.max(2, Math.round(W / 28));
    for (let b = 0; b <= bays; b++) {
      const x = Math.min(W - 2, Math.round((b / bays) * (W - 2)));
      p.rect(x, 0, 2, H - baseH, timber.mid);
    }
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        if (r() < 0.45) continue;
        const xa = Math.round((b / bays) * (W - 2)) + 2, xb = Math.round(((b + 1) / bays) * (W - 2));
        const ya = Math.round(f * fh) + 2, yb = Math.round((f + 1) * fh) - 1;
        if (r() < 0.5) p.line(xa, yb, xb - 1, ya, timber.mid);
        else { p.line(xa, ya, xb - 1, yb, timber.mid); p.line(xa, yb, xb - 1, ya, timber.mid); }
      }
    }
  }
  // windows on each floor, door on the ground floor
  const floors = opt.floors || 2;
  const fh = (H - baseH) / floors;
  const nWin = Math.max(1, Math.floor(W / 30));
  const doorX = opt.door === false ? -999 : Math.round(W * (opt.doorAt ?? 0.5)) - 7;
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < nWin; k++) {
      const cx = Math.round(((k + 0.5) / nWin) * W);
      const wy = Math.round(f * fh + fh * 0.28);
      if (f === floors - 1 && Math.abs(cx - (doorX + 7)) < 16) continue;
      windowPx(p, e, cx - 5, wy, r() < (opt.lit ?? 0.65), opt.shutter, r);
    }
  }
  if (opt.door !== false) doorPx(p, e, doorX, H - 23, 14, 22, opt.lamp !== false);
  // banner
  if (opt.banner) {
    const bx = Math.round(W * (opt.bannerAt ?? 0.25)) - 4, by = 4;
    const bc = ramp(opt.banner);
    p.rect(bx - 1, by - 1, 10, 1, '#3a2618');
    for (let y = 0; y < 22; y++) for (let x = 0; x < 8; x++) {
      if (y > 18 && Math.abs(x - 3.5) < (y - 18)) continue;
      p.set(bx + x, by + y, x === 0 ? bc.hi : x === 7 ? bc.dark : bc.base);
    }
    p.line(bx + 2, by + 6, bx + 5, by + 11, '#e8c050');
    p.line(bx + 5, by + 6, bx + 2, by + 11, '#e8c050');
  }
  return { map: p, emissive: e };
}

function roofTexture(color, seed) {
  const r = rnd(seed);
  const S = 64;
  const p = new Pix(S, S);
  const c = ramp(color);
  for (let row = 0; row < S / 4; row++) {
    const off = (row % 2) * 3;
    for (let x = 0; x < S; x++) {
      const col = Math.floor((x + off) / 6);
      const tone = [c.base, c.mid, c.base, c.hi][(col * 7 + row * 3) % 4];
      for (let y = 0; y < 4; y++) {
        const yy = row * 4 + y;
        let t = tone;
        if (y === 3) t = c.dark;
        else if ((x + off) % 6 === 0) t = c.dark;
        else if (y === 0) t = shade(tone, 1.08);
        if (r() < 0.03) t = mix(t, '#5a7a3a', 0.4);
        p.set(x, yy, t);
      }
    }
  }
  return p;
}

// ------------------------------------------------------------------ builders
export class TownBuilder {
  constructor(world) {
    this.w = world;
    this.g = world.group;
    this.lights = [];
    this.billboards = [];
    const cob = tex(cobbleTexture(128, '#a8977c', 21, 30), true);
    this.cobbleMat = new THREE.MeshLambertMaterial({ map: cob });
    this.stoneMat = new THREE.MeshLambertMaterial({ map: tex(stoneBrickTexture(64, '#a89c88', 31), true) });
    this.darkStoneMat = new THREE.MeshLambertMaterial({ map: tex(stoneBrickTexture(64, '#7a7468', 33), true) });
    this.woodMat = new THREE.MeshLambertMaterial({ map: tex(woodTexture(32, '#7a5030'), true) });
    this.roofMats = {
      slate: new THREE.MeshLambertMaterial({ map: tex(roofTexture('#46688a', 3), true) }),
      clay: new THREE.MeshLambertMaterial({ map: tex(roofTexture('#a8503a', 5), true) }),
      moss: new THREE.MeshLambertMaterial({ map: tex(roofTexture('#5a6a7a', 9), true) }),
    };
    this.balusterGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.62, 6);
    this.balusterGeo.translate(0, 0.31, 0);
    this.balusters = [];
  }

  add(m, shadow = true) {
    m.traverse((o) => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; } });
    this.g.add(m);
    return m;
  }

  // a raised block of ground: cobbled top, stone sides (top surface at y = top)
  block(x0, x1, z0, z1, top, mat = this.cobbleMat, side = this.stoneMat, bottom = -4) {
    const w = x1 - x0, d = z1 - z0, h = top - bottom;
    const g = new THREE.BoxGeometry(w, h, d);
    // per-face UV scaling for 16px/unit with a 128px cobble tile and 64px brick tile
    const uv = g.attributes.uv;
    const faces = [[d, h, 4], [d, h, 4], [w, d, 8], [w, d, 8], [w, h, 4], [w, h, 4]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * faces[f][0] * PPU / (faces[f][2] * 16), uv.getY(k) * faces[f][1] * PPU / (faces[f][2] * 16));
    }
    const m = new THREE.Mesh(g, [side, side, mat, side, side, side]);
    m.position.set((x0 + x1) / 2, bottom + h / 2, (z0 + z1) / 2);
    return this.add(m);
  }

  house(x, y, z, w, d, h, opt = {}, seed = 1) {
    const grp = new THREE.Group();
    const front = facade(w, h, opt, seed);
    const side = facade(d, h, { ...opt, door: false, banner: null, lit: (opt.lit ?? 0.65) * 0.7 }, seed + 9);
    const mk = (f) => {
      const t = tex(f.map);
      const e = tex(f.emissive);
      return new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: e, emissiveIntensity: 1.25 });
    };
    const mf = mk(front), ms = mk(side);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [ms, ms, this.stoneMat, this.stoneMat, mf, ms]);
    body.position.y = h / 2;
    grp.add(body);
    // gabled roof (ridge along x), overhanging eaves
    const a = opt.pitch ?? 0.68;
    const over = 0.35;
    const half = d / 2 + over;
    const L = half / Math.cos(a);
    const rise = (d / 2) * Math.tan(a);
    const roofMat = this.roofMats[opt.roof || 'slate'];
    for (const s of [1, -1]) {
      const g = uvScale(new THREE.BoxGeometry(w + 0.6, 0.14, L), (w + 0.6) * PPU / 64, L * PPU / 64);
      const rm = new THREE.Mesh(g, roofMat);
      rm.rotation.x = s * a;
      rm.position.set(0, h + rise - (L / 2) * Math.sin(a) + 0.05, s * (L / 2) * Math.cos(a));
      grp.add(rm);
    }
    // gable triangles on the sides
    const tri = new THREE.Shape();
    tri.moveTo(-d / 2, 0);
    tri.lineTo(d / 2, 0);
    tri.lineTo(0, rise);
    tri.lineTo(-d / 2, 0);
    const tg = new THREE.ShapeGeometry(tri);
    const tuv = tg.attributes.uv, tp = tg.attributes.position;
    for (let i = 0; i < tuv.count; i++) tuv.setXY(i, (tp.getX(i) + d / 2) / d, tp.getY(i) / h);
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(tg, ms);
      m.rotation.y = s * Math.PI / 2;
      m.position.set(s * w / 2, h, 0);
      grp.add(m);
    }
    // dormer
    if (opt.dormer) {
      const dw = 1.4, dh = 1.1;
      const df = facade(dw, dh, { ...opt, floors: 1, door: false, banner: null, lit: 1, stone: false }, seed + 3);
      const dm = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 1.2), [ms, ms, roofMat, roofMat, mk(df), ms]);
      dm.position.set(opt.dormerAt ?? 0, h + rise * 0.35 + dh / 2, d / 4 + 0.2);
      grp.add(dm);
      for (const s of [1, -1]) {
        const cap = new THREE.Mesh(uvScale(new THREE.BoxGeometry(0.95, 0.1, 1.4), 1, 1), roofMat);
        cap.rotation.z = s * 0.7;
        cap.position.set((opt.dormerAt ?? 0) + s * 0.36, h + rise * 0.35 + dh + 0.25, d / 4 + 0.2);
        grp.add(cap);
      }
    }
    if (opt.chimney) {
      const c = new THREE.Mesh(uvScale(new THREE.BoxGeometry(0.55, 1.6, 0.55), 0.6, 1.6), this.darkStoneMat);
      c.position.set(w * 0.3, h + rise * 0.7, -d * 0.15);
      grp.add(c);
    }
    grp.position.set(x, y, z);
    if (opt.ry) grp.rotation.y = opt.ry;
    return this.add(grp);
  }

  // stone balustrade from (x0,z0) to (x1,z1) at height y
  balustrade(x0, z0, x1, z1, y = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const grp = new THREE.Group();
    const rail = new THREE.Mesh(uvScale(new THREE.BoxGeometry(len, 0.18, 0.34), len * PPU / 64, 0.2), this.stoneMat);
    rail.position.y = 0.72;
    const base = new THREE.Mesh(uvScale(new THREE.BoxGeometry(len, 0.16, 0.38), len * PPU / 64, 0.2), this.stoneMat);
    base.position.y = 0.08;
    grp.add(rail, base);
    const nPost = Math.max(2, Math.round(len / 2.6) + 1);
    for (let i = 0; i < nPost; i++) {
      const post = new THREE.Mesh(uvScale(new THREE.BoxGeometry(0.42, 1.0, 0.42), 0.4, 1), this.stoneMat);
      post.position.set(-len / 2 + (i / (nPost - 1)) * len, 0.5, 0);
      grp.add(post);
    }
    const nb = Math.floor(len / 0.36);
    for (let i = 0; i < nb; i++) {
      const lx = -len / 2 + (i + 0.5) * (len / nb);
      this.balusters.push(new THREE.Vector3(x0 + Math.cos(ang) * (lx + len / 2), y + 0.16, z0 + Math.sin(ang) * (lx + len / 2)));
    }
    grp.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    grp.rotation.y = -ang;
    return this.add(grp);
  }

  flushBalusters() {
    const m = new THREE.InstancedMesh(this.balusterGeo, this.stoneMat, this.balusters.length);
    const mat = new THREE.Matrix4();
    this.balusters.forEach((p, i) => m.setMatrixAt(i, mat.makeTranslation(p.x, p.y, p.z)));
    m.castShadow = true;
    m.receiveShadow = true;
    this.g.add(m);
  }

  // semicircular steps bulging toward +z, rising from y0 to y1 at the terrace edge z
  curvedSteps(x, z, y0, y1, r0, n = 6) {
    const h = (y1 - y0) / n;
    for (let k = 0; k < n; k++) {
      const r = r0 - k * 0.42;
      const g = new THREE.CylinderGeometry(r, r, (k + 1) * h, 28, 1, false, -Math.PI / 2, Math.PI);
      uvScale(g, r * 3, 0.5);
      const m = new THREE.Mesh(g, [this.stoneMat, this.cobbleMat, this.cobbleMat]);
      m.position.set(x, y0 + ((k + 1) * h) / 2, z);
      this.add(m);
    }
  }

  fountain(x, z) {
    const grp = new THREE.Group();
    const basin = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(1.7, 1.8, 0.6, 20), 6, 0.6), this.stoneMat);
    basin.position.y = 0.3;
    const wt = tex(waterTexture(), true);
    wt.repeat.set(2, 2);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.2, metalness: 0.2, emissive: 0x0a2a2a, emissiveIntensity: 0.7 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.52;
    const pillar = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(0.22, 0.3, 1.5, 8), 1, 1.5), this.stoneMat);
    pillar.position.y = 1.1;
    const bowl = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(0.7, 0.35, 0.3, 12), 2, 0.3), this.stoneMat);
    bowl.position.y = 1.8;
    grp.add(basin, water, pillar, bowl);
    grp.position.set(x, 0, z);
    this.w.animated.push((t) => { wt.offset.set(Math.sin(t * 0.7) * 0.05, t * 0.03); });
    return this.add(grp);
  }

  bridge(x, z0, z1, width = 2.4, rise = 0.7) {
    const grp = new THREE.Group();
    const N = 10, span = z1 - z0;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      const za = z0 + span * u0, zb = z0 + span * u1;
      const ya = Math.sin(u0 * Math.PI) * rise, yb = Math.sin(u1 * Math.PI) * rise;
      const len = Math.hypot(zb - za, yb - ya) + 0.03;
      const seg = new THREE.Mesh(uvScale(new THREE.BoxGeometry(width, 0.5, len), width * PPU / 128, len * PPU / 128), [this.stoneMat, this.stoneMat, this.cobbleMat, this.stoneMat, this.stoneMat, this.stoneMat]);
      seg.position.set(0, (ya + yb) / 2 - 0.25, (za + zb) / 2);
      seg.rotation.x = -Math.atan2(yb - ya, zb - za);
      grp.add(seg);
      for (const s of [-1, 1]) {
        const wall = new THREE.Mesh(uvScale(new THREE.BoxGeometry(0.3, 0.55, len), 0.3, 0.5), this.stoneMat);
        wall.position.set(s * (width / 2 - 0.15), (ya + yb) / 2 + 0.27, (za + zb) / 2);
        wall.rotation.x = seg.rotation.x;
        grp.add(wall);
      }
    }
    // arch underside: two stone piers in the canal
    for (const zz of [z0 + 0.3, z1 - 0.3]) {
      const pier = new THREE.Mesh(uvScale(new THREE.BoxGeometry(width, 1.6, 0.7), 1, 1), this.darkStoneMat);
      pier.position.set(0, -0.9, zz);
      grp.add(pier);
    }
    grp.position.x = x;
    return this.add(grp);
  }

  stall(x, y, z, a, b) {
    const grp = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
    post.translate(0, 1.1, 0);
    for (const [px, pz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) {
      const m = new THREE.Mesh(post, this.woodMat);
      m.position.set(px, 0, pz);
      grp.add(m);
    }
    const t = tex(clothTexture(32, a, b), true);
    t.repeat.set(2, 1);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.5), new THREE.MeshLambertMaterial({ map: t }));
    awn.position.y = 2.2;
    awn.rotation.x = 0.2;
    const table = new THREE.Mesh(uvScale(new THREE.BoxGeometry(2.2, 0.12, 0.9), 2, 1), this.woodMat);
    table.position.set(0, 0.8, 0.1);
    grp.add(awn, table);
    grp.position.set(x, y, z);
    return this.add(grp);
  }

  lamp(x, y, z, int = 1.7) {
    this.billboards.push(['lantern', x, z, 1, false, y]);
    this.lights.push({ x, y: y + 2.3, z: z + 0.02, color: 0xffb860, intensity: int, range: 8, flicker: 0.35 });
  }

  wallLight(x, y, z, int = 1.2) {
    this.lights.push({ x, y, z, color: 0xffa850, intensity: int, range: 6, flicker: 0.5 });
  }
}

// ------------------------------------------------------------------ the lobby town layout
export function buildTown(world) {
  const T = new TownBuilder(world);
  const W = world;
  if (W.ground) W.ground.visible = false;
  // depth layers (front -> back): plaza | canal + bridge | street | steps | terrace houses | upper town
  T.block(-44, 44, -3.6, 30, 0); // plaza (party gathers here)
  T.block(-44, 44, -7.6, -3.6, -1.3, T.darkStoneMat, T.darkStoneMat); // canal bed
  T.block(-44, 44, -11.4, -7.6, 0); // street beyond the canal
  T.block(-44, 44, -21, -11.4, 1.7); // terrace
  T.block(-44, 44, -44, -21, 3.4); // upper town
  const wt = tex(waterTexture(64, 7), true);
  wt.repeat.set(22, 1);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(88, 4), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.16, metalness: 0.25, emissive: 0x0a2a2a, emissiveIntensity: 0.6 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.8, -5.6);
  water.receiveShadow = true;
  T.g.add(water);
  W.animated.push((t) => { wt.offset.set(t * 0.03, Math.sin(t * 0.5) * 0.02); });
  // arched stone bridge across the canal, lamps at both ends
  T.bridge(0, -3.4, -7.8, 2.8, 0.85);
  T.balustrade(-30, -3.75, -1.7, -3.75);
  T.balustrade(1.7, -3.75, 30, -3.75);
  T.balustrade(-30, -7.45, -1.7, -7.45);
  T.balustrade(1.7, -7.45, 30, -7.45);
  T.lamp(-2.3, 0, -2.9);
  T.lamp(2.3, 0, -2.9);
  T.lamp(-2.3, 0, -8.3, 1.4);
  T.lamp(2.3, 0, -8.3, 1.4);
  // curved steps up to the terrace + its balustrade
  T.curvedSteps(5.5, -11.4, 0, 1.7, 3.0, 6);
  T.balustrade(-24, -11.55, 2.9, -11.55, 1.7);
  T.balustrade(8.1, -11.55, 24, -11.55, 1.7);
  // fountain in the plaza
  T.fountain(-7, 2.0);
  // terrace houses
  T.house(-11, 1.7, -15.5, 6, 4.4, 4.4, { roof: 'slate', shutter: '#3a7a4a', banner: '#a8323a', bannerAt: 0.2, dormer: true, chimney: true, doorAt: 0.62 }, 11);
  T.house(-3.8, 1.7, -16.6, 5.2, 4.2, 5.2, { roof: 'clay', shutter: '#3a5a8a', dormer: true, doorAt: 0.5 }, 12);
  T.house(3.4, 1.7, -16.2, 5.4, 4.4, 4.6, { roof: 'slate', shutter: '#3a7a4a', chimney: true, banner: '#2a5a8a', bannerAt: 0.78, doorAt: 0.35 }, 13);
  T.house(11, 1.7, -15.4, 6, 4.6, 4.2, { roof: 'moss', shutter: '#8a3a3a', dormer: true, dormerAt: -1, doorAt: 0.7 }, 14);
  // street-level houses along the canal (left + right)
  T.house(-16.5, 0, -9.6, 6, 3.4, 3.8, { roof: 'clay', shutter: '#3a7a4a', chimney: true, doorAt: 0.3 }, 15);
  T.house(17, 0, -9.6, 6, 3.4, 4.0, { roof: 'slate', shutter: '#3a5a8a', dormer: true, doorAt: 0.7 }, 16);
  // upper town
  T.house(-14, 3.4, -27, 7, 5, 5.2, { roof: 'clay', shutter: '#3a7a4a', chimney: true }, 21);
  T.house(-5.5, 3.4, -28.5, 6, 5, 6.2, { roof: 'slate', shutter: '#3a5a8a', dormer: true, banner: '#a8323a' }, 22);
  T.house(3.5, 3.4, -27.5, 6.5, 5, 5.4, { roof: 'moss', shutter: '#8a3a3a', chimney: true }, 23);
  T.house(12.5, 3.4, -28, 7, 5, 5.0, { roof: 'clay', shutter: '#3a7a4a', dormer: true }, 24);
  // plaza houses framing the sides
  T.house(-18, 0, 3, 6, 5, 4.6, { roof: 'slate', shutter: '#3a7a4a', ry: Math.PI / 2, dormer: true, banner: '#a8323a' }, 31);
  T.house(18.5, 0, 2.5, 6, 5, 4.8, { roof: 'clay', shutter: '#3a5a8a', ry: -Math.PI / 2, chimney: true }, 32);
  // market + clutter
  T.stall(8.6, 0, 0.4, '#b8483a', '#ead8b0');
  T.stall(12.6, 0, 0.0, '#3a6a8a', '#e0d8c0');
  for (const [x, z] of [[10.8, 2.2], [11.3, 1.6], [14.6, 1.2], [-11.5, -9.4], [-10.9, -10.0]]) T.add(W.barrel(x, z));
  for (const [x, z, ry] of [[-10.6, 4.4, 0.3], [-10.0, 5.0, -0.2], [6.8, -9.6, 0.1]]) T.add(W.crate(x, z, 1, ry));
  T.lamp(-13.6, 1.7, -12.2);
  T.lamp(13.6, 1.7, -12.2);
  T.wallLight(-10, 3.2, -13.1);
  T.wallLight(2.9, 3.2, -13.8);
  T.wallLight(-3.4, 3.6, -14.3);
  T.flushBalusters();
  T.billboards.push(
    ['basket', 8.0, 0.8, 1, false, 0.92], ['basket2', 9.0, 0.8, 1, false, 0.92], ['basket', 12.2, 0.4, 1, true, 0.92], ['sack', 13.4, 0.6, 1, false, 0],
    ['sack', -9.6, 5.4, 1, false, 0], ['bush', -1.2, -13.0, 0.8, false, 1.7], ['bush', 9.8, -13.0, 0.8, true, 1.7],
    ['oak2', 22, -16, 1.2, true, 1.7], ['oak1', -22, -17, 1.2, false, 1.7], ['pine', 21, -4, 1.1, false, 0], ['pine', -22, -3, 1.1, true, 0],
    ['oak1', -4.5, 11, 1.15, false, 0], ['bush', 4.6, 10.5, 1.1, true, 0],
  );
  world.campLights = T.lights;
  world.campBillboards = T.billboards;
  return T;
}
