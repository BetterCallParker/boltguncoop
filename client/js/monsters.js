// Procedural monster sprites (same shaded-volume + ink technique as the travelers), palette
// variants per stage, and a packed texture atlas with per-frame UV rects for instanced drawing.
import { Doll } from './travelers.js';
import { Pix, ramp, shade, mix, noise2 } from './pixel.js';
import { ENEMIES, ENEMY_IDS } from '/shared/enemies.js';
import { iconPix } from './icons.js';

const R = (hex) => ramp(hex);

// palette variant: 'base' | 'ice' | 'fire'
function V(hex, pal) {
  if (pal === 'ice') return mix(mix(hex, '#8fc8ff', 0.5), '#ffffff', 0.12);
  if (pal === 'fire') return mix(hex, '#d8482a', 0.45);
  return hex;
}
const EYE = { base: '#ff3a3a', ice: '#7ae8ff', fire: '#ffd23a' };

// ------------------------------------------------------------------ painters
const PAINT = {
  bat: { w: 26, h: 20, frames: 3, fps: 10, paint(D, f, pal) {
    const body = R(V('#4a3a5a', pal)), wing = R(V('#5a4470', pal));
    const lift = [-5, 0, 4][f];
    for (const s of [-1, 1]) {
      D.poly([[13, 9], [13 + s * 11, 4 + lift], [13 + s * 10, 9 + lift * 0.4], [13 + s * 7, 8 + lift * 0.3], [13 + s * 5, 12], [13 + s * 2, 11]], wing, { base: s < 0 ? 0.3 : 0.05 });
    }
    D.ell(13, 10, 3.8, 3.6, body);
    D.poly([[10.5, 7.5], [11.5, 3.5], [12.5, 7.5]], body, { base: 0.3 });
    D.poly([[13.5, 7.5], [14.5, 3.5], [15.5, 7.5]], body, { base: 0.1 });
    D.dot(11.6, 9.4, EYE[pal]);
    D.dot(14.4, 9.4, EYE[pal]);
    D.dot(12.4, 12, '#ffffff');
    D.dot(13.6, 12, '#ffffff');
  } },
  slime: { w: 24, h: 20, frames: 4, fps: 6, paint(D, f, pal) {
    const g = R(V('#6ab84a', pal));
    const [rx, ry] = [[7.4, 5.2], [6.8, 6.0], [6.2, 6.8], [7.8, 4.6]][f];
    D.ell(12, 19.5 - ry, rx, ry, g, { bias: 0.1 });
    D.ell(9.5, 18.5 - ry * 1.5, 1.8, 1.2, R('#ffffff'), { contour: false });
    D.dot(10, 19 - ry, '#1a2a12');
    D.dot(14, 19 - ry, '#1a2a12');
    D.dot(12, 20.2 - ry * 0.6, shade(V('#3a7a2a', pal), 0.8));
  } },
  skeleton: { w: 26, h: 38, frames: 4, fps: 7, paint(D, f, pal) {
    const bone = R(V('#e6dcc2', pal)), rust = R('#8a5a3a');
    const st = [2, 0, -2, 0][f], by = f % 2 ? -1 : 0;
    // legs
    D.cyl(12.5, 26 + by, 0.9, 12.5 - st, 35, 0.8, bone, { bias: -0.3 });
    D.cyl(13.5, 26 + by, 0.9, 13.5 + st, 35, 0.8, bone);
    D.ell(12.5 - st + 1, 36, 1.8, 1, bone, { bias: -0.2 });
    D.ell(13.5 + st + 1, 36, 1.8, 1, bone);
    D.ell(13, 25 + by, 3, 1.6, bone);
    // spine + ribs
    D.cyl(13, 16 + by, 0.8, 13, 25 + by, 0.8, bone);
    for (let k = 0; k < 3; k++) D.ell(13, 17.5 + k * 2.2 + by, 3.6 - k * 0.4, 0.9, bone);
    // arms + sword
    D.cyl(11, 16.5 + by, 0.8, 10 - st * 0.5, 23 + by, 0.7, bone, { bias: -0.3 });
    D.cyl(15, 16.5 + by, 0.8, 16.5 + st * 0.5, 23 + by, 0.7, bone);
    D.cyl(17 + st * 0.5, 23 + by, 0.6, 22 + st * 0.5, 13 + by, 0.5, rust, { bias: 0.1 });
    // skull
    D.ell(13.5, 10 + by, 4.6, 4.4, bone, { bias: 0.1 });
    D.box(11.4, 13 + by, 4.6, 2.2, bone, { base: 0.3 });
    D.dot(12, 10 + by, '#1a1420'); D.dot(15.2, 10 + by, '#1a1420');
    D.dot(12, 11 + by, '#1a1420'); D.dot(15.2, 11 + by, '#1a1420');
    D.dot(12, 10.4 + by, EYE[pal]);
    for (let k = 0; k < 3; k++) D.dot(12 + k * 1.3, 14 + by, '#3a3028');
  } },
  ghost: { w: 26, h: 32, frames: 3, fps: 5, paint(D, f, pal) {
    const g = R(V('#d6ecff', pal === 'fire' ? 'base' : pal));
    const wob = [0, 1, -1][f];
    const pts = [[13, 3], [20, 9], [21, 22]];
    for (let k = 0; k <= 6; k++) pts.push([21 - k * (16 / 6), 29 + ((k + f) % 2 ? -2 : 0) + wob * (k % 3 === 0 ? 1 : 0)]);
    pts.push([5, 22], [6, 9]);
    D.poly(pts, g, { base: 0.35, curve: 1.1 });
    D.ell(13, 11, 7.2, 7.4, g, { bias: 0.1 });
    D.ell(10.3, 12, 1.6, 2.2, R('#1a1a2e'), { contour: false });
    D.ell(15.7, 12, 1.6, 2.2, R('#1a1a2e'), { contour: false });
    D.ell(13, 17, 1.6, 1.4, R('#1a1a2e'), { contour: false });
    D.cyl(6.5, 15, 1.4, 4 - wob, 20, 1.1, g, { bias: 0.1 });
  } },
  zombie: { w: 28, h: 38, frames: 4, fps: 5, paint(D, f, pal) {
    const skin = R(V('#7a9a6a', pal)), cloth = R(V('#6a4a3a', pal)), dark = R(V('#3a3a44', pal));
    const st = [1.6, 0, -1.6, 0][f], by = f % 2 ? 1 : 0;
    D.cyl(13, 27, 1.7, 13 - st, 35, 1.5, dark, { bias: -0.3 });
    D.cyl(15, 27, 1.7, 15 + st, 35, 1.5, dark);
    D.ell(13 - st + 1, 36, 2.2, 1.4, R('#3a2a20'), { bias: -0.2 });
    D.ell(15 + st + 1, 36, 2.2, 1.4, R('#3a2a20'));
    D.cyl(14, 17 + by, 4.6, 14, 28, 4, cloth, { vgrad: 0.3 });
    for (let k = 0; k < 4; k++) D.dot(11 + k * 2, 27 + (k % 2), shade('#6a4a3a', 0.6));
    D.cyl(12, 18 + by, 1.5, 19, 21 + by, 1.3, skin, { bias: -0.3 });
    D.cyl(16, 18 + by, 1.5, 23, 20 + by, 1.3, skin);
    D.ell(16, 11 + by, 4.6, 4.8, skin, { bias: 0.05 });
    D.box(13, 6.5 + by, 6, 2.2, R('#3a3020'), { base: 0.1 });
    D.dot(17.8, 10.5 + by, EYE[pal]);
    D.dot(15.6, 10.5 + by, '#1a1420');
    D.dot(18.4, 13.5 + by, '#3a2a2a');
  } },
  eyeball: { w: 26, h: 26, frames: 3, fps: 6, paint(D, f, pal) {
    const white = R('#f0e8e0'), flesh = R(V('#b04a5a', pal)), iris = R(V(pal === 'ice' ? '#3a9aff' : '#e0a020', pal));
    for (let k = 0; k < 3; k++) {
      const a = [0.5, 1.6, 2.6][k] + f * 0.25;
      D.cyl(13, 16, 1.2, 13 + Math.cos(a) * 9, 16 + Math.sin(a) * 9 + 2, 0.6, flesh, { bias: -0.2 });
    }
    D.ell(13, 12, 7.6, 7.6, white, { bias: 0.1 });
    for (let k = 0; k < 5; k++) D.dot(7 + k * 3, 16 + (k % 2), '#c03a3a');
    const lid = f === 2 ? 2 : 0;
    D.ell(15, 12, 3.4, 3.4 - lid, iris);
    D.ell(15.6, 12, 1.6, 1.8 - lid * 0.5, R('#1a1020'), { contour: false });
    D.dot(14.2, 10.6, '#ffffff');
  } },
  werewolf: { w: 34, h: 40, frames: 4, fps: 9, paint(D, f, pal) {
    const fur = R(V('#6a5a52', pal)), belly = R(V('#9a8a7a', pal)), dark = R(V('#3a302c', pal));
    const st = [3, 0, -3, 0][f], by = f % 2 ? -1 : 0;
    D.poly([[6, 22 + by], [2, 17 + by], [1, 20 + by], [5, 25 + by]], fur, { base: 0.2 });
    D.cyl(14, 26 + by, 2.4, 14 - st, 36, 1.8, dark, { bias: -0.3 });
    D.cyl(18, 26 + by, 2.4, 18 + st, 36, 1.8, fur);
    D.ell(14 - st + 1.4, 37, 2.6, 1.4, dark);
    D.ell(18 + st + 1.4, 37, 2.6, 1.4, dark);
    D.ell(15, 22 + by, 7.6, 6.4, fur, { bias: 0.05 });
    D.ell(17, 24 + by, 4, 3.6, belly, { contour: false });
    D.cyl(19, 19 + by, 2, 25 - st * 0.4, 27 + by, 1.6, fur, { bias: 0.05 });
    D.poly([[24 - st * 0.4, 27 + by], [27 - st * 0.4, 29 + by], [24 - st * 0.4, 29.5 + by]], R('#e8e0d0'));
    D.ell(22, 13 + by, 5.2, 4.6, fur, { bias: 0.1 });
    D.poly([[24, 12 + by], [31, 14 + by], [30, 16.5 + by], [24, 17 + by]], fur, { base: 0.25 });
    D.poly([[18, 10 + by], [19, 4 + by], [21.5, 9.5 + by]], fur, { base: 0.2 });
    D.poly([[21.5, 9 + by], [23.5, 3.5 + by], [25, 9.5 + by]], fur, { base: 0.1 });
    D.dot(24.5, 12.4 + by, EYE[pal]);
    D.dot(30.6, 14.4 + by, '#1a1420');
    D.dot(28, 16.6 + by, '#ffffff');
  } },
  imp: { w: 26, h: 28, frames: 3, fps: 9, paint(D, f, pal) {
    const skin = R(V('#c83a2a', pal === 'fire' ? 'base' : pal)), wing = R(V('#6a2a3a', pal === 'fire' ? 'base' : pal));
    const lift = [-4, 0, 3][f];
    for (const s of [-1, 1]) D.poly([[13, 12], [13 + s * 10, 5 + lift], [13 + s * 8, 12 + lift * 0.4], [13 + s * 4, 15]], wing, { base: s < 0 ? 0.25 : 0 });
    D.cyl(13, 13, 3.2, 13, 21, 2.6, skin);
    D.cyl(11.5, 20, 1.1, 11, 25, 0.9, skin, { bias: -0.3 });
    D.cyl(14.5, 20, 1.1, 15, 25, 0.9, skin);
    D.cyl(10, 21, 0.6, 5, 24 - lift * 0.3, 0.5, skin, { bias: -0.2 });
    D.poly([[5, 24 - lift * 0.3], [3, 22.5], [3.5, 25.5]], skin);
    D.ell(13, 9, 4.2, 4, skin, { bias: 0.1 });
    D.poly([[10, 6.5], [9, 2.5], [11.5, 5.5]], R('#e8d8b0'));
    D.poly([[16, 6.5], [17, 2.5], [14.5, 5.5]], R('#e8d8b0'));
    D.dot(11.6, 9, '#ffe23a');
    D.dot(14.4, 9, '#ffe23a');
    D.dot(13, 11, '#3a1010');
  } },
  cultist: { w: 26, h: 38, frames: 3, fps: 3, paint(D, f, pal) {
    const robe = R(V('#4a2a5a', pal)), trim = R(V('#a88a3a', pal)), glow = f === 2 ? '#ffffff' : pal === 'fire' ? '#ff8a3a' : '#c07aff';
    D.cyl(13, 14, 4.4, 13, 36, 7, robe, { vgrad: 0.35 });
    D.box(7, 35, 12, 1.2, trim, { base: 0.4, contour: false });
    D.ell(13, 10, 5.2, 5.4, robe, { bias: 0.05 });
    D.ell(14, 11, 3.2, 3.4, R('#1a1020'), { contour: false });
    D.dot(13, 11, glow);
    D.dot(15.4, 11, glow);
    D.cyl(19.5, 9, 0.6, 19.5, 33, 0.6, R('#5a3a22'));
    D.ell(19.5, 7.5, 1.9 + (f === 2 ? 0.8 : 0), 1.9 + (f === 2 ? 0.8 : 0), R(glow), { bias: 0.4 });
    D.cyl(16.5, 17, 1.3, 19, 21, 1.1, robe);
  } },
  thorn: { w: 26, h: 32, frames: 2, fps: 3, paint(D, f, pal) {
    const vine = R(V('#3e5a26', pal)), vine2 = R(V('#55762e', pal)), leaf = R(V('#4e7a2c', pal)), bud = R(V('#a83a5a', pal));
    const thornC = pal === 'ice' ? '#e8f6ff' : '#e8d8a0';
    const sw = f ? 1 : -1;
    // three thick curling vines with thorns
    const vines = [[7, 30, 4 + sw, 9, 1.6], [13, 31, 13 - sw * 0.6, 4, 1.9], [19, 30, 22 + sw, 10, 1.6]];
    vines.forEach(([x0, y0, x1, y1, w], k) => {
      const mx = (x0 + x1) / 2 + (k - 1) * 2.5, my = (y0 + y1) / 2;
      D.cyl(x0, y0, w, mx, my, w * 0.8, k === 1 ? vine2 : vine, { bias: k === 0 ? -0.2 : 0 });
      D.cyl(mx, my, w * 0.8, x1, y1, w * 0.45, k === 1 ? vine2 : vine, { bias: k === 0 ? -0.2 : 0.05 });
      for (let j = 0; j < 3; j++) {
        const t = 0.25 + j * 0.25, x = x0 + (x1 - x0) * t + (k - 1) * 2, y = y0 + (y1 - y0) * t;
        const side = (j + k) % 2 ? 1 : -1;
        D.put(x + side * (w + 0.6), y, thornC);
        D.put(x + side * (w + 1.6), y - 1, thornC);
      }
    });
    // closed flower bud at the top of the middle vine (the "mouth")
    D.ell(13 - sw * 0.6, 4.5, 3.2, 3.6, bud, { bias: 0.1 });
    D.poly([[10, 6], [13 - sw * 0.6, 1], [16, 6]], R(V('#c85a7a', pal)), { base: 0.3 });
    D.put(13 - sw * 0.6, 6, '#2a0a14');
    // leafy mound
    for (const [x, y, r] of [[6, 29, 4.2], [20, 29, 4.2], [13, 30, 5.4], [9, 26.5, 3], [17, 26.5, 3]]) D.ell(x, y, r, r * 0.62, leaf, { bias: 0.05 });
  } },
  golem: { w: 42, h: 46, frames: 4, fps: 4, paint(D, f, pal) {
    const rock = R(V('#8a8278', pal)), moss = R(V('#5a7a3a', pal)), core = pal === 'ice' ? '#7ae8ff' : pal === 'fire' ? '#ffb43a' : '#9aff7a';
    const st = [2, 0, -2, 0][f], by = f % 2 ? 1 : 0;
    D.ell(16 - st, 40, 4.2, 4, rock, { bias: -0.25 });
    D.ell(26 + st, 40, 4.2, 4, rock);
    D.ell(21, 26 + by, 11, 10, rock, { bias: 0.05 });
    D.ell(21, 24 + by, 3.2, 3.2, R(core), { bias: 0.5, contour: false });
    D.ell(9, 27 + by, 4.6, 7, rock, { bias: -0.2 });
    D.ell(33, 27 + by, 4.6, 7, rock);
    D.ell(21, 13 + by, 6.6, 5.4, rock, { bias: 0.1 });
    D.dot(19, 13 + by, core); D.dot(23.5, 13 + by, core);
    for (let k = 0; k < 9; k++) D.dot(13 + k * 2, 17 + by + (k % 3), moss.base);
    D.ell(21, 8.6 + by, 5, 1.6, moss, { contour: false });
  } },
  wraith: { w: 38, h: 46, frames: 3, fps: 4, paint(D, f, pal) {
    const armor = R(V('#3a3a4a', pal)), cape = R(V('#2a1a2a', pal)), glow = EYE[pal];
    const fl = [0, -1, 0][f];
    const cpts = [[12, 12 + fl], [26, 12 + fl]];
    for (let k = 0; k <= 5; k++) cpts.push([28 - k * 3.6, 42 + fl + ((k + f) % 2 ? -3 : 0)]);
    D.poly(cpts, cape, { base: 0.05 });
    D.cyl(19, 14 + fl, 6, 19, 30 + fl, 4.6, armor, { vgrad: 0.3 });
    D.ell(13, 15 + fl, 3, 2.6, armor);
    D.ell(25, 15 + fl, 3, 2.6, armor);
    D.cyl(26, 17 + fl, 1.4, 28, 26 + fl, 1.2, armor);
    D.cyl(28.5, 27 + fl, 0.9, 34, 6 + fl, 0.8, R('#aab4c8'), { bias: 0.2 });
    D.box(26, 26 + fl, 5, 1.2, R('#8a6a2a'), { base: 0.4 });
    D.ell(19, 8 + fl, 4.6, 5, armor, { bias: 0.1 });
    D.box(16.2, 7.2 + fl, 5.6, 1.4, R('#120c18'), { base: -0.5, contour: false });
    D.dot(17.4, 7.8 + fl, glow); D.dot(20.6, 7.8 + fl, glow);
    D.poly([[19, 3 + fl], [17.5, -1 + fl], [20.5, -1 + fl]], R(V('#8a2a3a', pal)));
  } },
  treant: { w: 66, h: 74, frames: 3, fps: 2.5, paint(D, f, pal) {
    const bark = R(V('#6a4a32', pal)), leaf = R(V('#4a7a2e', pal)), glow = pal === 'ice' ? '#9ae8ff' : '#ffd23a';
    const sw = [0, 1.5, -1.5][f];
    for (const [x, s] of [[24, -1], [42, 1]]) D.cyl(x, 60, 3, x + s * 6, 72, 2, bark, { bias: s < 0 ? -0.2 : -0.35 });
    D.cyl(33, 24, 10, 33, 64, 12, bark, { vgrad: 0.2 });
    for (let k = 0; k < 7; k++) D.dot(26 + k * 2.4, 40 + (k % 3) * 6, shade(V('#6a4a32', pal), 0.6));
    D.cyl(24, 30, 3, 8 + sw, 18 - sw, 1.6, bark, { bias: 0.1 });
    D.cyl(42, 30, 3, 58 - sw, 20 + sw, 1.6, bark);
    for (const [x, y, r] of [[33, 14, 14], [18, 20, 9], [48, 20, 9], [25, 8, 8], [42, 8, 8], [8 + sw, 16 - sw, 5], [58 - sw, 18 + sw, 5]]) D.ell(x, y, r, r * 0.85, leaf);
    D.ell(28, 38, 2.4, 2.8, R('#1a1008'), { contour: false });
    D.ell(38, 38, 2.4, 2.8, R('#1a1008'), { contour: false });
    D.dot(28, 38, glow); D.dot(38, 38, glow);
    D.poly([[28, 47], [38, 47], [36, 51], [30, 51]], R('#1a1008'), { contour: false });
  } },
  colossus: { w: 66, h: 78, frames: 3, fps: 2.5, paint(D, f, pal) {
    const bone = R(V('#e0d4b8', pal)), armor = R(V('#5a4a5a', pal)), glow = EYE[pal];
    const by = [0, 1, 0][f], st = [0, 2, -2][f];
    D.cyl(26, 50 + by, 2.4, 25 - st, 74, 2, bone, { bias: -0.3 });
    D.cyl(40, 50 + by, 2.4, 41 + st, 74, 2, bone);
    D.ell(33, 50 + by, 9, 4, armor);
    D.cyl(33, 24 + by, 2, 33, 50 + by, 2, bone);
    for (let k = 0; k < 4; k++) D.ell(33, 29 + k * 5 + by, 11 - k * 1.2, 2, bone);
    D.ell(19, 24 + by, 6, 5, armor);
    D.ell(47, 24 + by, 6, 5, armor);
    D.cyl(17, 27 + by, 2.2, 10 - st, 48 + by, 1.8, bone, { bias: -0.2 });
    D.cyl(49, 27 + by, 2.2, 56 + st, 48 + by, 1.8, bone);
    D.ell(33, 13 + by, 8, 8.4, bone, { bias: 0.1 });
    D.poly([[26, 8 + by], [19, -1 + by], [24, 9 + by]], bone);
    D.poly([[40, 8 + by], [47, -1 + by], [42, 9 + by]], bone);
    D.ell(29.5, 13 + by, 2.2, 2.6, R('#1a1020'), { contour: false });
    D.ell(36.5, 13 + by, 2.2, 2.6, R('#1a1020'), { contour: false });
    D.dot(29.5, 13 + by, glow); D.dot(36.5, 13 + by, glow);
    for (let k = 0; k < 5; k++) D.dot(29 + k * 2, 19 + by, '#3a3028');
  } },
  wyrm: { w: 80, h: 64, frames: 3, fps: 3, paint(D, f, pal) {
    const sc = R(V('#3e5276', pal)), dk = R(V('#26304e', pal)), belly = R(V('#cdb78a', pal)), horn = R('#ece4d0');
    const memF = R(V('#3c2442', pal)), memN = R(V('#6a3c62', pal)), glow = EYE[pal];
    const fl = [-6, 0, 5][f], b = [0, 1, 0][f];
    const wing = (sx, sy, mem, bone, k) => {
      const ex = sx - 9 * k, ey = 8 + fl, wx = sx - 22 * k, wy = 1 + fl;
      const tips = [[wx - 12 * k, 13 + fl], [wx - 7 * k, 21 + fl * 0.6], [wx + 1 * k, 27 + fl * 0.3], [sx - 6 * k, sy + 6]];
      const pts = [[sx, sy], [ex, ey], [wx, wy]];
      let prev = [wx, wy];
      for (const t of tips) { pts.push([(prev[0] + t[0]) / 2 + 1.5 * k, (prev[1] + t[1]) / 2 - 1], t); prev = t; }
      D.poly(pts, mem, { base: 0.1, vgrad: 0.5 });
      D.cyl(sx, sy, 1.6, ex, ey, 1.2, bone, { bias: 0.1 });
      D.cyl(ex, ey, 1.2, wx, wy, 0.9, bone, { bias: 0.1 });
      for (const t of tips.slice(0, 3)) D.cyl(wx, wy, 0.7, t[0], t[1], 0.4, bone);
      D.put(wx, wy - 1, horn.hi);
    };
    wing(40, 28 + b, memF, dk, 1);
    // tail: tapering segments sweeping left, spade tip
    for (let k = 0; k < 9; k++) {
      const t = k / 8, x = 32 - t * 27, y = 49 + Math.sin(t * 3.2 + f * 0.8) * 2.6 + t * 3 + b * (1 - t);
      D.ell(x, y, 6.2 - t * 4.2, 5 - t * 3.3, sc, { bias: 0.04 });
      if (k % 2 === 0 && k < 8) D.put(x, y - (5 - t * 3.3) - 1, horn.mid);
    }
    D.poly([[7, 50 + b * 0], [1, 45], [0, 53], [4, 55]], dk, { base: 0.2 });
    // far legs
    D.cyl(30, 48 + b, 3.4, 27, 60, 2.2, dk, { bias: -0.3 });
    D.cyl(50, 48 + b, 2.6, 52, 60, 1.8, dk, { bias: -0.3 });
    // body + belly plates
    D.ell(41, 41 + b, 14.5, 10.5, sc, { bias: 0.05 });
    for (let k = 0; k < 5; k++) D.ell(36 + k * 3.6, 48 + b - k * 0.8, 3.4, 2.2, belly, { contour: true, bias: 0.15 });
    for (let k = 0; k < 6; k++) D.poly([[28 + k * 4, 31.5 + b + k * 0.2], [30 + k * 4, 27 + b + k * 0.1], [32 + k * 4, 31.5 + b + k * 0.2]], horn, { base: 0.2 });
    // near legs with claws
    D.ell(33, 47 + b, 6, 6.5, sc, { bias: 0.05 });
    D.cyl(32, 50 + b, 2.8, 31, 60, 2, sc);
    D.cyl(52, 47 + b, 2.6, 55, 60, 1.8, sc);
    for (const x of [28, 30.5, 33, 52.5, 55, 57.5]) D.put(x, 61, horn.base);
    // neck curving up to the head
    D.cyl(51, 38 + b, 5.4, 56, 26 + b, 4.2, sc, { bias: 0.08 });
    D.cyl(56, 26 + b, 4.2, 60, 18 + b, 3.6, sc, { bias: 0.12 });
    for (let k = 0; k < 4; k++) D.ell(57.5 + k * 1.2, 35 + b - k * 4.5, 2.4, 1.6, belly, { bias: 0.2 });
    // head: skull, snout, open jaw, horns
    D.ell(64, 15 + b, 7, 5.6, sc, { bias: 0.12 });
    D.poly([[64, 11 + b], [78, 15 + b], [78, 18 + b], [66, 19 + b]], sc, { base: 0.4, vgrad: 0.6 });
    D.poly([[64, 19 + b], [76, 21 + b], [75, 23 + b], [64, 22 + b]], dk, { base: 0.2 });
    for (const x of [68, 71, 74]) D.put(x, 19 + b, '#ffffff');
    D.poly([[61, 11 + b], [50, 3 + b], [52, 2 + b], [63, 9 + b]], horn, { base: 0.35 });
    D.poly([[65, 10 + b], [60, 1 + b], [62, 0 + b], [67, 9 + b]], horn, { base: 0.5 });
    D.put(66, 14 + b, glow); D.put(67, 14 + b, glow); D.put(66, 13 + b, '#ffffff');
    D.put(76, 16 + b, '#120c1c');
    wing(46, 30 + b, memN, sc, 1);
  } },
  nightmother: { w: 84, h: 86, frames: 3, fps: 2.5, paint(D, f, pal) {
    const gown = R('#2e1c40'), gownD = R('#1c1028'), memb = R('#4a2a5e'), bone = R('#8a6aa8'), skin = R('#ece0ea'), hair = R('#1a1222');
    const gold = R('#d8b04a'), glow = '#ff5ad8', orb = R('#ff7ae0');
    const fl = [-4, 0, 3][f], b = [0, -1, 0][f];
    // great tattered wings with glowing eyespots
    for (const k of [-1, 1]) {
      const sx = 42 + k * 6, sy = 30 + b;
      const ex = 42 + k * 24, ey = 12 + fl, wx = 42 + k * 40, wy = 6 + fl;
      const tips = [[42 + k * 40, 30 + fl * 0.8], [42 + k * 34, 44 + fl * 0.5], [42 + k * 24, 52 + fl * 0.3], [42 + k * 12, 50]];
      const pts = [[sx, sy], [ex, ey], [wx, wy]];
      let prev = [wx, wy];
      for (const t of tips) { pts.push([(prev[0] + t[0]) / 2 - k * 2, (prev[1] + t[1]) / 2 - 1.5], t); prev = t; }
      D.poly(pts, memb, { base: k < 0 ? 0.3 : 0.05, vgrad: 0.6 });
      D.cyl(sx, sy, 1.6, ex, ey, 1.2, bone, { bias: 0.1 });
      D.cyl(ex, ey, 1.2, wx, wy, 0.9, bone, { bias: 0.1 });
      for (const t of tips.slice(0, 3)) D.cyl(ex, ey, 0.7, t[0], t[1], 0.4, bone);
      D.ell(42 + k * 31, 17 + fl * 0.8, 2.8, 2.8, R('#ff8ae8'), { bias: 0.4, contour: false });
      D.ell(42 + k * 31, 17 + fl * 0.8, 1.1, 1.6, R('#2a0a28'), { contour: false });
    }
    // halo of thorns behind the head
    for (let a = 0; a < Math.PI * 2; a += 0.12) D.put(42 + Math.cos(a) * 11, 14 + b + Math.sin(a) * 11, a % 0.48 < 0.12 ? '#ff9af0' : '#6a2a6a');
    // flowing gown, tattered hem
    const g = [[33, 34 + b], [51, 34 + b]];
    for (let k = 0; k <= 8; k++) g.push([60 - k * (36 / 8), 82 + ((k + f) % 2 ? -4 : 0) + (k % 3 === 0 ? 1 : 0)]);
    D.poly(g, gown, { base: 0.25, vgrad: 0.9 });
    D.poly([[38, 40 + b], [46, 40 + b], [50, 80], [34, 80]], gownD, { base: 0.1, vgrad: 0.6 });
    for (let k = 0; k < 5; k++) D.put(42, 44 + b + k * 7, gold.base);
    // bodice + gold trim
    D.cyl(42, 24 + b, 6, 42, 36 + b, 4.6, gown, { vgrad: 0.4 });
    D.box(36.5, 34 + b, 11, 2, gold, { base: 0.5 });
    D.box(39.5, 26 + b, 5, 8, R('#4a2a5a'), { base: 0.3 });
    // arms outstretched, orbs of light in her palms
    for (const k of [-1, 1]) {
      D.cyl(42 + k * 6, 26 + b, 1.8, 42 + k * 13, 34 + b, 1.3, skin, { bias: k < 0 ? 0.2 : -0.1 });
      D.cyl(42 + k * 13, 34 + b, 1.3, 42 + k * 18, 30 + b, 1.1, skin, { bias: k < 0 ? 0.2 : -0.1 });
      D.ell(42 + k * 19.5, 28 + b, 3.2, 3.2, orb, { bias: 0.5, contour: false });
      D.put(42 + k * 19, 27 + b, '#ffffff');
    }
    // long black hair framing a pale face, crown
    D.poly([[35, 12 + b], [49, 12 + b], [51, 34 + b], [46, 30 + b], [38, 30 + b], [33, 34 + b]], hair, { base: 0.1 });
    D.ell(42, 17 + b, 5.2, 6, skin, { bias: 0.15 });
    D.poly([[36.5, 13 + b], [47.5, 13 + b], [46, 16 + b], [42, 14 + b], [38, 16 + b]], hair, { base: 0.3 });
    D.put(40, 18 + b, glow); D.put(44, 18 + b, glow); D.put(40, 17 + b, '#ffe0f8'); D.put(44, 17 + b, '#ffe0f8');
    D.put(42, 21 + b, '#6a1a4a'); D.put(41, 21 + b, '#8a2a5a');
    D.box(37, 9 + b, 10, 2.4, gold, { base: 0.5 });
    for (const [x, h] of [[37.5, 3], [40, 5], [42, 7], [44, 5], [46.5, 3]]) D.poly([[x - 1, 9.5 + b], [x, 9.5 + b - h], [x + 1, 9.5 + b]], gold, { base: 0.6 });
    D.put(42, 7 + b, '#ff5ad8');
  } },
  // ---- allies summoned by travelers
  wolf: { w: 30, h: 22, frames: 4, fps: 10, paint(D, f) {
    const fur = R('#9ad0ff'), dark = R('#5a8ac8');
    const st = [2, 0, -2, 0][f], by = f % 2 ? -1 : 0;
    D.cyl(9, 13 + by, 1.4, 8 - st, 21, 1.1, dark, { bias: -0.3 });
    D.cyl(20, 13 + by, 1.4, 21 + st, 21, 1.1, dark, { bias: -0.3 });
    D.poly([[3, 9 + by], [0, 6 + by], [2, 11 + by]], fur, { base: 0.2 });
    D.ell(14, 12 + by, 9, 4.6, fur, { bias: 0.05 });
    D.cyl(10, 14 + by, 1.5, 10 + st, 21, 1.2, fur);
    D.cyl(19, 14 + by, 1.5, 19 - st, 21, 1.2, fur);
    D.ell(24, 8 + by, 4.4, 3.8, fur, { bias: 0.1 });
    D.poly([[26, 9 + by], [30, 10 + by], [27, 12 + by]], fur, { base: 0.3 });
    D.poly([[21, 5 + by], [22, 0 + by], [24, 5 + by]], fur, { base: 0.4 });
    D.put(25, 7 + by, '#ffffff');
    D.put(25, 8 + by, '#1a3a6a');
  } },
  turret: { w: 26, h: 26, frames: 2, fps: 4, paint(D, f) {
    const wood = R('#8a5a32'), iron = R('#6a6a7a'), brass = R('#c8a050');
    D.cyl(8, 16, 1, 4, 25, 0.9, wood, { bias: -0.2 });
    D.cyl(18, 16, 1, 22, 25, 0.9, wood, { bias: -0.2 });
    D.cyl(13, 16, 1, 13, 25, 0.9, wood);
    D.ell(13, 15, 5, 3, iron);
    D.box(5, 10 + (f ? 0.5 : 0), 17, 3, wood, { base: 0.3 });
    D.box(20, 10.5, 4, 2, iron, { base: 0.4 });
    D.cyl(6, 7, 0.8, 6, 16, 0.8, wood);
    D.ell(13, 7, 3, 2.6, brass, { bias: 0.2 });
    D.put(13, 6, '#ffe08a');
  } },
  brazier: { w: 22, h: 30, frames: 3, fps: 9, paint(D, f, pal) {
    const iron = R('#4a4450');
    D.cyl(7, 18, 0.7, 4, 29, 0.6, iron);
    D.cyl(15, 18, 0.7, 18, 29, 0.6, iron);
    D.cyl(11, 18, 0.7, 11, 29, 0.6, iron, { bias: -0.3 });
    D.ell(11, 17, 7, 3.4, iron);
    const h = [8, 10, 7][f];
    D.poly([[5.5, 16], [16.5, 16], [14, 16 - h * 0.6], [11 + (f - 1), 15 - h], [8, 16 - h * 0.55]], R('#ff7a2a'), { base: 0.4, contour: false });
    D.poly([[8, 16], [14, 16], [12.5, 13 - h * 0.4], [11, 13 - h * 0.7], [9.5, 13 - h * 0.4]], R('#ffd24a'), { base: 0.6, contour: false });
  } },
};

