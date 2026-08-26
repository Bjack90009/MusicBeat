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

  function randomBetween(min, max, rng) {
    return min + rng() * (max - min);
  }

  function createMovingNoteState(config, rng = Math.random, now = 0) {
    const radius = config.movingNoteSize / 2;
    return {
      x: randomBetween(radius, config.playAreaWidth - radius, rng),
      y: randomBetween(radius, config.playAreaHeight - radius, rng),
      angle: randomBetween(0, Math.PI * 2, rng),
      speed: randomBetween(config.movingNoteMinSpeed, config.movingNoteMaxSpeed, rng),
      targetSpeed: randomBetween(config.movingNoteMinSpeed, config.movingNoteMaxSpeed, rng),
      nextBehaviorAt: now + randomBetween(config.movingNoteMinDirectionIntervalMs, config.movingNoteMaxDirectionIntervalMs, rng),
      lastUpdatedAt: now
    };
  }

  function advanceMovingNote(current, now, config, rng = Math.random) {
    const state = { ...current };
    const deltaSeconds = Math.max(0, Math.min(.05, (now - state.lastUpdatedAt) / 1000));
    state.lastUpdatedAt = now;

    if (now >= state.nextBehaviorAt) {
      state.targetSpeed = randomBetween(config.movingNoteMinSpeed, config.movingNoteMaxSpeed, rng);
      const maxTurnRadians = config.movingNoteMaxTurnDegrees * Math.PI / 180;
      state.angle += randomBetween(-maxTurnRadians, maxTurnRadians, rng);
      state.nextBehaviorAt = now + randomBetween(config.movingNoteMinDirectionIntervalMs, config.movingNoteMaxDirectionIntervalMs, rng);
    }

    const speedStep = config.movingNoteAcceleration * deltaSeconds;
    if (state.speed < state.targetSpeed) state.speed = Math.min(state.targetSpeed, state.speed + speedStep);
    else state.speed = Math.max(state.targetSpeed, state.speed - speedStep);

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
    createMovingNoteState,
    advanceMovingNote
  };
});
