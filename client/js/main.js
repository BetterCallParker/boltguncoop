// Lanternbound client: title -> camp lobby -> run. Owns the renderer, world, net and input.
import * as THREE from 'three';
import { PHASE, MAX_PLAYERS } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { Renderer } from './render.js';
import { World } from './world.js';
import { TravelerView } from './actors.js';
import { Net } from './net.js';
import { LocalNet } from './localnet.js';
import { Input, PAD } from './input.js';
import { Lobby } from './lobby.js';
import { Guild } from './guild.js';
import { Audio } from './audio.js';
import { RunView, isRunPhase } from './runview.js';

const QUALITY = new URL(location.href).searchParams.get('q') || (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'low' : 'high');
const R = new Renderer(document.getElementById('game'), QUALITY);
const world = new World(R);
const input = new Input();
const audio = new Audio();
const guild = new Guild();

// ------------------------------------------------------------------ app state
const app = {
  mode: 'title', // title | lobby | run
  started: false,
  room: 'CAMP',
  name: '',
  roster: new Map(),
  host: -1,
  phase: PHASE.LOBBY,
  phaseT: 0,
  settings: {},
};
const local = new Map(); // playerId -> { id, slot, label, n }
const joinedSlots = new Map(); // slot -> playerId
const pendingJoins = new Set();

const lobby = new Lobby({ send: (m) => net.send(m), sfx: (n) => audio.play(n), guild });
lobby.onJoinClick = () => requestJoin('kb');
let run = null;

const OFFLINE = window.LB_OFFLINE || new URL(location.href).searchParams.has('offline');
const handlers = {
  on_welcome(m) {
    app.room = m.room;
    if (!net.offline) {
      try {
        const url = new URL(location.href);
        url.searchParams.set('room', m.room);
        history.replaceState(null, '', url);
      } catch { /* sandboxed page: keep the URL as is */ }
    }
    for (const slot of pendingJoins) sendJoin(slot);
    enterLobby();
  },
  on_roster(m) {
    app.host = m.host;
    app.settings = m.settings;
    app.phaseT = m.phaseT;
    const prevPhase = app.phase;
    app.phase = m.phase;
    app.roster = new Map(m.players.map((p) => [p.id, p]));
    for (const id of [...local.keys()]) {
      if (!app.roster.has(id)) {
        joinedSlots.delete(local.get(id).slot);
        local.delete(id);
      }
    }
    if (prevPhase !== m.phase || (isRunPhase(m.phase) && app.mode === 'lobby')) onPhase(m.phase, prevPhase);
    run.onRoster();
  },
  on_choices(m) {
    run.onChoices(m);
  },
  on_state(m) {
    run.onState(m);
  },
  on_joined(m) {
    pendingJoins.delete(m.slot);
    joinedSlots.set(m.slot, m.id);
    const used = new Set([...local.values()].map((l) => l.n));
    let n = 1;
    while (used.has(n)) n++;
    local.set(m.id, { id: m.id, slot: m.slot, n, label: 'P' + n });
    net.send({ t: 'meta', id: m.id, ranks: guild.ranks });
    audio.play('join');
  },
  on_nojoin(m) {
    pendingJoins.delete(m.slot);
    toast(m.why === 'full' ? 'The party is full (6 travelers).' : 'An expedition is underway. You can join the next one!');
  },
  onClose() {
    toast('Lost connection to the camp. Refresh to reconnect.');
  },
  onFail() {
    // no camp server here: host the expedition inside the browser instead
    goOffline();
    toast('No camp server found - starting an offline expedition (solo or couch co-op).', 4500);
    net.connect(app.room, app.name);
  },
};
let net = OFFLINE ? new LocalNet(handlers) : new Net(handlers);
function goOffline() {
  net = new LocalNet(handlers);
  if (run) run.net = net;
  window.__lb.net = net;
}

function sendJoin(slot) {
  const first = joinedSlots.size === 0 && [...pendingJoins][0] === slot;
  net.send({ t: 'join', slot, name: first ? app.name : '', c: Math.floor(Math.random() * CHARACTERS.length), meta: guild.ranks });
}

function requestJoin(slot) {
  if (joinedSlots.has(slot) || pendingJoins.has(slot)) return;
  if (app.mode === 'run') return;
  if ([...app.roster.values()].length >= MAX_PLAYERS) return;
  pendingJoins.add(slot);
  if (net.connected && app.mode !== 'title') sendJoin(slot);
}

function onPhase(ph) {
  if (isRunPhase(ph)) {
    if (app.mode === 'lobby') enterRun();
  } else if (app.mode === 'run') exitRun();
  else if (ph === PHASE.LOBBY && app.mode === 'lobby') enterLobby();
}

