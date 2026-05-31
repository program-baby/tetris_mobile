(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const course = window.PIXEL_DIRT_RUSH_COURSE;
  const timeLabel = document.getElementById("time-label");
  const bestLabel = document.getElementById("best-label");
  const crashLabel = document.getElementById("crash-label");
  const startScreen = document.getElementById("start-screen");
  const resultScreen = document.getElementById("result-screen");
  const pauseScreen = document.getElementById("pause-screen");
  const resultTitle = document.getElementById("result-title");
  const resultDetail = document.getElementById("result-detail");
  const bestKey = `pixelDirtRush_best_${course.id}`;
  const legacyBestKey = "pixelDirtRush_best_course01";

  const input = {
    accelerate: false,
    jump: false,
    leanForward: false,
    leanBack: false
  };

  const state = {
    mode: "title",
    startedAt: 0,
    pausedAt: 0,
    finishedTime: 0,
    bestTime: readBest(),
    crashCount: 0,
    cameraX: 0,
    cameraY: 0,
    message: "",
    messageUntil: 0,
    bike: makeBike(course.start.x, course.start.y)
  };

  let lastTime = performance.now();
  let jumpLatch = false;
  let raceAudio = null;
  const TOP_SPEED = 560;

  function makeBike(x, groundY) {
    return {
      x,
      y: groundY - 34,
      vx: 0,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
      grounded: true,
      crashedUntil: 0,
      spawnX: x,
      spawnY: groundY
    };
  }

  function readBest() {
    const saved = localStorage.getItem(bestKey) ?? localStorage.getItem(legacyBestKey);
    const value = Number(saved);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function saveBest(time) {
    if (!state.bestTime || time < state.bestTime) {
      state.bestTime = time;
      localStorage.setItem(bestKey, String(time));
      return true;
    }
    return false;
  }

  function formatTime(ms, fallback = "--:--.--") {
    if (!ms) return fallback;
    const total = Math.max(0, ms) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = Math.floor(total % 60);
    const centi = Math.floor((total % 1) * 100);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centi).padStart(2, "0")}`;
  }

  function startRace() {
    state.mode = "race";
    state.startedAt = performance.now();
    state.pausedAt = 0;
    state.finishedTime = 0;
    state.crashCount = 0;
    state.cameraX = 0;
    state.cameraY = 0;
    state.message = "";
    state.messageUntil = 0;
    state.bike = makeBike(course.start.x, course.start.y);
    jumpLatch = false;
    startRaceAudio();
    startScreen.classList.remove("is-open");
    resultScreen.classList.remove("is-open");
    pauseScreen.classList.remove("is-open");
    setPauseButtonText();
  }

  function showTitle() {
    state.mode = "title";
    state.startedAt = 0;
    state.pausedAt = 0;
    state.finishedTime = 0;
    state.crashCount = 0;
    state.cameraX = 0;
    state.cameraY = 0;
    state.message = "";
    state.messageUntil = 0;
    state.bike = makeBike(course.start.x, course.start.y);
    jumpLatch = false;
    for (const action of Object.keys(input)) input[action] = false;
    for (const button of document.querySelectorAll("[data-action]")) {
      button.classList.remove("is-down");
    }
    resultScreen.classList.remove("is-open");
    pauseScreen.classList.remove("is-open");
    startScreen.classList.add("is-open");
    stopRaceAudio();
    setPauseButtonText();
  }

  function pauseRace(now = performance.now()) {
    if (state.mode !== "race") return;
    state.mode = "pause";
    state.pausedAt = now;
    for (const action of Object.keys(input)) input[action] = false;
    for (const button of document.querySelectorAll("[data-action]")) {
      button.classList.remove("is-down");
    }
    stopRaceAudio();
    pauseScreen.classList.add("is-open");
    setPauseButtonText();
  }

  function resumeRace(now = performance.now()) {
    if (state.mode !== "pause") return;
    state.startedAt += now - state.pausedAt;
    state.pausedAt = 0;
    state.mode = "race";
    pauseScreen.classList.remove("is-open");
    startRaceAudio();
    setPauseButtonText();
  }

  function togglePause() {
    if (state.mode === "race") pauseRace();
    else if (state.mode === "pause") resumeRace();
  }

  function setPauseButtonText() {
    document.getElementById("pause-button").textContent = state.mode === "pause" ? "Resume" : "Pause";
  }

  function createRaceAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const context = new AudioContext();
    const master = context.createGain();
    const engine = context.createOscillator();
    const pulse = context.createOscillator();
    const wobble = context.createOscillator();
    const engineGain = context.createGain();
    const pulseGain = context.createGain();
    const throttleGain = context.createGain();
    const wobbleGain = context.createGain();

    master.gain.value = 0.0001;
    engine.type = "sawtooth";
    engine.frequency.value = 52;
    pulse.type = "square";
    pulse.frequency.value = 104;
    throttleGain.gain.value = 0.02;
    wobble.type = "sine";
    wobble.frequency.value = 11;
    engineGain.gain.value = 0.42;
    pulseGain.gain.value = 0.04;
    wobbleGain.gain.value = 10;

    wobble.connect(wobbleGain);
    wobbleGain.connect(engine.frequency);
    engine.connect(engineGain);
    pulse.connect(pulseGain);
    engineGain.connect(master);
    pulseGain.connect(master);
    throttleGain.connect(master);
    master.connect(context.destination);
    engine.start();
    pulse.start();
    wobble.start();

    return { context, master, engine, pulse, engineGain, pulseGain, throttleGain };
  }

  function startRaceAudio() {
    if (!raceAudio) raceAudio = createRaceAudio();
    if (!raceAudio) return;
    raceAudio.context.resume?.();
    raceAudio.master.gain.cancelScheduledValues(raceAudio.context.currentTime);
    raceAudio.master.gain.setTargetAtTime(0.05, raceAudio.context.currentTime, 0.05);
  }

  function stopRaceAudio() {
    if (!raceAudio) return;
    raceAudio.master.gain.cancelScheduledValues(raceAudio.context.currentTime);
    raceAudio.master.gain.setTargetAtTime(0.0001, raceAudio.context.currentTime, 0.05);
  }

  function updateRaceAudio(bike) {
    if (!raceAudio || state.mode !== "race") return;
    const now = raceAudio.context.currentTime;
    const speedRatio = Math.max(0, Math.min(1, bike.vx / TOP_SPEED));
    const throttle = input.accelerate && !bike.crashedUntil ? 1 : 0;
    const airborneLift = bike.grounded ? 0 : 18;
    const revAmount = throttle ? Math.max(0, 1 - speedRatio / 0.82) : 0;
    const revWave = revAmount * (Math.sin(performance.now() * 0.012) + 1) * 0.5;
    const base = 42 + speedRatio * 116 + throttle * (22 + revWave * 48) + airborneLift;
    const tremble = Math.sin(performance.now() * 0.038) * (throttle ? 3 + revAmount * 11 : 4);

    raceAudio.engine.frequency.setTargetAtTime(base + tremble, now, 0.035);
    raceAudio.pulse.frequency.setTargetAtTime((base + tremble) * 2, now, 0.035);
    raceAudio.engineGain.gain.setTargetAtTime(throttle ? 0.56 + revWave * 0.22 : 0.22, now, 0.05);
    raceAudio.pulseGain.gain.setTargetAtTime(throttle ? 0.065 + revWave * 0.07 : 0.018, now, 0.05);

    if (throttle && revAmount > 0.08 && Math.random() < 0.12 + revAmount * 0.18) {
      const blip = raceAudio.context.createOscillator();
      const blipGain = raceAudio.context.createGain();
      blip.type = Math.random() < 0.55 ? "sawtooth" : "square";
      blip.frequency.value = 46 + revWave * 72 + Math.random() * 28 + speedRatio * 44;
      blipGain.gain.setValueAtTime(0.0001, now);
      blipGain.gain.exponentialRampToValueAtTime(0.06 + revWave * 0.04, now + 0.012);
      blipGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      blip.connect(blipGain);
      blipGain.connect(raceAudio.throttleGain);
      blip.start(now);
      blip.stop(now + 0.11);
    }
  }

  function finishRace(now) {
    state.mode = "finish";
    stopRaceAudio();
    state.finishedTime = now - state.startedAt;
    const isBest = saveBest(state.finishedTime);
    resultTitle.textContent = isBest ? "New Best!" : "Goal!";
    resultDetail.textContent = `Time ${formatTime(state.finishedTime)} / Crash ${state.crashCount}`;
    resultScreen.classList.add("is-open");
  }

  function crash(now, reason) {
    const bike = state.bike;
    if (bike.crashedUntil > now) return;
    state.crashCount += 1;
    bike.crashedUntil = now + 2000;
    bike.vx = 0;
    bike.vy = 0;
    bike.angularVelocity = 0;
    bike.angle = 0;
    state.message = reason || "Crash +2s";
    state.messageUntil = now + 1300;
  }

  function respawnAfterCrash(now) {
    const bike = state.bike;
    if (!bike.crashedUntil || bike.crashedUntil > now) return;
    const spawn = findSafeSpawn(bike.x);
    bike.x = spawn.x;
    bike.y = spawn.y - 34;
    bike.spawnX = spawn.x;
    bike.spawnY = spawn.y;
    bike.grounded = true;
    bike.crashedUntil = 0;
  }

  function findSafeSpawn(x) {
    let found = course.safeSpawns[0];
    for (const spawn of course.safeSpawns) {
      if (spawn.x <= x - 120) found = spawn;
    }
    return found;
  }

  function update(dt, now) {
    if (state.mode !== "race") return;
    const bike = state.bike;

    if (bike.crashedUntil) {
      updateRaceAudio(bike);
      respawnAfterCrash(now);
      return;
    }

    const onMud = course.mudZones.some((zone) => bike.x >= zone.x && bike.x <= zone.x + zone.w);
    const isWheelie = bike.grounded && input.leanBack && !input.leanForward;
    const mudPenalty = onMud && !isWheelie;
    const maxSpeed = mudPenalty ? 330 : TOP_SPEED;
    const accel = mudPenalty ? 580 : 900;
    const drag = bike.grounded ? 0.92 : 0.985;

    if (input.accelerate) bike.vx += accel * dt;
    else bike.vx *= Math.pow(drag, dt * 60);

    bike.vx = Math.max(0, Math.min(maxSpeed, bike.vx));
    bike.vy += 1180 * dt;

    if (bike.grounded && input.jump && !jumpLatch) {
      bike.vy = isWheelie ? -650 : -540;
      if (isWheelie) bike.vx = Math.min(TOP_SPEED, bike.vx + 45);
      bike.grounded = false;
      bike.angularVelocity -= isWheelie ? 0.55 : 1.0;
    }
    jumpLatch = input.jump;

    if (input.leanForward) bike.angularVelocity += 7.2 * dt;
    if (input.leanBack) bike.angularVelocity -= 7.2 * dt;
    bike.angularVelocity = Math.max(-3.2, Math.min(3.2, bike.angularVelocity));
    bike.angularVelocity *= Math.pow(0.9, dt * 60);
    bike.angle += bike.angularVelocity * dt;

    if (bike.grounded) {
      bike.angle *= Math.pow(0.86, dt * 60);
    }

    bike.x += bike.vx * dt;
    bike.y += bike.vy * dt;

    const ground = getGroundAt(bike.x);
    if (ground && bike.y + 34 >= ground.y) {
      const wasAirborne = !bike.grounded;
      bike.y = ground.y - 34;
      bike.vy = 0;
      bike.grounded = true;
      bike.angle = blendAngle(bike.angle, ground.angle, 0.18);
      bike.angularVelocity *= 0.35;
      if (wasAirborne && Math.abs(bike.angle - ground.angle) > 1.12) {
        crash(now, "Bad landing +2s");
      }
    } else {
      bike.grounded = false;
    }

    if (!ground && bike.y > 610) {
      crash(now, "Gap fall +2s");
    }

    if (Math.abs(bike.angle) > 1.48) {
      crash(now, "Over tilt +2s");
    }

    for (const tire of course.tires) {
      const dx = bike.x - tire.x;
      const dy = bike.y + 28 - tire.y;
      if (dx * dx + dy * dy < (tire.r + 24) * (tire.r + 24) && bike.vx > 80) {
        crash(now, "Tire hit +2s");
      }
    }

    if (bike.x >= course.finishX) {
      finishRace(now);
    }

    updateRaceAudio(bike);
    state.cameraX += (Math.max(0, bike.x - 270) - state.cameraX) * Math.min(1, dt * 5);
    state.cameraY += (Math.max(-150, Math.min(220, bike.y - 260)) - state.cameraY) * Math.min(1, dt * 4);
  }

  function blendAngle(current, target, amount) {
    return current + (target - current) * amount;
  }

  function getGroundAt(x) {
    for (let i = 0; i < course.terrain.length - 1; i += 1) {
      const a = course.terrain[i];
      const b = course.terrain[i + 1];
      if (x < a.x || x > b.x) continue;
      if (a.y > 620 || b.y > 620) return null;
      const t = (x - a.x) / (b.x - a.x || 1);
      const y = a.y + (b.y - a.y) * t;
      return { y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    return null;
  }

  function draw(now) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    drawSky(width, height);
    drawWorld(now);
    drawBike(now);
    drawMessages(now);
    updateHud(now);
  }

  function drawSky(width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#67dff1");
    gradient.addColorStop(0.58, "#b8f0e5");
    gradient.addColorStop(0.59, "#78c86a");
    gradient.addColorStop(1, "#2f6b42");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(-state.cameraX * 0.18, -state.cameraY * 0.08);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    for (let x = -200; x < course.length + 900; x += 520) {
      pixelCloud(x, 72 + ((x / 7) % 80));
    }

    ctx.fillStyle = "#5bb06b";
    for (let x = -120; x < course.length + 600; x += 360) {
      pixelMountain(x, 320, 190, 150);
    }
    ctx.restore();
  }

  function pixelCloud(x, y) {
    const s = 12;
    ctx.fillRect(x, y, s * 5, s);
    ctx.fillRect(x + s, y - s, s * 4, s);
    ctx.fillRect(x + s * 3, y - s * 2, s * 2, s);
  }

  function pixelMountain(x, baseY, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + w * 0.5, baseY - h);
    ctx.lineTo(x + w, baseY);
    ctx.closePath();
    ctx.fill();
  }

  function drawWorld(now) {
    ctx.save();
    ctx.translate(-state.cameraX, -state.cameraY);

    for (const zone of course.mudZones) {
      const ground = getGroundAt(zone.x + zone.w * 0.5);
      if (!ground) continue;
      ctx.fillStyle = "#6f5633";
      ctx.fillRect(zone.x, ground.y - 8, zone.w, 26);
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      for (let x = zone.x + 12; x < zone.x + zone.w; x += 48) {
        ctx.fillRect(x, ground.y + 2, 22, 4);
      }
    }

    ctx.lineWidth = 0;
    ctx.beginPath();
    ctx.moveTo(course.terrain[0].x, 650);
    for (const point of course.terrain) ctx.lineTo(point.x, point.y);
    ctx.lineTo(course.length, 650);
    ctx.closePath();
    ctx.fillStyle = "#9b5a30";
    ctx.fill();

    ctx.beginPath();
    let started = false;
    for (let i = 0; i < course.terrain.length - 1; i += 1) {
      const a = course.terrain[i];
      const b = course.terrain[i + 1];
      if (a.y > 620 || b.y > 620) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(a.x, a.y);
        started = true;
      }
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = "#f2b45f";
    ctx.lineWidth = 8;
    ctx.stroke();

    for (const tire of course.tires) {
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(tire.x - tire.r, tire.y - tire.r, tire.r * 2, tire.r * 2);
      ctx.fillStyle = "#4b5563";
      ctx.fillRect(tire.x - tire.r + 8, tire.y - tire.r + 8, tire.r * 2 - 16, tire.r * 2 - 16);
    }

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(course.finishX, 230, 8, 138);
    for (let i = 0; i < 7; i += 1) {
      ctx.fillStyle = i % 2 ? "#111827" : "#f8fafc";
      ctx.fillRect(course.finishX + 8, 230 + i * 18, 54, 18);
    }
    ctx.fillStyle = "#111827";
    ctx.font = "900 18px Segoe UI";
    ctx.fillText("GOAL", course.finishX + 12, 222);

    ctx.restore();
  }

  function drawBike(now) {
    const bike = state.bike;
    const blink = bike.crashedUntil && Math.floor(now / 110) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(bike.x - state.cameraX, bike.y - state.cameraY);
    ctx.rotate(bike.angle);

    drawWheel(-34, 24, 15);
    drawWheel(34, 24, 15);

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.lineCap = "square";
    line(-34, 24, -8, 2);
    line(34, 24, -8, 2);
    line(-8, 2, 16, 2);
    line(16, 2, 34, 24);
    line(28, 18, 40, -8);
    line(34, -10, 48, -13);

    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.lineTo(16, -8);
    ctx.lineTo(28, 2);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fb923c";
    ctx.fillRect(-18, -12, 24, 8);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(-25, -8, 20, 6);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 6;
    line(-2, -23, 20, -14);
    line(20, -14, 47, -14);
    line(2, -19, 22, -10);
    line(22, -10, 42, -12);

    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 7;
    line(-8, -4, 9, 7);
    line(9, 7, 31, 14);
    line(-12, -3, -28, 9);
    line(-28, 9, -39, 22);

    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(-18, -28);
    ctx.lineTo(1, -31);
    ctx.lineTo(18, -13);
    ctx.lineTo(6, -2);
    ctx.lineTo(-15, -8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-18, -29, 19, 7);
    ctx.fillRect(-15, -9, 23, 8);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(-14, -48, 18, 16);
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(1, -43, 10, 6);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-13, -33, 17, 8);

    ctx.fillStyle = "#111827";
    ctx.fillRect(43, -17, 6, 6);
    ctx.fillRect(27, 11, 10, 5);
    ctx.fillRect(-43, 19, 10, 5);
    ctx.lineCap = "square";

    function drawWheel(x, y, r) {
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.arc(x, y, r - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i += 1) {
        const a = (Math.PI / 2) * i;
        line(x, y, x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
      }
    }

    function line(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMessages(now) {
    if (state.message && state.messageUntil > now) {
      ctx.fillStyle = "rgba(17, 24, 39, 0.78)";
      ctx.fillRect(300, 26, 360, 44);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "900 22px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(state.message, 480, 56);
      ctx.textAlign = "left";
    }
  }

  function updateHud(now) {
    let current = state.finishedTime;
    if (state.mode === "race") current = now - state.startedAt;
    if (state.mode === "pause") current = state.pausedAt - state.startedAt;
    timeLabel.textContent = formatTime(current, "00:00.00");
    bestLabel.textContent = formatTime(state.bestTime);
    crashLabel.textContent = String(state.crashCount);
  }

  function loop(now) {
    const dt = Math.min(0.032, (now - lastTime) / 1000);
    lastTime = now;
    update(dt, now);
    draw(now);
    requestAnimationFrame(loop);
  }

  function setInput(action, isDown) {
    if (action in input) input[action] = isDown;
  }

  function bindButton(button) {
    const action = button.dataset.action;
    const down = (event) => {
      event.preventDefault();
      setInput(action, true);
      button.classList.add("is-down");
    };
    const up = (event) => {
      event.preventDefault();
      setInput(action, false);
      button.classList.remove("is-down");
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
  }

  for (const button of document.querySelectorAll("[data-action]")) bindButton(button);

  window.addEventListener("keydown", (event) => {
    if (event.code === "ArrowRight" || event.code === "KeyD") setInput("accelerate", true);
    if (event.code === "Space") setInput("jump", true);
    if (event.code === "ArrowDown" || event.code === "KeyS") setInput("leanForward", true);
    if (event.code === "ArrowUp" || event.code === "KeyW") setInput("leanBack", true);
    if (event.code === "Enter" && state.mode === "title") startRace();
    if (event.code === "Escape" || event.code === "KeyP") togglePause();
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowRight" || event.code === "KeyD") setInput("accelerate", false);
    if (event.code === "Space") setInput("jump", false);
    if (event.code === "ArrowDown" || event.code === "KeyS") setInput("leanForward", false);
    if (event.code === "ArrowUp" || event.code === "KeyW") setInput("leanBack", false);
  });

  document.getElementById("start-button").addEventListener("click", startRace);
  document.getElementById("retry-button").addEventListener("click", showTitle);
  document.getElementById("restart-button").addEventListener("click", showTitle);
  document.getElementById("pause-button").addEventListener("click", togglePause);
  document.getElementById("resume-button").addEventListener("click", resumeRace);

  timeLabel.textContent = formatTime(0, "00:00.00");
  bestLabel.textContent = formatTime(state.bestTime);
  setPauseButtonText();
  requestAnimationFrame(loop);
}());
