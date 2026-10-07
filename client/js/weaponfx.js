// Weapon, ability and impact visuals: slashes, holy auras, orbiting chakrams, lightning, frost
// novas, puddles, explosions, meteors, boss telegraphs and quake rings, revive circles.
// Ground effects share one pixel-snapped shader (16 texels per unit, like the sprites) so they
// sit in the same HD-2D diorama as everything else; light flashes feed the world's light pool.
import * as THREE from 'three';
import { AURA_RADIUS, ORBIT_RADIUS, orbitState } from '/shared/items.js';
import { REVIVE_RADIUS, PPU } from '/shared/constants.js';

const K = { RING: 0, DISC: 1, WARN: 2, LANE: 3, ARC: 4, AURA: 5, SCORCH: 6, PROGRESS: 7 };

const GROUND_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GROUND_FS = /* glsl */ `
  uniform int uKind;
  uniform float uT, uAlpha, uTime, uSeed, uWidth, uR0, uPix;
  uniform vec3 uColor, uColor2;
  uniform vec2 uAspect;
  varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  const float PI = 3.14159265;
  void main() {
    vec2 p = (floor(vUv * uPix * uAspect) + 0.5) / (uPix * uAspect);
    float d = length(p);
    vec3 col = uColor;
    float al = 0.0;
    if (uKind == 0) { // expanding ring
      float e = 1.0 - pow(1.0 - uT, 3.0);
      float r = mix(uR0, 0.97, e);
      float w = uWidth * (1.0 - 0.45 * uT);
      float band = 1.0 - smoothstep(0.0, w, abs(d - r));
      float inner = (1.0 - smoothstep(0.0, r, d)) * 0.22;
      float n = vn(p * 9.0 + uSeed) * 0.35 + 0.65;
      al = (band * n + inner * (1.0 - uT)) * (1.0 - uT * uT);
      col = mix(uColor2, uColor, band);
    } else if (uKind == 1) { // puddle
      float n = vn(p * 3.2 + uSeed) * 0.55 + vn(p * 7.5 + uSeed * 1.7 + uTime * 0.25) * 0.25;
      float edge = 0.62 + n * 0.32;
      float inside = 1.0 - step(edge, d);
      float rim = inside * smoothstep(edge - 0.22, edge - 0.02, d);
      vec2 g = p * 4.5 + vec2(uSeed, uTime * 0.35);
      float b = step(0.86, h21(floor(g))) * step(length(fract(g) - 0.5), 0.22 + 0.08 * sin(uTime * 4.0 + h21(floor(g)) * 6.0));
      col = mix(uColor2, uColor, clamp(rim + b, 0.0, 1.0));
      al = inside * (0.5 + rim * 0.45 + b * 0.4);
    } else if (uKind == 2) { // incoming-strike warning
      float ring = 1.0 - smoothstep(0.0, 0.07, abs(d - 0.93));
      float fill = (1.0 - step(uT * 0.93, d)) * 0.4;
      float pulse = 0.7 + 0.3 * sin(uTime * 18.0);
      al = (ring * 0.9 + fill) * pulse * (1.0 - step(1.0, d));
    } else if (uKind == 3) { // charge lane (x: along 0..1, y: across)
      float along = p.x * 0.5 + 0.5;
      float edge = 1.0 - smoothstep(0.0, 0.18, 1.0 - abs(p.y));
      float chev = step(0.55, fract(along * 5.0 - abs(p.y) * 0.6 - uTime * 2.5));
      al = (edge * 0.9 + chev * 0.35 + 0.18) * (0.75 + 0.25 * sin(uTime * 20.0));
    } else if (uKind == 4) { // cleave crescent sweeping top -> bottom on the +x side
      float a = atan(p.y, p.x);
      float sweep = clamp(uT / 0.42, 0.0, 1.0);
      float lead = mix(PI * 0.55, -PI * 0.55, sweep);
      float revealed = step(lead, a) * step(a, PI * 0.55);
      float hot = 1.0 - smoothstep(0.0, 0.9, a - lead);
      float cres = smoothstep(0.42, 0.86, d) * (1.0 - smoothstep(0.93, 1.0, d));
      float fade = 1.0 - smoothstep(0.35, 1.0, uT);
      al = revealed * cres * fade * (0.45 + hot * 0.9);
      col = mix(uColor2, uColor, clamp(hot * 0.8 + smoothstep(0.78, 0.9, d) * 0.6, 0.0, 1.0));
    } else if (uKind == 5) { // holy aura
      float a = atan(p.y, p.x);
      float ring = 1.0 - smoothstep(0.0, 0.05, abs(d - 0.93));
      float glow = smoothstep(0.35, 0.93, d) * (1.0 - step(0.98, d)) * 0.28;
      float dash = step(0.62, fract(a * 12.0 / (2.0 * PI) + uTime * 0.25)) * (1.0 - smoothstep(0.0, 0.035, abs(d - 0.8)));
      float dash2 = step(0.7, fract(-a * 6.0 / (2.0 * PI) + uTime * 0.12)) * (1.0 - smoothstep(0.0, 0.03, abs(d - 0.62)));
      al = (ring * 0.8 + glow + dash * 0.55 + dash2 * 0.35) * (0.55 + 0.45 * uT);
      col = mix(uColor2, uColor, ring + dash);
    } else if (uKind == 6) { // scorch mark
      float n = vn(p * 4.0 + uSeed) * 0.5 + vn(p * 9.0 + uSeed) * 0.25;
      float inside = 1.0 - smoothstep(0.55 + n * 0.3, 0.75 + n * 0.3, d);
      al = inside * 0.62;
      col = uColor * (0.6 + n * 0.5);
    } else if (uKind == 7) { // revive progress circle
      float a01 = fract(atan(p.x, p.y) / (2.0 * PI) + 1.0);
      float ring = 1.0 - smoothstep(0.0, 0.06, abs(d - 0.92));
      float prog = step(a01, uT) * ring;
      float inner = (1.0 - step(0.92, d)) * 0.1 * (0.6 + 0.4 * sin(uTime * 4.0));
      al = ring * 0.3 + prog * 0.95 + inner;
      col = mix(uColor2, uColor, prog);
    }
    al *= uAlpha;
    if (al < 0.003) discard;
    gl_FragColor = vec4(col, al);
  }`;

const groundGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

// zone looks: main + edge color, particles
const ZONES = {
  acid: { c: '#9ae05a', c2: '#2e6a22', p: [0.7, 1.3, 0.5] },
  plague: { c: '#c87aee', c2: '#4a2268', p: [1.1, 0.6, 1.4] },
  hex: { c: '#b05aff', c2: '#2a0a3a', p: [1.0, 0.4, 1.5], part: 'star', a: 0.55 },
  fire: { c: '#ffb03a', c2: '#a8301a', p: [1.6, 0.7, 0.2], part: 'flame', a: 0.55, k: 1.1, quiet: true },
};
// novas by look: ring colors + particles
const NOVAS = {
  quake: { c: '#ffcf8a', c2: '#6a4a2a', part: 'smoke', add: false, p: [0.55, 0.45, 0.35], up: 1 },
  shout: { c: '#fff4dc', c2: '#c8a050', part: 'star', p: [1.4, 1.2, 0.6], light: 0xffe0a0 },
  blood: { c: '#ff6a6a', c2: '#6a0a1a', part: 'dot', p: [1.5, 0.2, 0.25], light: 0xff4a4a },
  song: { c: '#ffe08a', c2: '#b0703a', part: 'note', p: [1.4, 1.1, 0.5], light: 0xffd27a },
  thorn: { c: '#9ae05a', c2: '#3a5a1a', part: 'leaf', p: [0.6, 1.1, 0.4], up: 1 },
  bone: { c: '#fff4dc', c2: '#8a7a5a', part: 'shard', add: false, p: [0.95, 0.9, 0.8] },
};
const BEAMS = { holy: [1.6, 1.4, 0.7], sun: [1.7, 1.1, 0.4] };

function C(hex, k = 1) {
  return new THREE.Color(hex).multiplyScalar(k);
}

