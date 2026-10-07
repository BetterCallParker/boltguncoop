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
