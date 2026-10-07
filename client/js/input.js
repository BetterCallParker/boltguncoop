// Keyboard + Xbox/standard gamepads. Every device is a "slot": 'kb' or 'gp:N'.
const DEADZONE = 0.2;
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

function radial(x, y) {
  const l = Math.hypot(x, y);
  if (l < DEADZONE) return [0, 0];
  const s = Math.min(1, (l - DEADZONE) / (1 - DEADZONE)) / l;
  return [x * s, y * s];
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.prevPad = new Map();
    this.padEdges = new Map();
    this.prevStick = new Map();
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
    const UI = 'button, input, a, .card, [data-act], .lb-left, .lb-right, .lb-settings, .lb-party, .panel, .hud-res';
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
    const out = [];
    for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) if (gp && gp.connected) out.push(gp);
    return out;
  }

  pad(slot) {
    if (!slot || slot === 'kb') return null;
    return (navigator.getGamepads ? navigator.getGamepads() : [])[Number(slot.slice(3))] || null;
  }

  poll() {
    this.padEdges.clear();
    for (const gp of this.pads()) {
      let raw = 0;
      gp.buttons.forEach((b, i) => { if (b && (b.pressed || b.value > 0.4)) raw |= 1 << i; });
      const [sx, sy] = radial(gp.axes[0] || 0, gp.axes[1] || 0);
      const ps = this.prevStick.get(gp.index) || [0, 0];
      let flick = 0;
      if (sx > 0.6 && ps[0] <= 0.6) flick |= 1 << 20;
      if (sx < -0.6 && ps[0] >= -0.6) flick |= 1 << 21;
      if (sy > 0.6 && ps[1] <= 0.6) flick |= 1 << 22;
      if (sy < -0.6 && ps[1] >= -0.6) flick |= 1 << 23;
      this.prevStick.set(gp.index, [sx, sy]);
      const prev = this.prevPad.get(gp.index) || 0;
      this.padEdges.set(gp.index, (raw & ~prev) | flick);
      this.prevPad.set(gp.index, raw);
      if (raw & ~prev) for (const f of this.listeners) f();
    }
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

  // movement vector for a slot (x right, z down-screen), length <= 1
  move(slot) {
    if (slot === 'kb') {
      const k = (c) => this.keys.has(c);
      let x = 0, z = 0;
      if (k('KeyA') || k('ArrowLeft')) x -= 1;
      if (k('KeyD') || k('ArrowRight')) x += 1;
      if (k('KeyW') || k('ArrowUp')) z -= 1;
      if (k('KeyS') || k('ArrowDown')) z += 1;
      const [tx, tz] = this.touchVec();
      x += tx;
      z += tz;
      const l = Math.hypot(x, z);
      return l > 1 ? [x / l, z / l] : [x, z];
    }
    const gp = this.pad(slot);
    if (!gp) return [0, 0];
    let [x, z] = radial(gp.axes[0] || 0, gp.axes[1] || 0);
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    if (b(PAD.LEFT)) x = -1;
    if (b(PAD.RIGHT)) x = 1;
    if (b(PAD.UP)) z = -1;
    if (b(PAD.DOWN)) z = 1;
    const l = Math.hypot(x, z);
    return l > 1 ? [x / l, z / l] : [x, z];
  }

  // edge-triggered menu actions
  menu(slot) {
    const m = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, alt: false, tab: false, guild: false };
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
      return m;
    }
    const gp = this.pad(slot);
    if (!gp) return m;
    const e = this.padEdges.get(gp.index) || 0;
    const bit = (i) => (e & (1 << i)) !== 0;
    m.up = bit(PAD.UP) || bit(23);
    m.down = bit(PAD.DOWN) || bit(22);
    m.left = bit(PAD.LEFT) || bit(21);
    m.right = bit(PAD.RIGHT) || bit(20);
    m.confirm = bit(PAD.A);
    m.back = bit(PAD.B);
    m.start = bit(PAD.MENU);
    m.alt = bit(PAD.Y) || bit(PAD.VIEW);
    m.guild = bit(PAD.X);
    m.tab = bit(PAD.LB) || bit(PAD.RB);
    return m;
  }
}
