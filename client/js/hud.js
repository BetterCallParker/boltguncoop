// In-run interface: experience bar + level, timer, kills, party panel (HP, gold, loadouts),
// boss bar, story banners, off-screen markers, per-local-player level-up cards (keyboard,
// controller or mouse), the treasure chest reveal and the end-of-journey results.
import { CHARACTERS } from '/shared/characters.js';
import { WEAPONS, PASSIVES, maxLevel } from '/shared/items.js';
import { ENEMIES, ENEMY_IDS } from '/shared/enemies.js';
import { SEAT_COLORS, PS, fmtTime } from '/shared/constants.js';
import { portraitCanvas, fullSpriteCanvas } from './sprites.js';
import { iconURL } from './icons.js';

const $ = (id) => document.getElementById(id);
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pURL = new Map();
function portrait(ci) {
  if (!pURL.has(ci)) pURL.set(ci, portraitCanvas(ci, 4).toDataURL());
  return pURL.get(ci);
}
const sURL = new Map();
function sprite(ci, frame) {
  const k = ci + ':' + frame;
  if (!sURL.has(k)) sURL.set(k, fullSpriteCanvas(ci, frame, 5).toDataURL());
  return sURL.get(k);
}

export function optionInfo(o) {
  if (o.k === 'w') {
    const d = WEAPONS[o.id];
    const desc = o.new ? d.desc : (d.levels[o.lvl - 2] || {}).d || d.desc;
    let hint = '';
    if (d.evolve) hint = `Evolves with ${PASSIVES[d.evolve.with].name} at Lv ${maxLevel(o.id)}`;
    return { icon: iconURL(o.id, 3), name: d.name, lvl: o.new ? 'New!' : `Lv ${o.lvl}`, desc, hint, kind: 'Arm' };
  }
  if (o.k === 'p') {
    const d = PASSIVES[o.id];
    return { icon: iconURL(o.id, 3), name: d.name, lvl: o.new ? 'New!' : `Lv ${o.lvl}`, desc: d.desc, hint: '', kind: 'Relic' };
  }
  if (o.k === 'gold') return { icon: iconURL('bag', 3), name: 'Gold Pouch', lvl: '', desc: `Gain ${o.v || 25} gold.`, hint: '', kind: 'Boon' };
  return { icon: iconURL('roast', 3), name: 'Hearty Roast', lvl: '', desc: `Recover ${o.v || 40} HP.`, hint: '', kind: 'Boon' };
}

export class Hud {
  constructor({ send, sfx }) {
    this.send = send;
    this.sfx = sfx;
    this.root = $('hud');
    this.worldUI = $('world-ui');
    this.built = false;
    this.choice = new Map(); // pid -> { opts, sel, picked, level }
    this.bannerT = 0;
    this.arrows = [];
    this.resultsShown = false;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('mousemove', (e) => this.onHover(e));
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    this.worldUI.classList.toggle('hidden', !on);
  }

