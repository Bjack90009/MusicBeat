(() => {
  "use strict";

  const config = window.GAME_CONFIG;
  const rules = window.GAME_RULES;
  const runtime = window.RUNTIME_CONFIG || {};
  const apiBase = String(runtime.apiBaseUrl || (location.hostname === "127.0.0.1" || location.hostname === "localhost" ? "http://127.0.0.1:8787" : "")).replace(/\/$/, "");
  const savedPlayerNameKey = "music-beat-player-name";
  const formatScore = new Intl.NumberFormat("zh-CN");
  const gradeIds = ["perfect", "great", "good", "early"];
  const els = {
    playfield: document.querySelector("#playfield"),
    fieldMessage: document.querySelector("#field-message"),
    start: document.querySelector("#start-button"),
    timer: document.querySelector("#timer"),
    perfectCombo: document.querySelector("#perfect-combo"),
    score: document.querySelector("#score"),
    specialBonus: document.querySelector("#special-bonus"),
    combo: document.querySelector("#combo"),
    maxCombo: document.querySelector("#max-combo"),
    hits: document.querySelector("#hits"),
    specialHits: document.querySelector("#special-hits"),
    miss: document.querySelector("#miss-count"),
    leaderboard: document.querySelector("#leaderboard"),
    networkStatus: document.querySelector("#network-status"),
    modal: document.querySelector("#result-modal"),
    modalKicker: document.querySelector("#modal-kicker"),
    modalTitle: document.querySelector("#modal-title"),
    rankLabel: document.querySelector("#rank-label"),
    resultRank: document.querySelector("#result-rank"),
    resultScore: document.querySelector("#result-score"),
    nameEntry: document.querySelector("#name-entry"),
    nameInput: document.querySelector("#player-name"),
    nameError: document.querySelector("#name-error"),
    confirmRank: document.querySelector("#confirm-rank"),
    declineRank: document.querySelector("#decline-rank"),
    closeResult: document.querySelector("#close-result")
  };

  const state = {
    phase: "idle",
    sessionId: null,
    startedAt: 0,
    nextSpawnAt: 0,
    autoSpawnCount: 0,
    perfectStreak: 0,
    specialHits: 0,
    specialInputMethods: {},
    movingNote: null,
    movingElement: null,
    movingRng: null,
    movingAnimationFrame: 0,
    movingLastHitAt: Number.NEGATIVE_INFINITY,
    noteSequence: 0,
    activeNotes: new Map(),
    animationFrame: 0,
    score: 0,
    rawScore: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    miss: 0,
    grades: Object.fromEntries(gradeIds.map((id) => [id, 0])),
    qualitySpawned: Object.fromEntries(config.qualities.map((q) => [q.id, 0])),
    qualityHit: Object.fromEntries(config.qualities.map((q) => [q.id, 0])),
    timingSamples: [],
    inputMethods: {},
    pendingRun: null,
    rng: Math.random
  };

  function createId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomBetween(min, max) {
    return min + state.rng() * (max - min);
  }

  function deviceCategory() {
    if (matchMedia("(pointer: coarse)").matches && innerWidth < 768) return "mobile";
    if (matchMedia("(pointer: coarse)").matches) return "tablet";
    return "desktop";
  }

  function sessionContext() {
    return {
      sessionId: state.sessionId,
      configVersion: config.version,
      deviceCategory: deviceCategory(),
      viewportWidth: Math.round(innerWidth),
      viewportHeight: Math.round(innerHeight),
      language: String(navigator.language || "").slice(0, 16),
      timeZone: String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").slice(0, 40)
    };
  }

  async function apiRequest(path, options = {}, queueOnFailure = false) {
    if (!apiBase) throw new Error("排行榜服务尚未配置");
    const request = {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body
    };
    try {
      const response = await fetch(`${apiBase}${path}`, request);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
      return payload;
    } catch (error) {
      if (queueOnFailure && request.method !== "GET") enqueueRequest(path, request.body);
      throw error;
    }
  }

  function enqueueRequest(path, body) {
    try {
      const queue = JSON.parse(localStorage.getItem("music-beat-pending") || "[]");
      queue.push({ path, body, queuedAt: Date.now() });
      localStorage.setItem("music-beat-pending", JSON.stringify(queue.slice(-50)));
    } catch (_) { /* storage unavailable */ }
  }

  async function flushQueue() {
    if (!apiBase) return;
    let queue;
    try { queue = JSON.parse(localStorage.getItem("music-beat-pending") || "[]"); } catch (_) { return; }
    if (!Array.isArray(queue) || queue.length === 0) return;
    const remaining = [];
    for (const item of queue) {
      try { await apiRequest(item.path, { method: "POST", body: item.body }); }
      catch (_) { remaining.push(item); }
    }
    try { localStorage.setItem("music-beat-pending", JSON.stringify(remaining)); } catch (_) { /* ignored */ }
  }

  function resetStats() {
    state.score = 0;
    state.rawScore = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.hits = 0;
    state.miss = 0;
    state.autoSpawnCount = 0;
    state.perfectStreak = 0;
    state.specialHits = 0;
    state.specialInputMethods = {};
    state.noteSequence = 0;
    state.grades = Object.fromEntries(gradeIds.map((id) => [id, 0]));
    state.qualitySpawned = Object.fromEntries(config.qualities.map((q) => [q.id, 0]));
    state.qualityHit = Object.fromEntries(config.qualities.map((q) => [q.id, 0]));
    state.timingSamples = [];
    state.inputMethods = {};
    state.pendingRun = null;
    clearNotes();
    renderStats();
  }

  function renderStats() {
    state.score = rules.scoreWithMovingBonus(state.rawScore, state.specialHits, config.movingNoteBonusPerHit);
    els.score.textContent = formatScore.format(state.score);
    els.specialBonus.textContent = formatBonusPercent(rules.movingBonusRate(state.specialHits, config.movingNoteBonusPerHit));
    els.combo.textContent = state.combo;
    els.maxCombo.textContent = state.maxCombo;
    els.hits.textContent = state.hits;
    els.specialHits.textContent = state.specialHits;
    els.miss.textContent = state.miss;
    els.perfectCombo.textContent = `PERFECT COMBO ×${state.perfectStreak}`;
    els.perfectCombo.classList.toggle("active", state.perfectStreak > 0);
    gradeIds.forEach((id) => { document.querySelector(`#${id}-count`).textContent = state.grades[id]; });
  }

  function formatBonusRate(value) {
    return Number(value.toFixed(2)).toString();
  }

  function formatBonusPercent(value) {
    return `+${formatBonusRate(value * 100)}%`;
  }

  function chooseQuality() {
    const total = config.qualities.reduce((sum, quality) => sum + quality.probability, 0);
    let roll = state.rng() * total;
    for (const quality of config.qualities) {
      roll -= quality.probability;
      if (roll < 0) return quality;
    }
    return config.qualities[0];
  }

  function spawnNote(now) {
    const position = rules.selectSafePosition(config, [...state.activeNotes.values()], state.rng);
    if (!position) return false;
    const quality = chooseQuality();
    const size = randomBetween(config.minOuterSize, config.maxOuterSize);
    const { x, y } = position;
    const id = `${state.sessionId}-${++state.noteSequence}`;
    const note = { id, sequence: state.noteSequence, bornAt: now, expiresAt: now + config.noteLifetimeMs, quality, size, x, y, resolved: false };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "beat-note";
    button.dataset.noteId = id;
    button.setAttribute("aria-label", `${quality.label}色品质第 ${note.sequence} 拍`);
    button.style.cssText = [
      `left:${x / config.playAreaWidth * 100}%`,
      `top:${y / config.playAreaHeight * 100}%`,
      `--size:${size / config.playAreaWidth * 100}%`,
      `--target:${config.targetSize / size * 100}%`,
      `--target-scale:${config.targetSize / size}`,
      `--lifetime:${config.noteLifetimeMs}ms`,
      `--quality:${quality.color}`
    ].join(";");
    button.innerHTML = `<span class="outer-ring"></span><span class="guide-ring"></span><span class="target-ring"><i class="note-core"></i></span><span class="note-label">${quality.label} · ${note.sequence}</span>`;
    button.addEventListener("pointerdown", (event) => handleHit(note, event));
    note.element = button;
    state.activeNotes.set(id, note);
    state.autoSpawnCount += 1;
    state.qualitySpawned[quality.id] += 1;
    els.playfield.prepend(button);
    return true;
  }

  function getJudgment(remainingRatio) {
    return config.judgments.find((tier) => remainingRatio <= tier.maxRemainingRatio) || config.judgments.at(-1);
  }

  function handleHit(note, event) {
    if (state.phase !== "playing" || note.resolved) return;
    event.preventDefault();
    note.resolved = true;
    const now = performance.now();
    const remainingRatio = Math.max(0, Math.min(1, (note.expiresAt - now) / config.noteLifetimeMs));
    const tier = getJudgment(remainingRatio);
    const rawPoints = Math.round(note.quality.baseScore * tier.multiplier);
    const previousScore = state.score;
    state.rawScore += rawPoints;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.hits += 1;
    state.grades[tier.id] += 1;
    state.qualityHit[note.quality.id] += 1;
    state.timingSamples.push(Number(remainingRatio.toFixed(4)));
    const pointerType = event.pointerType || "unknown";
    state.inputMethods[pointerType] = (state.inputMethods[pointerType] || 0) + 1;
    state.perfectStreak = rules.nextPerfectStreak(state.perfectStreak, tier.id);
    renderStats();
    const points = state.score - previousScore;
    playTone(tier.id);
    showFeedback(note, tier, points, state.perfectStreak);
    note.element.classList.add("hit");
    setTimeout(() => removeNote(note), 210);
  }

  function registerMiss(note) {
    if (note.resolved) return;
    note.resolved = true;
    state.miss += 1;
    state.combo = 0;
    state.perfectStreak = 0;
    renderStats();
    showFeedback(note, { id: "miss", label: "MISS", color: "#8a94a0" }, 0);
    removeNote(note);
  }

  function showFeedback(note, tier, points, perfectStreak = 0) {
    const feedback = document.createElement("div");
    feedback.className = "hit-feedback";
    feedback.style.cssText = `left:${note.x / config.playAreaWidth * 100}%;top:${note.y / config.playAreaHeight * 100}%;--grade:${tier.color}`;
    feedback.innerHTML = `<strong>${tier.label}</strong><small>${points ? `+${formatScore.format(points)}` : "COMBO BREAK"}</small>${tier.id === "perfect" ? `<em>COMBO ×${perfectStreak}</em>` : ""}`;
    els.playfield.append(feedback);
    setTimeout(() => feedback.remove(), 720);
  }

  function removeNote(note) {
    state.activeNotes.delete(note.id);
    note.element?.remove();
  }

  function clearNotes() {
    for (const note of state.activeNotes.values()) note.element?.remove();
    state.activeNotes.clear();
    els.playfield.querySelectorAll(".hit-feedback").forEach((node) => node.remove());
  }

  function handleMovingHit(event) {
    if (state.phase !== "playing") return;
    const now = performance.now();
    if (!rules.canAcceptMovingHit(state.movingLastHitAt, now, config.movingNoteHitCooldownMs)) return;
    state.movingLastHitAt = now;
    event.preventDefault();
    state.specialHits += 1;
    state.movingNote = rules.turnMovingNoteOnHit(state.movingNote, config, state.movingRng);
    const pointerType = event.pointerType || "unknown";
    state.specialInputMethods[pointerType] = (state.specialInputMethods[pointerType] || 0) + 1;
    renderStats();
    playTone("special");
    state.movingElement.classList.remove("is-hit");
    void state.movingElement.offsetWidth;
    state.movingElement.classList.add("is-hit");
    window.setTimeout(() => state.movingElement?.classList.remove("is-hit"), 180);
    showMovingFeedback();
  }

  function showMovingFeedback() {
    const feedback = document.createElement("div");
    feedback.className = "hit-feedback moving-feedback";
    feedback.style.cssText = `left:${state.movingNote.x / config.playAreaWidth * 100}%;top:${state.movingNote.y / config.playAreaHeight * 100}%;--grade:#ffffff`;
    feedback.innerHTML = "<strong>lalala</strong>";
    els.playfield.append(feedback);
    window.setTimeout(() => feedback.remove(), 720);
  }

  function renderMovingNote() {
    if (!state.movingNote || !state.movingElement) return;
    state.movingElement.style.left = `${state.movingNote.x / config.playAreaWidth * 100}%`;
    state.movingElement.style.top = `${state.movingNote.y / config.playAreaHeight * 100}%`;
  }

  function moveSpecialNote(now) {
    if (state.phase !== "playing" || !state.movingNote || !state.movingElement) return;
    const speedMultiplier = rules.movingSpeedMultiplier(state.specialHits, config.movingNoteSpeedBonusPerHit);
    state.movingNote = rules.advanceMovingNote(state.movingNote, now, config, state.movingRng, speedMultiplier);
    state.movingElement.dataset.speedMultiplier = speedMultiplier.toFixed(2);
    state.movingElement.dataset.initialSpeed = state.movingNote.initialSpeed.toFixed(2);
    state.movingElement.dataset.currentSpeed = state.movingNote.speed.toFixed(2);
    state.movingElement.dataset.angle = state.movingNote.angle.toFixed(6);
    renderMovingNote();
    state.movingAnimationFrame = requestAnimationFrame(moveSpecialNote);
  }

  function removeMovingNote() {
    cancelAnimationFrame(state.movingAnimationFrame);
    state.movingAnimationFrame = 0;
    state.movingElement?.remove();
    state.movingElement = null;
    state.movingNote = null;
    state.movingRng = null;
    state.movingLastHitAt = Number.NEGATIVE_INFINITY;
  }

  function createMovingNote() {
    removeMovingNote();
    const now = performance.now();
    state.movingRng = seededRandom((config.seed ^ 0x51f15e) >>> 0);
    state.movingNote = rules.createMovingNoteState(config, state.movingRng, now);
    state.movingLastHitAt = Number.NEGATIVE_INFINITY;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "moving-note";
    button.setAttribute("aria-label", `PICK ME 彩虹色移动节拍，每次命中使当前总分增加 ${formatBonusRate(config.movingNoteBonusPerHit * 100)}%`);
    button.style.setProperty("--moving-size", `${config.movingNoteSize / config.playAreaWidth * 100}%`);
    button.innerHTML = '<span class="moving-ring"><i></i></span><small>PICK ME</small>';
    button.addEventListener("pointerdown", handleMovingHit);
    state.movingElement = button;
    els.playfield.append(button);
    renderMovingNote();
    state.movingAnimationFrame = requestAnimationFrame(moveSpecialNote);
  }

  let audioContext;
  function playTone(grade) {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const tones = { perfect: [880, "sine"], great: [660, "triangle"], good: [500, "triangle"], early: [350, "square"], special: [1046, "sine"] };
      const [frequency, type] = tones[grade] || [180, "sawtooth"];
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.15, now + .08);
      oscillator.type = type;
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.12, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .12);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + .13);
    } catch (_) { /* audio is optional */ }
  }

  function tick(now) {
    if (state.phase !== "playing") return;
    const elapsed = now - state.startedAt;
    const remaining = Math.max(0, config.durationMs - elapsed);
    els.timer.textContent = (remaining / 1000).toFixed(2);

    for (const note of [...state.activeNotes.values()]) {
      if (now >= note.expiresAt) registerMiss(note);
    }

    while (now >= state.nextSpawnAt && state.autoSpawnCount < config.maxNotes && elapsed < config.durationMs) {
      if (!spawnNote(now)) {
        state.nextSpawnAt = now + 50;
        break;
      }
      state.nextSpawnAt += randomBetween(config.minSpawnIntervalMs, config.maxSpawnIntervalMs);
    }

    if (remaining <= 0) {
      finishGame();
      return;
    }
    state.animationFrame = requestAnimationFrame(tick);
  }

  async function startGame() {
    if (state.phase === "playing") return;
    closeModal();
    resetStats();
    state.phase = "playing";
    state.sessionId = createId();
    state.rng = seededRandom((config.seed ^ Date.now()) >>> 0);
    state.startedAt = performance.now();
    state.nextSpawnAt = state.startedAt;
    els.timer.textContent = (config.durationMs / 1000).toFixed(2);
    els.fieldMessage.hidden = true;
    els.start.disabled = true;
    els.start.textContent = "挑战进行中";
    els.networkStatus.textContent = "";
    createMovingNote();
    apiRequest("/api/sessions", { method: "POST", body: JSON.stringify(sessionContext()) }, true).catch(() => {
      els.networkStatus.textContent = "记录服务暂时离线，本局数据将在恢复后补传";
    });
    state.animationFrame = requestAnimationFrame(tick);
  }

  function buildRunPayload() {
    const durationPlayedMs = Math.round(performance.now() - state.startedAt);
    return {
      sessionId: state.sessionId,
      configVersion: config.version,
      score: state.score,
      comboMax: state.maxCombo,
      hits: state.hits,
      misses: state.miss,
      spawned: state.autoSpawnCount,
      specialHits: state.specialHits,
      grades: state.grades,
      qualitySpawned: state.qualitySpawned,
      qualityHit: state.qualityHit,
      timingSamples: state.timingSamples,
      inputMethods: state.inputMethods,
      specialInputMethods: state.specialInputMethods,
      durationPlayedMs
    };
  }

  async function finishGame() {
    state.phase = "finished";
    cancelAnimationFrame(state.animationFrame);
    removeMovingNote();
    for (const note of [...state.activeNotes.values()]) registerMiss(note);
    els.timer.textContent = "0.00";
    els.start.disabled = false;
    els.start.textContent = "再来一次";
    els.fieldMessage.hidden = false;
    els.fieldMessage.querySelector("strong").textContent = "挑战完成";
    els.fieldMessage.querySelector("span").textContent = `本局得分 ${formatScore.format(state.score)}`;
    const run = buildRunPayload();
    state.pendingRun = run;

    try {
      const result = await apiRequest("/api/runs", { method: "POST", body: JSON.stringify(run) }, true);
      if (result.qualifies) showQualification(result.rank);
      else showStandardResult();
      await loadLeaderboard();
    } catch (_) {
      showStandardResult("成绩已保存在本机队列，联网后会自动补传");
    }
  }

  function showQualification(rank) {
    els.modalKicker.textContent = "恭喜上榜";
    els.modalTitle.textContent = "创造新纪录";
    els.rankLabel.textContent = "当前名次";
    els.resultRank.textContent = `第 ${rank} 名`;
    els.resultScore.textContent = formatScore.format(state.score);
    els.nameEntry.hidden = false;
    els.confirmRank.hidden = false;
    els.declineRank.hidden = false;
    els.closeResult.hidden = true;
    els.nameError.textContent = "";
    try { els.nameInput.value = localStorage.getItem(savedPlayerNameKey) || ""; }
    catch (_) { els.nameInput.value = ""; }
    openModal();
    setTimeout(() => { els.nameInput.focus(); els.nameInput.select(); }, 60);
  }

  function showStandardResult(message = "") {
    els.modalKicker.textContent = "本局完成";
    els.modalTitle.textContent = "挑战完成";
    els.rankLabel.textContent = message || "继续挑战，冲击排行榜";
    els.resultRank.textContent = "未上榜";
    els.resultScore.textContent = formatScore.format(state.score);
    els.nameEntry.hidden = true;
    els.confirmRank.hidden = true;
    els.declineRank.hidden = true;
    els.closeResult.hidden = false;
    openModal();
  }

  async function submitName() {
    const name = els.nameInput.value.trim();
    if (!name || name.length > 16) {
      els.nameError.textContent = "请输入 1–16 个字符的名称";
      return;
    }
    try { localStorage.setItem(savedPlayerNameKey, name); } catch (_) { /* storage unavailable */ }
    els.confirmRank.disabled = true;
    els.nameError.textContent = "";
    try {
      const result = await apiRequest("/api/leaderboard", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, name }) });
      if (!result.qualified) {
        showStandardResult("提交时榜单发生变化，本次未进入前 10");
      } else {
        els.modalTitle.textContent = "上榜成功";
        els.resultRank.textContent = `第 ${result.rank} 名`;
        els.nameEntry.hidden = true;
        els.confirmRank.hidden = true;
        els.declineRank.hidden = true;
        els.closeResult.hidden = false;
      }
      await loadLeaderboard();
    } catch (error) {
      els.nameError.textContent = error.message || "提交失败，请重试";
    } finally {
      els.confirmRank.disabled = false;
    }
  }

  async function declineRank() {
    els.declineRank.disabled = true;
    try { await apiRequest("/api/decline", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId }) }, true); }
    catch (_) { /* queued best effort */ }
    finally {
      els.declineRank.disabled = false;
      closeModal();
    }
  }

  function openModal() { els.modal.hidden = false; }
  function closeModal() { els.modal.hidden = true; }

  async function loadLeaderboard() {
    try {
      const result = await apiRequest("/api/leaderboard");
      const entries = Array.isArray(result.entries) ? result.entries : [];
      els.leaderboard.innerHTML = entries.length ? entries.map((entry) => `<li><span class="player"></span><span class="points">${formatScore.format(entry.score)}</span></li>`).join("") : '<li class="leaderboard-empty">还没有上榜记录，成为第一名吧</li>';
      entries.forEach((entry, index) => { els.leaderboard.children[index].querySelector(".player").textContent = entry.name; });
      els.networkStatus.textContent = "";
    } catch (_) {
      els.leaderboard.innerHTML = '<li class="leaderboard-empty">排行榜暂时无法连接</li>';
    }
  }

  els.start.addEventListener("click", startGame);
  els.closeResult.addEventListener("click", closeModal);
  els.confirmRank.addEventListener("click", submitName);
  els.declineRank.addEventListener("click", declineRank);
  els.nameInput.addEventListener("keydown", (event) => { if (event.key === "Enter") submitName(); });
  addEventListener("online", () => { flushQueue().then(loadLeaderboard); });
  addEventListener("beforeunload", () => {
    cancelAnimationFrame(state.animationFrame);
    cancelAnimationFrame(state.movingAnimationFrame);
  });

  renderStats();
  loadLeaderboard();
  flushQueue();
})();
