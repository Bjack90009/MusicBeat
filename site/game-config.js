window.GAME_CONFIG = Object.freeze({
  version: "2026-08-26-r5",
  durationMs: 5000,
  maxNotes: 5,
  minSpawnIntervalMs: 600,
  maxSpawnIntervalMs: 800,
  playAreaWidth: 500,
  playAreaHeight: 500,
  minOuterSize: 180,
  maxOuterSize: 240,
  targetSize: 60,
  noteLifetimeMs: 800,
  movingNoteSize: 72,
  movingNoteScore: 100,
  movingNoteMinSpeed: 90,
  movingNoteMaxSpeed: 180,
  movingNoteAcceleration: 120,
  movingNoteMinDirectionIntervalMs: 350,
  movingNoteMaxDirectionIntervalMs: 900,
  movingNoteMaxTurnDegrees: 90,
  seed: 20260825,
  judgments: [
    { id: "perfect", label: "PERFECT", maxRemainingRatio: 0.20, multiplier: 2, color: "#55e7ff" },
    { id: "great", label: "GREAT", maxRemainingRatio: 0.40, multiplier: 1.5, color: "#91ed65" },
    { id: "good", label: "GOOD", maxRemainingRatio: 0.80, multiplier: 1.2, color: "#ffd85a" },
    { id: "early", label: "EARLY", maxRemainingRatio: 1, multiplier: 1, color: "#ff7191" }
  ],
  qualities: [
    { id: "green", label: "绿", probability: 50, baseScore: 100, color: "#67e87b" },
    { id: "blue", label: "蓝", probability: 30, baseScore: 150, color: "#45aaff" },
    { id: "purple", label: "紫", probability: 15, baseScore: 250, color: "#b779ff" },
    { id: "gold", label: "金", probability: 5, baseScore: 500, color: "#ffc94a" }
  ]
});
