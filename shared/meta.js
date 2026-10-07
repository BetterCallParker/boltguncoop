// Guild upgrades: permanent power-ups bought with gold between runs (saved in each player's browser).

export const POWERUPS = [
  { id: 'might', name: 'Might', desc: '+5% damage', stat: 'might', per: 0.05, max: 5, cost: 200 },
  { id: 'armor', name: 'Armor', desc: '+1 armor', stat: 'armor', per: 1, max: 3, cost: 600 },
  { id: 'maxhp', name: 'Max Health', desc: '+10% max HP', stat: 'hpPct', per: 0.1, max: 3, cost: 200 },
  { id: 'recovery', name: 'Recovery', desc: '+0.1 HP per second', stat: 'recovery', per: 0.1, max: 5, cost: 200 },
  { id: 'cooldown', name: 'Cooldown', desc: '-2.5% weapon cooldown', stat: 'cooldown', per: -0.025, max: 2, cost: 900 },
  { id: 'area', name: 'Area', desc: '+5% weapon area', stat: 'area', per: 0.05, max: 2, cost: 300 },
  { id: 'speed', name: 'Speed', desc: '+10% projectile speed', stat: 'speed', per: 0.1, max: 2, cost: 300 },
  { id: 'duration', name: 'Duration', desc: '+15% effect duration', stat: 'duration', per: 0.15, max: 2, cost: 300 },
  { id: 'amount', name: 'Amount', desc: '+1 projectile', stat: 'amount', per: 1, max: 1, cost: 5000 },
  { id: 'move', name: 'Move Speed', desc: '+5% move speed', stat: 'moveSpeed', per: 0.05, max: 2, cost: 300 },
  { id: 'magnet', name: 'Magnet', desc: '+25% pickup range', stat: 'magnet', per: 0.25, max: 2, cost: 300 },
  { id: 'luck', name: 'Luck', desc: '+10% luck', stat: 'luck', per: 0.1, max: 3, cost: 600 },
  { id: 'growth', name: 'Growth', desc: '+3% experience', stat: 'growth', per: 0.03, max: 5, cost: 900 },
  { id: 'greed', name: 'Greed', desc: '+10% gold', stat: 'greed', per: 0.1, max: 5, cost: 200 },
  { id: 'revival', name: 'Revival', desc: 'Get back up once per run', stat: 'revival', per: 1, max: 1, cost: 8000 },
];

export function powerupCost(pu, nextRank) {
  return pu.cost * nextRank;
}

// Clamp untrusted rank tables coming from clients
export function sanitizeMeta(m) {
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const pu of POWERUPS) {
    const r = Math.min(pu.max, Math.max(0, Math.floor(Number(m[pu.id]) || 0)));
    if (r) out[pu.id] = r;
  }
  return out;
}
