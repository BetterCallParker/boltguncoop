// HD-2D renderer: three.js scene + post chain (bloom -> tilt-shift depth of field -> tone map ->
// color grade with vignette and grain), plus an overlay scene drawn crisp on top (damage numbers).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ------------------------------------------------------------------ volumetric light (god rays)
// For every pixel we march from the camera to the surface it sees, sampling the sun's shadow map:
// air that the sun can reach glows, air in shadow stays dark -> real light shafts through the
// canopy and around every sprite, ruin and tree. Computed at half resolution, blurred, then added.
const VOL_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const VOL_FS = /* glsl */ `
  uniform sampler2D tDepth;
  uniform sampler2DShadow tShadow;
  uniform mat4 shadowMatrix;
  uniform mat4 projInv;
  uniform mat4 camWorld;
  uniform vec3 camPos;
  uniform vec3 sunDir;
  uniform float density;
  uniform float falloff;
  uniform float maxDist;
  uniform float frame;
  varying vec2 vUv;
  uniform float canopyH;
  uniform float gapScale;
  uniform float gapCut;
  uniform float haze;
  uniform float time;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // light only passes through gaps in a virtual canopy high above: shafts instead of flat haze
  float gaps(vec3 p) {
    vec3 q = p + sunDir * ((canopyH - p.y) / max(sunDir.y, 0.2));
    vec2 uv = q.xz * gapScale + vec2(time * 0.01, time * 0.006);
    float n = vnoise(uv) * 0.65 + vnoise(uv * 2.3 + 7.1) * 0.35;
    return smoothstep(gapCut, gapCut + 0.12, n);
  }
  void main() {
    float d = texture2D(tDepth, vUv).x;
    vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 vp = projInv * ndc;
    vp /= vp.w;
    vec3 wp = (camWorld * vp).xyz;
    vec3 rd = wp - camPos;
    float len = length(rd);
    rd /= len;
    float L = min(len, maxDist);
    const int STEPS = 40;
    float stepL = L / float(STEPS);
    float jit = ign(gl_FragCoord.xy + frame * 5.588238);
    float acc = 0.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = camPos + rd * ((float(i) + jit) * stepL);
      float h = max(p.y, 0.0);
      float dens = exp(-h * falloff);
      vec4 sc = shadowMatrix * vec4(p, 1.0);
      sc.xyz /= sc.w;
      float lit = 1.0;
      if (sc.x > 0.001 && sc.x < 0.999 && sc.y > 0.001 && sc.y < 0.999 && sc.z < 1.0) lit = texture(tShadow, vec3(sc.xy, sc.z - 0.0015));
      float under = step(p.y, canopyH);
      acc += lit * dens * (haze + gaps(p) * under);
    }
    acc *= stepL * density;
    float c = dot(rd, sunDir);
    float g = 0.45;
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
    gl_FragColor = vec4(vec3(acc * (0.55 + 0.45 * hg)), 1.0);
  }`;
const BLUR_FS = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tInput, vUv) * 0.2270270270;
    c += texture2D(tInput, vUv + dir * 1.3846153846) * 0.3162162162;
    c += texture2D(tInput, vUv - dir * 1.3846153846) * 0.3162162162;
    c += texture2D(tInput, vUv + dir * 3.2307692308) * 0.0702702703;
    c += texture2D(tInput, vUv - dir * 3.2307692308) * 0.0702702703;
    gl_FragColor = c;
  }`;
const COMP_FS = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tVol;
  uniform vec3 color;
  uniform float on;
  uniform float debugVol;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tScene, vUv);
    float v = texture2D(tVol, vUv).r * on;
    gl_FragColor = debugVol > 0.5 ? vec4(vec3(v) * 0.5, 1.0) : vec4(s.rgb + color * v, s.a);
  }`;

class VolumetricScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.light = null;
    this.strength = 1;
    this.color = new THREE.Color(1, 0.86, 0.62);
    this.density = 0.05;
    this.falloff = 0.12;
    this.haze = 0.06;
    this.gapCut = 0.62;
    this.frame = 0;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.volRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.blurRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.volMat = new THREE.ShaderMaterial({
      vertexShader: VOL_VS, fragmentShader: VOL_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tDepth: { value: null }, tShadow: { value: null }, shadowMatrix: { value: new THREE.Matrix4() }, projInv: { value: new THREE.Matrix4() },
        camWorld: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        density: { value: 0.05 }, falloff: { value: 0.12 }, maxDist: { value: 70 }, frame: { value: 0 },
        canopyH: { value: 14 }, gapScale: { value: 0.2 }, gapCut: { value: 0.6 }, haze: { value: 0.06 }, time: { value: 0 },
      },
    });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: VOL_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false, uniforms: { tInput: { value: null }, dir: { value: new THREE.Vector2() } } });
    this.compMat = new THREE.ShaderMaterial({ vertexShader: VOL_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false, uniforms: { tScene: { value: null }, tVol: { value: null }, color: { value: new THREE.Color() }, on: { value: 0 }, debugVol: { value: new URL(location.href).searchParams.get('vol') ? 1 : 0 } } });
    this.fsq = new FullScreenQuad(null);
    this._v = new THREE.Vector3();
  }

  setSize(w, h) {
    this.sceneRT.setSize(w, h);
    const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
    this.volRT.setSize(hw, hh);
    this.blurRT.setSize(hw, hh);
    this.hw = hw;
    this.hh = hh;
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const L = this.light;
    const map = L && L.castShadow && L.shadow && L.shadow.map ? L.shadow.map.depthTexture : null;
    let on = 0;
    if (map && this.strength > 0.002) {
      on = 1;
      const u = this.volMat.uniforms;
      const cam = this.camera;
      u.tDepth.value = this.sceneRT.depthTexture;
      u.tShadow.value = map;
      u.shadowMatrix.value.copy(L.shadow.matrix);
      u.projInv.value.copy(cam.projectionMatrixInverse);
      u.camWorld.value.copy(cam.matrixWorld);
      u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
      u.sunDir.value.copy(L.position).sub(L.target.position).normalize();
      u.density.value = this.density;
      u.falloff.value = this.falloff;
      u.frame.value = (this.frame = (this.frame + 1) % 64);
      u.time.value = performance.now() / 1000;
      u.haze.value = this.haze;
      u.gapCut.value = this.gapCut;
      this.fsq.material = this.volMat;
      renderer.setRenderTarget(this.volRT);
      this.fsq.render(renderer);
      this.fsq.material = this.blurMat;
      for (const [src, dst, dx, dy] of [[this.volRT, this.blurRT, 1, 0], [this.blurRT, this.volRT, 0, 1], [this.volRT, this.blurRT, 2, 0], [this.blurRT, this.volRT, 0, 2]]) {
        this.blurMat.uniforms.tInput.value = src.texture;
        this.blurMat.uniforms.dir.value.set(dx / this.hw, dy / this.hh);
        renderer.setRenderTarget(dst);
        this.fsq.render(renderer);
      }
    }
    const c = this.compMat.uniforms;
    c.tScene.value = this.sceneRT.texture;
    c.tVol.value = this.volRT.texture;
    c.on.value = on;
    c.color.value.copy(this.color).multiplyScalar(this.strength * (L ? L.intensity : 1));
    this.fsq.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.fsq.render(renderer);
  }
}

