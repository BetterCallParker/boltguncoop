// The HD-2D diorama: endless pixel-textured ground, procedurally scattered billboard props and
// low-poly 3D ruins, a day -> dusk -> night lighting cycle, light pools and ambient particles.
import * as THREE from 'three';
import { STAGES } from '/shared/stages.js';
import { hash2 } from '/shared/rng.js';
import { PPU } from '/shared/constants.js';
import {
  treeSprite, grassTuft, flowerSprite, campfireSheet, lanternPost, groundTexture, stoneBrickTexture, woodTexture,
  clothTexture, glowCanvas, cobbleTexture, staveTexture, crateTexture, terracottaTexture, basketSprite, sackSprite, beamCanvas,
  tripodSprite, stumpLantern, canopyCanvas, bokehCanvas, waterTexture,
  pineSprite, gravestoneSprite, tallGrassSprite, rockTexture, pathTexture, mistCanvas,
} from './sprites.js';
import { Pix, noise2 } from './pixel.js';
import { buildTown } from './town.js';

export const SPRITE_TILT = 0.36; // sprites lean back toward the camera (radians)
const CHUNK = 12;
const CHUNK_RANGE = 3;

export function pixTexture(pix) {
  const t = new THREE.CanvasTexture(pix.toCanvas ? pix.toCanvas() : pix);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// shared uniforms: billboard props between the camera and the party dissolve into a stipple
export const STIPPLE = { focus: { value: new THREE.Vector3() }, radius: { value: 5.5 } };

export function spriteMaterial(tex, emissive = 0.14, fade = false) {
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive });
  if (fade) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFocus = STIPPLE.focus;
      sh.uniforms.uFadeR = STIPPLE.radius;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\n#else\nvBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\n#endif');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBase;\nuniform vec3 uFocus;\nuniform float uFadeR;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          vec2 dd = vBase.xz - uFocus.xz;
          if (vBase.z > uFocus.z - 1.0 && length(dd * vec2(0.8, 1.0)) < uFadeR) {
            float near = 1.0 - length(dd * vec2(0.8, 1.0)) / uFadeR;
            vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
            if (near > 0.35 ? (q.x + q.y > 0.5) : (mod(q.x + q.y, 2.0) < 1.0)) discard;
          }`);
    };
    m.customProgramCacheKey = () => 'stipple';
  }
  return m;
}

export function spriteDepthMaterial(tex) {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
}

// plane whose origin is at the bottom-center, sized in world units from pixel size
export function spriteGeometry(wpx, hpx) {
  const g = new THREE.PlaneGeometry(wpx / PPU, hpx / PPU);
  g.translate(0, hpx / PPU / 2, 0);
  return g;
}

// A batch of identical billboard sprites (trees, tufts...) as one InstancedMesh
class SpriteBatch {
  constructor(pix, cap, { shadow = true, emissive = 0.12, scale = 1, fade = pix.h > 24 } = {}) {
    this.tex = pixTexture(pix);
    this.geo = spriteGeometry(pix.w * scale, pix.h * scale);
    this.mat = spriteMaterial(this.tex, emissive, fade);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = false;
    if (shadow) this.mesh.customDepthMaterial = spriteDepthMaterial(this.tex);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.cap = cap;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-SPRITE_TILT, 0, 0));
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
  }

  reset() { this.mesh.count = 0; }

  add(x, z, scale = 1, flip = false, y = 0) {
    if (this.mesh.count >= this.cap) return;
    this.p.set(x, y, z);
    this.s.set(flip ? -scale : scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.mesh.count++, this.m);
  }

  commit() { this.mesh.instanceMatrix.needsUpdate = true; }
}

// ------------------------------------------------------------------ lighting presets
const LIGHT = {
  day: { sun: 0xffdcae, sunI: 3.1, sky: 0xa8c0c8, ground: 0x6a5a44, hemiI: 1.0, fog: 0xd0bc98, fogN: 42, fogF: 120, exposure: 1.06, lantern: 0.7, bloom: 0.32, warmth: 0.06, rays: 1 },
  dusk: { sun: 0xffa868, sunI: 2.5, sky: 0x8088a8, ground: 0x4a3a30, hemiI: 0.75, fog: 0xa07a60, fogN: 30, fogF: 90, exposure: 1.12, lantern: 1.4, bloom: 0.4, warmth: 0.08, rays: 0.8 },
  night: { sun: 0x6a8ae0, sunI: 0.55, sky: 0x2a3660, ground: 0x141018, hemiI: 0.45, fog: 0x161828, fogN: 20, fogF: 64, exposure: 1.15, lantern: 2.4, bloom: 0.5, warmth: 0.0, rays: 0.15 },
};
const STAGE_TINT = {
  verdant: { day: {}, dusk: {}, night: {} },
  frost: { day: { sun: 0xf0f6ff, sky: 0xc8dcff, ground: 0x8a9ab8, fog: 0xd8e4f4 }, dusk: { sun: 0xffb0a0, sky: 0x9a8ad8, fog: 0x8a8ac0 }, night: { sun: 0x8ab0ff, fog: 0x1e2a50 } },
  crypt: { day: { sun: 0xffc090, sunI: 1.2, sky: 0x8a6a8a, ground: 0x3a2028, hemiI: 0.7, fog: 0x4a2a3a, fogN: 22, fogF: 66 }, dusk: { sun: 0xff7a4a, sunI: 1.0, sky: 0x6a3a5a, fog: 0x3a1a2a }, night: { sun: 0xff6a3a, sunI: 0.4, sky: 0x3a1a3a, fog: 0x1a0a14 } },
};

function lerpPreset(a, b, t) {
  const out = {};
  const ca = new THREE.Color(), cb = new THREE.Color();
  for (const k of Object.keys(a)) {
    if (k === 'sun' || k === 'sky' || k === 'ground' || k === 'fog') out[k] = ca.setHex(a[k]).lerp(cb.setHex(b[k]), t).getHex();
    else out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

// ------------------------------------------------------------------ ambient particles
const PARTICLE_VS = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
    vColor = aColor;
  }`;
