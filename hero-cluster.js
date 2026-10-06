// Hero mode dial: an icosahedron of extruded ink-outlined shards drawn on a 2D canvas.
(function () {
  var canvas = document.getElementById('dialCluster');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var dial = canvas.closest('.dial');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- geometry: icosahedron -> 20 triangular shards ----------
  var p = (1 + Math.sqrt(5)) / 2;
  var V = [[-1,p,0],[1,p,0],[-1,-p,0],[1,-p,0],[0,-1,p],[0,1,p],[0,-1,-p],[0,1,-p],[p,0,-1],[p,0,1],[-p,0,-1],[-p,0,1]]
    .map(function (v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  var F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

  function add(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }

  var shards = F.map(function (f) {
    var c = [0, 1, 2].map(function (k) { return (V[f[0]][k] + V[f[1]][k] + V[f[2]][k]) / 3; });
    return {
      c: c, n: norm(c),
      // corners relative to the face centre, shrunk to leave gaps between shards
      t: f.map(function (i) { return add(V[i], c, -1).map(function (x) { return x * 0.82; }); }),
      ph: [Math.random() * 7, Math.random() * 7], fr: [0.6 + Math.random() * 0.5, 1.1 + Math.random() * 0.7],
      h: 0, sx: 0, sy: 0
    };
  });

  // ---------- state ----------
  var W = 0, H = 0, dpr = 1, cx = 0, cy = 0, unit = 0;
  var rotY = 0.6, rotX = -0.35, spin = 0.25, kick = 0;
  var ptr = null, t0 = 0, time = 0, raf = 0, visible = true, ink, paper, green = [155, 226, 143];
  var LIGHT = norm([-0.45, -0.7, 0.8]);

  function rgb(s) {
    var m = s.match(/[\da-f]{2}/gi);
    if (s[0] === '#' && m) return m.slice(0, 3).map(function (h) { return parseInt(h, 16); });
    return (s.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  }
  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    ink = rgb(cs.getPropertyValue('--color-ink').trim() || '#0F1115');
    paper = rgb(cs.getPropertyValue('--color-paper').trim() || '#F5F5F0');
    if (!document.documentElement.classList.contains('dark')) paper = [255, 255, 255];
  }
  function mix(a, b, k) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * k); }); }
  function css(c) { return 'rgb(' + c.join(',') + ')'; }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    cx = W / 2; cy = H * 0.4; unit = Math.min(W, H) * 0.235;
    draw();
  }

  function rot(v) {
    var cy_ = Math.cos(rotY), sy = Math.sin(rotY), cx_ = Math.cos(rotX), sx = Math.sin(rotX);
    var x = v[0] * cy_ + v[2] * sy, z = -v[0] * sy + v[2] * cy_;
    return [x, v[1] * cx_ - z * sx, v[1] * sx + z * cx_];
  }
  function proj(v) { var s = 4.2 / (4.2 - v[2]) * unit; return [cx + v[0] * s, cy + v[1] * s, v[2]]; }

  // ---------- frame ----------
  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var polys = [];
    shards.forEach(function (s) {
      var breathe = reduce.matches ? 0 : Math.sin(time * s.fr[0] + s.ph[0]) * 0.5 + Math.sin(time * s.fr[1] + s.ph[1]) * 0.5;
      var push = 0.16 + breathe * 0.05 + s.h * 0.24, scale = 1 + breathe * 0.07 + s.h * 0.12, depth = 0.22;
      var base = add(s.c, s.n, push);
      var inner = s.t.map(function (d) { return rot(add(base, d, scale)); });
      var outer = inner.map(function (v, i) { return add(v, rot(s.n), depth); });
      var pc = proj(rot(add(base, s.n, depth))); s.sx = pc[0]; s.sy = pc[1];
      var sz = rot(base)[2];
      var faces = [outer];
      for (var i = 0; i < 3; i++) { var j = (i + 1) % 3; faces.push([inner[i], inner[j], outer[j], outer[i]]); }
      faces.forEach(function (f) {
        var n = norm(cross(sub(f[1], f[0]), sub(f[2], f[0])));
        if (n[2] < 0) n = [-n[0], -n[1], -n[2]]; // the side we see faces the viewer
        var z = f.reduce(function (m, v) { return m + v[2]; }, 0) / f.length;
        polys.push({ pts: f.map(proj), sz: sz, z: z, n: n, h: s.h });
      });
    });
    // whole shards back-to-front, then faces back-to-front within each shard
    polys.sort(function (a, b) { return a.sz - b.sz || a.z - b.z; });
    ctx.lineJoin = 'round'; ctx.lineWidth = 1;
    ctx.strokeStyle = css(ink);
    polys.forEach(function (pl) {
      // flat ink-style tones: white / light grey / dark grey / near-black
      var d = pl.n[0] * LIGHT[0] + pl.n[1] * LIGHT[1] + pl.n[2] * LIGHT[2];
      var tone = d > 0.75 ? 0 : d > 0.45 ? 0.18 : d > 0.2 ? 0.62 : 0.88;
      var col = mix(paper, ink, tone);
      if (pl.h > 0.01) col = mix(col, green, pl.h * (tone > 0.5 ? 0.55 : 0.9));
      ctx.beginPath();
      pl.pts.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      ctx.fillStyle = css(col);
      ctx.fill(); ctx.stroke();
    });
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  function step(now) {
    raf = 0;
    var dt = Math.min((now - (t0 || now)) / 1000, 0.05); t0 = now;
    time += dt;
    kick *= Math.pow(0.04, dt);
    rotY += (spin + kick) * dt;
    rotX = -0.35 + Math.sin(time * 0.3) * 0.12;
    var ease = 1 - Math.pow(0.002, dt);
    shards.forEach(function (s) {
      var target = 0;
      if (ptr) { var d = Math.hypot(s.sx - ptr[0], s.sy - ptr[1]); target = Math.max(0, 1 - d / (unit * 1.1)); target *= target * (3 - 2 * target); }
      s.h += (target - s.h) * ease;
    });
    draw();
    loop();
  }
  function loop() {
    if (!raf && visible && !document.hidden && !reduce.matches) raf = requestAnimationFrame(step);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  // ---------- input ----------
  var down = null, dragged = false;
  function setPtr(e) { var r = canvas.getBoundingClientRect(); ptr = [e.clientX - r.left, e.clientY - r.top]; }
  dial.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' && !down) return;
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) dragged = true;
    setPtr(e);
  });
  dial.addEventListener('pointerdown', function (e) {
    down = [e.clientX, e.clientY]; dragged = false;
    if (e.pointerType !== 'mouse') { setPtr(e); try { dial.setPointerCapture(e.pointerId); } catch (_) {} }
  });
  function release(e) { down = null; if (e.pointerType !== 'mouse') ptr = null; }
  dial.addEventListener('pointerup', release);
  dial.addEventListener('pointercancel', release);
  dial.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') ptr = null; });
  // a drag shows the hover effect; only a tap (or Enter/Space) changes mode
  dial.addEventListener('click', function (e) {
    if (dragged) { e.stopImmediatePropagation(); e.preventDefault(); dragged = false; return; }
    kick = 6;
    if (reduce.matches) { rotY += Math.PI / 2; draw(); }
  }, true);

  // ---------- lifecycle ----------
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; visible ? loop() : stop(); }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : loop(); });
  if (reduce.addEventListener) reduce.addEventListener('change', function () { stop(); draw(); loop(); });
  new MutationObserver(function () { readTheme(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);

  readTheme();
  resize();
  loop();
})();
