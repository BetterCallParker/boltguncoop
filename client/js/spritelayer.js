// Instanced sprite layers: thousands of pixel sprites (monsters, gems, projectiles, particles,
// damage numbers) in one draw call each. Every instance carries its own position, size, atlas
// rect, tint/alpha and effects (hit flash, frost, in-plane rotation), so nothing is re-uploaded
// except one interleaved buffer per frame.
import * as THREE from 'three';
import { SPRITE_TILT } from './world.js';

const STRIDE = 17; // pos3 size2 uv4 col4 fx4

// 4x4 ordered dither: fades are screen-door so sprites stay opaque and need no sorting
const DITHER = /* glsl */ `
  float lbDither(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    float m = 0.0;
    if (i < 1.0) m = 0.0; else if (i < 2.0) m = 8.0; else if (i < 3.0) m = 2.0; else if (i < 4.0) m = 10.0;
    else if (i < 5.0) m = 12.0; else if (i < 6.0) m = 4.0; else if (i < 7.0) m = 14.0; else if (i < 8.0) m = 6.0;
    else if (i < 9.0) m = 3.0; else if (i < 10.0) m = 11.0; else if (i < 11.0) m = 1.0; else if (i < 12.0) m = 9.0;
    else if (i < 13.0) m = 15.0; else if (i < 14.0) m = 7.0; else if (i < 15.0) m = 13.0; else m = 5.0;
    return (m + 0.5) / 16.0;
  }`;

const ATTRS = /* glsl */ `
  attribute vec3 iPos;
  attribute vec2 iSize;
  attribute vec4 iUV;
  attribute vec4 iCol;
  attribute vec4 iFx;
  uniform float uTilt;
  varying vec4 vCol;
  varying vec4 vFx;`;

const PLACE = /* glsl */ `
  float lbC = cos(iFx.z), lbS = sin(iFx.z);
  vec2 lbP = vec2(position.x * iSize.x, position.y * iSize.y);
  lbP = vec2(lbP.x * lbC - lbP.y * lbS, lbP.x * lbS + lbP.y * lbC);
  vec3 transformed = iPos + vec3(lbP.x, lbP.y * cos(uTilt), -lbP.y * sin(uTilt));`;

const UVS = /* glsl */ `
  vec2 lbUv = vec2(iUV.z < 0.0 ? 1.0 - uv.x : uv.x, uv.y);
  vCol = iCol;
  vFx = iFx;`;

