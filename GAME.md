# Comet Courier — best-game-01 prototype

An original HTML5 canvas game built locally for the make.fun
**best-game-01** bounty (“Make the best game”, $1,000, entries close
2026-11-18 18:00 UTC / 2026-11-19 02:00 CST, as listed on the board).

> **Status: integrated with the official best-game-01 kit — NOT submitted.**
> `vendor/makefun-game.ts` was copied unchanged from the kit
> (sha256 `dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129`,
> matching `kit.json`), `LICENSE` is the kit's MIT licence, and `main.ts`
> now copies `game/` + `screenshots/` and writes `dossier.json` with
> `buildDossier`. The local build runs and is byte-identical across
> two runs; the kit's `check` passes 4/4 non-transcript checks (see
> "Pre-submit check" below). No wallet/keypair was created, no make.fun
> account was registered or logged into, nothing was uploaded to GitHub,
> and no entry was submitted from this work.

## How to play

Pilot a small courier ship through an asteroid field. Pick up a glowing
parcel, carry it to the station of the **same colour** (cyan / magenta /
gold), dodge asteroids, and collect star fuel.

- **Win:** complete **5 deliveries** before the timer ends (120 seconds).
  A time bonus (+2 per second left) is added to the final score.
- **Lose:** hull reaches **0** (asteroid hits cost 20 hull) **or** the
  timer runs out.
- **Score:** pickup +10, delivery +100, star fuel +5. A delivery also
  repairs +5 hull.
- **Fuel:** thrust and boosting burn fuel. At 0 fuel the ship only limps
  along; star pickups restore +30 fuel. Boosting costs 8 fuel.
- A guide arrow points from the ship to the parcel (or, while carrying,
  to the matching station). The matching station lights up while you
  carry its parcel; touching the wrong station bounces you off and
  keeps the parcel.

## Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Fly (thrust) |
| Click the canvas | Boost toward the click (costs fuel, 0.6 s cooldown) |
| P | Pause / resume |
| R | Restart (also the Start / Restart button) |
| M | Sound on/off (off by default) |
| Enter / click | Start from the start, win, or lose screen |

Sound is WebAudio bleeps only, created after a user gesture, and is
off by default.

## Files

```
best-game-01/
├── LICENSE          # MIT, copied from the kit starter (OSI-approved)
├── README.md        # this file
├── main.ts          # entry point: copies game/ + screenshots/ to the
│                    #   output dir and writes dossier.json via buildDossier
├── vendor/
│   └── makefun-game.ts  # kit library, UNCHANGED (sha256 verified vs kit.json)
├── game/
│   ├── index.html   # self-contained page, no network, no external assets
│   └── main.js      # full game logic (canvas, HUD, particles, shake, audio)
└── screenshots/     # 4 real renders of the game's own code (see below)
    ├── 01-start.png
    ├── 02-gameplay.png
    ├── 03-delivery.png
    └── 04-win.png
```

`main.ts` is Comet Courier's own entry point (Node standard library
only, written for this game, not pasted from the starter): it copies
`game/` and `screenshots/` beside it to the output directory
(`MAKEFUN_OUTPUT_DIR`, or `/output` in the grader) and writes
`dossier.json` there with `buildDossier` from
`./vendor/makefun-game.ts`, using the gate caps
(text_max_bytes 163840, screenshots max 4 / max_bytes 262144,
game_max_files 993, game_max_bytes 50331648, game_path_max_bytes 1000).
Verified on Node v24.22.1; two runs produce byte-identical output.
`out/` is a build artifact and is not kept in the repository tree.

## Run it locally

```bash
# Option 1 — open the file directly (fully offline)
#   open game/index.html in a browser

# Option 2 — serve it
python3 -m http.server 8000 --directory game
#   then open http://127.0.0.1:8000/index.html

# Option 3 — via the build entry (the grader's path, locally)
mkdir -p /tmp/comet-out && MAKEFUN_OUTPUT_DIR=/tmp/comet-out node main.ts
#   writes /tmp/comet-out/game/, /tmp/comet-out/screenshots/ (4 files)
#   and /tmp/comet-out/dossier.json (845,462 bytes, schema makefun/dossier/v1,
#   text 32,115 bytes — both full sources, no cut line)
```

## How it was tested