const TILT = {
  uniforms: {
    tDiffuse: { value: null },
    dir: { value: new THREE.Vector2(1, 0) },
    resolution: { value: new THREE.Vector2(1, 1) },
    focus: { value: 0.5 }, // screen y of the sharp band
    band: { value: 0.16 }, // half height of the sharp band
    amount: { value: 3.2 }, // max blur radius in pixels (at 1080p)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 dir;
    uniform vec2 resolution;
    uniform float focus, band, amount;
    varying vec2 vUv;
    void main() {
      float dy = vUv.y - focus;
      float d = max(0.0, abs(dy) - band) * (dy < 0.0 ? 1.45 : 1.0);
      float r = amount * smoothstep(0.0, 0.38, d) * (resolution.y / 1080.0);
      vec2 step = dir / resolution * r;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += texture2D(tDiffuse, vUv + step * 1.3846153846) * 0.3162162162;
      c += texture2D(tDiffuse, vUv - step * 1.3846153846) * 0.3162162162;
      c += texture2D(tDiffuse, vUv + step * 3.2307692308) * 0.0702702703;
      c += texture2D(tDiffuse, vUv - step * 3.2307692308) * 0.0702702703;
      gl_FragColor = c;
    }`,
};

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.5 },
    warmth: { value: 0.06 },
    saturation: { value: 0.96 },
    contrast: { value: 1.1 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    hurt: { value: 0 },
    desat: { value: 0 },
    grainAmt: { value: 1 },
  },
  vertexShader: TILT.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, warmth, saturation, contrast, flash, hurt, desat, grainAmt;
    uniform vec3 flashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // HD-2D grade: olive/teal shadows, amber highlights, gently crushed blacks
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(0.9, 0.98, 0.9);
      vec3 highTint = vec3(1.08, 1.0, 0.82);
      col *= mix(shadowTint, highTint, smoothstep(0.08, 0.75, l));
      col = max(col - 0.012, 0.0) * 1.03;
      col *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth * 0.6);
      col = (col - 0.5) * contrast + 0.5;
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(g), col, saturation * (1.0 - desat));
      // vignette
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.15, 1.0)));
      col *= mix(1.0 - vignette * grainAmt, 1.0, v);
      // hurt pulse (red edges)
      col = mix(col, vec3(0.75, 0.05, 0.08), hurt * (1.0 - v) * 0.5);
      // film grain
      col += (hash(vUv * 1000.0 + time) - 0.5) * 0.028 * grainAmt;
      col = mix(col, flashColor, flash);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.quality = quality;
    this.settings = { scale: 1, rays: 1, bloom: 1, dof: 1, shadows: true, grain: true };
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.dpr = quality === 'low' ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    r.setPixelRatio(this.dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = quality !== 'low';
    r.shadowMap.type = THREE.PCFShadowMap;
    this.r = r;
    this.scene = new THREE.Scene();
    this.overlay = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);

    this.composer = new EffectComposer(r);
    this.renderPass = new VolumetricScenePass(this.scene, this.camera);
    this.vol = this.renderPass;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.82);
    this.tiltH = new ShaderPass(TILT);
    this.tiltV = new ShaderPass(TILT);
    this.tiltV.uniforms.dir.value.set(0, 1);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const W = w * this.dpr, H = h * this.dpr;
    this.tiltH.uniforms.resolution.value.set(W, H);
    this.tiltV.uniforms.resolution.value.set(W, H);
    this.bloom.resolution.set(W / 2, H / 2);
  }

  setTilt(focus, band, amount) {
    for (const p of [this.tiltH, this.tiltV]) {
      p.uniforms.focus.value = focus;
      p.uniforms.band.value = band;
      p.uniforms.amount.value = amount * this.settings.dof;
    }
  }

  // player options: { scale, rays, bloom, dof, shadows, grain }
  applySettings(s) {
    Object.assign(this.settings, s);
    const base = this.quality === 'low' ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.dpr = Math.max(0.4, base * this.settings.scale);
    this.r.setPixelRatio(this.dpr);
    this.resize();
    const sh = !!this.settings.shadows && this.quality !== 'low';
    if (this.r.shadowMap.enabled !== sh) {
      this.r.shadowMap.enabled = sh;
      this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    this.bloom.enabled = this.settings.bloom > 0.01;
    this.tiltH.enabled = this.tiltV.enabled = this.settings.dof > 0.01;
    this.grade.uniforms.grainAmt.value = this.settings.grain ? 1 : 0;
  }

  render(time) {
    this.grade.uniforms.time.value = time % 100;
    this.composer.render();
    if (this.overlay.children.length) {
      this.r.autoClear = false;
      this.r.clearDepth();
      this.r.render(this.overlay, this.camera);
      this.r.autoClear = true;
    }
  }
}
