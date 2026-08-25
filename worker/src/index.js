const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,80}$/;
const MAX_SCORE = 20000;
const MAX_NOTES = 20;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, service: "music-beat-api" }, 200, cors);
      }
      if (request.method === "GET" && url.pathname === "/api/leaderboard") {
        return getLeaderboard(env, cors);
      }
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        return createSession(request, env, cors);
      }
      if (request.method === "POST" && url.pathname === "/api/runs") {
        return createRun(request, env, cors);
      }
      if (request.method === "POST" && url.pathname === "/api/leaderboard") {
        return submitLeaderboardName(request, env, cors);
      }
      if (request.method === "POST" && url.pathname === "/api/decline") {
        return declineLeaderboard(request, env, cors);
      }
      return json({ error: "接口不存在" }, 404, cors);
    } catch (error) {
      console.error("music-beat-api", error);
      const status = error instanceof ClientError ? error.status : 500;
      return json({ error: status === 500 ? "服务器暂时不可用" : error.message }, status, cors);
    }
  }
};

async function createSession(request, env, cors) {
  const body = await readJson(request);
  const sessionId = validSessionId(body.sessionId);
  const configVersion = safeText(body.configVersion, 40, "configVersion");
  const deviceCategory = enumValue(body.deviceCategory, ["mobile", "tablet", "desktop", "unknown"], "unknown");
  const viewportWidth = safeInteger(body.viewportWidth, 0, 10000, 0);
  const viewportHeight = safeInteger(body.viewportHeight, 0, 10000, 0);
  const language = optionalText(body.language, 16);
  const timeZone = optionalText(body.timeZone, 40);

  await env.DB.prepare(`
    INSERT INTO sessions (
      session_id, config_version, device_category, viewport_width, viewport_height, language, time_zone
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO NOTHING
  `).bind(sessionId, configVersion, deviceCategory, viewportWidth, viewportHeight, language, timeZone).run();

  return json({ ok: true, sessionId }, 201, cors);
}

async function createRun(request, env, cors) {
  const body = await readJson(request);
  const run = validateRun(body);

  await env.DB.prepare(`
    INSERT INTO sessions (session_id, config_version, status)
    VALUES (?, ?, 'started')
    ON CONFLICT(session_id) DO NOTHING
  `).bind(run.sessionId, run.configVersion).run();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO runs (
        session_id, score, combo_max, hits, misses, spawned,
        perfect_count, great_count, good_count, early_count,
        quality_spawned_json, quality_hit_json, timing_samples_json, input_methods_json,
        duration_played_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        score = excluded.score,
        combo_max = excluded.combo_max,
        hits = excluded.hits,
        misses = excluded.misses,
        spawned = excluded.spawned,
        perfect_count = excluded.perfect_count,
        great_count = excluded.great_count,
        good_count = excluded.good_count,
        early_count = excluded.early_count,
        quality_spawned_json = excluded.quality_spawned_json,
        quality_hit_json = excluded.quality_hit_json,
        timing_samples_json = excluded.timing_samples_json,
        input_methods_json = excluded.input_methods_json,
        duration_played_ms = excluded.duration_played_ms
    `).bind(
      run.sessionId, run.score, run.comboMax, run.hits, run.misses, run.spawned,
      run.grades.perfect, run.grades.great, run.grades.good, run.grades.early,
      JSON.stringify(run.qualitySpawned), JSON.stringify(run.qualityHit),
      JSON.stringify(run.timingSamples), JSON.stringify(run.inputMethods), run.durationPlayedMs
    ),
    env.DB.prepare(`
      UPDATE sessions
      SET status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE session_id = ?
    `).bind(run.sessionId)
  ]);

  const rank = await provisionalRank(env, run.sessionId);
  return json({ ok: true, qualifies: rank <= 10, rank: rank <= 10 ? rank : null }, 201, cors);
}

async function submitLeaderboardName(request, env, cors) {
  const body = await readJson(request);
  const sessionId = validSessionId(body.sessionId);
  const name = validPlayerName(body.name);
  const existing = await env.DB.prepare(`
    SELECT r.session_id, r.score, r.combo_max, r.completed_at, s.leaderboard_opt_out
    FROM runs r JOIN sessions s ON s.session_id = r.session_id
    WHERE r.session_id = ?
  `).bind(sessionId).first();
  if (!existing) throw new ClientError("找不到本局记录", 404);
  if (existing.leaderboard_opt_out) throw new ClientError("本局已选择不上榜", 409);

  const rank = await provisionalRank(env, sessionId);
  if (rank > 10) return json({ ok: true, qualified: false, rank: null }, 200, cors);

  await env.DB.prepare("UPDATE runs SET display_name = ? WHERE session_id = ?")
    .bind(name, sessionId).run();
  const finalRank = await provisionalRank(env, sessionId);
  return json({ ok: true, qualified: finalRank <= 10, rank: finalRank <= 10 ? finalRank : null }, 200, cors);
}

async function declineLeaderboard(request, env, cors) {
  const body = await readJson(request);
  const sessionId = validSessionId(body.sessionId);
  await env.DB.batch([
    env.DB.prepare("UPDATE sessions SET leaderboard_opt_out = 1 WHERE session_id = ?").bind(sessionId),
    env.DB.prepare("UPDATE runs SET display_name = NULL WHERE session_id = ?").bind(sessionId)
  ]);
  return json({ ok: true }, 200, cors);
}

async function getLeaderboard(env, cors) {
  const result = await env.DB.prepare(`
    SELECT display_name AS name, score, combo_max AS comboMax, completed_at AS completedAt
    FROM runs
    WHERE display_name IS NOT NULL
    ORDER BY score DESC, combo_max DESC, completed_at ASC
    LIMIT 10
  `).all();
  return json({ entries: result.results || [] }, 200, cors);
}

async function provisionalRank(env, sessionId) {
  const run = await env.DB.prepare(`
    SELECT score, combo_max, completed_at FROM runs WHERE session_id = ?
  `).bind(sessionId).first();
  if (!run) throw new ClientError("找不到本局记录", 404);
  const higher = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM runs
    WHERE display_name IS NOT NULL
      AND session_id <> ?
      AND (
        score > ? OR
        (score = ? AND combo_max > ?) OR
        (score = ? AND combo_max = ? AND completed_at < ?)
      )
  `).bind(sessionId, run.score, run.score, run.combo_max, run.score, run.combo_max, run.completed_at).first();
  return Number(higher?.count || 0) + 1;
}

