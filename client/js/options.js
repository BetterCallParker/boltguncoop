// Options / pause menu (Esc, or View / Start on a controller). During a run, opening it pauses the
// expedition for everyone. Settings are saved in this browser: graphics (resolution, light rays,
// glow, depth of field, shadows, grain), audio volumes and camera (zoom, screen shake, numbers).
import { ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from '/shared/constants.js';

const KEY = 'lanternbound_options_v1';
const PRESETS = {
  low: { scale: 0.75, shadows: false, rays: 0, bloom: 0.6, dof: 0.5 },
  medium: { scale: 0.9, shadows: true, rays: 0.5, bloom: 0.8, dof: 0.8 },
  high: { scale: 1, shadows: true, rays: 1, bloom: 1, dof: 1 },
  ultra: { scale: 1.3, shadows: true, rays: 1, bloom: 1, dof: 1 },
};
const DEFAULTS = { quality: 'high', ...PRESETS.high, grain: true, master: 0.8, music: 0.7, sfx: 0.9, shake: 1, numbers: true };
const pct = (v) => Math.round(v * 100) + '%';
const ROWS = [
  { sec: 'Graphics' },
  { key: 'quality', label: 'Quality preset', type: 'choice', options: ['low', 'medium', 'high', 'ultra', 'custom'], labels: ['Low', 'Medium', 'High', 'Ultra', 'Custom'], help: 'Sets everything below at once. Low is fastest.' },
  { key: 'scale', label: 'Resolution', type: 'range', min: 0.5, max: 1.5, step: 0.05, fmt: pct, help: 'Lower it if the game stutters.', preset: true },
  { key: 'rays', label: 'Light rays', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: pct, help: 'Strength of the sun shafts. 0% turns them off.', preset: true },
  { key: 'bloom', label: 'Glow', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: pct, help: 'Soft glow around bright lights and spells.', preset: true },
  { key: 'dof', label: 'Depth of field', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: pct, help: 'The tilt-shift blur at the top and bottom of the screen.', preset: true },
  { key: 'shadows', label: 'Shadows', type: 'bool', help: 'Sun shadows (light rays need them).', preset: true },
  { key: 'grain', label: 'Film grain & vignette', type: 'bool', help: 'Grain and darkened screen edges.' },
  { sec: 'Audio' },
  { key: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'music', label: 'Music', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'sfx', label: 'Sound effects', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { sec: 'Camera' },
  { key: 'zoom', label: 'Zoom', type: 'range', min: ZOOM_MIN, max: ZOOM_MAX, step: 0.05, fmt: (v) => Math.round((v / ZOOM_DEFAULT) * 100) + '%', help: 'Higher shows more of the battlefield. Mouse wheel and right stick too.' },
  { key: 'shake', label: 'Screen shake', type: 'range', min: 0, max: 1, step: 0.1, fmt: pct },
  { key: 'numbers', label: 'Damage numbers', type: 'bool' },
];
const ITEMS = ROWS.filter((r) => !r.sec);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class Options {
  constructor({ R, audio, view, sfx }) {
    this.R = R;
    this.audio = audio;
    this.view = view;
    this.sfx = sfx;
    this.s = { ...DEFAULTS };
    try { Object.assign(this.s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
    this.open = false;
    this.row = 0;
    this.ctx = null; // { inRun, isHost, pausedBy }
    this.root = document.getElementById('modal');
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.apply();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* ignore */ }
  }

  apply() {
    const s = this.s;
    this.R.applySettings({ scale: s.scale, rays: s.rays, bloom: s.bloom, dof: s.dof, shadows: s.shadows, grain: s.grain });
    this.audio.setVolumes(s.master, s.music, s.sfx);
  }

  get(key) {
    return key === 'zoom' ? this.view.zoom : this.s[key];
  }

  set(key, v) {
    const row = ITEMS.find((r) => r.key === key);
    if (!row) return;
    if (row.type === 'range') v = Math.min(row.max, Math.max(row.min, Math.round(v / row.step) * row.step));
    if (key === 'zoom') { this.view.setZoom(v); this.render(); return; }
    if (key === 'quality') {
      this.s.quality = v;
      if (PRESETS[v]) Object.assign(this.s, PRESETS[v]);
    } else {
      this.s[key] = v;
      if (row.preset) {
        const match = Object.entries(PRESETS).find(([, p]) => Object.entries(p).every(([k, pv]) => this.s[k] === pv));
        this.s.quality = match ? match[0] : 'custom';
      }
    }
    this.apply();
    this.save();
    this.render();
  }

  step(key, dir) {
    const row = ITEMS.find((r) => r.key === key);
    if (!row) return;
    const cur = this.get(key);
    if (row.type === 'bool') this.set(key, !cur);
    else if (row.type === 'choice') {
      const opts = row.options.filter((o) => o !== 'custom');
      let i = opts.indexOf(cur);
      if (i < 0) i = 2;
      this.set(key, opts[(i + dir + opts.length) % opts.length]);
    } else this.set(key, cur + dir * row.step);
    this.sfx('move');
  }

  // ctx: { inRun, isHost, pausedBy }
  show(ctx) {
    this.ctx = ctx;
    this.open = true;
    this.row = 0;
    this.root.classList.remove('hidden');
    this.render();
    this.sfx('open');
  }

  hide() {
    this.open = false;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.sfx('back');
    if (this.onClose) this.onClose();
  }

  // m: Input.menu() edges from any local device; returns true when the menu used them
  handle(m) {
    if (!this.open) return false;
    const n = ITEMS.length + this.buttons().length;
    if (m.up) { this.row = (this.row + n - 1) % n; this.sfx('move'); this.render(); }
    if (m.down) { this.row = (this.row + 1) % n; this.sfx('move'); this.render(); }
    if (this.row < ITEMS.length) {
      const r = ITEMS[this.row];
      if (m.left) this.step(r.key, -1);
      if (m.right || (m.confirm && r.type !== 'range')) this.step(r.key, 1);
    } else if (m.confirm) this.action(this.buttons()[this.row - ITEMS.length].act);
    if (m.back) this.hide();
    return true;
  }

  buttons() {
    const b = [{ act: 'resume', label: this.ctx && this.ctx.inRun ? 'Resume' : 'Close' }];
    if (this.ctx && this.ctx.inRun && this.ctx.isHost) b.push({ act: 'abandon', label: this.confirmAbandon ? 'Really abandon?' : 'Abandon expedition' });
    return b;
  }

  action(act) {
    if (act === 'resume') this.hide();
    else if (act === 'abandon') {
      if (!this.confirmAbandon) { this.confirmAbandon = true; this.render(); return; }
      this.confirmAbandon = false;
      if (this.onAbandon) this.onAbandon();
      this.hide();
    }
  }

  onClick(e) {
    const t = e.target.closest('[data-k], [data-act]');
    if (!t) return;
    if (t.dataset.act) { this.action(t.dataset.act); return; }
    const key = t.dataset.k;
    const dir = Number(t.dataset.d || 1);
    this.row = ITEMS.findIndex((r) => r.key === key);
    if (t.tagName === 'INPUT') return;
    this.step(key, dir);
  }

  onInput(e) {
    const t = e.target;
    if (t.tagName !== 'INPUT' || !t.dataset.k) return;
    this.set(t.dataset.k, Number(t.value));
  }

  render() {
    if (!this.open) return;
    const ctx = this.ctx || {};
    const p = el('div', 'opt panel');
    p.appendChild(el('h2', '', ctx.inRun ? 'Paused' : 'Options'));
    if (ctx.inRun) p.appendChild(el('div', 'opt-sub', 'The expedition is paused for the whole party.'));
    const list = el('div', 'opt-list');
    let i = 0;
    for (const r of ROWS) {
      if (r.sec) { list.appendChild(el('div', 'opt-sec', r.sec)); continue; }
      const idx = i++;
      const row = el('div', 'opt-row' + (idx === this.row ? ' focus' : ''));
      const v = this.get(r.key);
      let ctl = '';
      if (r.type === 'range') {
        ctl = `<b class="arr" data-k="${r.key}" data-d="-1">&#9664;</b><input type="range" id="opt-${r.key}" data-k="${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}"><b class="arr" data-k="${r.key}" data-d="1">&#9654;</b><span class="val">${r.fmt(v)}</span>`;
      } else if (r.type === 'bool') {
        ctl = `<span class="tog${v ? ' on' : ''}" data-k="${r.key}">${v ? 'On' : 'Off'}</span>`;
      } else {
        const lab = r.labels[r.options.indexOf(v)] || 'Custom';
        ctl = `<b class="arr" data-k="${r.key}" data-d="-1">&#9664;</b><span class="val wide">${lab}</span><b class="arr" data-k="${r.key}" data-d="1">&#9654;</b>`;
      }
      row.innerHTML = `<div class="ol"><span class="on">${r.label}</span>${r.help && idx === this.row ? `<span class="oh">${r.help}</span>` : ''}</div><div class="oc">${ctl}</div>`;
      list.appendChild(row);
    }
    p.appendChild(list);
    const btns = el('div', 'opt-btns');
    this.buttons().forEach((b, k) => {
      const btn = el('button', 'btn' + (k === 0 ? ' primary' : '') + (this.row === ITEMS.length + k ? ' focus' : ''), b.label);
      btn.dataset.act = b.act;
      btns.appendChild(btn);
    });
    p.appendChild(btns);
    p.appendChild(el('div', 'opt-help', '<b>&#8593;&#8595;</b> choose &middot; <b>&#8592;&#8594;</b> adjust &middot; <b>Esc</b> / <b>B</b> close'));
    this.root.replaceChildren(p);
    const f = p.querySelector('.opt-row.focus');
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }
}
