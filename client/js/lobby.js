// The Travelers' Camp: character select, party + ready-up, host run settings and the Guild shop.
import { CHARACTERS } from '/shared/characters.js';
import { WEAPONS } from '/shared/items.js';
import { SETTINGS, settingLabel } from '/shared/settings.js';
import { POWERUPS } from '/shared/meta.js';
import { MAX_PLAYERS, SEAT_COLORS, PHASE } from '/shared/constants.js';
import { portraitCanvas, fullSpriteCanvas } from './sprites.js';
import { iconURL } from './icons.js';

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const portraitURL = new Map();
export function portrait(ci) {
  if (!portraitURL.has(ci)) portraitURL.set(ci, portraitCanvas(ci, 4).toDataURL());
  return portraitURL.get(ci);
}
const bigURL = new Map();
function bigSprite(ci) {
  if (!bigURL.has(ci)) bigURL.set(ci, fullSpriteCanvas(ci, 7, 6).toDataURL());
  return bigURL.get(ci);
}

export class Lobby {
  constructor({ send, sfx, guild }) {
    this.send = send;
    this.sfx = sfx;
    this.guild = guild;
    this.root = $('lobby');
    this.plateRoot = $('plates');
    this.local = new Map(); // playerId -> { cursor, mode, setRow, guildRow }
    this.hover = -1;
    this.key = '';
    this.visible = false;
    this.root.addEventListener('click', (e) => this.onClick(e, 1));
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onClick(e, -1);
    });
    this.root.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-c]');
      const h = t ? Number(t.dataset.c) : -1;
      if (h !== this.hover) {
        this.hover = h;
        this.key = '';
      }
    });
  }

  state(id) {
    if (!this.local.has(id)) this.local.set(id, { cursor: -1, mode: 'pick', setRow: 0, guildRow: 0 });
    return this.local.get(id);
  }

  show(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    this.plateRoot.classList.toggle('hidden', !on);
    this.key = '';
  }

  // m: Input.menu(slot) edges for one local player
  handle(id, m, ctx) {
    const st = this.state(id);
    const r = ctx.roster.get(id);
    if (!r) return;
    if (st.cursor < 0) st.cursor = r.char;
    if (m.guild && st.mode !== 'guild') {
      st.mode = 'guild';
      this.sfx('open');
      return;
    }
    if (st.mode === 'guild') {
      if (m.up) st.guildRow = (st.guildRow + POWERUPS.length - 1) % POWERUPS.length;
      if (m.down) st.guildRow = (st.guildRow + 1) % POWERUPS.length;
      if (m.up || m.down) this.sfx('move');
      if (m.confirm) this.buy(POWERUPS[st.guildRow].id, id);
      if (m.back || m.guild) {
        st.mode = 'pick';
        this.sfx('back');
      }
      this.key = '';
      return;
    }
    if (st.mode === 'settings') {
      if (m.up) st.setRow = (st.setRow + SETTINGS.length - 1) % SETTINGS.length;
      if (m.down) st.setRow = (st.setRow + 1) % SETTINGS.length;
      if (m.up || m.down) this.sfx('move');
      if (m.left || m.right || m.confirm) this.cycleSetting(SETTINGS[st.setRow].key, m.left ? -1 : 1, ctx);
      if (m.back || m.alt) {
        st.mode = 'pick';
        this.sfx('back');
      }
      this.key = '';
      return;
    }
    let c = st.cursor;
    if (!r.ready) {
      if (m.left) c = (c + CHARACTERS.length - 1) % CHARACTERS.length;
      if (m.right) c = (c + 1) % CHARACTERS.length;
      if (m.up) c = (c + CHARACTERS.length - 2) % CHARACTERS.length;
      if (m.down) c = (c + 2) % CHARACTERS.length;
      if (c !== st.cursor) {
        st.cursor = c;
        this.send({ t: 'char', id, c });
        this.sfx('move');
        this.key = '';
      }
    }
    if (m.confirm) {
      this.send({ t: 'ready', id, v: !r.ready });
      this.sfx(r.ready ? 'back' : 'confirm');
    } else if (m.back && r.ready) {
      this.send({ t: 'ready', id, v: false });
      this.sfx('back');
    }
    if (m.alt && ctx.isHost) {
      st.mode = 'settings';
      this.sfx('open');
      this.key = '';
    }
  }

  cycleSetting(key, dir, ctx) {
    if (!ctx.isHost) return;
    const d = SETTINGS.find((x) => x.key === key);
    const cur = ctx.settings[key] ?? d.def;
    const n = d.options.length;
    this.send({ t: 'set', key, val: (cur + dir + n) % n });
    this.sfx('move');
  }

  buy(puId, id) {
    if (this.guild.buy(puId)) {
      this.sfx('buy');
      this.send({ t: 'meta', id, ranks: this.guild.ranks });
      for (const pid of this.local.keys()) if (pid !== id) this.send({ t: 'meta', id: pid, ranks: this.guild.ranks });
    } else this.sfx('deny');
    this.key = '';
  }

  onClick(e, dir) {
    const t = e.target.closest('[data-act]');
    if (!t || !this.ctx) return;
    const ctx = this.ctx;
    const id = ctx.primaryId;
    const act = t.dataset.act;
    if (act === 'char' && id) {
      const r = ctx.roster.get(id);
      if (r && r.ready) return;
      const c = Number(t.dataset.c);
      this.state(id).cursor = c;
      this.send({ t: 'char', id, c });
      this.sfx('move');
    } else if (act === 'ready' && id) {
      const r = ctx.roster.get(id);
      this.send({ t: 'ready', id, v: !(r && r.ready) });
      this.sfx(r && r.ready ? 'back' : 'confirm');
    } else if (act === 'set') {
      this.cycleSetting(t.dataset.key, Number(t.dataset.dir || dir), ctx);
    } else if (act === 'guild' && id) {
      const st = this.state(id);
      st.mode = st.mode === 'guild' ? 'pick' : 'guild';
      this.sfx('open');
    } else if (act === 'buy' && id) {
      this.buy(t.dataset.pu, id);
    } else if (act === 'refund') {
      this.guild.refund();
      for (const pid of this.local.keys()) this.send({ t: 'meta', id: pid, ranks: this.guild.ranks });
      this.sfx('back');
    } else if (act === 'join') {
      if (this.onJoinClick) this.onJoinClick();
    }
    this.key = '';
  }

  // ctx: { roster: Map, settings, isHost, hostName, local: Map(id -> {label, seat}), primaryId, room, phase, phaseT }
  render(ctx) {
    this.ctx = ctx;
    const humans = [...ctx.roster.values()].sort((a, b) => a.seat - b.seat);
    const states = [...ctx.local.keys()].map((id) => [id, this.state(id)]);
    const prim = ctx.primaryId ? this.state(ctx.primaryId) : null;
    const focus = this.hover >= 0 ? this.hover : prim && prim.cursor >= 0 ? prim.cursor : (ctx.roster.get(ctx.primaryId)?.char ?? 0);
    const key = JSON.stringify([humans, ctx.settings, ctx.isHost, states, focus, ctx.phase, Math.ceil(3.2 - (ctx.phaseT || 0)), this.guild.gold, this.guild.ranks, ctx.hostName]);
    if (key === this.key) return;
    this.key = key;

    // header
    const head = el('div', 'lb-head');
    const title = el('div', 'lb-title');
    title.append(el('span', 'orn', '❖'), document.createTextNode(" The Travelers' Camp "), el('span', 'orn', '❖'));
    head.append(title, el('div', 'lb-sub', 'Gather your party. When everyone is ready, the night begins.'));
    const room = el('div', 'lb-room panel');
    room.append(el('span', 'k', 'ROOM'), el('b', '', ctx.room));
    const gold = el('div', 'lb-gold panel');
    gold.append(el('img', 'ico'), document.createTextNode(this.guild.gold.toLocaleString()));
    gold.firstChild.src = iconURL('coin', 2);

    // traveler roster (2 columns)
    const left = el('div', 'lb-left panel');
    left.appendChild(el('h2', '', 'Travelers'));
    const grid = el('div', 'lb-grid');
    CHARACTERS.forEach((ch, i) => {
      const card = el('div', 'lb-trav');
      card.dataset.act = 'char';
      card.dataset.c = i;
      if (i === focus) card.classList.add('focus');
      const img = el('img', 'pix');
      img.src = portrait(i);
      card.appendChild(img);
      const txt = el('div', 'tx');
      txt.append(el('div', 'nm', ch.name), el('div', 'tt', ch.title.replace('The ', '')));
      card.appendChild(txt);
      const cur = el('div', 'curs');
      for (const [id, st] of states) {
        const r = ctx.roster.get(id);
        if (!r) continue;
        const showAt = r.ready ? r.char : st.cursor >= 0 ? st.cursor : r.char;
        if (showAt !== i) continue;
        const b = el('span', 'cur', ctx.local.get(id).label);
        b.style.background = SEAT_COLORS[r.seat % SEAT_COLORS.length];
        cur.appendChild(b);
        card.classList.add('picked');
      }
      card.appendChild(cur);
      grid.appendChild(card);
    });
    left.appendChild(grid);

    // focused traveler details
    const ch = CHARACTERS[focus] || CHARACTERS[0];
    const right = el('div', 'lb-right panel');
    const big = el('img', 'pix big');
    big.src = bigSprite(focus);
    const info = el('div', 'info');
    info.append(el('div', 'nm', ch.name), el('div', 'tt', ch.title), el('p', 'desc', ch.desc));
    const w = WEAPONS[ch.weapon];
    const wrow = el('div', 'weap');
    const wi = el('img', 'pix');
    wi.src = iconURL(ch.weapon, 3);
    const wt = el('div');
    wt.append(el('div', 'wn', w.name), el('div', 'wd', w.desc));
    wrow.append(wi, wt);
    const perk = el('div', 'perk');
    perk.append(el('span', 'k', 'Gift'), document.createTextNode(' ' + ch.perk));
    const top = el('div', 'top');
    top.append(big, info);
    right.append(top, el('div', 'lbl', 'Starting Weapon'), wrow, perk);

    // settings
    const set = el('div', 'lb-settings panel');
    set.appendChild(el('h2', '', 'Expedition'));
    set.appendChild(el('div', 'hostline', ctx.isHost ? 'You lead the party. Press Tab / Y to change settings.' : `Led by ${ctx.hostName || '...'}`));
    const editRow = states.find(([, st]) => st.mode === 'settings');
    SETTINGS.forEach((d, i) => {
      const row = el('div', 'set' + (editRow && editRow[1].setRow === i ? ' focus' : ''));
      row.appendChild(el('span', 'sl', d.label));
      const v = el('span', 'sv');
      if (ctx.isHost) {
        const l = el('b', 'arr', '◀');
        l.dataset.act = 'set'; l.dataset.key = d.key; l.dataset.dir = -1;
        const r = el('b', 'arr', '▶');
        r.dataset.act = 'set'; r.dataset.key = d.key; r.dataset.dir = 1;
        v.append(l, el('span', 'val', settingLabel(ctx.settings, d.key)), r);
      } else v.append(el('span', 'val', settingLabel(ctx.settings, d.key)));
      row.appendChild(v);
      set.appendChild(row);
    });

    // party slots
    const party = el('div', 'lb-party');
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const r = humans.find((h) => h.seat === i);
      const slot = el('div', 'slot' + (r ? '' : ' empty') + (r && r.ready ? ' ready' : ''));
      slot.style.setProperty('--sc', SEAT_COLORS[i]);
      if (r) {
        const img = el('img', 'pix');
        img.src = portrait(r.char);
        slot.appendChild(img);
        const L = ctx.local.get(r.id);
        const nm = el('div', 'pn');
        if (L) nm.appendChild(el('span', 'tag', L.label));
        nm.appendChild(document.createTextNode(r.name));
        slot.append(nm, el('div', 'pc', CHARACTERS[r.char].name), el('div', 'st', r.ready ? 'Ready' : 'Choosing...'));
        if (r.client === ctx.hostClient) slot.appendChild(el('div', 'crown', '♛'));
      } else {
        const j = el('div', 'join', 'Press A / Enter to join');
        j.dataset.act = 'join';
        slot.appendChild(j);
      }
      party.appendChild(slot);
    }

    // actions
    const actions = el('div', 'lb-actions');
    const me = ctx.roster.get(ctx.primaryId);
    const ready = el('button', 'btn primary' + (me && me.ready ? ' on' : ''), me ? (me.ready ? 'Ready!' : 'Ready Up') : 'Join');
    ready.dataset.act = me ? 'ready' : 'join';
    const gbtn = el('button', 'btn', 'Guild');
    gbtn.dataset.act = 'guild';
    const readyN = humans.filter((h) => h.ready).length;
    let status;
    if (ctx.phase === PHASE.COUNTDOWN) status = `The party sets out in ${Math.max(1, Math.ceil(3.2 - ctx.phaseT))}...`;
    else if (!humans.length) status = 'Waiting for travelers...';
    else status = `${readyN} / ${humans.length} ready`;
    actions.append(gbtn, ready, el('div', 'status', status));
    const hints = el('div', 'lb-hints');
    for (const [k, v] of [['← → / Stick', 'Choose'], ['Space / A', 'Ready'], ['Tab / Y', 'Settings (leader)'], ['G / X', 'Guild'], ['Enter / A', 'Join (new device)']]) {
      const h = el('span');
      h.append(el('b', '', k), document.createTextNode(' ' + v));
      hints.appendChild(h);
    }

    const nodes = [head, room, gold, left, right, set, party, actions, hints];
    // guild overlay
    const gs = states.find(([, st]) => st.mode === 'guild');
    if (gs) nodes.push(this.guildPanel(gs[1]));
    this.root.replaceChildren(...nodes);
  }

  guildPanel(st) {
    const g = el('div', 'guild panel');
    g.appendChild(el('h2', '', "The Adventurers' Guild"));
    const sub = el('div', 'gsub');
    const img = el('img', 'ico');
    img.src = iconURL('coin', 2);
    sub.append(document.createTextNode('Spend gold earned on expeditions on permanent blessings.  '), img, el('b', '', this.guild.gold.toLocaleString()));
    g.appendChild(sub);
    const list = el('div', 'glist');
    POWERUPS.forEach((pu, i) => {
      const r = this.guild.rank(pu.id);
      const row = el('div', 'gr' + (st.guildRow === i ? ' focus' : '') + (r >= pu.max ? ' max' : ''));
      row.dataset.act = 'buy';
      row.dataset.pu = pu.id;
      const pips = el('span', 'pips');
      for (let k = 0; k < pu.max; k++) pips.appendChild(el('i', k < r ? 'on' : ''));
      const cost = this.guild.nextCost(pu);
      row.append(el('span', 'gn', pu.name), el('span', 'gd', pu.desc), pips, el('span', 'gc', cost ? cost.toLocaleString() : 'MAX'));
      list.appendChild(row);
    });
    g.appendChild(list);
    const foot = el('div', 'gfoot');
    const ref = el('button', 'btn small', 'Refund all');
    ref.dataset.act = 'refund';
    const close = el('button', 'btn small', 'Close (Esc / B)');
    close.dataset.act = 'guild';
    foot.append(ref, close);
    g.appendChild(foot);
    return g;
  }

  // name plates over the party standing at the fire: [{ name, ready, x, y, seat, local }]
  plates(list) {
    const key = JSON.stringify(list.map((p) => [p.name, p.ready, p.seat, p.local]));
    if (key !== this.plateKey) {
      this.plateKey = key;
      this.plateRoot.replaceChildren(...list.map((p) => {
        const d = el('div', 'plate' + (p.ready ? ' ready' : ''));
        d.style.setProperty('--sc', SEAT_COLORS[p.seat % SEAT_COLORS.length]);
        if (p.local) d.appendChild(el('span', 'tag', p.local));
        d.appendChild(document.createTextNode(p.name));
        if (p.ready) d.appendChild(el('span', 'rd', 'READY'));
        return d;
      }));
    }
    list.forEach((p, i) => {
      const d = this.plateRoot.children[i];
      if (d) d.style.transform = `translate(-50%, -100%) translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
    });
  }
}