  build(players, local) {
    this.root.innerHTML = '';
    this.worldUI.innerHTML = '';
    this.choice.clear();
    this.resultsShown = false;
    const r = this.root;
    r.appendChild(el('div', 'hud-xp', '<div class="fill"></div><div class="shine"></div><div class="lv">Lv <b>1</b></div>'));
    r.appendChild(el('div', 'hud-timer', '<div class="t">00:00</div><div class="tod"></div>'));
    r.appendChild(el('div', 'hud-kills', `<img class="pix" src="${iconURL('skull', 2)}"><b>0</b>`));
    r.appendChild(el('div', 'hud-party'));
    r.appendChild(el('div', 'hud-boss hidden', '<div class="bn"></div><div class="bb"><div class="lag"></div><div class="f"></div></div>'));
    r.appendChild(el('div', 'hud-banner hidden', '<div class="orn"><span></span>&#10070;<span></span></div><div class="t"></div><div class="s"></div>'));
    r.appendChild(el('div', 'hud-notice hidden'));
    r.appendChild(el('div', 'hud-arrows'));
    r.appendChild(el('div', 'hud-lv hidden'));
    r.appendChild(el('div', 'hud-chest hidden'));
    r.appendChild(el('div', 'hud-res hidden'));
    r.appendChild(el('div', 'hud-feed'));
    this.q = (s) => r.querySelector(s);
    this.xpFill = this.q('.hud-xp .fill');
    this.lvText = this.q('.hud-xp .lv b');
    this.timer = this.q('.hud-timer .t');
    this.todEl = this.q('.hud-timer .tod');
    this.killsEl = this.q('.hud-kills b');
    this.partyEl = this.q('.hud-party');
    this.bossEl = this.q('.hud-boss');
    this.bannerEl = this.q('.hud-banner');
    this.noticeEl = this.q('.hud-notice');
    this.arrowEl = this.q('.hud-arrows');
    this.lvEl = this.q('.hud-lv');
    this.chestEl = this.q('.hud-chest');
    this.resEl = this.q('.hud-res');
    this.feedEl = this.q('.hud-feed');
    this.rows = new Map();
    this.plates = new Map();
    this.last = {};
    this.buildParty(players, local);
    this.built = true;
  }

  buildParty(players, local) {
    this.partyEl.innerHTML = '';
    this.rows.clear();
    const list = [...players.values()].sort((a, b) => a.seat - b.seat);
    for (const p of list) {
      const L = local.get(p.id);
      const row = el('div', 'pm' + (L ? ' local' : ''), `
        <img class="pt pix" src="${portrait(p.char)}">
        <div class="info">
          <div class="nm">${L ? `<span class="tag">${L.label}</span>` : ''}${esc(p.name)}<span class="gold"><img class="pix" src="${iconURL('coin', 1)}"><b>0</b></span></div>
          <div class="hp"><div class="lag"></div><div class="f"></div><span class="hpt"></span></div>
          <div class="ld"><div class="ws"></div><div class="rs"></div></div>
        </div>`);
      row.style.setProperty('--sc', SEAT_COLORS[p.seat]);
      this.partyEl.appendChild(row);
      this.rows.set(p.id, { row, hp: row.querySelector('.hp .f'), lag: row.querySelector('.hp .lag'), hpt: row.querySelector('.hpt'), gold: row.querySelector('.gold b'), ws: row.querySelector('.ws'), rs: row.querySelector('.rs'), lagV: 1, key: '' });
      const plate = el('div', 'wplate', `${L ? `<span class="tag">${L.label}</span>` : ''}${esc(p.name)}`);
      plate.style.setProperty('--sc', SEAT_COLORS[p.seat]);
      this.worldUI.appendChild(plate);
      this.plates.set(p.id, plate);
    }
  }

  removePlayer(id) {
    const r = this.rows.get(id);
    if (r) { r.row.remove(); this.rows.delete(id); }
    const pl = this.plates.get(id);
    if (pl) { pl.remove(); this.plates.delete(id); }
    this.choice.delete(id);
  }

  loadout(p) {
    const r = this.rows.get(p.id);
    if (!r || !p.inv) return;
    const key = JSON.stringify([p.inv.weapons, p.inv.passives]);
    if (key === r.key) return;
    r.key = key;
    r.ws.innerHTML = p.inv.weapons.map(([id, lvl]) => `<span class="slot${WEAPONS[id] && WEAPONS[id].evolved ? ' evo' : ''}"><img class="pix" src="${iconURL(id, 2)}"><i>${WEAPONS[id] && WEAPONS[id].evolved ? '&#9733;' : lvl}</i></span>`).join('');
    r.rs.innerHTML = p.inv.passives.map(([id, lvl]) => `<span class="slot"><img class="pix" src="${iconURL(id, 2)}"><i>${lvl}</i></span>`).join('');
  }