function clearCamp() {
  for (const v of campViews.values()) {
    R.scene.remove(v.root);
    v.dispose();
  }
  campViews.clear();
}

function enterRun() {
  app.mode = 'run';
  lobby.show(false);
  clearCamp();
  run.start();
}

function exitRun() {
  run.stop();
  world.setStage(0, { town: true });
  world.setTimeOfDay(0.46);
  enterLobby();
}

function toast(text, ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.getElementById('toast').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ------------------------------------------------------------------ title
const titleEl = document.getElementById('title');
const nameIn = document.getElementById('name');
const roomIn = document.getElementById('room');
try { nameIn.value = localStorage.getItem('lb_name') || ''; } catch { /* ignore */ }
roomIn.value = (new URL(location.href).searchParams.get('room') || '').toUpperCase();

function start(slot) {
  if (app.started) return;
  app.started = true;
  audio.unlock();
  app.name = nameIn.value.trim().slice(0, 14);
  try { localStorage.setItem('lb_name', app.name); } catch { /* ignore */ }
  const room = (roomIn.value || 'CAMP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'CAMP';
  if (slot) pendingJoins.add(slot);
  titleEl.classList.add('hidden');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  net.connect(room, app.name);
}
document.getElementById('play').addEventListener('click', () => start('kb'));
for (const el of [nameIn, roomIn]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); start('kb'); } });
input.onActivity(() => audio.unlock());
window.addEventListener('pointerdown', () => audio.unlock());

// ------------------------------------------------------------------ camp scene (title + lobby)
world.setStage(0, { town: true });
world.setTimeOfDay(0.46);
run = new RunView({ R, world, net, input, audio, guild, local, app, toast });
const CAMP_SPOTS = [[-1.0, 1.6], [1.1, 1.5], [-2.7, 0.8], [2.6, 0.7], [-4.2, -0.2], [4.1, -0.3]];
const campViews = new Map(); // key -> TravelerView
const camLook = new THREE.Vector3(0, 1.0, -6.4);

function campLineup() {
  // title: all eight travelers; lobby: the party
  if (app.mode === 'title' || app.roster.size === 0) {
    return CHARACTERS.map((_, i) => ({ key: 't' + i, char: i, x: [-5.2, -3.6, -1.8, 0, 1.8, 3.6, 5.2, 0.2][i], z: [0.4, 1.4, 2.0, 2.3, 2.0, 1.4, 0.4, -0.9][i] }));
  }
  return [...app.roster.values()].sort((a, b) => a.seat - b.seat).map((p) => ({
    key: 'p' + p.id, char: p.char, x: CAMP_SPOTS[p.seat][0], z: CAMP_SPOTS[p.seat][1], p,
  }));
}

function updateCamp(dt, t) {
  const list = campLineup();
  const seen = new Set();
  for (const s of list) {
    seen.add(s.key);
    let v = campViews.get(s.key);
    if (v && v.charIdx !== s.char) {
      R.scene.remove(v.root);
      v.dispose();
      v = null;
    }
    if (!v) {
      v = new TravelerView(s.char);
      v.root.position.set(s.x, 0, s.z);
      R.scene.add(v.root);
      campViews.set(s.key, v);
    }
    v.root.position.x += (s.x - v.root.position.x) * Math.min(1, dt * 6);
    v.root.position.z += (s.z - v.root.position.z) * Math.min(1, dt * 6);
    v.face(s.x <= 0 ? 1 : -1);
    v.update(dt, s.p && s.p.ready ? 'cheer' : 'idle');
  }
  for (const [k, v] of campViews) {
    if (!seen.has(k)) {
      R.scene.remove(v.root);
      v.dispose();
      campViews.delete(k);
    }
  }
  // camera: gentle drift around the fire
  const cam = R.camera;
  const sway = Math.sin(t * 0.12) * 0.8;
  if (app.mode === 'title') cam.position.set(sway, 21, 21);
  else cam.position.set(sway * 0.4, 20, 20);
  cam.lookAt(camLook);
  R.setTilt(app.mode === 'title' ? 0.45 : 0.36, app.mode === 'title' ? 0.14 : 0.17, 5);
  world.update(dt, t, 0, 0);
  // name plates over the party
  if (app.mode === 'lobby') {
    const plates = [];
    const v3 = new THREE.Vector3();
    for (const s of list) {
      if (!s.p) continue;
      const v = campViews.get(s.key);
      v3.set(v.root.position.x, 2.55, v.root.position.z).project(cam);
      const L = local.get(s.p.id);
      plates.push({ name: s.p.name, ready: s.p.ready, seat: s.p.seat, local: L ? L.label : '', x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight });
    }
    lobby.plates(plates);
  }
}