// ------------------------------------------------------------------ atlas
function paintFrames(sprite, pal) {
  const P = PAINT[sprite];
  const frames = [];
  for (let f = 0; f < P.frames; f++) {
    const D = new Doll(P.w, P.h);
    P.paint(D, f, pal);
    frames.push(D.finish());
  }
  return frames;
}

// Shelf-pack every enemy type's frames + the FX sprites into one canvas
export function buildEnemyAtlas() {
  const entries = [];
  ENEMY_IDS.forEach((id, typeIndex) => {
    const def = ENEMIES[id];
    const frames = paintFrames(def.sprite, def.pal || 'base');
    entries.push({ typeIndex, id, frames, fps: PAINT[def.sprite].fps });
  });
  for (const m of ['wolf', 'turret']) entries.push({ minion: m, id: m, frames: paintFrames(m, 'base'), fps: PAINT[m].fps });
  const items = [];
  for (const e of entries) for (const fr of e.frames) items.push({ e, fr });
  items.sort((a, b) => b.fr.h - a.fr.h);
  const W = 1024;
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (x + it.fr.w + 1 > W) { x = 0; y += rowH + 1; rowH = 0; }
    it.x = x;
    it.y = y;
    x += it.fr.w + 1;
    rowH = Math.max(rowH, it.fr.h);
  }
  const H = Math.pow(2, Math.ceil(Math.log2(y + rowH + 1)));
  const atlas = new Pix(W, H);
  for (const it of items) atlas.blit(it.fr, it.x, it.y);
  const types = [];
  const minions = {};
  for (const e of entries) {
    const rects = e.frames.map((fr) => {
      const it = items.find((q) => q.fr === fr);
      return { u: it.x / W, v: 1 - (it.y + fr.h) / H, du: fr.w / W, dv: fr.h / H, w: fr.w, h: fr.h };
    });
    if (e.minion) minions[e.minion] = { id: e.minion, rects, fps: e.fps };
    else types[e.typeIndex] = { id: e.id, rects, fps: e.fps };
  }
  minions.skeleton = types[ENEMY_IDS.indexOf('skeleton')];
  return { canvas: atlas.toCanvas(), types, minions, W, H };
}

