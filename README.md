# Lanternbound

A co-op horde-survival game (in the spirit of Vampire Survivors) drawn in an HD-2D style: small,
detailed pixel travelers in pixel-textured 3D dioramas with tilt-shift depth of field, bloom,
ray-marched light shafts, mist and a warm amber grade. Up to 6 players, online or on one couch.

## Play

```bash
npm install
npm start
```

Open http://localhost:3000, enter a name and a camp code, and press **Begin the Journey**.
Friends on your network open the *Network* address the server prints and use the same camp code.
Run the server on a host that is reachable from the internet to play together over the internet.

No server at hand? `npm run demo` builds `dist/lanternbound.html`, a single page that runs the
whole simulation inside the browser (solo, or couch co-op with controllers).

### Controls

| | Keyboard | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | left stick / d-pad | drag anywhere |
| Choose / confirm | Space / Enter | A | tap |
| Back | Esc | B | |
| Host settings (camp) | Tab | Y / View | tap a setting |
| Guild shop (camp) | G | X | tap Guild |

Each extra controller joins as another traveler by pressing **A** in camp.

## The game

- **Camp lobby** in a terraced timber town with a canal and bridge: pick one of 8 travelers, buy
  permanent upgrades at the Guild with gold from past runs, ready up. The host picks the stage,
  run length (10/15/20/30 min), difficulty, horde size, pickups and whether allies can revive.
- **Runs** across three stages (Verdant Ruins, Frostfang Peaks, Cinder Crypt) from morning to
  night: 11 weapons that evolve into 11 more with the right relic, 13 relics, shared party XP
  with per-player level-up cards, treasure chests, elites, three bosses and a final boss at the
  end of the night, swarms and encirclements, braziers with pickups, downs and revives.
- **Results** with damage per weapon, kills and gold banked to the Guild.

## How it works

- `server/` is the authoritative simulation: rooms, lobby and ready-up, a fixed 30 Hz step for the
  horde (spatial grid, separation, boss abilities), weapons, projectiles, pickups, level-ups and
  chests. It streams 15 Hz binary snapshots (`shared/protocol.js`): quantized enemy positions
  plus a JSON tail with players, events and pickups. Players move on their own screens
  immediately and the server validates their positions.
- `client/` plays snapshots back about 100 ms in the past for smooth interpolation, runs events
  when their snapshot is reached, and predicts local movement. Every sprite is painted
  procedurally (`travelers.js`, `monsters.js`, `sprites.js`) and drawn through instanced layers
  (`spritelayer.js`); the post chain lives in `render.js`.
- `shared/` holds the rules both sides use: characters, items and stat math, enemies, stages and
  the wave timeline, settings and constants.
- `client/js/localnet.js` hosts the same `Game` inside the browser for offline play.
