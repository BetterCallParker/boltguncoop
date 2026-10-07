// Constants shared by the server simulation and the browser client.
import { BALANCE } from './balance.js';

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
export const VIEW_HX = 21; // half-extents of the ground visible around a player at the widest zoom
export const VIEW_HZ = 16;
export const DESPAWN_RADIUS = 42; // enemies farther than this from every player get recycled
export const ZOOM_MIN = 0.8; // camera distance multipliers players can pick (mouse wheel / right stick)
export const ZOOM_MAX = 1.6;
export const ZOOM_DEFAULT = 1.3;
export const LOBBY_SPEED = 4.4; // walking around camp
// where each seat appears in the camp plaza
export const LOBBY_SPAWNS = [[-1.0, 1.6], [1.1, 1.5], [-2.7, 0.8], [2.6, 0.7], [-4.2, -0.2], [4.1, -0.3]];
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

// Experience needed to go from `level` to level+1, scaled for party size (see shared/balance.js)
export function xpForLevel(level, players = 1) {
  const X = BALANCE.xp;
  let base;
  if (level < 20) base = X.early + (level - 1) * X.earlyStep;
  else if (level < 40) base = X.mid + (level - 20) * X.midStep;
  else base = X.late + (level - 40) * X.lateStep;
  return Math.round(base * (1 + X.coop * (Math.max(1, players) - 1)));
}
