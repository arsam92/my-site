/* Orbital: rendering, input, menus, level editor. Physics lives in core.js. */
(function () {
  'use strict';

  const C = window.OrbitalCore;
  const LEVELS = window.ORBITAL_LEVELS;
  const W = C.W, H = C.H;
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d');

  const PALETTE = ['#4cc9f0', '#f9c74f', '#90be6d', '#c77dff', '#f8961e'];
  const REPEL = '#ff4d6d';
  const GOAL = '#5eead4';
  const HINTS = {
    0: 'Drag back from the dock and release to launch. Fewer shots, more stars.',
    3: 'Red planets push you away.'
  };

  const S = {
    screen: 'menu',          // menu | play | edit
    mode: 'campaign',        // campaign | test | shared
    level: null, index: -1,
    shots: 0, probe: null, trail: [], particles: [], aim: null,
    acc: 0, steps: 0, retryAt: 0, ending: false, t: 0,
    preview: true, sound: true
  };
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  const ED = { tool: 'planet', sign: 1, draft: null, drag: null, moving: null, verified: false };

  /* ---------- storage (always optional) ---------- */
  function loadJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode etc. */ }
  }
  let progress = loadJSON('orbital.stars', {});
  if (!progress || typeof progress !== 'object') progress = {};
  const settings = loadJSON('orbital.settings', {}) || {};
  if (settings.preview === false) S.preview = false;
  if (settings.sound === false) S.sound = false;
  function saveSettings() { saveJSON('orbital.settings', { preview: S.preview, sound: S.sound }); }

  /* ---------- small helpers ---------- */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(h, a) { const c = hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(h, t, to) { return 'rgb(' + hexToRgb(h).map((v) => Math.round(v + (to - v) * t)).join(',') + ')'; }
  function planetColor(p, i) { return p.s < 0 ? REPEL : PALETTE[i % PALETTE.length]; }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ---------- sound (tiny WebAudio synth) ---------- */
  let ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!S.sound) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sfxLaunch = () => tone(200, 560, 0.2, 'sine', 0.16);
  const sfxCrash = () => tone(170, 40, 0.4, 'sawtooth', 0.1);
  const sfxWin = () => { tone(523, 523, 0.16, 'triangle', 0.16, 0); tone(659, 659, 0.16, 'triangle', 0.16, 0.12); tone(784, 784, 0.3, 'triangle', 0.16, 0.24); };

  /* ---------- background stars ---------- */
  const stars = [];
  (function () {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 160; i++) stars.push({ x: rnd(), y: rnd(), r: rnd() * 1.3 + 0.3, p: rnd() * 6.28, s: 0.5 + rnd() * 1.5 });
  })();

  /* ---------- layout ---------- */
  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    const top = 64, bottom = 64;
    view.scale = Math.max(0.1, Math.min(view.w / W, (view.h - top - bottom) / H));
    view.ox = (view.w - W * view.scale) / 2;
    view.oy = top + (view.h - top - bottom - H * view.scale) / 2;
  }
  function toWorld(e) { return { x: (e.clientX - view.ox) / view.scale, y: (e.clientY - view.oy) / view.scale }; }

  /* ---------- screens ---------- */
  function setScreen(name) {
    S.screen = name;
    $('menu').classList.toggle('hidden', name !== 'menu');
    $('hud').classList.toggle('hidden', name !== 'play');
    $('editbar').classList.toggle('hidden', name !== 'edit');
    $('edStatus').classList.toggle('hidden', name !== 'edit');
    document.body.classList.toggle('playing', name !== 'menu');
    hideOverlay();
    if (name !== 'play') $('hint').classList.add('hidden');
  }

  function buildMenu() {
    const grid = $('levels');
    grid.innerHTML = '';
    let total = 0;
    LEVELS.forEach((l, i) => {
      const st = progress[i] || 0;
      total += st;
      const b = document.createElement('button');
      b.className = 'lvl';
      const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = l.name;
      const s = document.createElement('span'); s.className = 'st'; s.textContent = '★'.repeat(st) + '☆'.repeat(3 - st);
      b.append(n, nm, s);
      b.addEventListener('click', () => startCampaign(i));
      grid.appendChild(b);
    });
    $('total').textContent = total + ' / ' + LEVELS.length * 3 + ' stars';
  }

  function goMenu() {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    buildMenu();
    setScreen('menu');
  }

  function showOverlay(title, starsN, text, buttons) {
    $('ovTitle').textContent = title;
    $('ovStars').textContent = starsN == null ? '' : '★'.repeat(starsN) + '☆'.repeat(3 - starsN);
    $('ovText').textContent = text || '';
    const row = $('ovBtns');
    row.innerHTML = '';
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', b.fn);
      row.appendChild(el);
    });
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  /* ---------- playing ---------- */
  function startCampaign(i) { startPlay(clone(LEVELS[i]), 'campaign', i); }

  function startPlay(level, mode, index) {
    S.level = level; S.mode = mode; S.index = index;
    resetRun();
    setScreen('play');
    $('lvlName').textContent = mode === 'campaign' ? (index + 1) + '. ' + level.name : (mode === 'test' ? 'Test run' : level.name);
    $('bEdit').classList.toggle('hidden', mode !== 'shared');
    $('bBack').textContent = mode === 'test' ? 'Editor' : 'Menu';
    updateHud();
    updateHint();
  }

  function resetRun() {
    S.shots = 0; S.probe = null; S.trail = []; S.particles = []; S.aim = null; S.ending = false;
    hideOverlay();
  }
  function retry() { resetRun(); updateHud(); updateHint(); }

  function updateHud() { $('shots').textContent = 'Shots ' + S.shots; }
  function updateHint() {
    const el = $('hint');
    const txt = S.mode === 'campaign' && S.shots === 0 ? HINTS[S.index] : null;
    if (txt) { el.textContent = txt; el.classList.remove('hidden'); } else el.classList.add('hidden');
  }

  function launch(lp) {
    S.shots++;
    S.probe = C.makeProbe(S.level, lp.vx, lp.vy);
    S.trail = [{ x: S.probe.x, y: S.probe.y }];
    S.acc = 0; S.steps = 0; S.ending = false;
    updateHud(); updateHint();
    sfxLaunch();
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = 60 + Math.random() * 320;
      S.particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.9, color: color });
    }
  }

  function onWin() {
    const lvl = S.level;
    burst(lvl.goal.x, lvl.goal.y, GOAL, 90);
    sfxWin();
    const stars = S.shots <= 1 ? 3 : S.shots === 2 ? 2 : 1;
    if (S.mode === 'test') { ED.verified = true; }
    setTimeout(() => {
      if (S.screen !== 'play' || S.level !== lvl) return;
      const shotsTxt = S.shots + (S.shots === 1 ? ' shot' : ' shots');
      if (S.mode === 'campaign') {
        if ((progress[S.index] || 0) < stars) { progress[S.index] = stars; saveJSON('orbital.stars', progress); }
        const last = S.index >= LEVELS.length - 1;
        showOverlay('Level complete', stars, shotsTxt, [
          { label: 'Retry', fn: retry },
          last ? { label: 'Build your own', fn: () => enterEditor(true), primary: true }
               : { label: 'Next level', fn: () => startCampaign(S.index + 1), primary: true }
        ]);
      } else if (S.mode === 'test') {
        showOverlay('Level verified', null, 'It is beatable, so you can share it now.', [
          { label: 'Back to editor', fn: () => enterEditor(false), primary: true }
        ]);
      } else {
        showOverlay('Solved', stars, shotsTxt, [
          { label: 'Retry', fn: retry },
          { label: 'Build your own', fn: () => enterEditor(true), primary: true }
        ]);
      }
    }, 650);
  }

  function onFail(status) {
    const p = S.probe;
    if (status === 'crashed') burst(p.x, p.y, '#ff9f43', 50);
    sfxCrash();
    toast(status === 'crashed' ? 'Crashed into a planet' : 'Lost in space');
    S.retryAt = S.t + 0.75;
  }

  function update(dt) {
    S.t += dt;
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const q = S.particles[i];
      q.life -= dt;
      if (q.life <= 0) { S.particles.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.985; q.vy *= 0.985;
    }
    if (S.screen !== 'play') return;
    const pr = S.probe;
    if (pr && pr.status === 'flying') {
      S.acc = Math.min(S.acc + dt, 0.1);
      let n = 0;
      while (S.acc >= C.DT && pr.status === 'flying' && n < 32) {
        C.step(pr, S.level, C.DT);
        S.acc -= C.DT; n++;
        if (++S.steps % 3 === 0) {
          S.trail.push({ x: pr.x, y: pr.y });
          if (S.trail.length > 700) S.trail.shift();
        }
      }
      if (pr.status !== 'flying') {
        S.trail.push({ x: pr.x, y: pr.y });
        S.ending = true;
        if (pr.status === 'won') onWin(); else onFail(pr.status);
      }
    } else if (pr && S.ending && pr.status !== 'won' && S.t >= S.retryAt) {
      S.probe = null; S.trail = []; S.ending = false;
    }
  }

  /* ---------- drawing ---------- */
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); }

  function drawPlanet(p, i) {
    const col = planetColor(p, i);
    // field halo
    let g = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.r * 2.5);
    g.addColorStop(0, rgba(col, 0.2));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; circle(p.x, p.y, p.r * 2.5); ctx.fill();
    // animated field lines: attractors pull inward, repulsors push outward
    for (let k = 0; k < 2; k++) {
      let u = (S.t * 0.45 + k * 0.5) % 1;
      if (p.s > 0) u = 1 - u;
      const rr = p.r * (1.05 + u * 1.2);
      ctx.strokeStyle = rgba(col, 0.28 * (1 - Math.abs(u - 0.5) * 2) + 0.02);
      ctx.lineWidth = 2;
      circle(p.x, p.y, rr); ctx.stroke();
    }
    // body
    g = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, mix(col, 0.5, 255));
    g.addColorStop(0.6, col);
    g.addColorStop(1, mix(col, 0.6, 0));
    ctx.fillStyle = g; circle(p.x, p.y, p.r); ctx.fill();
    if (p.s < 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p.x - p.r * 0.3, p.y); ctx.lineTo(p.x + p.r * 0.3, p.y); ctx.stroke();
    }
  }

  function drawGoal(goal) {
    const pulse = Math.sin(S.t * 3) * 3;
    ctx.fillStyle = rgba(GOAL, 0.1); circle(goal.x, goal.y, goal.r + pulse); ctx.fill();
    ctx.strokeStyle = GOAL; ctx.lineWidth = 3; circle(goal.x, goal.y, goal.r + pulse); ctx.stroke();
    ctx.save();
    ctx.translate(goal.x, goal.y); ctx.rotate(S.t * 0.6);
    ctx.setLineDash([8, 10]); ctx.strokeStyle = rgba(GOAL, 0.6); ctx.lineWidth = 2;
    circle(0, 0, goal.r * 0.55); ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }

  function drawDock(start) {
    const pulse = 0.5 + 0.5 * Math.sin(S.t * 2.4);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + pulse * 0.3).toFixed(3) + ')';
    ctx.lineWidth = 2; circle(start.x, start.y, 17 + pulse * 3); ctx.stroke();
  }

  function drawProbeBall(x, y) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 24);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; circle(x, y, 24); ctx.fill();
    ctx.fillStyle = '#fff'; circle(x, y, C.PROBE_R); ctx.fill();
  }

  function drawTrail() {
    const tr = S.trail;
    if (tr.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const a = i / tr.length;
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.55).toFixed(3) + ')';
      ctx.lineWidth = 1 + a * 3;
      ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
  }

  function drawAim(lvl) {
    const sx = lvl.start.x, sy = lvl.start.y;
    ctx.setLineDash([6, 10]); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2;
    circle(sx, sy, C.MAX_PULL); ctx.stroke(); ctx.setLineDash([]);
    const lp = C.launchFromPull(lvl, S.aim.x, S.aim.y);
    if (!lp) return;
    const k = lp.pull / C.MAX_PULL;
    const col = 'hsl(' + Math.round(170 - 130 * k) + ',90%,62%)';
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lp.px, lp.py); ctx.stroke();
    ctx.fillStyle = col; circle(lp.px, lp.py, 9); ctx.fill();
    if (S.preview) {
      const pp = C.previewPath(lvl, lp.vx, lp.vy, 1.4, 6);
      for (let i = 0; i < pp.pts.length; i++) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - i / pp.pts.length)).toFixed(3) + ')';
        circle(pp.pts[i].x, pp.pts[i].y, 2.4); ctx.fill();
      }
    }
  }

  function drawEditorExtras() {
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 100; x < W; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 100; y < H; y += 100) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    if (ED.drag) {
      const col = ED.sign < 0 ? REPEL : PALETTE[ED.draft.planets.length % PALETTE.length];
      ctx.setLineDash([8, 8]); ctx.strokeStyle = col; ctx.lineWidth = 3;
      circle(ED.drag.x, ED.drag.y, ED.drag.moved ? ED.drag.r : 40); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function draw() {
    const d = view.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, view.h);
    bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#05070f');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, view.w, view.h);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.fillStyle = 'rgba(200,215,255,' + (0.35 + 0.35 * Math.sin(S.t * s.s + s.p)).toFixed(3) + ')';
      circle(s.x * view.w, s.y * view.h, s.r); ctx.fill();
    }
    if (S.screen === 'menu') return;

    ctx.setTransform(d * view.scale, 0, 0, d * view.scale, d * view.ox, d * view.oy);
    const lvl = S.screen === 'edit' ? ED.draft : S.level;
    if (!lvl) return;

    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, W, H);
    if (S.screen === 'edit') drawEditorExtras();

    lvl.planets.forEach(drawPlanet);
    drawGoal(lvl.goal);
    drawDock(lvl.start);

    if (S.screen === 'play') {
      drawTrail();
      const pr = S.probe;
      if (!pr) drawProbeBall(lvl.start.x, lvl.start.y);
      else if (pr.status === 'flying') drawProbeBall(pr.x, pr.y);
      if (S.aim && !pr) drawAim(lvl);
    }
    for (let i = 0; i < S.particles.length; i++) {
      const q = S.particles[i];
      ctx.globalAlpha = clamp(q.life / 1.2, 0, 1);
      ctx.fillStyle = q.color; circle(q.x, q.y, 3); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- level editor ---------- */
  const defaultDraft = () => ({
    name: 'My level', start: { x: 200, y: 450 }, goal: { x: 1400, y: 450, r: 34 },
    planets: [{ x: 800, y: 450, r: 60, s: 1 }]
  });

  function enterEditor(fresh) {
    if (fresh || !ED.draft) { ED.draft = defaultDraft(); ED.verified = false; }
    ED.drag = null; ED.moving = null;
    setScreen('edit');
    updateEdUI();
  }

  function editSharedCopy() {
    ED.draft = clone(S.level);
    ED.draft.name = 'My level';
    ED.verified = false;
    enterEditor(false);
  }

  function updateEdUI() {
    ['planet', 'start', 'goal', 'erase'].forEach((t) => $('t' + t[0].toUpperCase() + t.slice(1)).classList.toggle('active', ED.tool === t));
    $('bPolarity').textContent = 'Gravity: ' + (ED.sign > 0 ? 'attract' : 'repel');
    $('bPolarity').style.color = ED.sign > 0 ? '' : REPEL;
    $('bShare').disabled = !ED.verified;
    const st = $('edStatus');
    st.textContent = ED.verified ? 'Verified. Your level is ready to share.' : 'Drag to size a planet. Beat your level once to unlock sharing.';
    st.classList.toggle('ok', ED.verified);
  }

  function overlapsPlanet(x, y, margin) {
    return ED.draft.planets.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + margin);
  }

  function placeMarker(kind, p) {
    const x = clamp(p.x, 40, W - 40), y = clamp(p.y, 40, H - 40);
    if (overlapsPlanet(x, y, kind === 'goal' ? ED.draft.goal.r + 8 : 30)) return;
    const other = kind === 'start' ? ED.draft.goal : ED.draft.start;
    if (Math.hypot(other.x - x, other.y - y) < 150) return;
    ED.draft[kind].x = Math.round(x); ED.draft[kind].y = Math.round(y);
    ED.verified = false; updateEdUI();
  }

  function edDown(p) {
    if (ED.tool === 'planet') {
      ED.drag = { x: p.x, y: p.y, r: 40, moved: false };
    } else if (ED.tool === 'start' || ED.tool === 'goal') {
      ED.moving = ED.tool; placeMarker(ED.tool, p);
    } else if (ED.tool === 'erase') {
      for (let i = ED.draft.planets.length - 1; i >= 0; i--) {
        const q = ED.draft.planets[i];
        if (Math.hypot(q.x - p.x, q.y - p.y) <= q.r) { ED.draft.planets.splice(i, 1); ED.verified = false; updateEdUI(); break; }
      }
    }
  }
  function edMove(p) {
    if (ED.drag) {
      const dist = Math.hypot(p.x - ED.drag.x, p.y - ED.drag.y);
      if (dist > 10) ED.drag.moved = true;
      ED.drag.r = clamp(dist, 18, 110);
    } else if (ED.moving) placeMarker(ED.moving, p);
  }
  function edUp() {
    if (ED.drag) {
      const d = ED.drag, r = d.moved ? d.r : 40;
      ED.drag = null;
      if (ED.draft.planets.length >= C.MAX_PLANETS) { toast('That is the maximum number of planets'); return; }
      const nearStart = Math.hypot(d.x - ED.draft.start.x, d.y - ED.draft.start.y) < r + 30;
      const nearGoal = Math.hypot(d.x - ED.draft.goal.x, d.y - ED.draft.goal.y) < r + ED.draft.goal.r + 8;
      if (nearStart || nearGoal) { toast('Too close to the start or goal'); return; }
      ED.draft.planets.push({ x: Math.round(d.x), y: Math.round(d.y), r: Math.round(r), s: ED.sign });
      ED.verified = false; updateEdUI();
    }
    ED.moving = null;
  }

  function shareLink() {
    const url = location.href.split('#')[0] + '#L=' + C.encodeLevel(ED.draft);
    const fallback = () => window.prompt('Copy this link:', url);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => toast('Link copied. Send it to a friend.'), fallback);
    } else fallback();
  }

  /* ---------- input ---------- */
  canvas.addEventListener('pointerdown', (e) => {
    audio();
    const p = toWorld(e);
    if (S.screen === 'play') {
      if (S.probe || !S.level) return;
      if (Math.hypot(p.x - S.level.start.x, p.y - S.level.start.y) > 150) return;
      canvas.setPointerCapture(e.pointerId);
      S.aim = p;
      e.preventDefault();
    } else if (S.screen === 'edit') {
      canvas.setPointerCapture(e.pointerId);
      edDown(p);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toWorld(e);
    if (S.screen === 'play' && S.aim) S.aim = p;
    else if (S.screen === 'edit') edMove(p);
  });
  function pointerEnd(e) {
    if (S.screen === 'play' && S.aim) {
      const lp = C.launchFromPull(S.level, S.aim.x, S.aim.y);
      S.aim = null;
      if (lp && e.type === 'pointerup' && !S.probe) launch(lp);
    } else if (S.screen === 'edit') edUp();
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);

  function backAction() {
    if (S.screen === 'play') { if (S.mode === 'test') enterEditor(false); else goMenu(); }
    else if (S.screen === 'edit') goMenu();
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') { if (S.screen === 'play') retry(); }
    else if (e.key === 'Escape') backAction();
  });

  $('bRetry').addEventListener('click', retry);
  $('bBack').addEventListener('click', backAction);
  $('bEdMenu').addEventListener('click', goMenu);
  $('bEdit').addEventListener('click', editSharedCopy);
  $('bCreate').addEventListener('click', () => enterEditor(true));
  $('bPreview').addEventListener('click', () => {
    S.preview = !S.preview; $('bPreview').textContent = 'Preview: ' + (S.preview ? 'on' : 'off'); saveSettings();
  });
  $('bSound').addEventListener('click', () => {
    S.sound = !S.sound; $('bSound').textContent = 'Sound: ' + (S.sound ? 'on' : 'off'); saveSettings();
    if (S.sound) sfxLaunch();
  });
  $('tPlanet').addEventListener('click', () => { ED.tool = 'planet'; updateEdUI(); });
  $('tStart').addEventListener('click', () => { ED.tool = 'start'; updateEdUI(); });
  $('tGoal').addEventListener('click', () => { ED.tool = 'goal'; updateEdUI(); });
  $('tErase').addEventListener('click', () => { ED.tool = 'erase'; updateEdUI(); });
  $('bPolarity').addEventListener('click', () => { ED.sign = -ED.sign; ED.tool = 'planet'; updateEdUI(); });
  $('bClear').addEventListener('click', () => { ED.draft.planets = []; ED.verified = false; updateEdUI(); });
  $('bTest').addEventListener('click', () => startPlay(clone(ED.draft), 'test', -1));
  $('bShare').addEventListener('click', shareLink);

  /* ---------- boot ---------- */
  function loadFromHash() {
    const m = /^#L=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return false;
    const lvl = C.decodeLevel(m[1]);
    if (!lvl) { toast('That level link is broken'); return false; }
    startPlay(lvl, 'shared', -1);
    return true;
  }
  window.addEventListener('hashchange', () => { loadFromHash(); });
  window.addEventListener('resize', resize);

  $('bPreview').textContent = 'Preview: ' + (S.preview ? 'on' : 'off');
  $('bSound').textContent = 'Sound: ' + (S.sound ? 'on' : 'off');
  resize();
  buildMenu();
  if (!loadFromHash()) setScreen('menu');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Small hook for automated tests.
  window.__orbital = { S: S, ED: ED, startCampaign: startCampaign, enterEditor: enterEditor, launch: launch, C: C };
})();
