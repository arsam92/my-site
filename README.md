# Orbital

**A gravity slingshot puzzle that runs in your browser.** Drag back, release, and bend your shot around planets to land the probe in the green ring. No install, no accounts, no dependencies.

**[▶ Play it here](https://arsam92.github.io/my-site/)**

- 10 hand-made levels, each one **proven solvable** by a brute-force solver (`node check-levels.js`)
- **Repulsors** (red) push you away, attractors pull you in
- **Level editor** with one-click **share links**: your level is encoded in the URL, so there is no server
- A level can only be shared after you have beaten it yourself, so nobody gets an impossible level
- Works with mouse and touch, saves your stars locally, tiny synthesized sound effects

## How to play

1. Press and hold near the glowing dock.
2. Drag away from the direction you want to go. The farther you pull, the faster the probe flies.
3. Release. Fewer shots means more stars (1 shot = 3 stars).

A short preview of your shot is shown while you aim. You can turn it off (**Preview: off**) for a harder game. `R` restarts, `Esc` goes back.

## Build and share a level

Open **Build your own level**, drop planets by dragging (the drag distance sets the size), move the start and goal, and flip **Gravity** to place repulsors. Press **Test** and beat your own level, then press **Share link**. Anyone who opens the link plays your level instantly.

Made a good one? Open an issue with the link and it may become an official level.

## Run it locally

It is plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/arsam92/my-site
cd my-site
python3 -m http.server 8000   # then open http://localhost:8000
```

Opening `index.html` directly from disk works too.

## Check the levels

```bash
node check-levels.js
```

Runs a launch-angle and launch-speed sweep over every level and reports how many launches win. The script exits with an error if any level has no winning shot, so you can use it when adding levels.

## How it works

| File | Purpose |
| --- | --- |
| `core.js` | Physics (velocity Verlet at 240 Hz), level encoding for share links, solver. Shared by the browser and Node. |
| `levels.js` | The built-in levels. `s: 1` attracts, `s: -1` repels. |
| `game.js` | Rendering, input, menus, level editor. |
| `index.html` | Page and styles. |
| `check-levels.js` | Level solvability check. |

Gravity is `a = s · K · r² · d / (|d|² + ε)^(3/2)` summed over all planets, where `r` is the planet radius and `ε` softens close passes.

## Built with AI

This project was written with the help of an AI assistant (Claude) and directed, tested and published by its owner. The levels were checked with the solver in this repo rather than trusted by eye.

## License

MIT, see [LICENSE](LICENSE).