  // ---------------------------------------------------------------- per frame
  // s: { rt, len, level, xp, xn, kills, tod, players: Map, local, boss:{name,frac}|null, notice, cam: {project(x,y,z)->[sx,sy,onScreen]} , markers:[{x,z,kind,color}] }
  update(dt, s) {
    if (!this.built) return;
    const xpk = s.xn ? Math.min(1, s.xp / s.xn) : 0;
    if (this.last.xp !== xpk) { this.xpFill.style.width = (xpk * 100).toFixed(2) + '%'; this.last.xp = xpk; }
    if (this.last.lv !== s.level) {
      this.lvText.textContent = s.level;
      if (this.last.lv !== undefined) { this.q('.hud-xp').classList.remove('pop'); void this.q('.hud-xp').offsetWidth; this.q('.hud-xp').classList.add('pop'); }
      this.last.lv = s.level;
    }
    const tt = fmtTime(s.rt);
    if (this.last.t !== tt) {
      this.timer.textContent = tt;
      this.timer.classList.toggle('late', s.rt >= s.len - 60 && s.rt < s.len);
      this.timer.classList.toggle('over', s.rt >= s.len);
      this.last.t = tt;
    }
    const todName = s.tod < 0.3 ? 'Morning' : s.tod < 0.55 ? 'Afternoon' : s.tod < 0.8 ? 'Dusk' : 'Night';
    if (this.last.tod !== todName) { this.todEl.textContent = todName; this.last.tod = todName; }
    if (this.last.k !== s.kills) { this.killsEl.textContent = s.kills.toLocaleString(); this.last.k = s.kills; }
    // party rows
    for (const p of s.players.values()) {
      const r = this.rows.get(p.id);
      if (!r) continue;
      const f = p.maxHp ? Math.max(0, p.hp / p.maxHp) : 0;
      r.lagV = r.lagV > f ? Math.max(f, r.lagV - dt * 0.6) : f;
      const hk = f.toFixed(3) + p.state + ':' + (p.respawnIn || 0);
      if (r.hk !== hk) {
        r.hp.style.width = (f * 100).toFixed(1) + '%';
        r.hpt.textContent = p.state === PS.DOWNED ? (p.respawnIn ? `BACK IN ${p.respawnIn}s` : 'DOWN') : `${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`;
        r.row.classList.toggle('down', p.state === PS.DOWNED);
        r.row.classList.toggle('low', f < 0.3 && p.state !== PS.DOWNED);
        r.hk = hk;
      }
      r.lag.style.width = (r.lagV * 100).toFixed(1) + '%';
      if (r.goldV !== p.gold) { r.gold.textContent = p.gold; r.goldV = p.gold; }
      this.loadout(p);
      // name plate above the traveler
      const plate = this.plates.get(p.id);
      if (plate) {
        const [sx, sy, on] = s.cam.project(p.x, 2.75, p.z);
        plate.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
        plate.style.display = on ? '' : 'none';
        plate.classList.toggle('down', p.state === PS.DOWNED);
      }
    }
    // boss bar
    if (s.boss) {
      this.bossEl.classList.remove('hidden');
      if (this.last.bn !== s.boss.name) { this.q('.hud-boss .bn').textContent = s.boss.name; this.last.bn = s.boss.name; }
      this.bossLag = this.bossLag === undefined || this.bossLag < s.boss.frac ? s.boss.frac : Math.max(s.boss.frac, this.bossLag - dt * 0.3);
      this.q('.hud-boss .f').style.width = (s.boss.frac * 100).toFixed(2) + '%';
      this.q('.hud-boss .lag').style.width = (this.bossLag * 100).toFixed(2) + '%';
    } else if (!this.bossEl.classList.contains('hidden')) {
      this.bossEl.classList.add('hidden');
      this.bossLag = undefined;
    }
    // notice for downed local travelers
    const n = s.notice || '';
    if (this.last.notice !== n) {
      this.noticeEl.innerHTML = n;
      this.noticeEl.classList.toggle('hidden', !n);
      this.last.notice = n;
    }
    // off-screen markers
    this.drawArrows(s.markers || [], s.cam);
    // level-up countdown + who we wait for
    if (!this.lvEl.classList.contains('hidden')) {
      const foot = this.q('.lv-foot');
      if (foot) {
        const names = (s.waiting || []).map((id) => { const p = s.players.get(id); return p ? esc(p.name) : ''; }).filter(Boolean);
        foot.innerHTML = names.length ? `Waiting for ${names.join(', ')} &middot; <b>${s.lt ?? ''}</b>` : '';
      }
    }
    // feed lines fade
    for (const f of [...this.feedEl.children]) {
      f.t = (f.t || 0) + dt;
      if (f.t > 4.5) f.remove();
    }
    // world-space pops (picked upgrades)
    for (const pop of [...this.worldUI.querySelectorAll('.wpop')]) {
      pop.t = (pop.t || 0) + dt;
      const p = s.players.get(Number(pop.dataset.pid));
      if (pop.t > 1.8 || !p) { pop.remove(); continue; }
      const [sx, sy] = s.cam.project(p.x, 3.2 + pop.t * 0.6, p.z);
      pop.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      pop.style.opacity = pop.t > 1.3 ? (1.8 - pop.t) / 0.5 : 1;
    }
  }

