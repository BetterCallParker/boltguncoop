// Keyboard, touch and gamepads (Xbox and other controllers). Every device is a "slot": 'kb' or
// 'gp:N'. The 'kb' slot is the main traveler on this screen: it listens to the keyboard, touch
// and every controller that hasn't joined as its own traveler, so picking up an Xbox pad just
// works. Another controller presses Start in camp to join as an extra traveler.
const DEADZONE = 0.2;
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
const FLICK_R = 20, FLICK_L = 21, FLICK_D = 22, FLICK_U = 23;

function radial(x, y) {
  const l = Math.hypot(x, y);
  if (l < DEADZONE) return [0, 0];
  const s = Math.min(1, (l - DEADZONE) / (1 - DEADZONE)) / l;
  return [x * s, y * s];
}

function listPads() {
  try {
    return navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  } catch {
    return []; // gamepads blocked in this frame
  }
}

// Standard layout for any controller. Browsers that don't recognise an Xbox pad report its own
// order (A B X Y LB RB View Menu Guide LS RS, triggers + right stick on axes 2-5, d-pad on 6-7).
function readPad(gp) {
  const raw = (i) => { const b = gp.buttons[i]; return !!b && (b.pressed || b.value > 0.4); };
  const ax = gp.axes || [];
  if (gp.mapping === 'standard' || gp.buttons.length >= 17) {
    return { btn: raw, lx: ax[0] || 0, ly: ax[1] || 0, rx: ax[2] || 0, ry: ax[3] || 0 };
  }
  const MAP = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 8: 6, 9: 7, 10: 9, 11: 10 };
  return {
    btn: (i) => {
      if (i === PAD.LT) return (ax[2] ?? -1) > 0.3;
      if (i === PAD.RT) return (ax[5] ?? -1) > 0.3;
      if (i === PAD.UP) return (ax[7] ?? 0) < -0.5;
      if (i === PAD.DOWN) return (ax[7] ?? 0) > 0.5;
      if (i === PAD.LEFT) return (ax[6] ?? 0) < -0.5;
      if (i === PAD.RIGHT) return (ax[6] ?? 0) > 0.5;
      return MAP[i] !== undefined ? raw(MAP[i]) : false;
    },
    lx: ax[0] || 0, ly: ax[1] || 0, rx: ax[3] || 0, ry: ax[4] || 0,
  };
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.prevPad = new Map();
    this.padEdges = new Map();
    this.prevStick = new Map();
    this.state = new Map(); // pad index -> normalized pad
    this.claimed = new Set(); // pad indices that joined as their own traveler
    this.listeners = [];
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (BLOCK.has(e.code)) e.preventDefault();
      for (const f of this.listeners) f();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.initTouch();
  }

  // touch: drag anywhere outside the menus for a floating thumbstick (drives the 'kb' slot)
  initTouch() {
    this.touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    const base = document.createElement('div');
    const knob = document.createElement('div');
    base.style.cssText = 'position:fixed;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:2px solid rgba(246,220,148,.55);background:rgba(10,12,26,.25);pointer-events:none;z-index:60;display:none';
    knob.style.cssText = 'position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(246,220,148,.6);pointer-events:none;z-index:61;display:none';
    document.body.append(base, knob);
    const UI = 'button, input, a, .card, [data-act], .lb-left, .lb-right, .lb-settings, .lb-party, .panel, .hud-res, .fsbtn';
    const show = (on) => { base.style.display = knob.style.display = on ? 'block' : 'none'; };
    window.addEventListener('touchstart', (e) => {
      for (const f of this.listeners) f();
      if (this.touch.id !== null) return;
      for (const t of e.changedTouches) {
        if (t.target && t.target.closest && t.target.closest(UI)) continue;
        Object.assign(this.touch, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY });
        base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px';
        knob.style.left = t.clientX + 'px'; knob.style.top = t.clientY + 'px';
        show(true);
        break;
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.touch.id) continue;
        this.touch.x = t.clientX;
        this.touch.y = t.clientY;
        const [x, y] = this.touchVec();
        knob.style.left = this.touch.ox + x * 50 + 'px';
        knob.style.top = this.touch.oy + y * 50 + 'px';
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.touch.id) { this.touch.id = null; show(false); }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }

  touchVec() {
    const T = this.touch;
    if (!T || T.id === null) return [0, 0];
    const x = (T.x - T.ox) / 50, y = (T.y - T.oy) / 50;
    const l = Math.hypot(x, y);
    if (l < 0.15) return [0, 0];
    return l > 1 ? [x / l, y / l] : [x, y];
  }

  onActivity(f) { this.listeners.push(f); }

  pads() {
    return listPads().filter((gp) => gp && gp.connected);
  }

  pad(slot) {
    if (!slot || slot === 'kb') return null;
    return listPads()[Number(slot.slice(3))] || null;
  }

  // controllers that follow the main 'kb' slot
  freePads() {
    const out = [];
    for (const [i, st] of this.state) if (!this.claimed.has(i)) out.push([i, st]);
    return out;
  }

  poll() {
    this.padEdges.clear();
    const seen = new Set();
    for (const gp of this.pads()) {
      const st = readPad(gp);
      seen.add(gp.index);
      this.state.set(gp.index, st);
      let raw = 0;
      for (let i = 0; i < 16; i++) if (st.btn(i)) raw |= 1 << i;
      const [sx, sy] = radial(st.lx, st.ly);
      const ps = this.prevStick.get(gp.index) || [0, 0];
      let flick = 0;
      if (sx > 0.6 && ps[0] <= 0.6) flick |= 1 << FLICK_R;
      if (sx < -0.6 && ps[0] >= -0.6) flick |= 1 << FLICK_L;
      if (sy > 0.6 && ps[1] <= 0.6) flick |= 1 << FLICK_D;
      if (sy < -0.6 && ps[1] >= -0.6) flick |= 1 << FLICK_U;
      this.prevStick.set(gp.index, [sx, sy]);
      const prev = this.prevPad.get(gp.index) || 0;
      this.padEdges.set(gp.index, (raw & ~prev) | flick);
      this.prevPad.set(gp.index, raw);
      if (raw & ~prev) for (const f of this.listeners) f();
    }
    for (const i of [...this.state.keys()]) if (!seen.has(i)) this.state.delete(i);
  }

  endFrame() {
    this.pressed.clear();
  }

  keyPressed(code) {
    return this.pressed.has(code);
  }

  padPressed(index, button) {
    return ((this.padEdges.get(index) || 0) & (1 << button)) !== 0;
  }

  padMove(st) {
    let [x, z] = radial(st.lx, st.ly);
    if (st.btn(PAD.LEFT)) x = -1;
    if (st.btn(PAD.RIGHT)) x = 1;
    if (st.btn(PAD.UP)) z = -1;
    if (st.btn(PAD.DOWN)) z = 1;
    return [x, z];
  }

  // movement vector for a slot (x right, z down-screen), length <= 1
  move(slot) {
    let x = 0, z = 0;
    if (slot === 'kb') {
      const k = (c) => this.keys.has(c);
      if (k('KeyA') || k('ArrowLeft')) x -= 1;
      if (k('KeyD') || k('ArrowRight')) x += 1;
      if (k('KeyW') || k('ArrowUp')) z -= 1;
      if (k('KeyS') || k('ArrowDown')) z += 1;
      const [tx, tz] = this.touchVec();
      x += tx;
      z += tz;
      for (const [, st] of this.freePads()) {
        const [px, pz] = this.padMove(st);
        x += px;
        z += pz;
      }
    } else {
      const st = this.state.get(Number(slot.slice(3)));
      if (st) [x, z] = this.padMove(st);
    }
    const l = Math.hypot(x, z);
    return l > 1 ? [x / l, z / l] : [x, z];
  }

  // camera zoom input: -1 (closer) .. 1 (farther). Keyboard - / = and the right stick.
  zoomAxis(slot) {
    let v = 0;
    if (slot === 'kb') {
      if (this.keys.has('Minus') || this.keys.has('NumpadSubtract') || this.keys.has('PageDown')) v += 1;
      if (this.keys.has('Equal') || this.keys.has('NumpadAdd') || this.keys.has('PageUp')) v -= 1;
      for (const [, st] of this.freePads()) v += radial(0, st.ry)[1];
    } else {
      const st = this.state.get(Number(slot.slice(3)));
      if (st) v += radial(0, st.ry)[1];
    }
    return Math.max(-1, Math.min(1, v));
  }

  padMenu(index, m, withStart) {
    const e = this.padEdges.get(index) || 0;
    const bit = (i) => (e & (1 << i)) !== 0;
    m.up ||= bit(PAD.UP) || bit(FLICK_U);
    m.down ||= bit(PAD.DOWN) || bit(FLICK_D);
    m.left ||= bit(PAD.LEFT) || bit(FLICK_L);
    m.right ||= bit(PAD.RIGHT) || bit(FLICK_R);
    m.confirm ||= bit(PAD.A);
    m.back ||= bit(PAD.B);
    if (withStart) m.start ||= bit(PAD.MENU);
    m.alt ||= bit(PAD.Y) || bit(PAD.VIEW);
    m.guild ||= bit(PAD.X);
    m.prev ||= bit(PAD.LB);
    m.next ||= bit(PAD.RB);
    m.tab ||= bit(PAD.LB) || bit(PAD.RB);
  }

  // edge-triggered menu actions
  menu(slot) {
    const m = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, alt: false, tab: false, guild: false, prev: false, next: false };
    if (slot === 'kb') {
      const p = (c) => this.pressed.has(c);
      m.up = p('KeyW') || p('ArrowUp');
      m.down = p('KeyS') || p('ArrowDown');
      m.left = p('KeyA') || p('ArrowLeft');
      m.right = p('KeyD') || p('ArrowRight');
      m.confirm = p('Space') || p('Enter');
      m.back = p('Escape') || p('Backspace');
      m.start = p('Enter');
      m.alt = p('Tab');
      m.guild = p('KeyG');
      m.prev = p('KeyQ');
      m.next = p('KeyE');
      // Start on a free controller is "join as a new traveler", so it isn't part of the main slot
      for (const [i] of this.freePads()) this.padMenu(i, m, false);
      return m;
    }
    this.padMenu(Number(slot.slice(3)), m, true);
    return m;
  }

  // controller rumble (Xbox pads and others that support it); 'kb' rumbles the free controllers
  rumble(slot, strong = 0.5, weak = 0.3, ms = 120) {
    const list = slot === 'kb' ? this.freePads().map(([i]) => i) : [Number(String(slot).slice(3))];
    const all = listPads();
    for (const i of list) {
      const gp = all[i];
      const act = gp && gp.vibrationActuator;
      if (!act || !act.playEffect) continue;
      try {
        const p = act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
        if (p && p.catch) p.catch(() => {});
      } catch { /* not supported */ }
    }
  }
}
