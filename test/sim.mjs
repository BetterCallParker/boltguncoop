// Headless balance simulation: plays whole runs faster than real time with kiting bots and
// prints the party level, kills and survivors per minute. `node test/sim.mjs [players] [minutes] [stage]`
import { Game } from '../server/game.js';
import { PHASE, PS, BASE_MOVE_SPEED } from '../shared/constants.js';

const N = Number(process.argv[2] || 1);
const LEN = Number(process.argv[3] || 15);
const STAGE = Number(process.argv[4] || 0);
const choices = [];
const g = new Game('SIM', { sendTo(cid, msg) { if (msg.t === 'choices') choices.push(msg); } });
g.settings.length = [10, 15, 20, 30].indexOf(LEN) >= 0 ? [10, 15, 20, 30].indexOf(LEN) : 1;
g.settings.stage = STAGE;
const ids = [];
const CH = (process.env.CHARS || '0,1,2,3,4,5,6,7').split(',').map(Number);
for (let i = 0; i < N; i++) ids.push(g.addPlayer(i + 1, 'Bot' + i, CH[i % CH.length], {}).id);
for (const id of ids) g.toggleReady(id, true);
while (!g.run) g.step();
const run = g.run;
let lastMin = -1;
const t0 = Date.now();
const angle = new Map(ids.map((id, i) => [id, i]));
while (run.phase !== PHASE.OVER) {
  // bots: run from nearby monsters, drift in wide circles, sweep up gems
  for (const p of run.players.values()) {
    if (p.state !== PS.ALIVE) continue;
    let fx = 0, fz = 0;
    for (const e of run.enemies) {
      if (e.dead || e.def.prop) continue;
      const dx = p.x - e.x, dz = p.z - e.z, d2 = dx * dx + dz * dz;
      if (d2 < 4 && d2 > 1e-4) { const w = 1 / d2; fx += dx * w; fz += dz * w; }
    }
    // a slow wide circle (the classic survivor kite) that lets the horde come into reach
    const a = (angle.get(p.id) || 0) + 0.006;
    angle.set(p.id, a);
    fx += -Math.sin(a) * 0.3; fz += Math.cos(a) * 0.3;
    let best = null, bd = 1e9;
    for (const gm of run.gems.values()) { const d = (gm.x - p.x) ** 2 + (gm.z - p.z) ** 2; if (d < bd) { bd = d; best = gm; } }
    if (best && bd < 64) { const d = Math.sqrt(bd) || 1; fx += ((best.x - p.x) / d) * 0.25; fz += ((best.z - p.z) / d) * 0.25; }
    const l = Math.hypot(fx, fz) || 1;
    const sp = BASE_MOVE_SPEED * p.stats.moveSpeed * 0.7 / 30;
    g.playerPos(p.id, p.x + (fx / l) * sp, p.z + (fz / l) * sp, fx / l, fz / l);
  }
  g.step();
  while (choices.length) { const c = choices.shift(); g.pick(c.id, Math.floor(Math.random() * c.opts.length)); }
  const m = Math.floor(run.t / 60);
  if (m !== lastMin) {
    lastMin = m;
    const alive = [...run.players.values()].filter((p) => p.state === PS.ALIVE).length;
    const hp = [...run.players.values()].map((p) => Math.round(p.hp)).join('/');
    const evo = [...run.players.values()].map((p) => p.weapons.filter((w) => w.id && /dawn|storm|meteor|sanct|thous|plague|eternal|wrath|absolute|twin|soul/.test(w.id)).length).join('/');
    const lv = [...run.players.values()].map((p) => p.weapons.map((w) => w.lvl).join('') + '+' + Object.values(p.passives).join('')).join(' ');
    console.log(`${String(m).padStart(2)}m  lv ${String(run.level).padStart(3)}  kills ${String(run.kills).padStart(6)}  enemies ${String(run.enemies.length).padStart(4)}  alive ${alive}/${N}  hp ${hp}  evo ${evo}  ${lv}`);
  }
  if (run.t > LEN * 60 + 120) break;
}
console.log(`result: ${run.result} at ${(run.t / 60).toFixed(1)} min, level ${run.level}, kills ${run.kills}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