// ------------------------------------------------------------------ FX / pickup atlas
const SMOKE_N = noise2(4);
function fxPix(kind) {
  const p = new Pix(16, 16);
  switch (kind) {
    case 'bolt': p.line(1, 8, 13, 8, '#8a5a32'); p.line(1, 7, 13, 7, '#b8864a'); p.rect(12, 6, 3, 3, '#dfe6f2'); p.rect(0, 6, 2, 4, '#e8e0c8'); break;
    case 'storm': p.line(0, 8, 14, 8, '#bfe8ff'); p.line(2, 7, 15, 7, '#ffffff'); p.line(1, 9, 12, 9, '#6ab0ff'); break;
    case 'knife': p.line(3, 8, 12, 8, '#e8eef8'); p.line(3, 7, 11, 7, '#ffffff'); p.rect(1, 7, 3, 3, '#8a3a3a'); p.set(13, 8, '#ffffff'); break;
    case 'edge': p.line(2, 8, 14, 8, '#fff4c0'); p.line(2, 7, 13, 7, '#ffffff'); p.rect(0, 7, 3, 3, '#c8a03a'); break;
    case 'orb': p.ellipse(8, 8, 5, 5, '#ff6a1f'); p.ellipse(7.5, 7.5, 3.4, 3.4, '#ffb03a'); p.ellipse(7, 7, 1.8, 1.8, '#fff4c0'); break;
    case 'axe': p.line(3, 13, 11, 5, '#8a5a32'); p.poly([[9, 3], [14, 4], [15, 9], [12, 10], [10, 7]], '#c3cbdc'); p.line(14, 4, 15, 9, '#ffffff'); break;
    case 'wisp': p.ellipse(8, 9, 4, 4.5, '#6ad0ff'); p.poly([[8, 1], [11, 7], [5, 7]], '#6ad0ff'); p.ellipse(8, 9, 2.2, 2.4, '#e8faff'); break;
    case 'chakram': for (let a = 0; a < 6.28; a += 0.2) { p.set(8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, '#f0c84a'); p.set(8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, '#fff0a0'); } for (let k = 0; k < 4; k++) { const a = k * 1.57; p.line(8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 8 + Math.cos(a + 0.5) * 8, 8 + Math.sin(a + 0.5) * 8, '#ffffff'); } break;
    case 'flask': p.rect(6, 2, 4, 2, '#8a5a32'); p.ellipse(8, 10, 4.5, 4.5, '#d8f4ff'); p.ellipse(8, 11, 3.5, 3, '#5fdc6a'); break;
    case 'meteor': p.ellipse(8, 8, 6, 6, '#5a3a2a'); p.ellipse(7, 7, 4, 4, '#8a4a2a'); p.ellipse(6, 6, 2, 2, '#ff8a3a'); break;
    case 'eorb': p.ellipse(8, 8, 4.5, 4.5, '#b05aff'); p.ellipse(7.5, 7.5, 2.6, 2.6, '#f0d0ff'); break;
    case 'dark': p.ellipse(8, 8, 5, 5, '#5a1a6a'); p.ellipse(8, 8, 3.2, 3.2, '#ff5ad8'); p.ellipse(7.5, 7.5, 1.5, 1.5, '#ffe0ff'); break;
    case 'glow': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; if (d < 1) p.set(x, y, [255, 255, 255, Math.round((1 - d) * (1 - d) * 255)]); } return p;
    case 'spark': p.rect(7, 3, 2, 10, '#ffffff'); p.rect(3, 7, 10, 2, '#ffffff'); p.rect(6, 6, 4, 4, '#ffffff'); return p;
    case 'ring': for (let a = 0; a < 6.28; a += 0.05) { p.set(8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, '#ffffff'); p.set(8 + Math.cos(a) * 6.4, 8 + Math.sin(a) * 6.4, '#ffffff'); } return p;
    case 'smoke': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot((x - 7.5) / 7, (y - 8) / 6.4) + SMOKE_N(x * 0.6, y * 0.6) * 0.35;
      if (d < 0.95) p.set(x, y, d < 0.55 ? '#ffffff' : d < 0.8 ? '#d8d8d8' : '#b4b4b4');
    } return p;
    case 'shard': p.poly([[8, 1], [11, 8], [8, 15], [5, 8]], '#e8f4ff'); p.poly([[8, 1], [11, 8], [8, 8]], '#ffffff'); return p;
    case 'star': p.poly([[8, 0], [9.5, 6.5], [16, 8], [9.5, 9.5], [8, 16], [6.5, 9.5], [0, 8], [6.5, 6.5]], '#ffffff'); return p;
    case 'dot': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 5; if (d < 1) p.set(x, y, [255, 255, 255, Math.round(255 * Math.min(1, (1 - d) * 2.2))]); } return p;
    case 'bubble': for (let a = 0; a < 6.28; a += 0.08) p.set(8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, '#ffffff'); p.rect(5, 5, 2, 2, '#ffffff'); return p;
    case 'leaf': p.poly([[2, 12], [6, 5], [13, 3], [10, 10]], '#ffffff'); p.line(3, 12, 11, 5, '#c8c8c8'); return p;
    case 'flame': p.poly([[8, 1], [12, 8], [12, 12], [8, 15], [4, 12], [4, 8]], '#ffd88a'); p.poly([[8, 6], [10.5, 10], [8, 14], [5.5, 10]], '#ffffff'); return p;
    case 'px': p.rect(0, 0, 16, 16, '#ffffff'); return p;
    case 'bone': p.line(3, 8, 12, 8, '#efe6d0'); p.line(3, 7, 12, 7, '#fffaf0'); p.ellipse(2.5, 7.5, 1.6, 1.6, '#efe6d0'); p.ellipse(13, 7.5, 1.4, 1.4, '#fffaf0'); p.set(14, 7, '#ffffff'); break;
    case 'pellet': p.ellipse(8, 8, 2.6, 2.6, '#8a8a96'); p.ellipse(7.5, 7.5, 1.4, 1.4, '#d8d8e4'); break;
    case 'icespear': p.line(1, 8, 12, 8, '#9ad8ff'); p.line(1, 7, 11, 7, '#e8faff'); p.poly([[11, 6], [15, 7.5], [11, 9]], '#ffffff'); break;
    case 'spear': p.line(0, 8, 11, 8, '#8a5a32'); p.line(0, 7, 11, 7, '#b8864a'); p.poly([[10, 5.5], [15, 7.5], [10, 9.5]], '#dfe6f2'); p.set(11, 7, '#ffffff'); break;
    case 'shuriken': p.poly([[8, 1], [9.5, 6.5], [15, 8], [9.5, 9.5], [8, 15], [6.5, 9.5], [1, 8], [6.5, 6.5]], '#b8c0d4'); p.ellipse(8, 8, 1.5, 1.5, '#3a3a4a'); p.line(8, 2, 9, 6, '#ffffff'); break;
    case 'frostorb': p.ellipse(8, 8, 6, 6, '#4aa8ff'); p.ellipse(7.5, 7.5, 4.2, 4.2, '#9ad8ff'); p.ellipse(6.5, 6.5, 2, 2, '#ffffff'); p.set(12, 4, '#e8faff'); p.set(3, 11, '#e8faff'); break;
    case 'ball': p.ellipse(8, 8, 5.5, 5.5, '#6ab0ff'); p.ellipse(8, 8, 3.6, 3.6, '#d8f0ff'); p.ellipse(7.5, 7.5, 1.8, 1.8, '#ffffff'); p.line(1, 3, 4, 6, '#ffffff'); p.line(15, 12, 12, 10, '#ffffff'); break;
    case 'bee': p.ellipse(8, 9, 4, 3, '#f0c83a'); p.rect(7, 6.5, 1, 5, '#2a2018'); p.rect(9.5, 6.5, 1, 5, '#2a2018'); p.ellipse(7, 5.5, 2.4, 1.6, '#e8f6ff'); p.ellipse(10, 5.5, 2.4, 1.6, '#e8f6ff'); p.set(12, 9, '#2a2018'); break;
    case 'feather': p.poly([[1, 9], [8, 5], [15, 7], [9, 10]], '#d8ecff'); p.line(1, 9, 15, 7, '#ffffff'); p.set(14, 6, '#ffe08a'); break;
    case 'hammer': p.line(3, 13, 9, 7, '#8a5a32'); p.poly([[7, 3], [13, 2], [15, 7], [9, 8]], '#f0c84a'); p.line(13, 2, 15, 7, '#fff4c0'); p.set(10, 4, '#ffffff'); break;
    case 'shell': p.ellipse(8, 8, 4, 3, '#4a4a56'); p.rect(5, 6, 2, 4, '#c8a050'); p.ellipse(10, 7, 1.4, 1, '#8a8a96'); break;
    case 'hexorb': p.ellipse(8, 8, 5, 5, '#5a1a6a'); p.ellipse(8, 8, 3.4, 3.4, '#b05aff'); p.ellipse(7.5, 7.5, 1.4, 1.4, '#f0d0ff'); break;
    case 'trap': p.ellipse(8, 9, 6.5, 3.5, '#5a5464'); p.ellipse(8, 9, 4.8, 2.4, '#2a2632'); for (let x = 2; x <= 14; x += 2) { p.set(x, 7, '#c8c2d2'); p.set(x, 11, '#c8c2d2'); } p.ellipse(8, 9, 1.4, 1, '#ff5a3a'); break;
    case 'void': p.ellipse(8, 8, 6, 6, '#1a0a2a'); p.ellipse(8, 8, 4, 4, '#3a1a5a'); for (let a = 0; a < 6.28; a += 0.25) p.set(8 + Math.cos(a) * 6.4, 8 + Math.sin(a) * 6.4, '#c08aff'); p.ellipse(8, 8, 1.2, 1.2, '#000000'); break;
    case 'wind': for (let k = 0; k < 3; k++) for (let a = 0; a < 5; a += 0.15) p.set(8 + Math.cos(a + k * 2.1) * (2 + a * 1.1), 8 + Math.sin(a + k * 2.1) * (1.4 + a * 0.8), k ? '#d8f4ff' : '#ffffff'); break;
    case 'note': p.ellipse(6, 11, 2.4, 1.8, '#ffe08a'); p.line(8, 11, 8, 3, '#ffe08a'); p.line(8, 3, 12, 5, '#ffe08a'); break;
  }
  p.outline('#120c1c', 0.3);
  return p;
}

