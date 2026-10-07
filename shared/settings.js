// Run settings the host can change in the lobby. Stored as option indices.
import { STAGES } from './stages.js';

export const SETTINGS = [
  { key: 'stage', label: 'Stage', options: STAGES.map((_, i) => i), labels: STAGES.map((s) => s.name), def: 0 },
  { key: 'length', label: 'Run Length', options: [10, 15, 20, 30], labels: ['10 min', '15 min', '20 min', '30 min'], def: 1 },
  { key: 'difficulty', label: 'Difficulty', options: [0, 1, 2], labels: ['Normal', 'Hard', 'Nightmare'], def: 0 },
  { key: 'density', label: 'Horde Size', options: [0.7, 1, 1.4], labels: ['Calm', 'Normal', 'Swarming'], def: 1 },
  { key: 'pickups', label: 'Pickups', options: [0.6, 1, 1.6], labels: ['Few', 'Normal', 'Plenty'], def: 1 },
  { key: 'revive', label: 'Revive Allies', options: [0, 1], labels: ['Off', 'On'], def: 1 },
];

export const DIFFICULTY = [
  { hp: 1, dmg: 1, speed: 1 },
  { hp: 1.6, dmg: 1.3, speed: 1.08 },
  { hp: 2.4, dmg: 1.7, speed: 1.15 },
];

export function defaultSettings() {
  const s = {};
  for (const d of SETTINGS) s[d.key] = d.def;
  return s;
}

export function settingValue(settings, key) {
  const d = SETTINGS.find((x) => x.key === key);
  if (!d) return undefined;
  const i = settings[key] ?? d.def;
  return d.options[Math.min(d.options.length - 1, Math.max(0, i))];
}

export function settingLabel(settings, key) {
  const d = SETTINGS.find((x) => x.key === key);
  const i = settings[key] ?? d.def;
  return d.labels[Math.min(d.labels.length - 1, Math.max(0, i))];
}