class Ground {
  constructor(kind, x, z, rx, rz, o = {}) {
    this.kind = kind;
    this.uni = {
      uKind: { value: kind }, uT: { value: 0 }, uAlpha: { value: o.alpha ?? 1 }, uTime: { value: 0 },
      uSeed: { value: Math.random() * 50 }, uWidth: { value: o.width ?? 0.08 }, uR0: { value: o.r0 ?? 0.1 },
      uPix: { value: Math.max(4, Math.max(rx, rz) * PPU) }, uAspect: { value: new THREE.Vector2(rx >= rz ? 1 : rx / rz, rz > rx ? 1 : rz / rx) },
      uColor: { value: o.color || C('#ffffff') }, uColor2: { value: o.color2 || o.color || C('#ffffff') },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uni, vertexShader: GROUND_VS, fragmentShader: GROUND_FS, transparent: true, depthWrite: false,
      blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(groundGeo, this.mat);
    this.mesh.position.set(x, o.y ?? 0.05 + Math.random() * 0.01, z);
    this.mesh.scale.set(rx, 1, rz);
    this.mesh.renderOrder = o.order ?? 2;
    this.dur = o.dur ?? 0.5;
    this.t = 0;
    this.fadeIn = o.fadeIn || 0;
    this.fadeOut = o.fadeOut || 0;
    this.baseAlpha = o.alpha ?? 1;
    this.persist = !!o.persist;
    this.follow = o.follow || null;
  }
  dispose() { this.mat.dispose(); }
}

// camera-facing jagged lightning ribbon
class Bolt {
  constructor(pts, color, width, dur) {
    this.pts = pts;
    this.width = width;
    this.dur = dur;
    this.t = 0;
    this.regen = 0;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array((pts.length - 1) * 6 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.jag = pts.map(() => new THREE.Vector3());
    this.build();
  }
  build() {
    const view = new THREE.Vector3(0, -0.75, -0.66);
    const jitter = this.width * 2.6;
    const P = this.pts.map((p, i) => {
      if (i === 0 || i === this.pts.length - 1) return p.clone();
      return p.clone().add(new THREE.Vector3((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter * 0.5, (Math.random() - 0.5) * jitter));
    });
    const side = new THREE.Vector3(), dir = new THREE.Vector3();
    let o = 0;
    for (let i = 0; i < P.length - 1; i++) {
      dir.subVectors(P[i + 1], P[i]);
      side.crossVectors(dir, view).normalize().multiplyScalar(this.width * (1 - (i / P.length) * 0.4));
      const a = P[i], b = P[i + 1];
      const v = [a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b.x + side.x, b.y + side.y, b.z + side.z,
        a.x - side.x, a.y - side.y, a.z - side.z, b.x + side.x, b.y + side.y, b.z + side.z, b.x - side.x, b.y - side.y, b.z - side.z];
      this.pos.set(v, o);
      o += 18;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

function boltPoints(x0, y0, z0, x1, y1, z1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    out.push(new THREE.Vector3(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k));
  }
  return out;
}

export class WeaponFX {
  constructor(R, ents, hooks = {}) {
    this.R = R;
    this.scene = R.scene;
    this.ents = ents;
    this.P = ents.particles;
    this.fx = ents.fx;
    this.hooks = hooks; // { shake(amount), flash(color, amount) }
    this.grounds = [];
    this.bolts = [];
    this.flashes = [];
    this.meteors = [];
    this.auras = new Map(); // "pid:wid" -> Ground
    this.revives = new Map(); // pid -> Ground
    this.lanes = new Map(); // boss id -> Ground
    this.zones = new Map(); // zone id -> Ground
    this.actives = []; // spins, beams, cones and buffs that follow a traveler
    this.drops = []; // falling arrows / hail, fissure eruptions
    this.mineMap = new Map();
    this.time = 0;
  }

  add(g) {
    this.scene.add(g.mesh);
    this.grounds.push(g);
    return g;
  }

  light(x, z, color, intensity, range, dur, y = 1.6) {
    if (this.flashes.length > 6) this.flashes.shift();
    this.flashes.push({ x, y, z, color, intensity, range, dur, t: 0, dynamic: true });
  }

  // ---------------------------------------------------------------- server events
  cleave(px, pz, side, R, evo) {
    const g = this.add(new Ground(K.ARC, px, pz, R, R * 0.75, {
      dur: 0.3, color: evo ? C('#fff2c0', 2.2) : C('#ffffff', 1.8), color2: evo ? C('#ffb03a', 1.6) : C('#7ab8ff', 1.3), y: 0.6,
    }));
    if (side < 0) g.mesh.rotation.y = Math.PI;
    g.mesh.scale.z = R * 0.75;
    for (let i = 0; i < 6; i++) {
      const a = (Math.random() - 0.5) * Math.PI * 0.9;
      const r = R * (0.75 + Math.random() * 0.25);
      this.P.spawn({ kind: 'spark', x: px + Math.cos(a) * r * side, y: 0.7, z: pz - Math.sin(a) * r * 0.75, vx: side * 2, vy: 1, life: 0.25, size: 0.35, size1: 0.05, r: evo ? 1.6 : 1.2, g: evo ? 1.2 : 1.3, b: evo ? 0.5 : 1.6 });
    }
  }

  explosion(x, z, R, kind) {
    if (kind === 'bone' || kind === 'spark') {
      const bone = kind === 'bone';
      this.add(new Ground(K.RING, x, z, R * 1.1, R * 1.1, { dur: 0.35, width: 0.14, color: bone ? C('#fff4dc', 1.6) : C('#d8f0ff', 2), color2: bone ? C('#9a8a6a', 1) : C('#4a8aff', 1.3), r0: 0.15 }));
      this.P.burst(bone ? 10 : 8, { kind: bone ? 'shard' : 'spark', add: !bone, x, y: 0.5, z, jitter: R * 0.4, life: 0.5, size: 0.35, size1: 0.1, r: bone ? 0.95 : 0.8, g: bone ? 0.9 : 1.1, b: bone ? 0.8 : 1.7, speed: 5, up: 4, grav: 12, spin: 10 });
      this.burstGlow(x, z, R * 1.8, bone ? [1.0, 0.9, 0.7] : [0.6, 0.9, 1.6], 0.15);
      return;
    }
    const meteor = kind === 'meteor';
    this.add(new Ground(K.RING, x, z, R * 1.1, R * 1.1, { dur: meteor ? 0.55 : 0.4, width: 0.16, color: C('#ffd27a', 2), color2: C('#ff5a1a', 1.4), r0: 0.15 }));
    this.add(new Ground(K.SCORCH, x, z, R * 0.9, R * 0.9, { dur: meteor ? 2.2 : 1.2, normal: true, color: C('#1a0e08'), fadeOut: 0.6, order: 1, y: 0.025 }));
    this.ents.glowL && this.burstGlow(x, z, R * 2.4, [1.6, 0.8, 0.3], meteor ? 0.35 : 0.22);
    this.P.burst(meteor ? 22 : 12, { kind: 'flame', x, y: 0.5, z, jitter: R * 0.6, life: 0.55, size: 0.6, size1: 0.1, r: 1.6, g: 0.75, b: 0.25, speed: 3.5 * R * 0.6, up: 3, grav: 3 });
    this.P.burst(meteor ? 10 : 5, { kind: 'smoke', add: false, x, y: 0.6, z, jitter: R * 0.5, life: 0.9, size: 0.9, size1: 0.3, r: 0.32, g: 0.27, b: 0.25, speed: 1.6, up: 1.6, drag: 2 });
    if (meteor) this.P.burst(10, { kind: 'shard', add: false, x, y: 0.4, z, life: 0.8, size: 0.35, size1: 0.2, r: 0.45, g: 0.35, b: 0.3, speed: 6, up: 6, grav: 18, spin: 12 });
    this.light(x, z, 0xff8a3a, meteor ? 9 : 5, R * 4, meteor ? 0.4 : 0.25);
    if (this.hooks.shake) this.hooks.shake(meteor ? 0.35 : 0.12, x, z);
  }

  burstGlow(x, z, size, c, dur) {
    this.flashes.push({ glow: true, x, y: 0.8, z, size, c, dur, t: 0 });
  }

  meteorIncoming(x, z, R, delay) {
    this.add(new Ground(K.WARN, x, z, R, R, { dur: delay, color: C('#ff4a2a', 1.2), order: 2 }));
    this.meteors.push({ x, z, t: 0, dur: delay, trail: 0 });
  }

  zone(id, x, z, r, life, kind) {
    const P = ZONES[kind] || ZONES.acid;
    const g = this.add(new Ground(K.DISC, x, z, r, r, {
      dur: life, fadeIn: 0.2, fadeOut: 0.5, normal: !P.add, order: 1, y: 0.03,
      color: C(P.c, P.k || 0.85), color2: C(P.c2), alpha: P.a || 0.62,
    }));
    this.zones.set(id, g);
    if (!P.quiet) this.P.burst(8, { kind: P.part || 'bubble', x, y: 0.2, z, jitter: r, life: 0.5, size: 0.3, size1: 0.1, r: P.p[0], g: P.p[1], b: P.p[2], speed: 2.5, up: 3, grav: 6 });
    g.bubbleK = P.p;
    g.bubbleKind = P.part || 'bubble';
    g.r = r;
  }

  zap(x, z, R, evo, vis) {
    if (vis === 'holy') {
      // a pillar of light instead of a bolt
      this.flashes.push({ glow: true, pillar: true, x, y: 3, z, size: R * 1.2, c: [1.6, 1.4, 0.7], dur: 0.45, t: 0 });
      this.add(new Ground(K.RING, x, z, R, R, { dur: 0.4, width: 0.18, color: C('#fff4c0', 2.2), color2: C('#ffc84a', 1.2), r0: 0.1 }));
      this.P.burst(10, { kind: 'star', x, y: 0.3, z, jitter: R * 0.6, life: 0.6, size: 0.3, size1: 0.05, r: 1.6, g: 1.4, b: 0.7, speed: 1.5, up: 4, floor: false });
      this.light(x, z, 0xffe0a0, 7, R * 4, 0.3, 2);
      return;
    }
    const col = evo ? C('#ffe08a', 3) : C('#bfe6ff', 3);
    const b = new Bolt(boltPoints(x + 0.6, 13, z - 1.5, x, 0.1, z, 10), col, 0.12, 0.22);
    const b2 = new Bolt(boltPoints(x + 0.6, 13, z - 1.5, x, 0.1, z, 10), evo ? C('#ffb03a', 1) : C('#4a8aff', 1), 0.42, 0.22);
    b2.mat.opacity = 0.45;
    this.scene.add(b.mesh, b2.mesh);
    this.bolts.push(b, b2);
    this.add(new Ground(K.RING, x, z, R, R, { dur: 0.3, width: 0.14, color: col, color2: evo ? C('#ff9a3a', 1.2) : C('#4a8aff', 1.2), r0: 0.2 }));
    this.P.burst(8, { kind: 'spark', x, y: 0.3, z, life: 0.3, size: 0.35, size1: 0.05, r: evo ? 1.6 : 1, g: evo ? 1.3 : 1.4, b: evo ? 0.6 : 1.8, speed: 4, up: 3 });
    this.light(x, z, evo ? 0xffd27a : 0x9ad8ff, 8, 9, 0.18, 2);
    this.burstGlow(x, z, R * 2.2, evo ? [1.5, 1.2, 0.5] : [0.6, 0.9, 1.6], 0.15);
  }

  arc(x1, z1, x2, z2) {
    const b = new Bolt(boltPoints(x1, 0.8, z1, x2, 0.8, z2, 6), C('#d0f0ff', 2.6), 0.08, 0.18);
    this.scene.add(b.mesh);
    this.bolts.push(b);
  }

  nova(px, pz, R, freeze, vis = 'frost') {
    if (vis && vis !== 'frost' && NOVAS[vis]) {
      const N = NOVAS[vis];
      this.add(new Ground(K.RING, px, pz, R, R, { dur: 0.45, width: 0.14, color: C(N.c, 2), color2: C(N.c2, 1.2), r0: 0.08 }));
      this.P.burst(16, { kind: N.part, add: N.add !== false, x: px, y: 0.5, z: pz, life: 0.5, size: 0.4, size1: 0.1, r: N.p[0], g: N.p[1], b: N.p[2], speed: R * 2, up: N.up || 1.5, drag: 2, spin: 6, floor: false });
      if (N.light) this.light(px, pz, N.light, 4, R * 2.5, 0.3);
      if (vis === 'quake' && this.hooks.shake) this.hooks.shake(0.25, px, pz);
      return;
    }
    this.add(new Ground(K.RING, px, pz, R, R, { dur: 0.45, width: 0.12, color: C('#e8f8ff', 2), color2: C('#4ab0ff', 1.4), r0: 0.08 }));
    this.add(new Ground(K.RING, px, pz, R * 0.75, R * 0.75, { dur: 0.6, width: 0.3, color: C('#8ad8ff', 0.8), color2: C('#2a6aff', 0.6), r0: 0.05 }));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.P.spawn({ kind: 'shard', add: true, x: px, y: 0.6, z: pz, vx: Math.cos(a) * R * 2.2, vz: Math.sin(a) * R * 1.8, vy: 0.5, life: 0.4, size: 0.4, size1: 0.1, r: 0.7, g: 1.1, b: 1.6, rot: -a, drag: 3, floor: false });
    }
    this.light(px, pz, 0x8ad8ff, freeze ? 7 : 4, R * 2.5, 0.3);
    if (freeze && this.hooks.flash) this.hooks.flash(0xbfe6ff, 0.18);
  }

  // ---------------------------------------------------------------- the wider arsenal
  spin(pid, vis, R, dur, evo) {
    this.actives.push({ type: 'spin', pid, R, until: this.time + dur, evo, vis });
  }

  beam(pid, vis, angles, len, width, dur, rot) {
    this.actives.push({ type: 'beam', pid, vis, angles, len, width, until: this.time + dur, t0: this.time, rot });
  }

  cone(pid, vis, angle, len, arc, dur) {
    this.actives.push({ type: 'cone', pid, vis, angle, len, arc, until: this.time + dur, t0: this.time });
  }

  rain(vis, R, cx, cz, pts) {
    this.add(new Ground(K.WARN, cx, cz, R, R, { dur: 0.35 + (pts.length ? pts[pts.length - 1] : 0.8), color: vis === 'hail' ? C('#8ad8ff', 0.7) : C('#ffd27a', 0.6), order: 2, alpha: 0.5 }));
    for (let i = 0; i < pts.length; i += 3) this.drops.push({ vis, x: pts[i], z: pts[i + 1], at: this.time + pts[i + 2], t0: this.time + pts[i + 2] - 0.35 });
  }

  fissure(vis, x, z, dx, dz, n, gap, dt, r) {
    for (let i = 1; i <= n; i++) this.drops.push({ vis: 'earth', x: x + dx * i * gap, z: z + dz * i * gap, at: this.time + i * dt, t0: this.time + i * dt, r });
  }

  mine(id, x, z, evo) {
    this.mineMap.set(id, { x, z, evo, t0: this.time });
  }

  mineGone(id) {
    this.mineMap.delete(id);
  }

  summonPuff(x, z, vis) {
    const c = vis === 'turret' ? [1.2, 1, 0.6] : [0.5, 1, 1.4];
    this.P.burst(12, { kind: vis === 'turret' ? 'smoke' : 'dot', add: vis !== 'turret', x, y: 0.4, z, jitter: 0.6, life: 0.6, size: 0.4, size1: 0.05, r: c[0], g: c[1], b: c[2], speed: 1.5, up: 2.5, floor: false });
    this.add(new Ground(K.RING, x, z, 1.2, 1.2, { dur: 0.4, width: 0.15, color: C(vis === 'turret' ? '#ffd27a' : '#8ae8ff', 1.4), color2: C('#2a6a8a', 0.8), r0: 0.1 }));
  }

  buff(pid, R, dur) {
    this.actives.push({ type: 'buff', pid, R, until: this.time + Math.min(dur, 4) });
  }

  updateActives(ctx) {
    const ents = this.ents, P = this.P, fx = this.fx, time = ctx.time, dt = ctx.dt;
    const pos = new Map(ctx.players.map((p) => [p.id, p]));
    let w = 0;
    for (const a of this.actives) {
      if (time >= a.until) continue;
      this.actives[w++] = a;
      const p = pos.get(a.pid);
      if (!p) continue;
      if (a.type === 'spin') {
        const n = a.evo ? 8 : 5;
        for (let i = 0; i < n; i++) {
          const ang = time * 14 + (i / n) * Math.PI * 2;
          const x = p.x + Math.cos(ang) * a.R * 0.85, z = p.z + Math.sin(ang) * a.R * 0.85;
          ents.projL.push(x, 0.8, z, 1.1, 1.1, fx.axe, false, 1, 1, 1, 1, 0, 0, -time * 18);
          if (Math.random() < dt * 20) P.spawn({ kind: 'spark', x, y: 0.8, z, life: 0.15, size: 0.3, size1: 0.05, r: 1.2, g: 1.1, b: 0.9, floor: false });
        }
        ents.flatL.push(p.x, 0.05, p.z, a.R * 2, a.R * 1.8, fx.ring, false, 0.9, 0.8, 0.6, 1, 0, 0, time * 8);
      } else if (a.type === 'beam') {
        const c = BEAMS[a.vis] || BEAMS.holy;
        const k = Math.min(1, (time - a.t0) / 0.12) * Math.min(1, (a.until - time) / 0.15);
        for (const a0 of a.angles) {
          const ang = a0 + a.rot * (time - a.t0);
          const steps = Math.ceil(a.len / 0.6);
          for (let i = 1; i <= steps; i++) {
            const d = (i / steps) * a.len;
            const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
            ents.glowL.push(x, 0.8, z, a.width * 3.2, a.width * 3.2, fx.glow, false, c[0] * 0.5 * k, c[1] * 0.5 * k, c[2] * 0.5 * k, 1);
            ents.glowL.push(x, 0.8, z, a.width * 1.4, a.width * 1.4, fx.glow, false, 1.2 * k, 1.2 * k, 1.1 * k, 1);
          }
        }
      } else if (a.type === 'cone') {
        const c = a.vis === 'fire' ? [1.6, 0.7, 0.2] : [0.6, 0.9, 1.6];
        if (Math.random() < 0.9) for (let i = 0; i < 4; i++) {
          const ang = a.angle + (Math.random() - 0.5) * a.arc;
          const sp = a.len * (1.6 + Math.random() * 0.8);
          P.spawn({ kind: 'flame', x: p.x + Math.cos(ang) * 0.6, y: 0.8, z: p.z + Math.sin(ang) * 0.6, vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, vy: 0.4, life: 0.42, size: 0.35, size1: 1.0, r: c[0], g: c[1], b: c[2], a: 1, a1: 0, drag: 1.5, floor: false });
        }
      } else if (a.type === 'buff') {
        const pulse = 0.5 + 0.3 * Math.sin(time * 6);
        ents.flatL.push(p.x, 0.05, p.z, 1.8, 1.6, fx.ring, false, 1.3 * pulse, 0.9 * pulse, 0.3 * pulse, 1, 0, 0, time * 2);
        if (Math.random() < dt * 6) P.spawn({ kind: 'note', x: p.x + (Math.random() - 0.5), y: 1.6, z: p.z, vy: 1.2, life: 0.8, size: 0.4, size1: 0.2, r: 1.4, g: 1.1, b: 0.5, floor: false });
      }
    }
    this.actives.length = w;
    // falling arrows / hail and fissure eruptions
    w = 0;
    for (const d of this.drops) {
      if (time > d.at + 0.05) {
        if (!d.done) {
          d.done = true;
          if (d.vis === 'earth') {
            this.add(new Ground(K.SCORCH, d.x, d.z, d.r, d.r, { dur: 1.2, normal: true, color: C('#2a1e14'), fadeOut: 0.5, order: 1, y: 0.025 }));
            P.burst(6, { kind: 'shard', add: false, x: d.x, y: 0.2, z: d.z, life: 0.5, size: 0.4, size1: 0.2, r: 0.55, g: 0.42, b: 0.3, speed: 2, up: 6, grav: 16, spin: 8 });
            P.burst(3, { kind: 'smoke', add: false, x: d.x, y: 0.3, z: d.z, life: 0.6, size: 0.7, size1: 0.2, r: 0.5, g: 0.42, b: 0.35, speed: 1, up: 1, drag: 2 });
            if (this.hooks.shake) this.hooks.shake(0.05, d.x, d.z);
          } else {
            const hail = d.vis === 'hail';
            P.burst(3, { kind: hail ? 'shard' : 'spark', add: true, x: d.x, y: 0.1, z: d.z, life: 0.25, size: 0.3, size1: 0.05, r: hail ? 0.7 : 1.2, g: hail ? 1 : 1, b: hail ? 1.6 : 0.6, speed: 2, up: 2 });
          }
        }
        if (time > d.at + (d.vis === 'earth' ? 0.35 : 0.6)) continue;
      }
      this.drops[w++] = d;
      if (d.vis === 'earth') {
        if (time >= d.t0) {
          const k = Math.min(1, (time - d.t0) / 0.12);
          ents.projL.push(d.x, 0.3 + k * 0.6, d.z, d.r * 1.2, d.r * 1.4 * k, fx.shard, false, 0.6, 0.48, 0.36, 1, 0, 0, 0);
        }
        continue;
      }
      // falling projectile: from the sky to the ground at its moment
      const k = Math.max(0, Math.min(1, (time - d.t0) / 0.35));
      const landed = time >= d.at;
      const y = landed ? 0.15 : (1 - k) * 9 + 0.2;
      const rect = d.vis === 'hail' ? fx.shard : fx.bolt;
      const tint = d.vis === 'hail' ? [0.75, 0.95, 1.1] : [1, 1, 1];
      if (time >= d.t0) ents.projL.push(d.x + (1 - k) * 2.2, y, d.z - (1 - k) * 1.0, d.vis === 'hail' ? 0.6 : 0.9, d.vis === 'hail' ? 0.6 : 0.9, rect, false, tint[0], tint[1], tint[2], landed ? Math.max(0, 1 - (time - d.at) / 0.6) : 1, 0, 0, landed ? -1.2 : -1.9);
    }
    this.drops.length = w;
    // traps on the ground
    for (const [, m] of this.mineMap) {
      const armed = time - m.t0 > 0.45;
      ents.itemL.push(m.x, 0.02, m.z, 0.9, 0.9, fx.trap, false, 1, 1, 1, 1, armed && Math.floor(time * 3) % 2 ? 0.4 : 0, 0, 0);
    }
  }

  quake(x, z, speed, max) {
    this.add(new Ground(K.RING, x, z, max, max, { dur: (max - 0.5) / speed, width: 0.05, color: C('#ffcf8a', 1.4), color2: C('#8a5a2a', 0.8), r0: 0.5 / max, normal: false }));
    this.P.burst(14, { kind: 'smoke', add: false, x, y: 0.3, z, life: 0.8, size: 0.8, size1: 0.2, r: 0.55, g: 0.45, b: 0.35, speed: 4, up: 1, drag: 2 });
    if (this.hooks.shake) this.hooks.shake(0.4, x, z);
  }

  telegraph(eid, dx, dz, dur, boss) {
    const len = 10, w = boss ? boss.w * 0.45 : 1.6;
    const old = this.lanes.get(eid);
    if (old) old.t = old.dur;
    const g = this.add(new Ground(K.LANE, 0, 0, len / 2, w, { dur, color: C('#ff3a3a', 1.1), order: 2 }));
    g.mesh.rotation.y = -Math.atan2(dz, dx);
    g.eid = eid;
    g.dx = dx; g.dz = dz; g.len = len;
    this.lanes.set(eid, g);
  }

  holyBurst(px, pz, R) {
    this.add(new Ground(K.RING, px, pz, R, R, { dur: 0.6, width: 0.2, color: C('#fff4c0', 2.4), color2: C('#ffc84a', 1.4), r0: 0.05 }));
    this.burstGlow(px, pz, R * 2, [1.6, 1.4, 0.8], 0.3);
    this.light(px, pz, 0xffe0a0, 10, R * 3, 0.5);
    if (this.hooks.flash) this.hooks.flash(0xfff0c0, 0.35);
  }

  levelPillar(px, pz) {
    this.add(new Ground(K.RING, px, pz, 2.2, 2.2, { dur: 0.7, width: 0.14, color: C('#ffe9a0', 1.8), color2: C('#ffb03a', 1.2), r0: 0.1 }));
    this.flashes.push({ glow: true, pillar: true, x: px, y: 3, z: pz, size: 1.4, c: [1.4, 1.1, 0.5], dur: 0.9, t: 0 });
    this.P.burst(14, { kind: 'star', x: px, y: 0.4, z: pz, jitter: 0.8, life: 1, size: 0.3, size1: 0.05, r: 1.5, g: 1.2, b: 0.5, speed: 1.2, up: 4, floor: false });
  }

  sparkleAt(px, pz, c, n = 10) {
    this.P.burst(n, { kind: 'star', x: px, y: 0.6, z: pz, jitter: 0.6, life: 0.7, size: 0.28, size1: 0.04, r: c[0], g: c[1], b: c[2], speed: 1.5, up: 3, floor: false });
  }

  // ---------------------------------------------------------------- per frame
  // ctx: { dt, time, runT, players:[{id,x,z,state,revive,seat,color,weapons:[{id,lvl,t0,ws}]}], paused, enemyPos(id) }
  update(ctx) {
    const { dt, time, runT, paused } = ctx;
    this.time = time;
    const ents = this.ents;
    // persistent per-player effects
    const liveAura = new Set();
    for (const p of ctx.players) {
      if (p.state !== 0) continue;
      for (const w of p.weapons) {
        const ws = w.ws;
        if (!ws) continue;
        if (ws.kind === 'aura') {
          const key = p.id + ':' + w.id;
          liveAura.add(key);
          let g = this.auras.get(key);
          const R = AURA_RADIUS * ws.area;
          if (!g) {
            g = this.add(new Ground(K.AURA, p.x, p.z, R, R, { persist: true, color: ws.evolved ? C('#fff8e0', 1.5) : C('#ffe08a', 1.3), color2: ws.evolved ? C('#ffd27a', 0.9) : C('#ffb03a', 0.7), alpha: 0.75 }));
            this.auras.set(key, g);
          }
          g.mesh.position.set(p.x, 0.06, p.z);
          g.mesh.scale.set(R, 1, R);
          g.uni.uPix.value = R * PPU;
          const ph = ((runT - w.t0) % ws.cd + ws.cd) % ws.cd;
          g.uni.uT.value = Math.max(0, 1 - ph / 0.3);
          if (!paused && Math.random() < dt * (ws.evolved ? 9 : 4)) {
            const a = Math.random() * Math.PI * 2, r = R * Math.sqrt(Math.random());
            this.P.spawn({ kind: ws.evolved ? 'star' : 'dot', x: p.x + Math.cos(a) * r, y: 0.15, z: p.z + Math.sin(a) * r * 0.9, vy: 1.2, life: 0.9, size: 0.22, size1: 0, r: 1.4, g: 1.15, b: 0.5, floor: false });
          }
        } else if (ws.kind === 'orbit') {
          const st = orbitState(ws, w.t0, runT);
          if (!st.active) continue;
          const R = ORBIT_RADIUS * ws.area;
          const ang = runT * 3.4 * ws.speed;
          const size = 0.95 * Math.max(1, ws.area * 0.9) * (0.4 + 0.6 * st.k);
          for (let i = 0; i < ws.amount; i++) {
            const a = ang + (i / ws.amount) * Math.PI * 2;
            const x = p.x + Math.cos(a) * R * st.k, z = p.z + Math.sin(a) * R * st.k;
            ents.projL.push(x, 0.75, z, size, size, ws.vis === 'sword' ? this.fx.edge : this.fx.chakram, false, 1, 1, 1, 1, 0, 0, ws.vis === 'sword' ? a + Math.PI / 2 : -time * 14);
            ents.glowL.push(x, 0.75, z, size * 1.6, size * 1.6, this.fx.glow, false, ws.evolved ? 0.9 : 0.6, ws.evolved ? 0.55 : 0.5, ws.evolved ? 0.9 : 0.2, 1);
            if (!paused && Math.random() < dt * 10) this.P.spawn({ kind: 'dot', x, y: 0.75, z, life: 0.25, size: 0.3, size1: 0, r: 1.2, g: 1, b: 0.4, floor: false });
          }
        }
      }
    }
    for (const [k, g] of this.auras) if (!liveAura.has(k)) { g.persist = false; g.t = g.dur = 0; this.auras.delete(k); }
    // revive circles under downed travelers
    const downed = new Set();
    for (const p of ctx.players) {
      if (p.state !== 1 || !ctx.reviveOn) continue;
      downed.add(p.id);
      let g = this.revives.get(p.id);
      if (!g) {
        g = this.add(new Ground(K.PROGRESS, p.x, p.z, REVIVE_RADIUS, REVIVE_RADIUS, { persist: true, color: C(p.color, 1.6), color2: C(p.color, 0.5) }));
        this.revives.set(p.id, g);
      }
      g.mesh.position.set(p.x, 0.06, p.z);
      g.uni.uT.value = p.revive / 100;
    }
    for (const [k, g] of this.revives) if (!downed.has(k)) { g.persist = false; g.t = g.dur = 0; this.revives.delete(k); }
    // boss charge lanes follow their boss
    for (const [eid, g] of this.lanes) {
      const e = ctx.enemyPos(eid);
      if (e) g.mesh.position.set(e.x + g.dx * g.len / 2, 0.07, e.z + g.dz * g.len / 2);
      if (g.t >= g.dur) this.lanes.delete(eid);
    }
    // ground effects
    let w = 0;
    for (const g of this.grounds) {
      g.t += dt;
      if (!g.persist && g.t >= g.dur) {
        this.scene.remove(g.mesh);
        g.dispose();
        continue;
      }
      this.grounds[w++] = g;
      g.uni.uTime.value = time;
      if (!g.persist && g.kind !== K.AURA && g.kind !== K.PROGRESS) {
        const k = g.t / g.dur;
        if (g.kind !== K.DISC && g.kind !== K.SCORCH) g.uni.uT.value = Math.min(1, k);
        let a = g.baseAlpha;
        if (g.fadeIn && g.t < g.fadeIn) a *= g.t / g.fadeIn;
        if (g.fadeOut && g.dur - g.t < g.fadeOut) a *= Math.max(0, (g.dur - g.t) / g.fadeOut);
        g.uni.uAlpha.value = a;
      }
      if (g.bubbleK && !paused && Math.random() < dt * (g.r > 1.2 ? 8 : 3)) {
        const a = Math.random() * Math.PI * 2, r = g.r * 0.7 * Math.sqrt(Math.random());
        this.P.spawn({ kind: g.bubbleKind || 'bubble', x: g.mesh.position.x + Math.cos(a) * r, y: 0.08, z: g.mesh.position.z + Math.sin(a) * r, vy: 0.7, life: 0.6, size: 0.24, size1: 0.12, r: g.bubbleK[0], g: g.bubbleK[1], b: g.bubbleK[2], floor: false });
      }
    }
    this.grounds.length = w;
    for (const [id, g] of this.zones) if (g.t >= g.dur) this.zones.delete(id);
    // lightning
    w = 0;
    for (const b of this.bolts) {
      b.t += dt;
      if (b.t >= b.dur) { this.scene.remove(b.mesh); b.dispose(); continue; }
      this.bolts[w++] = b;
      b.regen -= dt;
      if (b.regen <= 0) { b.regen = 0.045; b.build(); }
      b.mat.opacity = (b.mat.opacity > 0.5 ? 1 : 0.45) * (1 - b.t / b.dur) * (Math.random() < 0.15 ? 0.3 : 1);
    }
    this.bolts.length = w;
    // falling meteors
    w = 0;
    for (const m of this.meteors) {
      m.t += dt;
      if (m.t >= m.dur) continue;
      this.meteors[w++] = m;
      const k = m.t / m.dur;
      const x = m.x + (1 - k) * 5, y = (1 - k) * 15 + 0.4, z = m.z - (1 - k) * 4;
      ents.projL.push(x, y, z, 1.6, 1.6, this.fx.meteor, false, 1, 1, 1, 1, 0, 0, time * 3);
      ents.glowL.push(x, y, z, 3, 3, this.fx.glow, false, 0.9, 0.4, 0.12, 1);
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = 0.02;
        this.P.spawn({ kind: 'flame', x, y, z, vy: 0.5, life: 0.4, size: 0.8, size1: 0.1, r: 1.6, g: 0.65, b: 0.2, floor: false });
      }
    }
    this.meteors.length = w;
    this.updateActives(ctx);
    // glow bursts (drawn through the entity glow layer)
    w = 0;
    for (const f of this.flashes) {
      f.t += dt;
      if (f.t >= f.dur) continue;
      this.flashes[w++] = f;
      if (f.glow) {
        const k = 1 - f.t / f.dur;
        if (f.pillar) ents.glowL.push(f.x, f.y, f.z, f.size * (0.6 + k * 0.4), 7, this.fx.glow, false, f.c[0] * k, f.c[1] * k, f.c[2] * k, 1);
        else ents.glowL.push(f.x, f.y, f.z, f.size * (1.2 - k * 0.4), f.size * (1.2 - k * 0.4), this.fx.glow, false, f.c[0] * k, f.c[1] * k, f.c[2] * k, 1);
      }
    }
    this.flashes.length = w;
  }

  // light-pool entries for the world (flashes only; travelers' lanterns are added by the run)
  lights() {
    const out = [];
    for (const f of this.flashes) {
      if (f.glow) continue;
      const k = 1 - f.t / f.dur;
      out.push({ x: f.x, y: f.y, z: f.z, color: f.color, intensity: f.intensity * k, range: f.range, dynamic: true });
    }
    return out;
  }

  clear() {
    for (const g of this.grounds) { this.scene.remove(g.mesh); g.dispose(); }
    for (const b of this.bolts) { this.scene.remove(b.mesh); b.dispose(); }
    this.grounds.length = 0;
    this.bolts.length = 0;
    this.flashes.length = 0;
    this.meteors.length = 0;
    this.actives.length = 0;
    this.drops.length = 0;
    this.mineMap.clear();
    this.auras.clear();
    this.revives.clear();
    this.lanes.clear();
    this.zones.clear();
  }
}
