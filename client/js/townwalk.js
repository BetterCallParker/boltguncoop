// Where travelers can walk in the camp town (see buildTown in town.js): the plaza, the arched
// bridge over the canal, the street beyond, and the curved steps up to the terrace. Houses,
// the fountain, stalls and clutter are solid. Heights follow the bridge arch and the steps.

const R = 0.35; // traveler footprint
const STEPS = { x: 5.5, z: -11.4, r: 3.0, ring: 0.42, n: 6, top: 1.7 };
const BRIDGE = { half: 1.15, z0: -3.4, z1: -7.8, rise: 0.85 };

// solid boxes [x0, x1, z0, z1] and circles [x, z, r]
const BOXES = [
  [-20.5, -15.5, 0, 6], [16, 21, -0.5, 5.5], // plaza houses
  [7.4, 9.8, -0.2, 1.0], [11.4, 13.8, -0.6, 0.6], // market stalls
  [-19.5, -13.5, -11.3, -7.9], [14, 20, -11.3, -7.9], // street houses
  [-14, -8, -17.7, -13.3], [-6.4, -1.2, -18.7, -14.5], [0.7, 6.1, -18.4, -14.0], [8, 14, -17.7, -13.1], // terrace houses
];
const CIRCLES = [
  [-7, 2, 1.9], // fountain
  [10.8, 2.2, 0.45], [11.3, 1.6, 0.45], [14.6, 1.2, 0.45], [-11.5, -9.4, 0.45], [-10.9, -10.0, 0.45], // barrels
  [-10.6, 4.4, 0.5], [-10.0, 5.0, 0.5], [6.8, -9.6, 0.5], // crates
  [-2.3, -2.9, 0.25], [2.3, -2.9, 0.25], [-2.3, -8.3, 0.25], [2.3, -8.3, 0.25], [-13.6, -12.2, 0.25], [13.6, -12.2, 0.25], // lamps
  [-4.5, 11, 0.5], [4.6, 10.5, 0.6], [-1.2, -13.0, 0.5], [9.8, -13.0, 0.5], // trees + bushes
];

function stepsHeight(x, z) {
  const r = Math.hypot(x - STEPS.x, z - STEPS.z);
  if (z < STEPS.z || r >= STEPS.r) return null;
  const k = Math.min(STEPS.n - 1, Math.floor((STEPS.r - r) / STEPS.ring));
  return ((k + 1) * STEPS.top) / STEPS.n;
}

export function townHeight(x, z) {
  if (z > -3.6) return 0;
  if (Math.abs(x) < BRIDGE.half + 0.2 && z >= BRIDGE.z1) {
    const u = Math.min(1, Math.max(0, (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0)));
    return Math.sin(u * Math.PI) * BRIDGE.rise;
  }
  if (z >= STEPS.z) return stepsHeight(x, z) ?? 0;
  return STEPS.top;
}

function free(x, z) {
  if (x < -23 || x > 23 || z > 14 || z < -20.4) return false;
  // canal: only the bridge crosses it (balustrades on both banks)
  if (z < -3.5 && z > -7.65 && Math.abs(x) > BRIDGE.half) return false;
  for (const [x0, x1, z0, z1] of BOXES) if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) return false;
  for (const [cx, cz, r] of CIRCLES) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + R) ** 2) return false;
  return true;
}

function canStep(x0, z0, x1, z1) {
  if (!free(x1, z1)) return false;
  // the terrace edge has a balustrade except where the steps come up
  const a = z0 >= STEPS.z, b = z1 >= STEPS.z;
  if (a !== b && (x1 < STEPS.x - 2.3 || x1 > STEPS.x + 2.3)) return false;
  return true;
}

// move a point by (dx, dz), sliding along walls; returns [x, z]
export function townMove(x, z, dx, dz) {
  const nx = x + dx, nz = z + dz;
  if (canStep(x, z, nx, nz)) return [nx, nz];
  if (dx && canStep(x, z, nx, z)) return [nx, z];
  if (dz && canStep(x, z, x, nz)) return [x, nz];
  return [x, z];
}

// nudge a spawn point to the nearest free spot
export function townPlace(x, z) {
  if (free(x, z)) return [x, z];
  for (let r = 0.5; r < 6; r += 0.5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (free(px, pz)) return [px, pz];
    }
  }
  return [x, z];
}
