/* Orbital core: physics, level encoding, solver. Works in the browser (window.OrbitalCore) and in Node (require). */
(function (root) {
  'use strict';

  var W = 1600, H = 900;           // world size
  var K = 8000;                    // gravity constant (mass = K * r^2)
  var SOFT = 400;                  // softening term, keeps close passes stable
  var PROBE_R = 5;
  var MAX_PULL = 170;              // max slingshot pull distance
  var MIN_PULL = 14;
  var SPEED_PER_PULL = 4;
  var MAX_TIME = 25;               // seconds before a probe is declared lost
  var MARGIN = 250;                // how far outside the world a probe may drift
  var DT = 1 / 240;
  var MAX_PLANETS = 24;

  var tmp = [0, 0];

  function accel(x, y, planets, out) {
    var ax = 0, ay = 0;
    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      var dx = p.x - x, dy = p.y - y;
      var d2 = dx * dx + dy * dy + SOFT;
      var f = p.s * K * p.r * p.r / (d2 * Math.sqrt(d2));
      ax += dx * f;
      ay += dy * f;
    }
    out[0] = ax;
    out[1] = ay;
  }

  function makeProbe(level, vx, vy) {
    return { x: level.start.x, y: level.start.y, vx: vx, vy: vy, t: 0, status: 'flying' };
  }

  // Advance one fixed step (velocity Verlet) and update probe.status.
  function step(pr, level, dt) {
    accel(pr.x, pr.y, level.planets, tmp);
    var ax = tmp[0], ay = tmp[1];
    pr.x += pr.vx * dt + 0.5 * ax * dt * dt;
    pr.y += pr.vy * dt + 0.5 * ay * dt * dt;
    accel(pr.x, pr.y, level.planets, tmp);
    pr.vx += 0.5 * (ax + tmp[0]) * dt;
    pr.vy += 0.5 * (ay + tmp[1]) * dt;
    pr.t += dt;

    for (var i = 0; i < level.planets.length; i++) {
      var p = level.planets[i];
      var dx = pr.x - p.x, dy = pr.y - p.y;
      var rr = p.r + PROBE_R;
      if (dx * dx + dy * dy < rr * rr) { pr.status = 'crashed'; return; }
    }
    var gx = pr.x - level.goal.x, gy = pr.y - level.goal.y;
    if (gx * gx + gy * gy < level.goal.r * level.goal.r) { pr.status = 'won'; return; }
    if (pr.x < -MARGIN || pr.x > W + MARGIN || pr.y < -MARGIN || pr.y > H + MARGIN || pr.t > MAX_TIME) {
      pr.status = 'lost';
    }
  }

  // Slingshot: pulling the pointer away from the start launches the probe the other way.
  function launchFromPull(level, px, py) {
    var dx = level.start.x - px, dy = level.start.y - py;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < MIN_PULL) return null;
    if (d > MAX_PULL) { dx *= MAX_PULL / d; dy *= MAX_PULL / d; d = MAX_PULL; }
    return { vx: dx * SPEED_PER_PULL, vy: dy * SPEED_PER_PULL, pull: d, px: level.start.x - dx, py: level.start.y - dy };
  }

  // Run a whole flight (used by the solver and by the aim preview).
  function simulate(level, vx, vy, dt, maxT) {
    var pr = makeProbe(level, vx, vy);
    var limit = maxT || MAX_TIME;
    while (pr.status === 'flying' && pr.t < limit) step(pr, level, dt || 1 / 120);
    return pr;
  }

  // Sample the first `seconds` of a flight for the aim preview.
  function previewPath(level, vx, vy, seconds, every) {
    var pr = makeProbe(level, vx, vy);
    var pts = [];
    var n = 0;
    while (pr.status === 'flying' && pr.t < seconds) {
      step(pr, level, DT);
      if (++n % every === 0) pts.push({ x: pr.x, y: pr.y });
    }
    return { pts: pts, status: pr.status };
  }

  // Brute-force search over angle and speed. Returns the share of launches that win.
  function solve(level, angleStep, speedStep) {
    angleStep = angleStep || 1;
    speedStep = speedStep || 20;
    var total = 0, count = 0, first = null;
    var minV = MIN_PULL * SPEED_PER_PULL, maxV = MAX_PULL * SPEED_PER_PULL;
    for (var a = 0; a < 360; a += angleStep) {
      var c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
      for (var v = minV; v <= maxV; v += speedStep) {
        total++;
        var pr = simulate(level, c * v, s * v, 1 / 120);
        if (pr.status === 'won') { count++; if (!first) first = { angle: a, speed: v }; }
      }
    }
    return { count: count, total: total, share: count / total, first: first };
  }

  // How forgiving is a level? Scan a grid of launches (slow, near-minimum pulls are excluded because
  // a mouse cannot aim them precisely) and score each winning cell by how many of its neighbours win too.
  function robustness(level, angStep, spStep, minSpeed, dt) {
    var maxV = MAX_PULL * SPEED_PER_PULL;
    var na = Math.round(360 / angStep), ns = Math.floor((maxV - minSpeed) / spStep) + 1;
    var grid = new Uint8Array(na * ns), wins = 0;
    for (var i = 0; i < na; i++) {
      var a = i * angStep * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      for (var j = 0; j < ns; j++) {
        var v = minSpeed + j * spStep;
        if (simulate(level, c * v, s * v, dt || 1 / 120).status === 'won') { grid[i * ns + j] = 1; wins++; }
      }
    }
    // neighbourhood: +/-1 cell in both directions (angle wraps around)
    var good = 0, best = null, bestScore = -1;
    for (var i2 = 0; i2 < na; i2++) {
      for (var j2 = 0; j2 < ns; j2++) {
        if (!grid[i2 * ns + j2]) continue;
        var score = 0;
        for (var di = -1; di <= 1; di++) {
          for (var dj = -1; dj <= 1; dj++) {
            var jj = j2 + dj;
            if (jj < 0 || jj >= ns) continue;
            score += grid[(((i2 + di) % na + na) % na) * ns + jj];
          }
        }
        if (score >= 8) good++;
        if (score > bestScore) { bestScore = score; best = { angle: i2 * angStep, speed: minSpeed + j2 * spStep, score: score }; }
      }
    }
    return { wins: wins, total: na * ns, robustCells: good, best: best, bestScore: bestScore };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  // Accept only well-formed levels (important: levels arrive through URLs).
  function sanitizeLevel(l) {
    if (!l || typeof l !== 'object') return null;
    var st = l.start || {}, g = l.goal || {};
    var out = {
      name: typeof l.name === 'string' ? l.name.slice(0, 40) : 'Custom level',
      start: { x: clamp(num(st.x, 200), 20, W - 20), y: clamp(num(st.y, 450), 20, H - 20) },
      goal: { x: clamp(num(g.x, 1400), 20, W - 20), y: clamp(num(g.y, 450), 20, H - 20), r: clamp(num(g.r, 34), 20, 60) },
      planets: []
    };
    var ps = Array.isArray(l.planets) ? l.planets.slice(0, MAX_PLANETS) : [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i] || {};
      out.planets.push({
        x: clamp(num(p.x, 0), -100, W + 100),
        y: clamp(num(p.y, 0), -100, H + 100),
        r: clamp(num(p.r, 40), 15, 120),
        s: p.s < 0 ? -1 : 1
      });
    }
    return out;
  }

  function toBase64Url(str) {
    var b = typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'binary').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64Url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  }

  // Compact URL-safe encoding: [startX, startY, goalX, goalY, goalR, [x, y, r, sign]...]
  function encodeLevel(l) {
    var r = Math.round;
    var arr = [r(l.start.x), r(l.start.y), r(l.goal.x), r(l.goal.y), r(l.goal.r)];
    for (var i = 0; i < l.planets.length; i++) {
      var p = l.planets[i];
      arr.push([r(p.x), r(p.y), r(p.r), p.s < 0 ? -1 : 1]);
    }
    return toBase64Url(JSON.stringify(arr));
  }

  function decodeLevel(code) {
    try {
      var arr = JSON.parse(fromBase64Url(code));
      if (!Array.isArray(arr) || arr.length < 5 || arr.length > 5 + MAX_PLANETS) return null;
      var planets = [];
      for (var i = 5; i < arr.length; i++) {
        var q = arr[i];
        if (!Array.isArray(q)) return null;
        planets.push({ x: q[0], y: q[1], r: q[2], s: q[3] });
      }
      return sanitizeLevel({
        name: 'Shared level',
        start: { x: arr[0], y: arr[1] },
        goal: { x: arr[2], y: arr[3], r: arr[4] },
        planets: planets
      });
    } catch (e) {
      return null;
    }
  }

  var api = {
    W: W, H: H, PROBE_R: PROBE_R, MAX_PULL: MAX_PULL, MIN_PULL: MIN_PULL, SPEED_PER_PULL: SPEED_PER_PULL,
    MAX_TIME: MAX_TIME, DT: DT, MAX_PLANETS: MAX_PLANETS,
    accel: accel, makeProbe: makeProbe, step: step, launchFromPull: launchFromPull,
    simulate: simulate, previewPath: previewPath, solve: solve, robustness: robustness,
    sanitizeLevel: sanitizeLevel, encodeLevel: encodeLevel, decodeLevel: decodeLevel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrbitalCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
