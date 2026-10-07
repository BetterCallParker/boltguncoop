// Binary snapshot format (server -> client, 15 Hz).
//
//  u8   type (1)
//  u32  tick
//  f32  originX, originZ            enemy positions are quantized relative to this point
//  u16  enemy count, then per enemy: u16 id, u8 type, u8 flags, i16 qx, i16 qz   (q = units * 32)
//  u16  bar count, then per entry:   u16 id, u8 hp fraction (0-255)   (elites / bosses)
//  u16  damage count, then:          u16 enemy id, u16 amount (bit 15 = big hit)
//  u16  kill count, then:            u16 enemy id
//  u32  json length, then UTF-8 JSON for everything else (players, events, pickups...)

export const MSG_SNAP = 1;
export const Q = 32;

// enemy flags
export const EF = { FLASH: 1, LEFT: 2, FROZEN: 4, ELITE: 8, SLOW: 16, BOSS: 32, SPAWN: 64 };

const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

export function encodeSnapshot(s) {
  const json = enc.encode(JSON.stringify(s.json));
  const n = s.enemies.length;
  const size = 1 + 4 + 8 + 2 + n * 8 + 2 + s.bars.length * 3 + 2 + s.dmg.length * 4 + 2 + s.kills.length * 2 + 4 + json.length;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, MSG_SNAP); o += 1;
  v.setUint32(o, s.tick, true); o += 4;
  v.setFloat32(o, s.ox, true); o += 4;
  v.setFloat32(o, s.oz, true); o += 4;
  v.setUint16(o, n, true); o += 2;
  for (const e of s.enemies) {
    v.setUint16(o, e.id, true);
    v.setUint8(o + 2, e.type);
    v.setUint8(o + 3, e.flags);
    v.setInt16(o + 4, clampQ((e.x - s.ox) * Q), true);
    v.setInt16(o + 6, clampQ((e.z - s.oz) * Q), true);
    o += 8;
  }
  v.setUint16(o, s.bars.length, true); o += 2;
  for (const [id, f] of s.bars) {
    v.setUint16(o, id, true);
    v.setUint8(o + 2, Math.max(0, Math.min(255, Math.round(f * 255))));
    o += 3;
  }
  v.setUint16(o, s.dmg.length, true); o += 2;
  for (const [id, amt, big] of s.dmg) {
    v.setUint16(o, id, true);
    v.setUint16(o + 2, (Math.min(32767, Math.max(1, Math.round(amt)))) | (big ? 0x8000 : 0), true);
    o += 4;
  }
  v.setUint16(o, s.kills.length, true); o += 2;
  for (const id of s.kills) {
    v.setUint16(o, id, true);
    o += 2;
  }
  v.setUint32(o, json.length, true); o += 4;
  new Uint8Array(buf, o, json.length).set(json);
  return buf;
}

function clampQ(v) {
  v = Math.round(v);
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v;
}

export function decodeSnapshot(buf) {
  const v = new DataView(buf);
  let o = 0;
  const type = v.getUint8(o); o += 1;
  if (type !== MSG_SNAP) return null;
  const tick = v.getUint32(o, true); o += 4;
  const ox = v.getFloat32(o, true); o += 4;
  const oz = v.getFloat32(o, true); o += 4;
  const n = v.getUint16(o, true); o += 2;
  const enemies = new Array(n);
  for (let i = 0; i < n; i++) {
    enemies[i] = {
      id: v.getUint16(o, true),
      type: v.getUint8(o + 2),
      flags: v.getUint8(o + 3),
      x: ox + v.getInt16(o + 4, true) / Q,
      z: oz + v.getInt16(o + 6, true) / Q,
    };
    o += 8;
  }
  const nb = v.getUint16(o, true); o += 2;
  const bars = new Map();
  for (let i = 0; i < nb; i++) {
    bars.set(v.getUint16(o, true), v.getUint8(o + 2) / 255);
    o += 3;
  }
  const nd = v.getUint16(o, true); o += 2;
  const dmg = new Array(nd);
  for (let i = 0; i < nd; i++) {
    const a = v.getUint16(o + 2, true);
    dmg[i] = [v.getUint16(o, true), a & 0x7fff, (a & 0x8000) !== 0];
    o += 4;
  }
  const nk = v.getUint16(o, true); o += 2;
  const kills = new Array(nk);
  for (let i = 0; i < nk; i++) {
    kills[i] = v.getUint16(o, true);
    o += 2;
  }
  const jl = v.getUint32(o, true); o += 4;
  const json = JSON.parse(dec.decode(new Uint8Array(buf, o, jl)));
  return { tick, ox, oz, enemies, bars, dmg, kills, json };
}
