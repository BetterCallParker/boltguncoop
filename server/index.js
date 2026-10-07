// Lanternbound server: serves the browser client and runs authoritative co-op game rooms
// over WebSockets (one Game per room code).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { DT, SNAP_EVERY, TICK_RATE, MAX_PLAYERS } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const STATIC = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/')],
  ['/shared/', path.join(ROOT, 'shared/')],
  ['/server/', path.join(ROOT, 'server/')], // the simulation also runs in-browser for offline play
  ['/', path.join(ROOT, 'client/')],
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (url === '/') url = '/index.html';
  for (const [prefix, dir] of STATIC) {
    if (!url.startsWith(prefix)) continue;
    const file = path.normalize(path.join(dir, url.slice(prefix.length)));
    if (!file.startsWith(dir)) break; // path traversal guard
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ------------------------------------------------------------------ rooms
const rooms = new Map(); // code -> { game, clients: Set<Client>, emptySince }
let nextClientId = 1;

function cleanCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return c || 'CAMP';
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(typeof obj === 'string' || obj instanceof ArrayBuffer ? obj : JSON.stringify(obj));
}

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { code, clients: new Set(), emptySince: 0, game: null };
    room.game = new Game(code, {
      sendTo(clientId, msg) {
        for (const c of room.clients) if (c.id === clientId) send(c.ws, msg);
      },
    });
    rooms.set(code, room);
    console.log(`[room ${code}] created`);
  }
  return room;
}

function updateHost(room) {
  const first = [...room.clients][0];
  room.game.setHost(first ? first.id : -1);
}

const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  const client = { id: nextClientId++, ws, room: null, players: new Set() };
  try { ws._socket.setNoDelay(true); } catch { /* not fatal */ }

  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const room = client.room;
    const g = room && room.game;
    switch (msg.t) {
      case 'hello': {
        if (client.room) return;
        const code = cleanCode(msg.room);
        const r = getRoom(code);
        client.room = r;
        r.clients.add(client);
        updateHost(r);
        send(ws, { t: 'welcome', cid: client.id, room: code, tickRate: TICK_RATE, maxPlayers: MAX_PLAYERS });
        if (r.game.run) send(ws, r.game.run.fullState());
        r.game.rosterDirty = true;
        break;
      }
      case 'join': {
        if (!g) return;
        const res = g.addPlayer(client.id, msg.name, msg.c, msg.meta, msg.unlocks);
        if (!res.ok) { send(ws, { t: 'nojoin', slot: msg.slot, why: res.why }); return; }
        client.players.add(res.id);
        send(ws, { t: 'joined', slot: msg.slot, id: res.id });
        break;
      }
      case 'leave':
        if (g && client.players.has(msg.id)) {
          client.players.delete(msg.id);
          g.removePlayer(msg.id);
        }
        break;
      case 'char':
        if (g && client.players.has(msg.id)) g.setCharacter(msg.id, msg.c);
        break;
      case 'ready':
        if (g && client.players.has(msg.id)) g.toggleReady(msg.id, msg.v);
        break;
      case 'meta':
        if (g && client.players.has(msg.id)) g.setMeta(msg.id, msg.ranks, msg.unlocks);
        break;
      case 'set':
        if (g) g.setSetting(client.id, String(msg.key), msg.val);
        break;
      case 'pos':
        if (g && Array.isArray(msg.d)) {
          for (const row of msg.d) if (Array.isArray(row) && client.players.has(row[0])) g.playerPos(row[0], row[1], row[2], row[3], row[4]);
        }
        break;
      case 'pick':
        if (g && client.players.has(msg.id)) g.pick(msg.id, msg.i);
        break;
      case 'lobby':
        if (g) g.backToLobby(client.id);
        break;
      case 'pause':
        if (g) g.setPause(client.id, !!msg.v);
        break;
      case 'abandon':
        if (g) g.abandon(client.id);
        break;
      case 'ping':
        send(ws, { t: 'pong', c: msg.c });
        break;
    }
  });

  ws.on('close', () => {
    const r = client.room;
    if (!r) return;
    r.game.dropPause(client.id);
    for (const id of client.players) r.game.removePlayer(id);
    r.clients.delete(client);
    updateHost(r);
    if (r.clients.size === 0) r.emptySince = Date.now();
  });
  ws.on('error', () => {});
});

// ------------------------------------------------------------------ fixed-step loop
let last = performance.now();
let acc = 0;
let tick = 0;
setInterval(() => {
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  if (acc > 0.25) acc = 0.25; // don't spiral after a stall
  while (acc >= DT) {
    acc -= DT;
    tick++;
    for (const [code, room] of rooms) {
      if (room.clients.size === 0) {
        if (Date.now() - room.emptySince > 30000) {
          rooms.delete(code);
          console.log(`[room ${code}] closed`);
        }
        continue;
      }
      room.game.step();
      if (room.game.rosterDirty) {
        room.game.rosterDirty = false;
        const msg = JSON.stringify(room.game.roster());
        for (const c of room.clients) send(c.ws, msg);
      }
      if (tick % SNAP_EVERY === 0) {
        const snap = room.game.snapshot();
        if (snap) for (const c of room.clients) send(c.ws, snap);
      }
      // travelers strolling around camp (10 Hz)
      const ph = room.game.phase;
      if ((ph === 'lobby' || ph === 'countdown') && tick % 3 === 0 && room.game.players.size) {
        const msg = JSON.stringify(room.game.lobbyState());
        for (const c of room.clients) send(c.ws, msg);
      }
    }
  }
}, 5);

server.listen(PORT, () => {
  console.log(`Lanternbound running at http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) console.log(`  Network: http://${ni.address}:${PORT}  (friends on your network can join here)`);
    }
  }
});
