/* Checks that every built-in level is winnable by a launch a human can actually aim.
 *
 * For each level it sweeps launch angle (1 degree steps) and launch speed (16 units/s steps, skipping the
 * very slow pulls that a mouse cannot place precisely) and reports:
 *   wins           how many sampled launches reach the goal
 *   forgiving      winning launches whose neighbours (+/-1 degree, +/-16 speed) also win
 *   straight shot  whether aiming straight at the goal already wins (only acceptable for level 1)
 *
 * Usage: node check-levels.js
 * Exits with code 1 if a level has no forgiving winning launch, so it is safe to use in CI.
 */
const Core = require('./core.js');
const LEVELS = require('./levels.js');

let failed = 0;
LEVELS.forEach((lvl, i) => {
  const t0 = Date.now();
  const r = Core.robustness(lvl, 1, 16, 240, 1 / 120);

  const goalAngle = Math.atan2(lvl.goal.y - lvl.start.y, lvl.goal.x - lvl.start.x);
  let straight = false;
  for (let v = 240; v <= 680; v += 20) {
    if (Core.simulate(lvl, Math.cos(goalAngle) * v, Math.sin(goalAngle) * v, 1 / 120).status === 'won') straight = true;
  }

  const ok = r.bestScore >= 9 && (i === 0 || !straight);
  if (!ok) failed++;
  console.log(
    `${String(i + 1).padStart(2)}. ${lvl.name.padEnd(12)} wins ${String(r.wins).padStart(4)}  forgiving ${String(r.robustCells).padStart(3)}` +
    `  straight shot ${straight ? 'yes' : 'no '}  ${ok ? 'OK' : 'FAIL'}  [${Date.now() - t0} ms]`
  );
});
process.exit(failed ? 1 : 0);
