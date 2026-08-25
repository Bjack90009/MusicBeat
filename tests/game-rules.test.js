const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../site/game-rules.js");

const config = {
  playAreaWidth: 500,
  playAreaHeight: 500,
  maxOuterSize: 240
};

function sequenceRandom(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test("four candidate areas stay in bounds and remain a maximum outer circle apart", () => {
  const candidates = rules.safeSpawnCandidates(config, sequenceRandom([0, .25, .5, .75, .1, .9]));
  assert.equal(candidates.length, 4);
  for (const candidate of candidates) {
    assert.ok(candidate.x >= 120 && candidate.x <= 380);
    assert.ok(candidate.y >= 120 && candidate.y <= 380);
  }
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      const distance = Math.hypot(candidates[first].x - candidates[second].x, candidates[first].y - candidates[second].y);
      assert.ok(distance >= config.maxOuterSize);
    }
  }
});

test("safe selection rejects occupied maximum-circle areas", () => {
  const active = [];
  for (let count = 0; count < 4; count += 1) {
    const position = rules.selectSafePosition(config, active, () => .5);
    assert.ok(position);
    assert.ok(active.every((note) => Math.hypot(position.x - note.x, position.y - note.y) >= config.maxOuterSize));
    active.push(position);
  }
  assert.equal(rules.selectSafePosition(config, active, () => .5), null);
});

test("five bonus notes at 200ms remain sequential and fit with expiry first", () => {
  const spawnTimes = [0, 200, 400, 600, 800];
  const active = [];
  let maximumActive = 0;
  for (const now of spawnTimes) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].expiresAt <= now) active.splice(index, 1);
    }
    const position = rules.selectSafePosition(config, active, () => .5);
    assert.ok(position);
    active.push({ ...position, expiresAt: now + 800 });
    maximumActive = Math.max(maximumActive, active.length);
  }
  assert.equal(maximumActive, 4);
  assert.equal(rules.bonusWindowMs(5, 200, 800), 1600);
});

test("perfect streak increments, resets, and triggers the reward only once", () => {
  let streak = 0;
  for (let count = 0; count < 5; count += 1) streak = rules.nextPerfectStreak(streak, "perfect");
  assert.equal(streak, 5);
  assert.equal(rules.shouldTriggerBonus(streak, false, 5), true);
  assert.equal(rules.shouldTriggerBonus(streak, true, 5), false);
  assert.equal(rules.nextPerfectStreak(streak, "great"), 0);
});
