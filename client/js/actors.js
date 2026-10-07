// A traveler in the 3D world: animated pixel sprite sheet (front / side / back views) on a leaning
// billboard with a real cast shadow and a soft contact shadow.
import * as THREE from 'three';
import { travelerSheet, frameIndex, FW, FH } from './travelers.js';
import { blobShadowCanvas } from './sprites.js';
import { pixTexture, spriteGeometry, SPRITE_TILT } from './world.js';

let blobTex = null;
export function blobTexture() {
  if (!blobTex) {
    blobTex = new THREE.CanvasTexture(blobShadowCanvas(32));
    blobTex.magFilter = THREE.NearestFilter;
    blobTex.minFilter = THREE.NearestFilter;
  }
  return blobTex;
}

const sheetTex = new Map();
function texFor(charIdx) {
  if (!sheetTex.has(charIdx)) sheetTex.set(charIdx, pixTexture(travelerSheet(charIdx).canvas));
  return sheetTex.get(charIdx);
}

export class TravelerView {
  constructor(charIdx, scale = 1) {
    this.charIdx = charIdx;
    this.root = new THREE.Group();
    this.tex = texFor(charIdx).clone();
    this.tex.needsUpdate = true;
    this.frames = travelerSheet(charIdx).frames;
    this.tex.repeat.set(1 / this.frames, 1);
    this.mat = new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.26 });
    this.sprite = new THREE.Mesh(spriteGeometry(FW * scale, FH * scale), this.mat);
    this.sprite.rotation.x = -SPRITE_TILT;
    this.sprite.castShadow = true;
    this.sprite.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
    this.root.add(this.sprite);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * scale, 0.55 * scale), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    sh.renderOrder = 1;
    this.root.add(sh);
    this.shadow = sh;
    this.t = Math.random() * 10;
    this.view = 'front';
    this.flip = false;
    this.frame = -1;
    this.flash = 0;
    this.setFrame(0);
  }

  setFrame(i) {
    if (i === this.frame && this.flipApplied === this.flip) return;
    this.frame = i;
    this.flipApplied = this.flip;
    if (!this.flip) {
      this.tex.repeat.x = 1 / this.frames;
      this.tex.offset.x = i / this.frames;
    } else {
      this.tex.repeat.x = -1 / this.frames;
      this.tex.offset.x = (i + 1) / this.frames;
    }
  }

  // point the sprite along a movement direction (x right, z toward the camera)
  faceDir(dx, dz) {
    if (Math.abs(dx) < 0.05 && Math.abs(dz) < 0.05) return;
    if (Math.abs(dz) > Math.abs(dx) * 1.15) {
      this.view = dz > 0 ? 'front' : 'back';
      this.flip = false;
    } else {
      this.view = 'side';
      this.flip = dx < 0;
    }
  }

  // legacy helper: face left/right in the side view, or front
  face(dir) {
    this.view = 'front';
    this.flip = false;
    this.lean = dir;
  }

  // state: 'idle' | 'walk' | 'hurt' | 'cheer' | 'down'
  update(dt, state = 'idle', speed = 1) {
    this.t += dt * speed;
    const flipNow = state === 'down' || state === 'hurt' || state === 'cheer' ? false : this.flip;
    const saved = this.flip;
    this.flip = flipNow;
    this.setFrame(frameIndex(state === 'idle' || state === 'walk' ? this.view : 'front', state, this.t));
    this.flip = saved;
    if (this.flash > 0) {
      this.flash -= dt;
      this.mat.emissiveIntensity = this.flash > 0 ? 1.2 : 0.26;
    }
  }

  hit() {
    this.flash = 0.12;
  }

  dispose() {
    this.tex.dispose();
    this.mat.dispose();
    this.sprite.geometry.dispose();
  }
}