function enterLobby() {
  app.mode = 'lobby';
  lobby.show(true);
  audio.music('town');
}

function lobbyCtx() {
  const hostR = [...app.roster.values()].find((r) => r.client === app.host);
  const locals = [...local.values()].sort((a, b) => a.n - b.n);
  return {
    roster: app.roster, settings: app.settings, isHost: app.host === net.cid, hostName: hostR ? hostR.name : '', hostClient: app.host,
    local, primaryId: locals.length ? locals[0].id : null, room: app.room, phase: app.phase, phaseT: app.phaseT,
  };
}

// ------------------------------------------------------------------ input routing
function handleMenus() {
  const pads = input.pads();
  if (app.mode === 'title') {
    const tp = document.getElementById('titlepads');
    if (pads.length && !tp.dataset.found) {
      tp.dataset.found = '1';
      tp.innerHTML = `${pads.length} controller${pads.length > 1 ? 's' : ''} found &middot; press <b>A</b> to begin`;
    }
    for (const gp of pads) if (input.padPressed(gp.index, PAD.A) || input.padPressed(gp.index, PAD.MENU)) return start('gp:' + gp.index);
    if (input.keyPressed('Enter') && document.activeElement !== nameIn && document.activeElement !== roomIn) start('kb');
    return;
  }
  // new devices join
  for (const gp of pads) {
    const slot = 'gp:' + gp.index;
    if (!joinedSlots.has(slot) && (input.padPressed(gp.index, PAD.A) || input.padPressed(gp.index, PAD.MENU))) requestJoin(slot);
  }
  if (!joinedSlots.has('kb') && input.keyPressed('Enter')) requestJoin('kb');
  if (app.mode === 'lobby') {
    const ctx = lobbyCtx();
    for (const L of local.values()) lobby.handle(L.id, input.menu(L.slot), ctx);
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  input.poll();
  handleMenus();
  if (app.mode === 'preview') updatePreview(dt, time);
  else if (app.mode === 'run') run.update(dt, time);
  else if (app.mode === 'title' || app.mode === 'lobby') {
    if (app.mode === 'lobby') {
      app.phaseT += dt;
      lobby.render(lobbyCtx());
    }
    updateCamp(dt, time);
  }
  input.endFrame();
  R.render(time);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ world preview (?world=N)
// Shows a stage's open field at the gameplay camera with a party of travelers wandering about.
const PREVIEW = new URL(location.href).searchParams.get('world');
const preview = { walkers: [], focus: new THREE.Vector3() };
if (PREVIEW !== null) {
  app.mode = 'preview';
  titleEl.classList.add('hidden');
  for (const v of campViews.values()) R.scene.remove(v.root);
  campViews.clear();
  world.setStage(Number(PREVIEW) || 0);
  world.setTimeOfDay(Number(new URL(location.href).searchParams.get('tod') ?? 0.3));
  [0, 1, 2, 3, 5, 6].forEach((ci, i) => {
    const v = new TravelerView(ci);
    const a = (i / 6) * Math.PI * 2;
    v.root.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 2.2);
    v.target = new THREE.Vector3();
    v.retarget = 0;
    R.scene.add(v.root);
    preview.walkers.push(v);
  });
}

function updatePreview(dt, t) {
  // the party drifts east together while each traveler wanders around the group
  preview.focus.x += dt * 1.2;
  for (const v of preview.walkers) {
    v.retarget -= dt;
    if (v.retarget <= 0) {
      v.retarget = 1.5 + Math.random() * 2.5;
      v.target.set(preview.focus.x + (Math.random() - 0.5) * 9, 0, preview.focus.z + (Math.random() - 0.5) * 6);
      v.pause = Math.random() < 0.25;
    }
    const dx = v.target.x - v.root.position.x, dz = v.target.z - v.root.position.z, d = Math.hypot(dx, dz);
    let state = 'idle';
    if (d > 0.3 && !v.pause) {
      const sp = 4.2 * dt;
      v.root.position.x += (dx / d) * Math.min(d, sp);
      v.root.position.z += (dz / d) * Math.min(d, sp);
      v.faceDir(dx, dz);
      state = 'walk';
    }
    v.update(dt, state);
  }
  const cam = R.camera;
  const f = preview.focus;
  cam.position.set(f.x, 21, f.z + 18.5);
  cam.lookAt(f.x, 0, f.z - 0.6);
  R.setTilt(0.5, 0.11, 5);
  world.update(dt, t, f.x, f.z);
}

window.__lb = { app, net, local, R, world, lobby, guild, input, preview, run, audio };