function patchLit(m, tilt, emissive) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTilt = tilt;
    sh.uniforms.uEmissive = emissive;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + ATTRS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + UVS + '\n#ifdef USE_MAP\nvMapUv = iUV.xy + lbUv * abs(iUV.zw);\n#endif')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, sin(uTilt), cos(uTilt));')
      .replace('#include <begin_vertex>', PLACE);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vCol;\nvarying vec4 vFx;\nuniform float uEmissive;\n' + DITHER)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= vCol.rgb;
        float lbL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.72, 1.0) * (0.55 + lbL * 1.1), vFx.y * 0.8);`)
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (vCol.a < 0.999 && lbDither(gl_FragCoord.xy) >= vCol.a) discard;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * uEmissive + vec3(1.0, 0.96, 0.9) * vFx.x * 1.25 + vec3(0.15, 0.4, 0.8) * vFx.y * 0.25;');
  };
  m.customProgramCacheKey = () => 'lbSpriteLit';
}

function patchDepth(m, tilt) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTilt = tilt;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + ATTRS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + UVS + '\n#ifdef USE_MAP\nvMapUv = iUV.xy + lbUv * abs(iUV.zw);\n#endif')
      .replace('#include <begin_vertex>', PLACE);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vCol;\nvarying vec4 vFx;\n' + DITHER)
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (vCol.a < 0.999 && lbDither(gl_FragCoord.xy) >= vCol.a) discard;');
  };
  m.customProgramCacheKey = () => 'lbSpriteDepth';
}

const UNLIT_VS = /* glsl */ `
  ${ATTRS}
  uniform float uBillboard;
  varying vec2 vUv;
  void main() {
    float lbC = cos(iFx.z), lbS = sin(iFx.z);
    vec2 lbP = vec2(position.x * iSize.x, position.y * iSize.y);
    lbP = vec2(lbP.x * lbC - lbP.y * lbS, lbP.x * lbS + lbP.y * lbC);
    if (uBillboard > 0.5) {
      vec4 mv = viewMatrix * vec4(iPos, 1.0);
      mv.xy += lbP;
      gl_Position = projectionMatrix * mv;
    } else {
      vec3 p = iPos + vec3(lbP.x, lbP.y * cos(uTilt), -lbP.y * sin(uTilt));
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
    ${UVS}
    vUv = iUV.xy + lbUv * abs(iUV.zw);
  }`;

const UNLIT_FS = /* glsl */ `
  uniform sampler2D map;
  uniform float uDither;
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec4 vFx;
  ${DITHER}
  void main() {
    vec4 t = texture2D(map, vUv);
    vec4 c = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
    if (uDither > 0.5) {
      if (t.a < 0.5 || lbDither(gl_FragCoord.xy) >= vCol.a) discard;
      c.a = 1.0;
    } else if (c.a < 0.004) discard;
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`;

export class SpriteLayer {
  // opts.lit: Lambert-lit (scene lights, fog, shadows) vs unlit (glows, particles, UI numbers)
  constructor(tex, cap, opts = {}) {
    const {
      lit = false, shadow = false, blending = 'normal', anchor = 'bottom', tilt = SPRITE_TILT, emissive = 0.25,
      billboard = false, dither = false, depthTest = true, renderOrder = 0, alphaTest = 0.5,
    } = opts;
    this.cap = cap;
    this.count = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    if (anchor === 'bottom') base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    g.setAttribute('normal', base.getAttribute('normal'));
    this.data = new Float32Array(cap * STRIDE);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    this.buf = buf;
    g.setAttribute('iPos', new THREE.InterleavedBufferAttribute(buf, 3, 0));
    g.setAttribute('iSize', new THREE.InterleavedBufferAttribute(buf, 2, 3));
    g.setAttribute('iUV', new THREE.InterleavedBufferAttribute(buf, 4, 5));
    g.setAttribute('iCol', new THREE.InterleavedBufferAttribute(buf, 4, 9));
    g.setAttribute('iFx', new THREE.InterleavedBufferAttribute(buf, 4, 13));
    g.instanceCount = 0;
    this.geo = g;
    this.tilt = { value: tilt };
    if (lit) {
      this.emissive = { value: emissive };
      const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest, side: THREE.DoubleSide });
      patchLit(m, this.tilt, this.emissive);
      this.mat = m;
    } else {
      const m = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, uTilt: this.tilt, uBillboard: { value: billboard ? 1 : 0 }, uDither: { value: dither ? 1 : 0 } },
        vertexShader: UNLIT_VS,
        fragmentShader: UNLIT_FS,
        transparent: !dither,
        depthWrite: dither,
        depthTest,
        side: THREE.DoubleSide,
        blending: blending === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false,
      });
      this.mat = m;
    }
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    if (lit && shadow) {
      this.mesh.castShadow = true;
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest });
      patchDepth(dm, this.tilt);
      this.mesh.customDepthMaterial = dm;
    }
  }

  begin() { this.count = 0; }

  // rect: {u, v, du, dv}; flip mirrors horizontally
  push(x, y, z, w, h, rect, flip = false, r = 1, g = 1, b = 1, a = 1, flash = 0, frost = 0, rot = 0) {
    if (this.count >= this.cap) return;
    const d = this.data, o = this.count++ * STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = w; d[o + 4] = h;
    d[o + 5] = rect.u; d[o + 6] = rect.v; d[o + 7] = flip ? -rect.du : rect.du; d[o + 8] = rect.dv;
    d[o + 9] = r; d[o + 10] = g; d[o + 11] = b; d[o + 12] = a;
    d[o + 13] = flash; d[o + 14] = frost; d[o + 15] = rot; d[o + 16] = 0;
  }

  end() {
    this.geo.instanceCount = this.count;
    if (this.count) {
      this.buf.clearUpdateRanges();
      this.buf.addUpdateRange(0, this.count * STRIDE);
      this.buf.needsUpdate = true;
    }
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    if (this.mesh.customDepthMaterial) this.mesh.customDepthMaterial.dispose();
  }
}

// ------------------------------------------------------------------ particles
// CPU-simulated sprites in two layers (soft additive glow + opaque dithered pixels)
export class Particles {
  constructor(scene, tex, rects, cap = 2400) {
    this.rects = rects;
    this.add = new SpriteLayer(tex, cap, { blending: 'add', anchor: 'center', billboard: true, renderOrder: 3 });
    this.solid = new SpriteLayer(tex, cap, { dither: true, anchor: 'center', billboard: true, renderOrder: 2 });
    this.add.mesh.material.depthWrite = false;
    scene.add(this.add.mesh, this.solid.mesh);
    this.list = [];
    this.cap = cap;
  }

  // o: {kind, x,y,z, vx,vy,vz, life, size, size1, r,g,b, a, a1, grav, drag, rot, vrot, add}
  spawn(o) {
    if (this.list.length >= this.cap) this.list.shift();
    const p = {
      kind: 'dot', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.6, age: 0, size: 0.3, size1: null,
      r: 1, g: 1, b: 1, a: 1, a1: 0, grav: 0, drag: 0, rot: 0, vrot: 0, add: true, floor: true, ...o,
    };
    if (p.size1 === null) p.size1 = p.size;
    p.rect = this.rects[p.kind] || this.rects.dot;
    this.list.push(p);
    return p;
  }

  // a radial burst of n particles; spread in the ground plane, kick upward
  burst(n, o) {
    const sp = o.speed ?? 3, up = o.up ?? 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.35 + Math.random() * 0.65);
      this.spawn({
        ...o,
        x: o.x + (Math.random() - 0.5) * (o.jitter || 0),
        z: o.z + (Math.random() - 0.5) * (o.jitter || 0),
        vx: Math.cos(a) * s, vz: Math.sin(a) * s * 0.8, vy: up * (0.4 + Math.random() * 0.8),
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.6),
        rot: Math.random() * 6.28, vrot: (Math.random() - 0.5) * (o.spin || 0),
      });
    }
  }

  update(dt) {
    this.add.begin();
    this.solid.begin();
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      L[w++] = p;
      const k = p.age / p.life;
      p.vy -= p.grav * dt;
      if (p.drag) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f; p.vy *= f; p.vz *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.floor && p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += p.vrot * dt;
      const s = p.size + (p.size1 - p.size) * k;
      const a = p.a + (p.a1 - p.a) * k;
      (p.add ? this.add : this.solid).push(p.x, p.y, p.z, s, s, p.rect, false, p.r * (p.add ? a : 1), p.g * (p.add ? a : 1), p.b * (p.add ? a : 1), p.add ? 1 : a, 0, 0, p.rot);
    }
    L.length = w;
    this.add.end();
    this.solid.end();
  }

  clear() {
    this.list.length = 0;
    this.add.begin(); this.add.end();
    this.solid.begin(); this.solid.end();
  }

  dispose(scene) {
    scene.remove(this.add.mesh, this.solid.mesh);
    this.add.dispose();
    this.solid.dispose();
  }
}
