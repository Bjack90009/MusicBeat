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

test("perfect streak increments and resets without a reward trigger", () => {
  let streak = 0;
  for (let count = 0; count < 5; count += 1) streak = rules.nextPerfectStreak(streak, "perfect");
  assert.equal(streak, 5);
  assert.equal(rules.nextPerfectStreak(streak, "great"), 0);
});

test("PICK ME hits add ten percent of the ordinary note score per hit", () => {
  assert.equal(rules.movingBonusRate(0, 0.1), 0);
  assert.equal(rules.movingBonusRate(2, 0.1), 0.2);
  assert.equal(rules.scoreWithMovingBonus(200, 0, 0.1), 200);
  assert.equal(rules.scoreWithMovingBonus(200, 2, 0.1), 240);
});

test("PICK ME speed grows twenty percent of initial speed per accepted hit", () => {
  assert.equal(rules.movingSpeedMultiplier(0, 0.2), 1);
  assert.equal(rules.movingSpeedMultiplier(2, 0.2), 1.4);
  assert.equal(rules.movingSpeedMultiplier(5, 0.2), 2);
});

test("PICK ME accepts at most one hit per 100ms", () => {
  assert.equal(rules.canAcceptMovingHit(Number.NEGATIVE_INFINITY, 10, 100), true);
  assert.equal(rules.canAcceptMovingHit(1000, 1099, 100), false);
  assert.equal(rules.canAcceptMovingHit(1000, 1100, 100), true);
});

const movingConfig = {
  ...config,
  movingNoteSize: 72,
  movingNoteMinSpeed: 90,
  movingNoteMaxSpeed: 180,
  movingNoteMinDirectionIntervalMs: 350,
  movingNoteMaxDirectionIntervalMs: 900,
  movingNoteMaxTurnDegrees: 90,
  movingNoteHitMinTurnDegrees: 60,
  movingNoteHitMaxTurnDegrees: 150
};

test("each accepted PICK ME hit changes direction by the configured range", () => {
  const initial = { angle: 0.5 };
  const turned = rules.turnMovingNoteOnHit(initial, movingConfig, () => 0);
  const circularDelta = Math.min(
    Math.abs(turned.angle - initial.angle),
    Math.PI * 2 - Math.abs(turned.angle - initial.angle)
  );
  assert.ok(circularDelta >= 60 * Math.PI / 180 - 1e-9);
  assert.ok(circularDelta <= 150 * Math.PI / 180 + 1e-9);
  assert.equal(initial.angle, 0.5);
});

test("moving note is created fully inside the play area", () => {
  const state = rules.createMovingNoteState(movingConfig, () => .5, 1000);
  assert.ok(state.x >= 36 && state.x <= 464);
  assert.ok(state.y >= 36 && state.y <= 464);
  assert.ok(state.speed >= 90 && state.speed <= 180);
  assert.equal(state.initialSpeed, state.speed);
  assert.ok(state.nextBehaviorAt >= 1350 && state.nextBehaviorAt <= 1900);
});

test("moving note derives current speed and displacement from its initial speed", () => {
  const state = {
    x: 250, y: 250, angle: 0, initialSpeed: 100, speed: 100,
    nextBehaviorAt: 1000, lastUpdatedAt: 0
  };
  const normal = rules.advanceMovingNote(state, 50, movingConfig, () => .5, 1);
  const boosted = rules.advanceMovingNote(state, 50, movingConfig, () => .5, 1.4);
  assert.equal(normal.x, 255);
  assert.equal(boosted.speed, 140);
  assert.equal(boosted.x, 257);
});

test("moving note reflects from the play-area edge", () => {
  const state = {
    x: 463, y: 250, angle: 0, initialSpeed: 180, speed: 180,
    nextBehaviorAt: 10000, lastUpdatedAt: 0
  };
  const next = rules.advanceMovingNote(state, 50, movingConfig, () => .5);
  assert.equal(next.x, 464);
  assert.ok(Math.abs(next.angle - Math.PI) < 1e-9);
});