const PARTICLE_FS = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = uSoft > 0.5 ? smoothstep(1.0, 0.0, d) : step(d, 0.9);
    gl_FragColor = vec4(vColor * (1.0 + uSoft), a * vAlpha);
  }`;

class Ambient {
  constructor(scene, kind) {
    this.kind = kind;
    const n = kind === 'snow' ? 700 : kind === 'embers' ? 260 : 150;
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.color = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.phase = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false,
      blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { uScale: { value: 14 }, uSoft: { value: kind === 'snow' ? 0 : 1 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.init = false;
  }

  respawn(i, fx, fz, anywhere) {
    const W = 46, D = 36;
    this.pos[i * 3] = fx + (Math.random() - 0.5) * W;
    this.pos[i * 3 + 2] = fz + (Math.random() - 0.5) * D;
    const k = this.kind;
    const col = new THREE.Color();
    if (k === 'snow') {
      this.pos[i * 3 + 1] = anywhere ? Math.random() * 14 : 14;
      this.vel[i * 3] = 0.6 + Math.random() * 0.6;
      this.vel[i * 3 + 1] = -(1.2 + Math.random() * 1.2);
      this.size[i] = 4 + Math.random() * 4;
      col.set('#f4f8ff');
    } else if (k === 'embers') {
      this.pos[i * 3 + 1] = anywhere ? Math.random() * 8 : 0;
      this.vel[i * 3 + 1] = 0.6 + Math.random() * 1.2;
      this.size[i] = 4 + Math.random() * 4;
      col.set(Math.random() < 0.5 ? '#ff8a3a' : '#ffc45a');
    } else {
      this.pos[i * 3 + 1] = 0.3 + Math.random() * 3.5;
      this.size[i] = 4 + Math.random() * 4;
      col.set(Math.random() < 0.7 ? '#d8ff7a' : '#fff0a0');
    }
    this.color[i * 3] = col.r; this.color[i * 3 + 1] = col.g; this.color[i * 3 + 2] = col.b;
    this.phase[i] = Math.random() * 100;
  }

  update(dt, t, fx, fz, intensity) {
    this.mat.uniforms.uScale.value = 14 * (window.innerHeight / 900) * (window.devicePixelRatio || 1);
    if (!this.init) {
      for (let i = 0; i < this.n; i++) this.respawn(i, fx, fz, true);
      this.init = true;
    }
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      const ph = this.phase[i];
      if (this.kind === 'fireflies') {
        this.pos[j] += Math.sin(t * 0.7 + ph) * dt * 0.6;
        this.pos[j + 1] += Math.sin(t * 1.3 + ph * 2) * dt * 0.3;
        this.pos[j + 2] += Math.cos(t * 0.5 + ph) * dt * 0.6;
        this.alpha[i] = intensity * (0.5 + 0.5 * Math.sin(t * 2.4 + ph));
      } else if (this.kind === 'snow') {
        this.pos[j] += (this.vel[j] + Math.sin(t + ph) * 0.4) * dt;
        this.pos[j + 1] += this.vel[j + 1] * dt;
        this.alpha[i] = 0.85;
        if (this.pos[j + 1] < 0) this.respawn(i, fx, fz, false);
      } else {
        this.pos[j] += Math.sin(t * 2 + ph) * dt * 0.4;
        this.pos[j + 1] += this.vel[j + 1] * dt;
        this.alpha[i] = Math.max(0, 1 - this.pos[j + 1] / 8) * (0.6 + 0.4 * Math.sin(t * 6 + ph));
        if (this.pos[j + 1] > 8) this.respawn(i, fx, fz, false);
      }
      if (Math.abs(this.pos[j] - fx) > 26 || Math.abs(this.pos[j + 2] - fz) > 20) this.respawn(i, fx, fz, true);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------ world
export class World {
  constructor(renderer) {
    this.R = renderer;
    this.scene = renderer.scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    if (renderer.vol) renderer.vol.light = this.sun;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = new THREE.Fog(0x7a5a8a, 30, 80);
    this.pool = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffa04a, 0, 9, 1.6);
      this.scene.add(l);
      this.pool.push(l);
    }
    this.lightSources = []; // static {x,y,z,color,intensity,range,flicker}
    this.dynamicLights = []; // per-frame (players' lanterns etc.)
    this.stage = null;
    this.chunks = new Map();
    this.animated = []; // {mesh/tex, update(t)}
    this.tod = 0.5;
    this.glowTex = null;
  }

  // ---------------------------------------------------------------- stage setup
  setStage(index, { camp = false, town = false } = {}) {
    this.clear();
    const st = STAGES[index] || STAGES[0];
    this.stage = st;
    this.camp = camp;
    this.town = town;
    this.campLights = null;
    this.campBillboards = null;
    const pal = st.props;
    // ground
    const tex = pixTexture(groundTexture(st.ground, 256, 3 + index));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.groundTile = 256 / PPU; // world units per texture tile
    const size = 140;
    this.groundSize = size;
    tex.repeat.set(size / this.groundTile, size / this.groundTile);
    this.groundTex = tex;
    const gmat = new THREE.MeshLambertMaterial({ map: tex });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), gmat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    // shared textures for 3D props
    this.stoneTex = pixTexture(stoneBrickTexture(64, pal === 'crypt' ? '#7a7088' : pal === 'frost' ? '#a8b4c8' : '#9a9488', 5 + index));
    this.stoneTex.wrapS = this.stoneTex.wrapT = THREE.RepeatWrapping;
    this.woodTex = pixTexture(woodTexture(32));
    this.woodTex.wrapS = this.woodTex.wrapT = THREE.RepeatWrapping;
    this.stoneMat = new THREE.MeshLambertMaterial({ map: this.stoneTex });
    this.rockMat = new THREE.MeshLambertMaterial({ map: pixTexture(rockTexture(32, 2 + index)), flatShading: true });
    this.pathTex = pixTexture(pathTexture(64, 160, 3 + index));
    this.pathMat = new THREE.MeshLambertMaterial({ map: this.pathTex, transparent: true, alphaTest: 0.5 });
    this.woodMat = new THREE.MeshLambertMaterial({ map: this.woodTex });

    // billboard batches
    const B = (pix, cap, o) => {
      const b = new SpriteBatch(pix, cap, o);
      this.group.add(b.mesh);
      return b;
    };
    this.batches = {};
    if (pal === 'forest') {
      this.batches.oak1 = B(treeSprite('oak', 1), 200);
      this.batches.oak2 = B(treeSprite('oak', 2), 200);
      this.batches.oak3 = B(treeSprite('oak', 7, 'autumn'), 80);
      this.batches.pine = B(pineSprite(4), 260);
      this.batches.pine2 = B(pineSprite(9), 260);
      this.batches.bush = B(treeSprite('bush', 5), 300);
      this.batches.grave = B(gravestoneSprite(2), 120);
      this.batches.grave2 = B(gravestoneSprite(5), 120);
      this.batches.tall = B(tallGrassSprite(3), 900, { shadow: false, emissive: 0.1 });
      this.batches.tuft = B(grassTuft(3), 1600, { shadow: false, emissive: 0.1 });
      this.batches.tuft2 = B(grassTuft(9, '#5a9a4a'), 1600, { shadow: false, emissive: 0.1 });
      this.batches.flower = B(flowerSprite(2), 600, { shadow: false, emissive: 0.2 });
      this.batches.flower2 = B(flowerSprite(5), 600, { shadow: false, emissive: 0.2 });
    } else if (pal === 'frost') {
      this.batches.pine = B(pineSprite(4, true), 300);
      this.batches.pine2 = B(pineSprite(8, true), 300);
      this.batches.dead = B(treeSprite('dead', 3, 'snow'), 120);
      this.batches.bush = B(treeSprite('bush', 5, 'snow'), 200);
      this.batches.tuft = B(grassTuft(3, '#8aa0b8'), 800, { shadow: false, emissive: 0.1 });
    } else {
      this.batches.dead = B(treeSprite('dead', 3), 160);
      this.batches.tuft = B(grassTuft(3, '#5a4a52'), 600, { shadow: false, emissive: 0.1 });
    }
    this.batches.lantern = B(lanternPost(), 120, { emissive: 0.3 });

    this.ambient = new Ambient(this.scene, st.ambient);
    this.buildMist();
    this.glowTex = new THREE.CanvasTexture(glowCanvas(64, '#ffc87a'));
    if (town) {
      this.ensureBatch('basket', basketSprite(3), 24);
      this.ensureBatch('basket2', basketSprite(8), 24);
      this.ensureBatch('sack', sackSprite(), 24);
      buildTown(this);
    } else if (camp) this.buildCamp();
    this.lastChunkKey = '';
  }

  // fog banks drifting at the edges of the diorama
  buildMist() {
    const texes = [1, 2, 3].map((k) => new THREE.CanvasTexture(mistCanvas(128, k * 7)));
    this.mist = new THREE.Group();
    const spots = this.town
      ? [[-26, 5, -8], [-24, 6, -22], [26, 5, -12], [24, 6, -26], [-12, 7, -34], [14, 7, -34], [-28, 3, 10], [28, 3, 8]]
      : [[-24, 4, -6], [-22, 3, -18], [24, 4, -10], [22, 3, -22], [0, 5, -30], [-12, 4, -28], [14, 4, -30], [-26, 2, 10], [26, 2, 8], [0, 6, 14]];
    spots.forEach(([x, y, z], i) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: texes[i % 3], transparent: true, depthWrite: false, opacity: 0.5, fog: false }));
      const sc = 14 + (i % 3) * 5;
      m.scale.set(sc, sc * 0.55, 1);
      m.position.set(x, y, z);
      m.userData = { x, o: 0.22 + (i % 4) * 0.06, sp: 0.03 + (i % 5) * 0.01, ph: i * 1.7 };
      this.mist.add(m);
    });
    this.group.add(this.mist);
  }

  // (legacy) soft light shafts as additive planes
  buildRays() {
    const tex = new THREE.CanvasTexture(beamCanvas());
    this.rays = new THREE.Group();
    const spots = [[-9, -9, 3.2], [-3, -12, 2.4], [4, -10, 3.6], [11, -13, 2.6], [-14, -4, 2.8], [8, -4, 2.2]];
    for (const [x, z, w] of spots) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 16), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.12, fog: false, side: THREE.DoubleSide }));
      m.position.set(x, 6.5, z);
      m.rotation.set(-0.35, 0.25, 0.42);
      this.rays.add(m);
    }
    this.group.add(this.rays);
  }

  clear() {
    this.rays = null;
    this.mist = null;
    if (this.ambient) this.ambient.dispose(this.scene);
    this.ambient = null;
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.lightSources = [];
    this.animated = [];
  }

  // ---------------------------------------------------------------- chunked props
  chunkProps(cx, cz) {
    const st = this.stage;
    const seed = 911 + STAGES.indexOf(st) * 7;
    const out = { group: new THREE.Group(), lights: [], billboards: [] };
    const h = (k) => hash2(cx * 31 + k, cz * 17 - k * 3, seed);
    const pal = st.props;
    const clearR = this.camp ? 10 : 6;
    // keep the camp clearing open and leave a lane in front of the lobby camera
    const free = (x, z) => Math.hypot(x, z) > clearR && !(this.camp && z > 1.5 && z < 12 && Math.abs(x) < 9);
    const bb = (name, x, z, s = 1, flip = false) => {
      if (this.batches[name] && free(x, z)) out.billboards.push([name, x, z, s, flip]);
    };
    const add3d = (mesh, x, z, ry = 0) => {
      if (!free(x, z)) return false;
      mesh.position.x = x;
      mesh.position.z = z;
      if (ry) mesh.rotation.y = ry;
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      out.group.add(mesh);
      return true;
    };
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // grove mask: some chunks are dense woods, most are open meadow to fight in
    const grove = hash2(Math.floor(cx / 2), Math.floor(cz / 2), seed + 5);
    // grass, tall grass, flowers
    const nT = pal === 'crypt' ? 8 : pal === 'frost' ? 18 : 40;
    for (let i = 0; i < nT; i++) bb(h(i * 3 + 3) < 0.5 ? 'tuft' : 'tuft2', x0 + h(i * 3 + 1) * CHUNK, z0 + h(i * 3 + 2) * CHUNK, 0.8 + h(i + 99) * 0.5, h(i + 77) < 0.5);
    if (pal === 'forest') {
      for (let i = 0; i < 16; i++) bb('tall', x0 + h(i * 5 + 701) * CHUNK, z0 + h(i * 5 + 702) * CHUNK, 0.8 + h(i + 703) * 0.5, h(i + 704) < 0.5);
      for (let i = 0; i < 12; i++) bb(h(i + 500) < 0.5 ? 'flower' : 'flower2', x0 + h(i * 5 + 501) * CHUNK, z0 + h(i * 5 + 502) * CHUNK, 1);
    }
    // trees
    const nTrees = grove > 0.78 ? 6 + Math.floor(h(1000) * 5) : grove > 0.5 ? 1 + Math.floor(h(1000) * 3) : (h(1001) < 0.4 ? 1 : 0);
    for (let i = 0; i < nTrees; i++) {
      const x = x0 + h(i * 7 + 1100) * CHUNK, z = z0 + h(i * 7 + 1101) * CHUNK;
      const r = h(i * 7 + 1102);
      const s = 0.9 + h(i * 7 + 1103) * 0.35;
      const flip = h(i + 1200) < 0.5;
      if (pal === 'forest') bb(r < 0.3 ? 'pine' : r < 0.55 ? 'pine2' : r < 0.78 ? 'oak1' : r < 0.93 ? 'oak2' : 'oak3', x, z, s, flip);
      else if (pal === 'frost') bb(r < 0.45 ? 'pine' : r < 0.85 ? 'pine2' : 'dead', x, z, s, flip);
      else bb('dead', x, z, s, flip);
    }
    for (let i = 0; i < 3; i++) if (h(i + 1300) < 0.55) bb('bush', x0 + h(i * 3 + 1301) * CHUNK, z0 + h(i * 3 + 1302) * CHUNK, 0.9 + h(i + 1310) * 0.4, h(i + 1311) < 0.5);
    // dappled light: invisible canopy silhouettes high above the woods
    if (pal !== 'crypt') {
      const nc = grove > 0.45 ? 3 : 1;
      for (let i = 0; i < nc; i++) out.group.add(this.canopyCaster(x0 + h(1900 + i) * CHUNK, z0 + h(1910 + i) * CHUNK, 6 + h(1920 + i) * 5, i + cx * 3 + cz));
    }
    // mossy boulders
    for (let i = 0; i < 3; i++) if (h(1500 + i) < 0.4) add3d(this.rock(0.3 + h(1510 + i) * 0.55, i + cx * 3 + cz), x0 + h(1520 + i) * CHUNK, z0 + h(1530 + i) * CHUNK);
    // a stretch of sandy path with stepping stones
    if (h(1550) < 0.32 && pal !== 'crypt') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 10), this.pathMat);
      m.rotation.set(-Math.PI / 2, 0, h(1551) * Math.PI);
      m.position.set(x0 + 6, 0.012, z0 + 6);
      m.receiveShadow = true;
      out.group.add(m);
    }
    // wooden fence runs
    if (h(1560) < 0.24 && pal !== 'crypt') {
      const n = 3 + Math.floor(h(1561) * 4);
      const ang = h(1562) < 0.5 ? 0 : Math.PI / 2;
      const fx0 = x0 + 2 + h(1563) * 6, fz0 = z0 + 2 + h(1564) * 6;
      for (let k = 0; k < n; k++) {
        if (h(1570 + k) < 0.12) continue; // broken gaps
        const fx = fx0 + Math.cos(ang) * k * 1.6, fz = fz0 + Math.sin(ang) * k * 1.6;
        add3d(this.fence(1.6), fx, fz, -ang);
      }
    }
    // a forgotten graveyard
    if (h(1600) < 0.1 && pal === 'forest') {
      const gx = x0 + 3 + h(1601) * 6, gz = z0 + 3 + h(1602) * 6;
      for (let k = 0; k < 6; k++) bb(h(1610 + k) < 0.5 ? 'grave' : 'grave2', gx + (k % 3) * 1.6 - 1.6 + (h(1620 + k) - 0.5) * 0.4, gz + Math.floor(k / 3) * 1.8, 1, h(1630 + k) < 0.5);
      for (let k = 0; k < 4; k++) add3d(this.fence(1.6), gx - 2.6 + k * 1.6, gz - 1.4);
    }
    // ruins
    if (h(1400) < (pal === 'crypt' ? 0.55 : 0.2)) {
      const rx = x0 + 2 + h(1401) * (CHUNK - 4), rz = z0 + 2 + h(1402) * (CHUNK - 4);
      const n = 1 + Math.floor(h(1403) * 3);
      for (let i = 0; i < n; i++) add3d(this.pillar(1.2 + h(1410 + i) * (pal === 'crypt' ? 3.2 : 2.2), h(1420 + i) < 0.5), rx + (h(1430 + i) - 0.5) * 4, rz + (h(1440 + i) - 0.5) * 3);
      if (h(1450) < 0.5) add3d(this.wall(2 + h(1451) * 2.5, 0.8 + h(1452) * 1.4), rx + (h(1453) - 0.5) * 3, rz - 1.4);
    }
    if (pal === 'frost' && h(1650) < 0.3) {
      const x = x0 + h(1652) * CHUNK, z = z0 + h(1653) * CHUNK;
      if (add3d(this.crystal(0.8 + h(1651) * 1.2), x, z)) out.lights.push({ x, y: 1, z, color: 0x7ad8ff, intensity: 1.2, range: 6, flicker: 0 });
    }
    if (pal === 'crypt' && h(1700) < 0.4) {
      const x = x0 + h(1701) * CHUNK, z = z0 + h(1702) * CHUNK;
      if (add3d(this.brazier(), x, z)) out.lights.push({ x, y: 1.4, z, color: 0xff7a3a, intensity: 2.2, range: 8, flicker: 1 });
    }
    if (h(1800) < 0.12) {
      const x = x0 + h(1801) * CHUNK, z = z0 + h(1802) * CHUNK;
      if (free(x, z)) {
        bb('lantern', x, z, 1);
        out.lights.push({ x, y: 2.3, z: z + 0.02, color: 0xffc070, intensity: 1.6, range: 7, flicker: 0.4 });
      }
    }
    return out;
  }

  fence(len) {
    const grp = new THREE.Group();
    const post = new THREE.BoxGeometry(0.14, 0.95, 0.14);
    post.translate(0, 0.47, 0);
    for (const x of [-len / 2, len / 2]) {
      const m = new THREE.Mesh(post, this.woodMat);
      m.position.x = x;
      grp.add(m);
    }
    for (const y of [0.35, 0.72]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.06), this.woodMat);
      rail.position.y = y;
      grp.add(rail);
    }
    return grp;
  }

  ensureBatch(name, pix, cap = 32, opts = {}) {
    if (this.batches[name]) return this.batches[name];
    const b = new SpriteBatch(pix, cap, opts);
    this.group.add(b.mesh);
    this.batches[name] = b;
    return b;
  }

  updateChunks(fx, fz) {
    const ccx = Math.floor(fx / CHUNK), ccz = Math.floor(fz / CHUNK);
    const key = this.town ? 'town' : ccx + ',' + ccz;
    if (key === this.lastChunkKey) return;
    this.lastChunkKey = key;
    if (this.town) {
      for (const b of Object.values(this.batches)) b.reset();
      for (const [name, x, z, sc, flip, y] of this.campBillboards || []) this.batches[name]?.add(x, z, sc, flip, y || 0);
      for (const b of Object.values(this.batches)) b.commit();
      this.lightSources = [...(this.campLights || [])];
      return;
    }
    const want = new Set();
    for (let dz = -CHUNK_RANGE; dz <= CHUNK_RANGE; dz++) {
      for (let dx = -CHUNK_RANGE - 1; dx <= CHUNK_RANGE + 1; dx++) want.add(`${ccx + dx},${ccz + dz}`);
    }
    for (const [k, c] of this.chunks) {
      if (!want.has(k)) {
        this.disposeChunk(c);
        this.chunks.delete(k);
      }
    }
    for (const k of want) {
      if (this.chunks.has(k)) continue;
      const [cx, cz] = k.split(',').map(Number);
      const c = this.chunkProps(cx, cz);
      this.group.add(c.group);
      this.chunks.set(k, c);
    }
    // rebuild billboard batches from the active chunks
    for (const b of Object.values(this.batches)) b.reset();
    this.lightSources = this.campLights ? [...this.campLights] : [];
    for (const c of this.chunks.values()) {
      for (const [name, x, z, s, flip] of c.billboards) this.batches[name].add(x, z, s, flip);
      this.lightSources.push(...c.lights);
    }
    if (this.campBillboards) for (const [name, x, z, sc, flip, y] of this.campBillboards) this.batches[name]?.add(x, z, sc, flip, y || 0);
    for (const b of Object.values(this.batches)) b.commit();
  }

  disposeChunk(c) {
    this.group.remove(c.group);
  }

  // ---------------------------------------------------------------- 3D prop builders
  pillar(h, broken) {
    const g = new THREE.CylinderGeometry(0.42, 0.5, h, 8, 1);
    g.translate(0, h / 2, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * h * 0.9);
    const m = new THREE.Mesh(g, this.stoneMat);
    const grp = new THREE.Group();
    grp.add(m);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), this.stoneMat);
    base.position.y = 0.15;
    base.castShadow = base.receiveShadow = true;
    grp.add(base);
    if (!broken) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 1.15), this.stoneMat);
      cap.position.y = h + 0.14;
      cap.castShadow = true;
      grp.add(cap);
    } else {
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), this.stoneMat);
      chunk.position.set(0.7, 0.25, 0.4);
      chunk.castShadow = true;
      grp.add(chunk);
    }
    m.castShadow = m.receiveShadow = true;
    grp.rotation.y = Math.random() * Math.PI;
    return grp;
  }

  wall(w, h) {
    const g = new THREE.BoxGeometry(w, h, 0.6);
    g.translate(0, h / 2, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.8, uv.getY(i) * h * 0.8);
    const m = new THREE.Mesh(g, this.stoneMat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  rock(s, seed) {
    const g = new THREE.DodecahedronGeometry(s, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-s * 0.2, p.getY(i)) * 0.7);
    g.computeVertexNormals();
    g.translate(0, s * 0.25, 0);
    const m = new THREE.Mesh(g, this.rockMat || this.stoneMat);
    m.rotation.y = seed;
    return m;
  }

  crystal(s) {
    const g = new THREE.OctahedronGeometry(s * 0.5, 0);
    g.scale(0.6, 1.6, 0.6);
    g.translate(0, s * 0.8, 0);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x9ae4ff, emissive: 0x2a8ad0, emissiveIntensity: 0.9, flatShading: true }));
    return m;
  }

  brazier() {
    const grp = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0x4a4050 }));
    bowl.position.y = 1.0;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.9, 6), new THREE.MeshLambertMaterial({ color: 0x3a3040 }));
    leg.position.y = 0.45;
    grp.add(bowl, leg);
    const fire = this.fireSprite(1.0);
    fire.position.y = 1.05;
    grp.add(fire);
    return grp;
  }

  fireSprite(scale = 1) {
    if (!this.fireTex) {
      this.fireTex = pixTexture(campfireSheet());
      this.fireTex.repeat.set(0.25, 1);
    }
    const tex = this.fireTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(0.25, 1);
    const m = new THREE.Mesh(spriteGeometry(32 * scale, 32 * scale), new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    m.rotation.x = -SPRITE_TILT;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    glow.scale.set(2.2 * scale, 2.2 * scale, 1);
    glow.position.y = 0.8 * scale;
    m.add(glow);
    const off = Math.random() * 10;
    this.animated.push((t) => {
      tex.offset.x = (Math.floor(t * 9 + off) % 4) * 0.25;
      glow.material.opacity = 0.5 + Math.sin(t * 13 + off) * 0.08 + Math.sin(t * 7.3) * 0.06;
    });
    return m;
  }

  // ---------------------------------------------------------------- the lobby camp
  barrel(x, z, s = 1) {
    if (!this.staveMat) {
      const t = pixTexture(staveTexture());
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      this.staveMat = new THREE.MeshLambertMaterial({ map: t });
      this.lidMat = new THREE.MeshLambertMaterial({ color: 0x6a4428 });
    }
    const g = new THREE.CylinderGeometry(0.36 * s, 0.32 * s, 0.9 * s, 10);
    g.translate(0, 0.45 * s, 0);
    const m = new THREE.Mesh(g, [this.staveMat, this.lidMat, this.lidMat]);
    m.position.set(x, 0, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  crate(x, z, s = 1, ry = 0, y = 0) {
    if (!this.crateMat) this.crateMat = new THREE.MeshLambertMaterial({ map: pixTexture(crateTexture()) });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8 * s, 0.8 * s, 0.8 * s), this.crateMat);
    m.position.set(x, y + 0.4 * s, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  pot(x, z, s = 1) {
    if (!this.potMat) this.potMat = new THREE.MeshLambertMaterial({ map: pixTexture(terracottaTexture()) });
    const pts = [[0, 0], [0.18, 0], [0.3, 0.12], [0.34, 0.32], [0.26, 0.52], [0.16, 0.6], [0.2, 0.68], [0.18, 0.7]].map(([r, y]) => new THREE.Vector2(r * s, y * s));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 9), this.potMat);
    m.position.set(x, 0, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  stall(x, z, ry, clothA, clothB) {
    const grp = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6);
    post.translate(0, 1.15, 0);
    for (const [px, pz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) {
      const m = new THREE.Mesh(post, this.woodMat);
      m.position.set(px, 0, pz);
      m.castShadow = true;
      grp.add(m);
    }
    const tex = pixTexture(clothTexture(32, clothA, clothB));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.7), new THREE.MeshLambertMaterial({ map: tex }));
    awn.position.y = 2.3;
    awn.rotation.x = 0.18;
    awn.castShadow = true;
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 1.0), this.woodMat);
    table.position.set(0, 0.8, 0.1);
    table.castShadow = table.receiveShadow = true;
    grp.add(awn, table);
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    return grp;
  }

  steps(x, z, w, n, ry = 0) {
    const grp = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(w, 0.25, 0.5);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w * 0.6, uv.getY(k) * 0.3);
      const m = new THREE.Mesh(g, this.stoneMat);
      m.position.set(0, 0.125 + i * 0.25, -i * 0.5);
      m.castShadow = m.receiveShadow = true;
      grp.add(m);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    return grp;
  }

  // raised stone terrace: retaining wall + walkable top
  terrace(x, z, w, d, h) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w * 0.8, uv.getY(k) * h * 0.8);
    const top = this.cobbleMat || (this.cobbleMat = (() => {
      const t = pixTexture(cobbleTexture(128, '#9a8a74', 9));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshLambertMaterial({ map: t });
    })());
    const m = new THREE.Mesh(g, [this.stoneMat, this.stoneMat, top, this.stoneMat, this.stoneMat, this.stoneMat]);
    m.position.set(x, 0, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  torch(x, y, z) {
    const fire = this.fireSprite(0.55);
    fire.position.set(x, y, z);
    this.campLights.push({ x, y: y + 0.5, z: z + 0.2, color: 0xffa050, intensity: 2.2, range: 7, flicker: 1 });
    return fire;
  }

  // invisible leaf silhouettes high above the ground: they only cast shadows (dappled sunlight)
  canopyCaster(x, z, size, seed) {
    if (!this.canopyTex) this.canopyTex = [1, 2, 3].map((k) => new THREE.CanvasTexture(canopyCanvas(128, k * 13)));
    const tex = this.canopyTex[Math.abs(Math.floor(seed * 7)) % 3];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = seed;
    m.position.set(x, 13, z);
    m.castShadow = true;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: tex, alphaTest: 0.5 });
    return m;
  }

  bokeh(n, x0, x1, z0, z1, y0, y1) {
    if (!this.bokehTex) this.bokehTex = new THREE.CanvasTexture(bokehCanvas());
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bokehTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.2, fog: false }));
      const s = 0.5 + Math.random() * 1.1;
      sp.scale.set(s, s, 1);
      sp.position.set(x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), z0 + Math.random() * (z1 - z0));
      const ph = Math.random() * 10, sp0 = 0.08 + Math.random() * 0.16;
      this.animated.push((t) => { sp.material.opacity = sp0 * (0.55 + 0.45 * Math.sin(t * 0.8 + ph)) * (0.4 + this.lanternK * 0.3); });
      this.group.add(sp);
    }
  }

  pond(x, z, w, d) {
    const wt = pixTexture(waterTexture());
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    wt.repeat.set(w / 4, d / 4);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.25, metalness: 0.15, emissive: 0x0a2a2a, emissiveIntensity: 0.6 }));
    water.scale.set(w / 2, d / 2, 1);
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, 0.015, z);
    water.receiveShadow = true;
    this.group.add(water);
    this.animated.push((t) => { wt.offset.set(t * 0.02, Math.sin(t * 0.4) * 0.03); });
    // mossy bank rocks
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = this.rock(0.25 + Math.random() * 0.3, i);
      r.position.set(x + Math.cos(a) * w / 2 * 1.02, 0, z + Math.sin(a) * d / 2 * 1.04);
      r.castShadow = r.receiveShadow = true;
      this.group.add(r);
    }
  }

  bridge(x, z, span, width = 1.6) {
    const grp = new THREE.Group();
    const N = 11;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      const xa = -span / 2 + span * u0, xb = -span / 2 + span * u1;
      const ya = Math.sin(u0 * Math.PI) * 1.1, yb = Math.sin(u1 * Math.PI) * 1.1;
      const len = Math.hypot(xb - xa, yb - ya) + 0.04;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, width), this.stoneMat);
      seg.position.set((xa + xb) / 2, (ya + yb) / 2 + 0.2, 0);
      seg.rotation.z = Math.atan2(yb - ya, xb - xa);
      seg.castShadow = seg.receiveShadow = true;
      grp.add(seg);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 0.16), this.stoneMat);
        rail.position.set((xa + xb) / 2, (ya + yb) / 2 + 0.55, (side * width) / 2);
        rail.rotation.z = seg.rotation.z;
        rail.castShadow = true;
        grp.add(rail);
      }
    }
    grp.position.set(x, 0, z);
    return grp;
  }

  buildCamp() {
    const g = this.group;
    this.campLights = [];
    // sandy clearing with a ragged dithered edge into the grass
    const dirt = groundTexture('dirt', 128, 11);
    const S = 256;
    const mask = new Pix(S, S);
    const n = noise2(5);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot((x - S / 2) / (S / 2), (y - S / 2) / (S * 0.36)) + (n(x / 20, y / 20, 13) - 0.5) * 0.36;
      if (d < 0.74 || (d < 0.95 && Pix.dither(x, y, (0.95 - d) / 0.21))) mask.set(x, y, dirt.get(x % 128, y % 128));
    }
    const clearing = new THREE.Mesh(new THREE.PlaneGeometry(S / 16, S / 16), new THREE.MeshLambertMaterial({ map: pixTexture(mask), transparent: true, alphaTest: 0.5 }));
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(0, 0.01, -0.6);
    clearing.receiveShadow = true;
    g.add(clearing);
    // campfire with a cooking pot on a tripod
    const fire = this.fireSprite(0.9);
    fire.position.set(0, 0, -1.3);
    g.add(fire);
    this.campLights.push({ x: 0, y: 1.1, z: -0.9, color: 0xff8a3a, intensity: 4.2, range: 11, flicker: 1 });
    // logs to sit on + a bedroll
    for (const [x, z, ry, len] of [[-3.0, -1.2, 0.35, 2.2], [-0.6, -4.0, 1.45, 2.6], [3.2, -2.6, -0.5, 1.8]]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, len, 8), this.woodMat);
      log.rotation.set(0, ry, Math.PI / 2);
      log.position.set(x, 0.25, z);
      log.castShadow = log.receiveShadow = true;
      g.add(log);
    }
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 10), new THREE.MeshLambertMaterial({ map: pixTexture(clothTexture(32, '#8a3a32', '#b8584a')) }));
    roll.rotation.set(0, 0.2, Math.PI / 2);
    roll.position.set(-4.4, 0.22, 0.6);
    roll.castShadow = roll.receiveShadow = true;
    g.add(roll);
    g.add(this.barrel(4.3, -0.4), this.crate(4.9, 0.5, 0.75, 0.3), this.pot(3.6, 0.7, 0.8));
    // the pond with an old stone bridge in the background
    this.pond(0.5, -12.5, 17, 6.5);
    g.add(this.bridge(1.5, -12.6, 8));
    for (const [x, z, h, b] of [[-8.6, -9.4, 3.2, false], [9.6, -9.8, 2.2, true], [-6.2, -15.8, 3.8, false]]) {
      const p = this.pillar(h, b);
      p.position.set(x, 0, z);
      g.add(p);
    }
    // dappled light through the canopy over the camp
    const casters = [[-9, -6, 9], [-2, -9, 7], [5, -8, 8], [-12, 0, 8], [10, -3, 9], [-5, 3, 6], [7, 4, 7], [1, -15, 9], [-14, -12, 9], [13, -12, 8]];
    casters.forEach(([x, z, sz], i) => g.add(this.canopyCaster(x, z, sz, i)));
    this.bokeh(26, -14, 16, -20, -9, 0.6, 4.5);
    if (!this.batches.tripod) {
      const B = (pix, cap, o) => { const b = new SpriteBatch(pix, cap, o); this.group.add(b.mesh); return b; };
      this.batches.tripod = B(tripodSprite(), 2, { emissive: 0.1 });
      this.batches.stump = B(stumpLantern(), 4, { emissive: 0.35 });
    }
    this.campBillboards = [
      ['tripod', 0, -1.45, 1, false], ['stump', 3.6, 1.6, 1, false],
      ['oak1', 8.2, 3.4, 1.25, true], ['pine', -8.6, 3.0, 1.2, false], ['bush', 6.4, 2.0, 1.1, false], ['bush', -6.6, 1.6, 1, true],
      ['bush', -5.8, -3.6, 1.1, false], ['bush', 5.6, -4.4, 1, true], ['bush', -2.8, -6.6, 0.9, false], ['bush', 3.4, -6.8, 1, true],
      ['oak2', -11, -7, 1.2, false], ['oak1', 11.5, -6.5, 1.2, true], ['pine', -15, -10, 1.25, false], ['oak3', -9.5, -16.5, 1.15, true],
      ['oak2', 9, -17, 1.2, false], ['pine', 15.5, -12, 1.2, true], ['oak1', 2.5, -19, 1.3, false], ['pine', -3.5, -18.5, 1.2, true],
      ['oak2', -16.5, -3, 1.15, true], ['oak1', 16.5, -1.5, 1.2, false],
      ['lantern', -5.4, 2.6, 1, false],
    ];
    this.campLights.push(
      { x: 3.6, y: 0.9, z: 1.62, color: 0xffd080, intensity: 1.8, range: 6, flicker: 0.3 },
      { x: -5.4, y: 2.3, z: 2.62, color: 0xffc070, intensity: 1.5, range: 7, flicker: 0.4 },
    );
  }

  // ---------------------------------------------------------------- per frame
  setTimeOfDay(t) {
    this.tod = t;
  }

  update(dt, t, fx, fz) {
    // ground follows the camera focus, texture stays anchored to the world
    if (this.ground && this.ground.visible) {
      this.ground.position.set(fx, 0, fz);
      const tile = this.groundTile, size = this.groundSize;
      this.groundTex.offset.set((fx - size / 2) / tile, (-fz - size / 2) / tile);
    }
    this.updateChunks(fx, fz);
    // lighting
    const st = this.stage ? this.stage.id : 'verdant';
    const tint = STAGE_TINT[st] || STAGE_TINT.verdant;
    const P = (k) => ({ ...LIGHT[k], ...tint[k] });
    const L = this.tod < 0.5 ? lerpPreset(P('day'), P('dusk'), this.tod / 0.5) : lerpPreset(P('dusk'), P('night'), (this.tod - 0.5) / 0.5);
    this.sun.color.setHex(L.sun);
    this.sun.intensity = L.sunI;
    this.hemi.color.setHex(L.sky);
    this.hemi.groundColor.setHex(L.ground);
    this.hemi.intensity = L.hemiI;
    this.scene.fog.color.setHex(L.fog);
    this.scene.fog.near = L.fogN;
    this.scene.fog.far = L.fogF;
    this.scene.background = this.bgColor || (this.bgColor = new THREE.Color());
    this.scene.background.setHex(L.fog);
    this.R.r.toneMappingExposure = L.exposure;
    this.R.bloom.strength = L.bloom;
    this.R.grade.uniforms.warmth.value = L.warmth;
    this.lanternK = L.lantern;
    // the sun comes from the front-left so sprites facing the camera are lit, shadows fall behind
    const elev = 0.9 - this.tod * 0.45;
    // fields: light from the upper-left behind (shadows fall toward the viewer, like Octopath's
    // meadows); town: light from the front-left so the facades glow
    if (this.town) this.sun.position.set(fx - 15, 13 + elev * 15, fz + 11);
    else this.sun.position.set(fx - 16, 12 + elev * 16, fz - 9);
    this.sun.target.position.set(fx, 0, fz);
    // point light pool: nearest light sources + dynamic lights
    const cand = [];
    for (const s of this.lightSources) {
      const d = (s.x - fx) ** 2 + (s.z - fz) ** 2;
      if (d < 26 * 26) cand.push([d, s]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    let i = 0;
    for (const s of this.dynamicLights) {
      if (i >= this.pool.length) break;
      this.applyLight(this.pool[i++], s, t);
    }
    for (const [, s] of cand) {
      if (i >= this.pool.length) break;
      this.applyLight(this.pool[i++], s, t);
    }
    for (; i < this.pool.length; i++) this.pool[i].intensity = 0;
    for (const f of this.animated) f(t, dt);
    // volumetric sun shafts + drifting mist banks
    if (this.R.vol) {
      this.R.vol.strength = L.rays * (this.town ? 0.35 : this.stage.props === 'crypt' ? 0.5 : 0.6);
      this.R.vol.color.setHex(L.sun).lerp(new THREE.Color(1, 0.9, 0.7), 0.4);
      this.R.vol.density = 0.085;
      this.R.vol.falloff = 0.05;
      this.R.vol.haze = 0.012;
      this.R.vol.gapCut = 0.6;
    }
    // trees in front of the party turn see-through
    STIPPLE.focus.value.set(fx, 0, fz);
    if (this.mist) {
      this.mist.position.set(fx, 0, fz);
      this.mist.children.forEach((m, k) => {
        const d = m.userData;
        m.position.x = d.x + Math.sin(t * d.sp + d.ph) * 2.5;
        m.material.opacity = d.o * (0.75 + 0.25 * Math.sin(t * 0.2 + d.ph));
        m.material.color.setHex(L.fog).lerp(new THREE.Color(1, 1, 1), 0.35);
      });
    }
    if (this.ambient) {
      const amb = this.stage.ambient === 'fireflies' ? Math.min(1, 0.25 + this.tod * 1.2) : 1;
      this.ambient.update(dt, t, fx, fz, amb);
    }
  }

  applyLight(l, s, t) {
    l.position.set(s.x, s.y, s.z);
    l.color.setHex(s.color);
    l.distance = s.range;
    const fl = s.flicker ? 1 + (Math.sin(t * 11 + s.x) * 0.08 + Math.sin(t * 23.7 + s.z) * 0.06) * s.flicker : 1;
    l.intensity = s.intensity * fl * (s.dynamic ? 1 : 0.5 + this.lanternK * 0.5);
  }
}
