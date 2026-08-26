((root, factory) => {
  "use strict";

  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  if (root) root.GAME_RULES = Object.freeze(rules);
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  function shuffled(items, rng) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function safeSpawnCandidates(config, rng = Math.random) {
    const diameter = config.maxOuterSize;
    const radius = diameter / 2;
    const horizontalJitter = Math.max(0, (config.playAreaWidth - diameter * 2) / 2);
    const verticalJitter = Math.max(0, (config.playAreaHeight - diameter * 2) / 2);
    const left = () => radius + rng() * horizontalJitter;
    const right = () => config.playAreaWidth - radius - rng() * horizontalJitter;
    const top = () => radius + rng() * verticalJitter;
    const bottom = () => config.playAreaHeight - radius - rng() * verticalJitter;

    return shuffled([
      { x: left(), y: top() },
      { x: right(), y: top() },
      { x: left(), y: bottom() },
      { x: right(), y: bottom() }
    ], rng);
  }

  function selectSafePosition(config, activeNotes, rng = Math.random) {
    const minimumDistanceSquared = config.maxOuterSize ** 2;
    return safeSpawnCandidates(config, rng).find((candidate) => activeNotes.every((note) => {
      const deltaX = candidate.x - note.x;
      const deltaY = candidate.y - note.y;
      return deltaX ** 2 + deltaY ** 2 >= minimumDistanceSquared;
    })) || null;
  }

  function nextPerfectStreak(currentStreak, gradeId) {
    return gradeId === "perfect" ? currentStreak + 1 : 0;
  }

  function movingBonusRate(specialHits, bonusPerHit) {
    return Math.max(0, specialHits) * Math.max(0, bonusPerHit);
  }

  function scoreWithMovingBonus(baseScore, specialHits, bonusPerHit) {
    return Math.round(baseScore * (1 + movingBonusRate(specialHits, bonusPerHit)));
  }

  function movingSpeedMultiplier(specialHits, speedBonusPerHit) {
    return 1 + Math.max(0, specialHits) * Math.max(0, speedBonusPerHit);
  }

  function canAcceptMovingHit(lastHitAt, now, cooldownMs) {
    return !Number.isFinite(lastHitAt) || now - lastHitAt >= cooldownMs;
  }

  function turnMovingNoteOnHit(current, config, rng = Math.random) {
    const state = { ...current };
    const minTurn = Math.max(0, Math.min(config.movingNoteHitMinTurnDegrees, config.movingNoteHitMaxTurnDegrees));
    const maxTurn = Math.max(minTurn, Math.max(config.movingNoteHitMinTurnDegrees, config.movingNoteHitMaxTurnDegrees));
    const turnRadians = randomBetween(minTurn, maxTurn, rng) * Math.PI / 180;
    state.angle += (rng() < .5 ? -1 : 1) * turnRadians;
    state.angle = ((state.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return state;
  }

  function randomBetween(min, max, rng) {
    return min + rng() * (max - min);
  }

  function createMovingNoteState(config, rng = Math.random, now = 0) {
    const radius = config.movingNoteSize / 2;
    const initialSpeed = randomBetween(config.movingNoteMinSpeed, config.movingNoteMaxSpeed, rng);
    return {
      x: randomBetween(radius, config.playAreaWidth - radius, rng),
      y: randomBetween(radius, config.playAreaHeight - radius, rng),
      angle: randomBetween(0, Math.PI * 2, rng),
      initialSpeed,
      speed: initialSpeed,
      nextBehaviorAt: now + randomBetween(config.movingNoteMinDirectionIntervalMs, config.movingNoteMaxDirectionIntervalMs, rng),
      lastUpdatedAt: now
    };
  }

  function advanceMovingNote(current, now, config, rng = Math.random, speedMultiplier = 1) {
    const state = { ...current };
    const deltaSeconds = Math.max(0, Math.min(.05, (now - state.lastUpdatedAt) / 1000));
    state.lastUpdatedAt = now;

    if (now >= state.nextBehaviorAt) {
      const maxTurnRadians = config.movingNoteMaxTurnDegrees * Math.PI / 180;
      state.angle += randomBetween(-maxTurnRadians, maxTurnRadians, rng);
      state.nextBehaviorAt = now + randomBetween(config.movingNoteMinDirectionIntervalMs, config.movingNoteMaxDirectionIntervalMs, rng);
    }

    state.speed = state.initialSpeed * speedMultiplier;
    state.x += Math.cos(state.angle) * state.speed * deltaSeconds;
    state.y += Math.sin(state.angle) * state.speed * deltaSeconds;

    const radius = config.movingNoteSize / 2;
    const maxX = config.playAreaWidth - radius;
    const maxY = config.playAreaHeight - radius;
    if (state.x <= radius || state.x >= maxX) {
      state.x = Math.max(radius, Math.min(maxX, state.x));
      state.angle = Math.PI - state.angle;
    }
    if (state.y <= radius || state.y >= maxY) {
      state.y = Math.max(radius, Math.min(maxY, state.y));
      state.angle = -state.angle;
    }
    state.angle = ((state.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return state;
  }

  return {
    safeSpawnCandidates,
    selectSafePosition,
    nextPerfectStreak,
    movingBonusRate,
    scoreWithMovingBonus,
    movingSpeedMultiplier,
    canAcceptMovingHit,
    turnMovingNoteOnHit,
    createMovingNoteState,
    advanceMovingNote
  };
});