const ICON_FX = new Set(['gem1', 'gem2', 'gem3', 'roast', 'coin', 'bag', 'lodestone', 'freeze', 'starfall', 'chest']);
export const FX_KINDS = ['bolt', 'storm', 'knife', 'edge', 'orb', 'axe', 'wisp', 'chakram', 'flask', 'meteor', 'eorb', 'dark', 'glow', 'spark', 'ring',
  'gem1', 'gem2', 'gem3', 'roast', 'coin', 'bag', 'lodestone', 'freeze', 'starfall', 'chest',
  'smoke', 'shard', 'star', 'dot', 'bubble', 'leaf', 'flame', 'px',
  'bone', 'pellet', 'icespear', 'spear', 'shuriken', 'frostorb', 'ball', 'bee', 'feather', 'hammer', 'shell', 'hexorb', 'trap', 'void', 'wind', 'note'];

export function buildFxAtlas() {
  const cols = 8;
  const rows = Math.pow(2, Math.ceil(Math.log2(Math.ceil(FX_KINDS.length / cols))));
  const atlas = new Pix(cols * 16, rows * 16);
  const rects = {};
  FX_KINDS.forEach((k, i) => {
    const p = ICON_FX.has(k) ? iconPix(k) : fxPix(k);
    const x = (i % cols) * 16, y = Math.floor(i / cols) * 16;
    atlas.blit(p, x, y);
    rects[k] = { u: (x + 0.02) / atlas.w, v: 1 - (y + 15.98) / atlas.h, du: 15.96 / atlas.w, dv: 15.96 / atlas.h };
  });
  return { canvas: atlas.toCanvas(), rects };
}

// pixel digits for damage numbers (5x7 font) in a 10-glyph strip
const GLYPHS = ['01110100011001110101110011000101110', '00100011000010000100001000010001110', '01110100010000100110010001000011111', '11110000010000101110000010000111110', '00010001100101010010111110001000010', '11111100001111000001000011000101110', '00110010001000011110100011000101110', '11111000010001000100010000100001000', '01110100011000101110100011000101110', '01110100011000101111000010001001100'];
export function digitAtlas() {
  const p = new Pix(10 * 7, 9);
  GLYPHS.forEach((g, d) => {
    for (let i = 0; i < 35; i++) if (g[i] === '1') p.set(d * 7 + 1 + (i % 5), 1 + Math.floor(i / 5), '#ffffff');
  });
  p.outline('#000000', 0);
  return p;
}