function validateRun(body) {
  const sessionId = validSessionId(body.sessionId);
  const configVersion = safeText(body.configVersion, 40, "configVersion");
  const score = safeInteger(body.score, 0, MAX_SCORE, null, "score");
  const comboMax = safeInteger(body.comboMax, 0, MAX_NOTES, null, "comboMax");
  const hits = safeInteger(body.hits, 0, MAX_NOTES, null, "hits");
  const misses = safeInteger(body.misses, 0, MAX_NOTES, null, "misses");
  const spawned = safeInteger(body.spawned, 0, MAX_NOTES, null, "spawned");
  const durationPlayedMs = safeInteger(body.durationPlayedMs, 4000, 7000, null, "durationPlayedMs");
  const grades = validateCountMap(body.grades, ["perfect", "great", "good", "early"]);
  const qualitySpawned = validateCountMap(body.qualitySpawned, ["green", "blue", "purple", "gold"]);
  const qualityHit = validateCountMap(body.qualityHit, ["green", "blue", "purple", "gold"]);
  const gradeHits = Object.values(grades).reduce((sum, count) => sum + count, 0);
  const spawnedByQuality = Object.values(qualitySpawned).reduce((sum, count) => sum + count, 0);
  const hitsByQuality = Object.values(qualityHit).reduce((sum, count) => sum + count, 0);
  if (gradeHits !== hits || hits + misses !== spawned || spawnedByQuality !== spawned || hitsByQuality !== hits || comboMax > hits) {
    throw new ClientError("对局统计不一致", 400);
  }
  const timingSamples = Array.isArray(body.timingSamples) ? body.timingSamples.map((value) => Number(value)) : [];
  if (timingSamples.length !== hits || timingSamples.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new ClientError("点击时机数据不一致", 400);
  }
  const inputMethods = validateInputMethods(body.inputMethods, hits);
  return { sessionId, configVersion, score, comboMax, hits, misses, spawned, durationPlayedMs, grades, qualitySpawned, qualityHit, timingSamples, inputMethods };
}

function validateCountMap(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ClientError("统计字段格式错误", 400);
  return Object.fromEntries(keys.map((key) => [key, safeInteger(value[key], 0, MAX_NOTES, null, key)]));
}

function validateInputMethods(value, expectedHits) {
  const allowed = ["mouse", "touch", "pen", "unknown"];
  const result = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, count] of Object.entries(value)) {
      if (!allowed.includes(key)) continue;
      result[key] = safeInteger(count, 0, MAX_NOTES, 0);
    }
  }
  if (Object.values(result).reduce((sum, count) => sum + count, 0) !== expectedHits) {
    throw new ClientError("输入方式统计不一致", 400);
  }
  return result;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 25000) throw new ClientError("请求内容过大", 413);
  try { return await request.json(); }
  catch (_) { throw new ClientError("请求必须是 JSON", 400); }
}

function validSessionId(value) {
  if (!SESSION_ID_PATTERN.test(String(value || ""))) throw new ClientError("sessionId 无效", 400);
  return String(value);
}

function validPlayerName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name || [...name].length > 16 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ClientError("名称须为 1–16 个字符", 400);
  }
  return name;
}

function safeText(value, maxLength, field) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw new ClientError(`${field} 无效`, 400);
  return text;
}

function optionalText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function safeInteger(value, min, max, fallback = null, field = "数值") {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    if (fallback !== null) return fallback;
    throw new ClientError(`${field} 无效`, 400);
  }
  return number;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = !origin || configured.includes(origin) || /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? (origin || "*") : "null",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(payload, status, cors) {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...cors, "Cache-Control": "no-store" } });
}

class ClientError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
