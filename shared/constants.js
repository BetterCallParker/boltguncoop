// Constants shared by the server simulation and the browser client.

export const TICK_RATE = 30; // server simulation steps per second
export const DT = 1 / TICK_RATE;
export const SNAP_EVERY = 2; // snapshot every N ticks (15 Hz)
export const MAX_PLAYERS = 6;

export const PHASE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  RUN: 'run',
  LEVELUP: 'levelup',
  CHEST: 'chest',
  OVER: 'over',
};

// Player life states
export const PS = { ALIVE: 0, DOWNED: 1, SPECTATE: 2 };

export const PPU = 16; // sprite pixels per world unit (keeps pixel density consistent everywhere)
export const PLAYER_RADIUS = 0.45;
export const BASE_MOVE_SPEED = 5.2; // units / second
export const VIEW_HX = 16; // half-extents of the ground visible around a player (gameplay camera)
export const VIEW_HZ = 11.5;
export const DESPAWN_RADIUS = 34; // enemies farther than this from every player get recycled
export const REVIVE_RADIUS = 1.8;
export const REVIVE_TIME = 2.6; // seconds of standing next to a downed friend
export const LEVELUP_TIMEOUT = 25; // seconds before a choice is made for you
export const CHEST_TIME = 3.6;
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

// Name-tag / party colors (one per seat)
export const SEAT_COLORS = ['#f2c14e', '#5fb8ff', '#ff6f6f', '#7ee08a', '#c58bff', '#ff9f43'];

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

// Experience needed to go from `level` to level+1 (Vampire-Survivors-like curve), scaled for party size
export function xpForLevel(level, players = 1) {
  let base;
  if (level < 20) base = 5 + (level - 1) * 10;
  else if (level < 40) base = 195 + (level - 20) * 13;
  else base = 455 + (level - 40) * 16;
  return Math.round(base * (1 + 0.35 * (Math.max(1, players) - 1)));
}