Node v24.22.1, Python 3.12.3, Chromium 157 at
`/opt/meta-chromium/chrome` via the bundled Playwright 1.55.1
(test script kept at `/tmp/comet-test.mjs`, not part of the game).

1. **Static / offline check:** `game/` served with `python3 -m http.server`
   — `index.html` and `main.js` both returned 200. A grep for
   `http://`, `https://`, `fetch(`, `XMLHttpRequest`, CDN names found
   nothing in `game/`. In the headless run, the only requests were the
   local `index.html` and `main.js` files — no network requests.
2. **Built-in logic tests** (`index.html?test=1`): **9/9 passed**
   - start state (playing, 0 deliveries, 120 s)
   - ArrowRight moves the ship
   - touching a parcel picks it up (+10)
   - matching station delivers (+100, 1 delivery)
   - asteroid hit costs 20 hull
   - star fuel refills the tank
   - timer running out loses the run
   - 5th delivery wins the game
   - restart resets score, deliveries, hull and timer
3. **Live interaction checks** (Playwright keyboard): ArrowRight moved
   the ship from x 480.0 → 513.3, P paused the game, R restarted it
   (playing, 0 deliveries, 0 score). **Console errors: none. Page
   errors: none.**
4. **Screenshots:** real headless-Chromium renders of the game's own
   code, using the documented `?screen=` presets in `main.js`
   (start / play / deliver / win / lose — no image was fabricated):
   - `screenshots/01-start.png` — start screen
   - `screenshots/02-gameplay.png` — mid-gameplay, carrying a cyan parcel
   - `screenshots/03-delivery.png` — delivery moment (+100, 1/5)
   - `screenshots/04-win.png` — win screen (5/5, score 560)
   - `screenshots/05-lose.png` was moved out of the entry (kept at
     `../best-game-01-extra/05-lose.png`): the gate allows at most 4
     screenshots, and the four kept already show start, play, delivery
     and win.

## Issues found during testing

- Directly launching `/opt/meta-chromium/chrome` failed with
  “Hatch WebGL domain policy is required for browser startup”.
  Fixed by launching through Playwright with the shared audit
  runtime's launch options (which pass the WebGL allowed-domains
  file and hash). No game change was needed.
- Chrome's Local Network Access checks blocked `http://127.0.0.1:8123`
  from Playwright, so the headless verification used `file://` URLs
  instead; the plain `python3 -m http.server` curl check still
  returned 200 for both files.
- Three small polish fixes after the first screenshots: the start
  screen no longer says “play again”, the delivery preset no longer
  shows a parcel still being carried after the delivery, and the
  nebulae now fade radially instead of ending in a hard disc edge.
  All screenshots were re-taken after these fixes and the 9/9 tests
  were re-run.

## Pre-submit check

Run from the kit directory, without transcripts (none bundled yet):

```bash
node cli/makefun.mjs check --kit . --repo ~/workspace/makefun/best-game-01 --worktree
```

Result at 2026-11-18 02:39 UTC: **4 passed, 1 failed, 14 skipped,
5 checked at submission** — exit 1, solely on the expected failure.
Passed: `competition_open`, `snapshot` (10 files, 706,961 bytes),
`license_osi` (MIT), `entrypoint` (main.ts, node22).
Failed: `transcripts_present` — no transcripts were uploaded yet.
The 5 “at submission” items (`repo_public`, `repo_owner`,
`repo_created_after_open`, `commit_in_repo`, `duplicate_snapshot`)
can only be checked once the repository exists on GitHub.
Without `--worktree`, check exits 1 with “not in a git repository”
— again because no GitHub repository exists yet. There is no local
grade for this competition; the server grades every entry.

## Still missing for a real submission

- A GitHub repository for the entry, created after the competition
  opened (2026-11-15 18:00 UTC), with `.makefun/owner.json` holding
  the entry wallet (`FGCpiRC8NpfD2oqRpjbmqrP7bU6NGNrAxbR62RhSrxeX`)
  unless the repo owner is the account's GitHub login — the
  make.fun account is @gentle-beacon-60.
- Bundling the session transcripts that built this entry
  (`node cli/makefun.mjs bundle …`), then re-running `check` with
  `--transcripts`, signing the entry message, and submitting before
  the deadline, 2026-11-19 02:00 CST.
- The bounty closes 2026-11-19 02:00 CST, so any submission would
  need to happen well before then.
