// The Guild: gold + permanent power-up ranks, saved in this browser.
import { POWERUPS, powerupCost, sanitizeMeta } from '/shared/meta.js';

const KEY = 'lanternbound_guild_v1';

export class Guild {
  constructor() {
    this.gold = 0;
    this.ranks = {};
    this.stage = 0; // highest stage unlocked (stages unlock as you beat them)
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      this.gold = Math.max(0, Math.floor(d.gold || 0));
      this.ranks = sanitizeMeta(d.ranks);
      this.stage = Math.max(0, Math.floor(d.stage || 0));
    } catch { /* storage blocked */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ gold: this.gold, ranks: this.ranks, stage: this.stage })); } catch { /* ignore */ }
  }

  rank(id) {
    return this.ranks[id] || 0;
  }

  nextCost(pu) {
    const r = this.rank(pu.id);
    return r >= pu.max ? 0 : powerupCost(pu, r + 1);
  }

  buy(id) {
    const pu = POWERUPS.find((p) => p.id === id);
    if (!pu) return false;
    const cost = this.nextCost(pu);
    if (!cost || this.gold < cost) return false;
    this.gold -= cost;
    this.ranks[id] = this.rank(id) + 1;
    this.save();
    return true;
  }

  refund() {
    let back = 0;
    for (const pu of POWERUPS) for (let r = 1; r <= this.rank(pu.id); r++) back += powerupCost(pu, r);
    this.gold += back;
    this.ranks = {};
    this.save();
  }

  // returns true when this actually unlocked something new
  unlockStage(i) {
    if (i <= this.stage) return false;
    this.stage = i;
    this.save();
    return true;
  }

  addGold(n) {
    this.gold += Math.max(0, Math.floor(n));
    this.save();
  }
}
