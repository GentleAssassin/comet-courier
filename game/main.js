/* Comet Courier — an original HTML5 canvas game.
 *
 * Goal: complete 5 deliveries before the 120-second timer ends.
 * Pick up a glowing parcel, carry it to the station of the SAME colour,
 * dodge asteroids, and collect star fuel. Hull 0 or time 0 = lose.
 *
 * Controls: WASD / arrows to fly, click the canvas to boost toward the
 * click (costs fuel), P pause, R restart, M sound (off by default).
 * No network, no external assets: all art is drawn on the canvas.
 * Query strings are for local testing / screenshots only:
 *   ?screen=start|play|deliver|win|lose   — open in a preset state
 *   ?test=1                                — run the built-in logic tests
 */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;

  var COLOURS = [
    { name: 'cyan',    main: '#22d3ee', glow: 'rgba(34,211,238,.35)' },
    { name: 'magenta', main: '#f472b6', glow: 'rgba(244,114,182,.35)' },
    { name: 'gold',    main: '#fbbf24', glow: 'rgba(251,191,36,.35)' }
  ];
  var WIN_DELIVERIES = 5;
  var GAME_SECONDS = 120;
  var SHIP_R = 14;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ------------------------------------------------------------------ */
  /* Sound — WebAudio bleeps, off by default. Created only after a     */
  /* user gesture, so loading the page never starts audio.             */
  /* ------------------------------------------------------------------ */
  var soundOn = false;
  var audioCtx = null;
  function beep(freq, dur, type) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* audio is optional; never break the game */ }
  }

  /* ------------------------------------------------------------------ */
  /* Game state                                                          */
  /* ------------------------------------------------------------------ */
  var game = {
    state: 'start',           // start | playing | paused | win | lose
    score: 0,
    deliveries: 0,
    hull: 100,
    fuel: 100,
    timeLeft: GAME_SECONDS,
    carrying: null,           // colour object, or null
    parcel: null,
    ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, thrusting: false },
    stations: [],
    asteroids: [],
    fuels: [],
    particles: [],
    floats: [],               // floating score text
    stars: [],
    keys: {},
    boostCooldown: 0,
    invulnerable: 0,
    shake: 0,
    elapsed: 0,
    message: ''
  };

  function makeStars() {
    game.stars = [];
    for (var i = 0; i < 130; i++) {
      game.stars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.5, 1.8),
        tw: rand(0, Math.PI * 2), speed: rand(0.5, 2) });
    }
  }

  function makeStations() {
    game.stations = [
      { colour: COLOURS[0], x: 96,  y: 108, r: 36 },
      { colour: COLOURS[1], x: 864, y: 108, r: 36 },
      { colour: COLOURS[2], x: 480, y: 516, r: 36 }
    ];
  }

  function spawnParcel() {
    var colour = pick(COLOURS);
    var p;
    do {
      p = { colour: colour, x: rand(90, W - 90), y: rand(170, H - 110), r: 13, bob: rand(0, 6) };
    } while (game.stations.some(function (s) { return dist(p, s) < 120; }));
    game.parcel = p;
  }

  function spawnAsteroid() {
    var verts = [];
    var n = 9;
    for (var i = 0; i < n; i++) verts.push(rand(0.75, 1.15));
    return {
      x: rand(60, W - 60), y: rand(90, H - 90),
      vx: rand(-55, 55) || 30, vy: rand(-45, 45) || 20,
      r: rand(15, 30), rot: rand(0, 6.28), vr: rand(-0.8, 0.8), verts: verts
    };
  }

  function spawnFuel(x, y) {
    game.fuels.push({ x: x !== undefined ? x : rand(80, W - 80),
      y: y !== undefined ? y : rand(140, H - 80), r: 12, bob: rand(0, 6) });
  }

  function burst(x, y, colour, count) {
    for (var i = 0; i < (count || 18); i++) {
      var a = rand(0, Math.PI * 2), sp = rand(40, 220);
      game.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.4, 0.9), max: 0.9, colour: colour, r: rand(2, 5) });
    }
  }

  function addFloat(x, y, text, colour) {
    game.floats.push({ x: x, y: y, text: text, colour: colour || '#fff', life: 1.4 });
  }

  function startGame() {
    game.state = 'playing';
    game.score = 0;
    game.deliveries = 0;
    game.hull = 100;
    game.fuel = 100;
    game.timeLeft = GAME_SECONDS;
    game.carrying = null;
    game.ship = { x: W / 2, y: H / 2 + 40, vx: 0, vy: 0, angle: -Math.PI / 2, thrusting: false };
    game.asteroids = [];
    for (var i = 0; i < 7; i++) game.asteroids.push(spawnAsteroid());
    game.fuels = [];
    spawnFuel(220, 300); spawnFuel(740, 320); spawnFuel(480, 180);
    game.particles = []; game.floats = [];
    game.boostCooldown = 0; game.invulnerable = 0; game.shake = 0; game.elapsed = 0;
    game.message = '';
    makeStations();
    spawnParcel();
    beep(520, 0.12, 'triangle');
  }

  function loseGame(reason) {
    if (game.state !== 'playing') return;
    game.state = 'lose';
    game.message = reason;
    game.shake = 14;
    burst(game.ship.x, game.ship.y, '#f87171', 40);
    beep(160, 0.5, 'sawtooth');
  }

  function winGame() {
    game.state = 'win';
    var bonus = Math.round(game.timeLeft) * 2;
    game.score += bonus;
    burst(game.ship.x, game.ship.y, '#fbbf24', 50);
    beep(660, 0.15, 'sine'); setTimeout(function () { beep(880, 0.25, 'sine'); }, 140);
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */
  function update(dt) {
    game.elapsed += dt;
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 30);
    if (game.boostCooldown > 0) game.boostCooldown -= dt;
    if (game.invulnerable > 0) game.invulnerable -= dt;

    // Particles and floating text always animate, even on end screens.
    game.particles = game.particles.filter(function (p) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0;
    });
    game.floats = game.floats.filter(function (f) { f.y -= 28 * dt; f.life -= dt; return f.life > 0; });
    game.stars.forEach(function (s) { s.tw += dt * s.speed; });

    if (game.state !== 'playing') return;

    game.timeLeft -= dt;
    if (game.timeLeft <= 0) { game.timeLeft = 0; loseGame('Time ran out — the parcels are late.'); return; }
    // Slow fuel burn while flying; thrust burns a little more.
    game.fuel = Math.max(0, game.fuel - dt * 0.9);

    var ship = game.ship;
    var ax = 0, ay = 0;
    if (game.keys['arrowleft'] || game.keys['a']) ax -= 1;
    if (game.keys['arrowright'] || game.keys['d']) ax += 1;
    if (game.keys['arrowup'] || game.keys['w']) ay -= 1;
    if (game.keys['arrowdown'] || game.keys['s']) ay += 1;
    ship.thrusting = (ax !== 0 || ay !== 0);
    if (ship.thrusting) {
      var len = Math.sqrt(ax * ax + ay * ay);
      var power = game.fuel > 0 ? 430 : 170;   // out of fuel: limp, don't stop
      ship.vx += (ax / len) * power * dt;
      ship.vy += (ay / len) * power * dt;
      ship.angle = Math.atan2(ay, ax);
      game.fuel = Math.max(0, game.fuel - dt * 1.6);
      if (Math.random() < 0.6) {
        game.particles.push({ x: ship.x - Math.cos(ship.angle) * 16,
          y: ship.y - Math.sin(ship.angle) * 16,
          vx: -Math.cos(ship.angle) * 90 + rand(-20, 20),
          vy: -Math.sin(ship.angle) * 90 + rand(-20, 20),
          life: 0.35, max: 0.35, colour: '#fb923c', r: 3 });
      }
    }
    ship.vx *= Math.pow(0.35, dt);   // drag
    ship.vy *= Math.pow(0.35, dt);
    var speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    if (speed > 340) { ship.vx *= 340 / speed; ship.vy *= 340 / speed; }
    ship.x = clamp(ship.x + ship.vx * dt, 20, W - 20);
    ship.y = clamp(ship.y + ship.vy * dt, 64, H - 20);   // keep clear of the HUD

    // Asteroids drift and bounce off the walls.
    game.asteroids.forEach(function (a) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.vr * dt;
      if (a.x < a.r || a.x > W - a.r) a.vx *= -1;
      if (a.y < 64 + a.r || a.y > H - a.r) a.vy *= -1;
      a.x = clamp(a.x, a.r, W - a.r); a.y = clamp(a.y, 64 + a.r, H - a.r);
    });

    // Pick up a parcel.
    if (!game.carrying && game.parcel && dist(ship, game.parcel) < SHIP_R + game.parcel.r + 4) {
      game.carrying = game.parcel.colour;
      game.parcel = null;
      game.score += 10;
      addFloat(ship.x, ship.y - 26, '+10  PICKED UP', game.carrying.main);
      burst(ship.x, ship.y, game.carrying.main, 14);
      beep(740, 0.1, 'triangle');
    }

    // Deliver to the matching station.
    if (game.carrying) {
      game.stations.forEach(function (st) {
        if (dist(ship, st) < SHIP_R + st.r) {
          if (st.colour.name === game.carrying.name) {
            game.deliveries += 1;
            game.score += 100;
            game.hull = Math.min(100, game.hull + 5);
            addFloat(st.x, st.y - 48, '+100  DELIVERED!', st.colour.main);
            burst(st.x, st.y, st.colour.main, 36);
            beep(880, 0.12, 'sine');
            game.carrying = null;
            if (game.deliveries >= WIN_DELIVERIES) { winGame(); return; }
            spawnParcel();
          } else {
            addFloat(ship.x, ship.y - 26, 'Wrong station!', '#f87171');
            ship.vx = -ship.vx * 0.6; ship.vy = -ship.vy * 0.6;
            game.carrying = game.carrying; // keep the parcel
          }
        }
      });
    }

    // Asteroid hits.
    if (game.invulnerable <= 0) {
      game.asteroids.forEach(function (a) {
        if (dist(ship, a) < SHIP_R + a.r - 4) {
          game.hull -= 20;
          game.invulnerable = 1.2;
          game.shake = 12;
          burst(ship.x, ship.y, '#f87171', 26);
          addFloat(ship.x, ship.y - 26, '-20 HULL', '#f87171');
          beep(140, 0.25, 'sawtooth');
          ship.vx = (ship.x - a.x) * 4; ship.vy = (ship.y - a.y) * 4;
          if (game.hull <= 0) { game.hull = 0; loseGame('Hull destroyed by an asteroid.'); }
        }
      });
    }

    // Star fuel.
    game.fuels = game.fuels.filter(function (f) {
      if (dist(ship, f) < SHIP_R + f.r + 4) {
        game.fuel = Math.min(100, game.fuel + 30);
        game.score += 5;
        addFloat(f.x, f.y - 22, '+30 FUEL', '#fde68a');
        burst(f.x, f.y, '#fde68a', 12);
        beep(980, 0.08, 'sine');
        setTimeout(function () { if (game.state === 'playing') spawnFuel(); }, 4000);
        return false;
      }
      return true;
    });
  }

  function boostToward(x, y) {
    if (game.state !== 'playing' || game.boostCooldown > 0 || game.fuel < 8) return;
    var ship = game.ship;
    var dx = x - ship.x, dy = y - ship.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    ship.vx += (dx / len) * 280;
    ship.vy += (dy / len) * 280;
    ship.angle = Math.atan2(dy, dx);
    game.fuel -= 8;
    game.boostCooldown = 0.6;
    burst(ship.x, ship.y, '#67e8f9', 16);
    beep(620, 0.09, 'triangle');
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */
  function drawStarShape(x, y, r, colour) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.45;
      var a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawShip() {
    var s = game.ship;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (game.invulnerable > 0 && Math.floor(game.elapsed * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.rotate(s.angle + Math.PI / 2);
    if (s.thrusting) {
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(-6, 12); ctx.lineTo(0, 24 + Math.random() * 8); ctx.lineTo(6, 12);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#e0f2fe';
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(12, 12); ctx.lineTo(0, 6); ctx.lineTo(-12, 12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Carried parcel rides above the ship.
    if (game.carrying) {
      ctx.save();
      ctx.translate(s.x, s.y - 26 + Math.sin(game.elapsed * 4) * 2);
      ctx.fillStyle = game.carrying.main;
      ctx.shadowColor = game.carrying.main; ctx.shadowBlur = 12;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.restore();
    }
  }

  function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y); ctx.rotate(a.rot);
    ctx.fillStyle = '#6b7280';
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < a.verts.length; i++) {
      var ang = (i / a.verts.length) * Math.PI * 2;
      var rr = a.r * a.verts[i];
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4b5563';
    ctx.beginPath(); ctx.arc(-a.r * 0.3, -a.r * 0.2, a.r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(a.r * 0.35, a.r * 0.3, a.r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawStation(st) {
    var active = game.carrying && game.carrying.name === st.colour.name;
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.strokeStyle = st.colour.main;
    ctx.globalAlpha = active ? 0.95 : 0.45;
    ctx.lineWidth = active ? 4 : 2;
    ctx.setLineDash(active ? [] : [6, 6]);
    ctx.beginPath(); ctx.arc(0, 0, st.r + (active ? 6 + Math.sin(game.elapsed * 5) * 3 : 0), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b1226';
    ctx.beginPath(); ctx.arc(0, 0, st.r - 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = st.colour.main; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = st.colour.main;
    ctx.shadowColor = st.colour.main; ctx.shadowBlur = active ? 18 : 8;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('STATION', 0, -4);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(st.colour.name.toUpperCase(), 0, 12);
    ctx.restore();
  }

  function drawGuideArrow() {
    var target = null, colour = '#fff';
    if (game.carrying) {
      var st = game.stations.filter(function (s) { return s.colour.name === game.carrying.name; })[0];
      if (st) { target = st; colour = st.colour.main; }
    } else if (game.parcel) { target = game.parcel; colour = game.parcel.colour.main; }
    if (!target) return;
    var dx = target.x - game.ship.x, dy = target.y - game.ship.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 120) return;
    var ang = Math.atan2(dy, dx);
    var x = game.ship.x + Math.cos(ang) * 44, y = game.ship.y + Math.sin(ang) * 44;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = colour; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function bar(x, y, w, h, frac, colour, label) {
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w + 8, y + h / 2);
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(5,8,24,.85)';
    ctx.fillRect(0, 0, W, 56);
    ctx.strokeStyle = '#2a3a66';
    ctx.beginPath(); ctx.moveTo(0, 56); ctx.lineTo(W, 56); ctx.stroke();
    ctx.fillStyle = '#eaf2ff';
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('SCORE ' + game.score, 14, 20);
    ctx.fillText('DELIVERIES ' + game.deliveries + '/' + WIN_DELIVERIES, 14, 42);
    bar(200, 12, 130, 12, game.hull / 100, game.hull > 30 ? '#34d399' : '#f87171', 'HULL ' + Math.round(game.hull));
    bar(200, 34, 130, 12, game.fuel / 100, '#fbbf24', 'FUEL ' + Math.round(game.fuel));
    var mins = Math.floor(game.timeLeft / 60);
    var secs = Math.floor(game.timeLeft % 60);
    ctx.fillStyle = game.timeLeft < 20 ? '#f87171' : '#eaf2ff';
    ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('TIME ' + mins + ':' + (secs < 10 ? '0' : '') + secs, W - 14, 28);
    ctx.fillStyle = '#9fb3d9'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(game.carrying ? 'Carrying: ' + game.carrying.name.toUpperCase() + ' parcel — find the ' + game.carrying.name + ' station'
      : (game.parcel ? 'Pick up the ' + game.parcel.colour.name + ' parcel' : 'Delivering…'), W - 14, 48);
  }

  function overlay(title, lines, accent, footer) {
    ctx.fillStyle = 'rgba(3,5,18,.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent || '#eaf2ff';
    ctx.font = 'bold 44px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(title, W / 2, H / 2 - 90);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '17px system-ui, sans-serif';
    lines.forEach(function (line, i) { ctx.fillText(line, W / 2, H / 2 - 30 + i * 28); });
    ctx.fillStyle = '#9fb3d9'; ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(footer === undefined ? 'Press R or click Start to play again  •  P pauses  •  M toggles sound' : footer, W / 2, H / 2 + 110);
  }

  function render() {
    ctx.save();
    if (game.shake > 0) ctx.translate(rand(-game.shake, game.shake) * 0.5, rand(-game.shake, game.shake) * 0.5);
    // Space background.
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0a2e'); grad.addColorStop(1, '#050514');
    ctx.fillStyle = grad; ctx.fillRect(-20, -20, W + 40, H + 40);
    game.stars.forEach(function (s) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(s.tw));
      ctx.fillStyle = '#dbeafe';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // Soft nebulae, drawn procedurally with a radial fade (no hard edge).
    var neb;
    neb = ctx.createRadialGradient(180, 420, 10, 180, 420, 170);
    neb.addColorStop(0, 'rgba(99,102,241,.12)'); neb.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = neb; ctx.fillRect(0, 240, 360, 360);
    neb = ctx.createRadialGradient(780, 430, 10, 780, 430, 150);
    neb.addColorStop(0, 'rgba(236,72,153,.10)'); neb.addColorStop(1, 'rgba(236,72,153,0)');
    ctx.fillStyle = neb; ctx.fillRect(620, 270, 320, 320);

    game.stations.forEach(drawStation);
    if (game.parcel) {
      var p = game.parcel;
      var bobY = p.y + Math.sin(game.elapsed * 3 + p.bob) * 4;
      ctx.save();
      ctx.shadowColor = p.colour.main; ctx.shadowBlur = 16;
      ctx.fillStyle = p.colour.main;
      ctx.fillRect(p.x - 9, bobY - 9, 18, 18);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 9, bobY - 9, 18, 18);
      ctx.restore();
    }
    game.fuels.forEach(function (f) {
      drawStarShape(f.x, f.y + Math.sin(game.elapsed * 3 + f.bob) * 3, 12, '#fde68a');
    });
    game.asteroids.forEach(drawAsteroid);
    drawGuideArrow();
    if (game.state !== 'start') drawShip();
    game.particles.forEach(function (pt) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.colour;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    game.floats.forEach(function (f) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = f.colour;
      ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    drawHUD();

    if (game.state === 'start') {
      overlay('☄️ COMET COURIER', [
        'Deliver 5 parcels before the timer ends.',
        'Pick up a glowing parcel, then fly it to the station of the same colour.',
        'Asteroids cost 20 hull. Star fuel refills your tank. Click to boost.',
        'Move: WASD / arrows   •   Boost: click   •   Pause: P   •   Restart: R'
      ], '#67e8f9', 'Sound is off by default — press M to turn it on');
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('▶  Press Enter, click Start, or click the canvas to begin', W / 2, H / 2 + 70);
    } else if (game.state === 'paused') {
      overlay('PAUSED', ['Take a breath, courier.', 'Score ' + game.score + '  •  Deliveries ' + game.deliveries + '/' + WIN_DELIVERIES], '#eaf2ff');
    } else if (game.state === 'win') {
      overlay('🎉 ALL DELIVERIES DONE!', [
        'You delivered ' + WIN_DELIVERIES + ' parcels with ' + Math.max(0, Math.round(game.timeLeft)) + 's to spare.',
        'Final score: ' + game.score,
        'The comet route is yours, courier.'
      ], '#34d399');
    } else if (game.state === 'lose') {
      overlay('💥 RUN FAILED', [
        game.message || 'Out of hull or out of time.',
        'Deliveries: ' + game.deliveries + '/' + WIN_DELIVERIES + '  •  Score: ' + game.score,
        'Try a slower, wider route around the asteroids.'
      ], '#f87171');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Main loop, input, presets, and self-tests                           */
  /* ------------------------------------------------------------------ */
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function togglePause() {
    if (game.state === 'playing') { game.state = 'paused'; }
    else if (game.state === 'paused') { game.state = 'playing'; }
    syncButtons();
  }

  function toggleSound() {
    soundOn = !soundOn;
    if (soundOn) beep(660, 0.1, 'sine');
    syncButtons();
  }

  function syncButtons() {
    var b = document.getElementById('btn-sound');
    if (b) b.textContent = 'Sound: ' + (soundOn ? 'On' : 'Off') + ' (M)';
    var p = document.getElementById('btn-pause');
    if (p) p.textContent = game.state === 'paused' ? 'Resume (P)' : 'Pause (P)';
  }

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    game.keys[k] = true;
    if (k === 'r') { startGame(); syncButtons(); }
    if (k === 'p') togglePause();
    if (k === 'm') toggleSound();
    if (k === 'enter' && (game.state === 'start' || game.state === 'win' || game.state === 'lose')) {
      startGame(); syncButtons();
    }
  });
  window.addEventListener('keyup', function (e) { game.keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousedown', function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    if (game.state === 'start' || game.state === 'win' || game.state === 'lose') { startGame(); syncButtons(); return; }
    if (game.state === 'paused') { togglePause(); return; }
    boostToward(x, y);
  });

  document.getElementById('btn-start').addEventListener('click', function () { startGame(); syncButtons(); });
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-sound').addEventListener('click', toggleSound);

  // Preset states for screenshots / manual review (?screen=play|deliver|win|lose).
  function applyPreset(screen) {
    if (screen === 'play') {
      startGame();
      game.ship.x = 480; game.ship.y = 330;
      game.carrying = COLOURS[0];
      game.score = 10;
      game.timeLeft = 96;
    } else if (screen === 'deliver') {
      startGame();
      game.deliveries = 1; game.score = 110;
      game.carrying = null;   // just delivered the gold parcel; next parcel is in the world
      game.ship.x = 470; game.ship.y = 458; game.ship.vx = 0; game.ship.vy = -20;
      game.timeLeft = 88;
      burst(480, 516, COLOURS[2].main, 30);
      addFloat(480, 468, '+100  DELIVERED!', COLOURS[2].main);
    } else if (screen === 'win') {
      startGame();
      game.state = 'win'; game.deliveries = 5; game.score = 560; game.timeLeft = 34;
      game.carrying = null; game.parcel = null;
    } else if (screen === 'lose') {
      startGame();
      game.state = 'lose'; game.hull = 0; game.deliveries = 2; game.score = 230; game.timeLeft = 41;
      game.message = 'Hull destroyed by an asteroid.';
      burst(game.ship.x, game.ship.y, '#f87171', 30);
    }
  }

  // Built-in logic tests (?test=1). Runs synchronously, writes results
  // into #test-results and window.__testResults for headless verification.
  function runTests() {
    var results = [];
    function check(name, ok) { results.push((ok ? 'PASS' : 'FAIL') + '  ' + name); }
    function reset() { startGame(); }

    reset();
    check('start: state is playing, 0 deliveries, 120s', game.state === 'playing' && game.deliveries === 0 && game.timeLeft === GAME_SECONDS);

    var x0 = game.ship.x;
    game.keys['arrowright'] = true; update(0.2); game.keys['arrowright'] = false;
    check('movement: ArrowRight moves the ship right', game.ship.x > x0);

    reset();
    game.ship.x = game.parcel.x; game.ship.y = game.parcel.y; game.ship.vx = 0; game.ship.vy = 0;
    var parcelColour = game.parcel.colour;
    update(0.05);
    check('pickup: touching a parcel picks it up (+10)', game.carrying === parcelColour && game.score === 10);

    var st = game.stations.filter(function (s) { return s.colour.name === parcelColour.name; })[0];
    game.ship.x = st.x; game.ship.y = st.y; game.ship.vx = 0; game.ship.vy = 0;
    update(0.05);
    check('delivery: matching station scores +100 and counts 1 delivery', game.deliveries === 1 && game.score === 110 && game.carrying === null);

    reset();
    var hull0 = game.hull;
    game.asteroids[0].x = game.ship.x; game.asteroids[0].y = game.ship.y;
    game.asteroids[0].vx = 0; game.asteroids[0].vy = 0;
    update(0.05);
    check('collision: asteroid hit costs 20 hull', game.hull === hull0 - 20);

    reset();
    game.fuel = 40;
    game.fuels[0].x = game.ship.x; game.fuels[0].y = game.ship.y;
    update(0.05);
    check('fuel: star fuel refills the tank', game.fuel > 40);

    reset();
    game.timeLeft = 0.1; update(0.2);
    check('lose: timer running out ends the run', game.state === 'lose');

    reset();
    game.deliveries = 4;
    game.ship.x = game.parcel.x; game.ship.y = game.parcel.y; update(0.05);
    var c = game.carrying;
    var st2 = game.stations.filter(function (s) { return s.colour.name === c.name; })[0];
    game.ship.x = st2.x; game.ship.y = st2.y; game.ship.vx = 0; game.ship.vy = 0; update(0.05);
    check('win: 5th delivery wins the game', game.state === 'win' && game.deliveries === 5);

    reset();
    check('restart: R / startGame resets score, deliveries, hull and timer',
      game.state === 'playing' && game.score === 0 && game.deliveries === 0 && game.hull === 100 && game.timeLeft === GAME_SECONDS);

    var passed = results.filter(function (r) { return r.indexOf('PASS') === 0; }).length;
    var text = 'Comet Courier self-tests: ' + passed + '/' + results.length + ' passed\n' + results.join('\n');
    window.__testResults = { passed: passed, total: results.length, lines: results, text: text };
    var el = document.getElementById('test-results');
    if (el) { el.style.display = 'block'; el.textContent = text; }
    document.title = 'TESTS: ' + passed + '/' + results.length + ' passed';
    game.state = 'start';   // leave the game on its start screen after testing
  }

  makeStars();
  makeStations();
  var params = new URLSearchParams(window.location.search || '');
  if (params.get('test') === '1') {
    runTests();
  } else if (params.get('screen')) {
    applyPreset(params.get('screen'));
  }
  syncButtons();
  requestAnimationFrame(loop);

  // Exposed for manual / headless play-testing only.
  window.__comet = { game: game, startGame: startGame, update: update, boostToward: boostToward };
})();
