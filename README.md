# echoloop — outrun your past selves

A neon arena survival game for the browser. **Zero dependencies, zero assets, zero build step** — just open `index.html`.

Every **12 seconds**, a red **ghost** awakens and replays your *exact* movement from the last loop. Touch a ghost and you die. Grab green orbs to score and raise your combo. Ghosts fade after 3 loops — but new ones keep coming. Survive as long as you can, and outsmart yourself.

## How to play

- **Move** to dodge your own ghosts and collect green orbs.
- Each orb: **+100 × combo** points; combo climbs to ×8.
- Surviving earns **10 pts/sec** automatically.
- Last 3 seconds of every loop: the arena edge pulses red and ticks — your ghost is about to awaken.
- Ghosts replay your path on an endless loop for 3 loops, then dissolve.

## Controls

| Input | Action |
|---|---|
| `WASD` / arrow keys | Move |
| `Space` | Start / restart |
| `R` | Restart (from game over / pause) |
| `P` or `Esc` | Pause / resume |
| `M` | Mute / unmute |
| Touch: **drag** anywhere | Virtual joystick to steer |
| Touch: **tap** | Start / restart |

Best score is saved in `localStorage`.

## Run it

No build, no install, no server required:

```sh
# option 1: just open the file
open index.html        # macOS
xdg-open index.html    # Linux

# option 2: serve locally (avoids file:// quirks in some browsers)
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Project layout

```
echoloop/
├── index.html   # page, HUD, overlays, styling
├── game.js      # pure game logic — no DOM (unit-tested in Node)
├── audio.js     # tiny WebAudio synth, no audio files
├── main.js      # canvas renderer, input, game loop
└── tests/
    ├── test_logic.js   # 20 unit tests for game.js (node --test)
    └── test_wiring.js  # 9 automated playtests: boots the REAL browser
                        # files in a stubbed-DOM sandbox and drives them
                        # with scripted keyboard/touch input
```

Run the tests (Node 18+):

```sh
node --test tests/
```

## Features

- Fixed-timestep simulation (60 Hz) — deterministic, frame-rate independent
- Ghost replay system with path tracing, expiry, and fade-out
- Combo scoring, survival scoring, persistent best score
- Particle bursts, screen shake, floating score text, player trail
- Title / pause / game-over flows, in-game instructions
- WebAudio sound effects (orb, ghost awaken, countdown ticks, death) — mutable
- Responsive canvas (960×600 internal, scales to viewport), touch joystick
- Auto-pause when the tab loses visibility

## Limitations

- Single arena, one game mode (endless survival) — no levels or online leaderboard.
- Best score is per-browser (`localStorage`); no account sync.
- Sound requires a user gesture first (browser autoplay policy).
- Ghost AI is pure replay — it never hunts you, it *is* you.
- Arena renders at a fixed 960×600 logical resolution, scaled to fit the
  screen — on small phones the playfield gets tiny (HUD stays DOM-sized
  and readable, but the ship/ghosts shrink with the canvas).
- Touch steering is a drag-anywhere virtual joystick; it needs pointer
  events, and the tap targets on the title/game-over overlays are sized
  for thumbs but were not tested on real iOS Safari/Android devices
  (no physical-device QA in this build's audit pass).
- `localStorage` failures (private mode / disabled storage) are swallowed
  silently — best score just won't persist.

## License

MIT — see [LICENSE](LICENSE).
