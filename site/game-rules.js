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

  function shouldTriggerBonus(perfectStreak, alreadyTriggered, triggerCombo) {
    return !alreadyTriggered && perfectStreak === triggerCombo;
  }

  function bonusWindowMs(noteCount, spawnIntervalMs, noteLifetimeMs) {
    return Math.max(0, noteCount - 1) * spawnIntervalMs + noteLifetimeMs;
  }

  return {
    safeSpawnCandidates,
    selectSafePosition,
    nextPerfectStreak,
    shouldTriggerBonus,
    bonusWindowMs
  };
});