  drawArrows(markers, cam) {
    const W = window.innerWidth, H = window.innerHeight;
    let i = 0;
    for (const m of markers) {
      const [sx, sy, on] = cam.project(m.x, 1, m.z);
      if (on) continue;
      let a = this.arrows[i];
      if (!a) {
        a = el('div', 'arw', '<i></i><img class="pix">');
        this.arrowEl.appendChild(a);
        this.arrows[i] = a;
      }
      i++;
      const cx = W / 2, cy = H / 2;
      let dx = sx - cx, dy = sy - cy;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) { a.style.display = 'none'; continue; }
      const mx = W / 2 - 34, my = H / 2 - 34;
      const k = Math.min(mx / Math.max(1e-3, Math.abs(dx)), my / Math.max(1e-3, Math.abs(dy)));
      const x = cx + dx * k, y = cy + dy * k;
      const ang = Math.atan2(dy, dx);
      a.style.display = '';
      a.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      a.style.setProperty('--c', m.color);
      a.firstChild.style.transform = `rotate(${ang}rad)`;
      const img = a.lastChild;
      if (img.dataset.k !== m.icon) { img.dataset.k = m.icon; img.src = m.icon; }
    }
    for (; i < this.arrows.length; i++) this.arrows[i].style.display = 'none';
  }

  // ---------------------------------------------------------------- moments
  banner(title, sub, dur = 3.2) {
    if (!this.built) return;
    this.q('.hud-banner .t').textContent = title;
    this.q('.hud-banner .s').textContent = sub || '';
    this.bannerEl.classList.remove('hidden', 'out');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('in');
    clearTimeout(this.bannerOut);
    clearTimeout(this.bannerHide);
    this.bannerOut = setTimeout(() => this.bannerEl.classList.add('out'), dur * 1000);
    this.bannerHide = setTimeout(() => this.bannerEl.classList.add('hidden'), dur * 1000 + 600);
  }

  feed(html) {
    if (!this.built) return;
    const f = el('div', 'fl', html);
    this.feedEl.appendChild(f);
    while (this.feedEl.children.length > 5) this.feedEl.firstChild.remove();
  }

  pop(pid, iconId, text) {
    const p = el('div', 'wpop', `<img class="pix" src="${iconURL(iconId, 2)}"><span>${esc(text)}</span>`);
    p.dataset.pid = pid;
    this.worldUI.appendChild(p);
  }

  // ---------------------------------------------------------------- level up
  showChoices(m, players, local) {
    const p = players.get(m.id);
    if (!p || !local.has(m.id)) return;
    this.choice.set(m.id, { opts: m.opts, sel: 0, picked: false, level: m.level });
    this.renderLevelUp(players, local);
    this.sfx('levelup');
  }

  renderLevelUp(players, local) {
    const entries = [...this.choice.entries()];
    if (!entries.length) { this.lvEl.classList.add('hidden'); return; }
    const level = entries[0][1].level;
    let html = `<div class="lv-head"><div class="lv-title">Level Up</div><div class="lv-sub">The party reaches level <b>${level}</b> &middot; each traveler chooses a blessing</div></div><div class="lv-cols">`;
    for (const [pid, c] of entries) {
      const p = players.get(pid);
      const L = local.get(pid);
      if (!p || !L) continue;
      html += `<div class="lv-col${c.picked ? ' done' : ''}" style="--sc:${SEAT_COLORS[p.seat]}"><div class="lv-who"><img class="pix" src="${portrait(p.char)}"><span class="tag">${L.label}</span>${esc(p.name)}</div>`;
      c.opts.forEach((o, i) => {
        const info = optionInfo(o);
        html += `<div class="card${i === c.sel ? ' sel' : ''}${c.picked === i + 1 ? ' picked' : ''}${o.new ? ' new' : ''}" data-pid="${pid}" data-i="${i}">
          <div class="ci"><img class="pix" src="${info.icon}"></div>
          <div class="cb"><div class="ct"><span class="cn">${esc(info.name)}</span><span class="cl">${info.lvl}</span></div>
          <div class="cd">${esc(info.desc)}</div>${info.hint ? `<div class="ch">${esc(info.hint)}</div>` : ''}</div>
          <div class="ck">${info.kind}</div></div>`;
      });
      html += `<div class="lv-wait">${c.picked ? 'Blessing chosen' : ''}</div></div>`;
    }
    html += '</div><div class="lv-foot"></div><div class="lv-help">Move to choose &middot; <b>Space</b> / <b>A</b> / click to take</div>';
    this.lvEl.innerHTML = html;
    this.lvEl.classList.remove('hidden');
  }

  hideLevelUp() {
    this.choice.clear();
    this.lvEl.classList.add('hidden');
  }

  levelInput(pid, m, players, local) {
    const c = this.choice.get(pid);
    if (!c || c.picked) return false;
    const n = c.opts.length;
    let moved = false;
    if (m.up || m.left) { c.sel = (c.sel + n - 1) % n; moved = true; }
    if (m.down || m.right) { c.sel = (c.sel + 1) % n; moved = true; }
    if (moved) { this.sfx('move'); this.renderLevelUp(players, local); }
    if (m.confirm) { this.pick(pid, c.sel, players, local); return true; }
    return moved;
  }

  pick(pid, i, players, local) {
    const c = this.choice.get(pid);
    if (!c || c.picked) return;
    c.picked = i + 1;
    c.sel = i;
    this.send({ t: 'pick', id: pid, i });
    this.sfx('confirm');
    this.renderLevelUp(players, local);
  }

  onClick(e) {
    const card = e.target.closest('.card');
    if (card && this.ctx) {
      this.pick(Number(card.dataset.pid), Number(card.dataset.i), this.ctx.players, this.ctx.local);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (btn && this.onAction) this.onAction(btn.dataset.act);
  }

  onHover(e) {
    const card = e.target.closest('.card');
    if (!card || !this.ctx) return;
    const c = this.choice.get(Number(card.dataset.pid));
    const i = Number(card.dataset.i);
    if (c && !c.picked && c.sel !== i) {
      c.sel = i;
      this.renderLevelUp(this.ctx.players, this.ctx.local);
    }
  }

  // ---------------------------------------------------------------- chest
  chest(p, rewards, gold, isLocal) {
    const ce = this.chestEl;
    ce.innerHTML = `<div class="ch-glow"></div><div class="ch-who">${isLocal ? 'You found' : esc(p ? p.name : 'A traveler') + ' found'} a treasure chest!</div>
      <div class="ch-box"><div class="ch-rays"></div><img class="pix" src="${iconURL('chest', 8)}"></div>
      <div class="ch-items"></div><div class="ch-gold"><img class="pix" src="${iconURL('coin', 2)}"> +${gold}</div>`;
    ce.classList.remove('hidden', 'open');
    const items = ce.querySelector('.ch-items');
    rewards.forEach((r, i) => {
      const info = r.k === 'w' ? { name: WEAPONS[r.id].name } : { name: PASSIVES[r.id].name };
      const it = el('div', 'ci' + (r.evo ? ' evo' : ''), `<img class="pix" src="${iconURL(r.id, 3)}"><span>${esc(info.name)}</span><b>${r.evo ? 'Evolved!' : 'Lv ' + r.lvl}</b>`);
      it.style.animationDelay = (1.25 + i * 0.35) + 's';
      items.appendChild(it);
    });
    ce.querySelector('.ch-gold').style.animationDelay = (1.3 + rewards.length * 0.35) + 's';
    clearTimeout(this.chestTimer);
    this.chestTimer = setTimeout(() => { ce.classList.add('open'); this.sfx('chestopen'); }, 1150);
    this.chestHide = setTimeout(() => ce.classList.add('hidden'), (3.6 + rewards.length * 0.35) * 1000 + 200);
  }

  hideChest() {
    clearTimeout(this.chestTimer);
    clearTimeout(this.chestHide);
    if (this.chestEl) this.chestEl.classList.add('hidden');
  }

  // ---------------------------------------------------------------- results
  results(result, stats, t, level, kills, ctx) {
    this.hideLevelUp();
    this.hideChest();
    this.resultsShown = true;
    const win = result === 'victory';
    const best = stats.reduce((m, s) => (s.total > (m ? m.total : -1) ? s : m), null);
    let html = `<div class="res-panel"><div class="res-title ${win ? 'win' : 'lose'}">${win ? 'Victory' : 'The Lanterns Go Dark'}</div>
      <div class="res-sub">${win ? 'The Nightmother is vanquished. Dawn breaks over the land.' : 'The party has fallen... but the Guild remembers.'}</div>
      <div class="res-stats"><span>Survived <b>${fmtTime(t)}</b></span><span>Level <b>${level}</b></span><span>Foes felled <b>${kills.toLocaleString()}</b></span></div><div class="res-cards">`;
    for (const s of stats) {
      const p = ctx.players.get(s.id);
      const seat = p ? p.seat : 0;
      const L = ctx.local.get(s.id);
      const top = s.dmg.slice(0, 6);
      const maxD = top.length ? top[0][1] : 1;
      html += `<div class="rc${L ? ' local' : ''}" style="--sc:${SEAT_COLORS[seat]}">
        ${best && best.id === s.id && stats.length > 1 ? '<div class="mvp">&#9819; Most Valiant</div>' : ''}
        <img class="rs pix" src="${sprite(s.char, 19)}">
        <div class="rn">${L ? `<span class="tag">${L.label}</span>` : ''}${esc(s.name)}</div>
        <div class="rt">${esc(CHARACTERS[s.char].title)}</div>
        <div class="rl"><span>Felled <b>${s.kills.toLocaleString()}</b></span><span>Damage <b>${Math.round(s.total).toLocaleString()}</b></span></div>
        <div class="rd">${top.map(([w, d]) => `<div class="dr"><img class="pix" src="${iconURL(WEAPONS[w] ? w : w === 'starfall' ? 'starfall' : 'skull', 2)}"><div class="db"><div style="width:${((d / maxD) * 100).toFixed(1)}%"></div></div><b>${d.toLocaleString()}</b></div>`).join('')}</div>
        <div class="rg"><img class="pix" src="${iconURL('coin', 2)}"> ${s.gold} gold${L ? ' <i>to the Guild</i>' : ''}</div>
      </div>`;
    }
    html += `</div><div class="res-foot">${ctx.isHost ? '<button class="btn primary" data-act="lobby">Return to Camp</button>' : '<span class="wait">Waiting for the host to lead the party home&hellip;</span>'}<span class="auto"></span></div></div>`;
    this.resEl.innerHTML = html;
    this.resEl.classList.remove('hidden');
  }

  resultsTick(secsLeft) {
    const a = this.resEl && this.resEl.querySelector('.auto');
    if (a) a.textContent = secsLeft > 0 ? `Returning to camp in ${secsLeft}s` : '';
  }
}

export { ENEMIES, ENEMY_IDS };
