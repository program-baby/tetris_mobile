"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const SOLO_RANKING_LIMIT = 10;
const SCORE_AUDIT_EVENT_LIMIT = 80;
const SOLO_SCORE_HARD_CAP = 2000000;
const SOLO_SCORE_MIN_ACTIVE_MS = 20000;
const SOLO_SCORE_MAX_PER_PIECE = 12000;
const COMBO_BONUS_MAX = 210;

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeName(value) {
  return safeString(value, "PLAYER").trim().slice(0, 12) || "PLAYER";
}

function normalizeRankingList(value) {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];
  return list
    .filter((entry) => Number.isFinite(entry.score) && entry.score <= SOLO_SCORE_HARD_CAP && typeof entry.name === "string")
    .map((entry) => ({
      uid: safeString(entry.uid, ""),
      name: normalizeName(entry.name),
      score: Math.max(0, Math.floor(entry.score)),
      lines: Math.max(0, Math.floor(entry.lines || 0)),
      level: Math.max(1, Math.floor(entry.level || 1)),
      date: Number.isFinite(entry.date) ? entry.date : Date.now()
    }))
    .sort((a, b) => b.score - a.score || b.lines - a.lines || b.level - a.level || a.date - b.date)
    .slice(0, SOLO_RANKING_LIMIT);
}

function getLineClearCounts(payload) {
  const counts = payload && typeof payload.lineClearCounts === "object" ? payload.lineClearCounts : {};
  return {
    1: Math.max(0, Math.floor(safeNumber(counts[1] ?? counts["1"], 0))),
    2: Math.max(0, Math.floor(safeNumber(counts[2] ?? counts["2"], 0))),
    3: Math.max(0, Math.floor(safeNumber(counts[3] ?? counts["3"], 0))),
    4: Math.max(0, Math.floor(safeNumber(counts[4] ?? counts["4"], 0)))
  };
}

function getLineClearTotal(lineClearCounts) {
  return [1, 2, 3, 4].reduce((sum, size) => sum + lineClearCounts[size], 0);
}

function getLineTotal(lineClearCounts) {
  return [1, 2, 3, 4].reduce((sum, size) => sum + size * lineClearCounts[size], 0);
}

function validateSubmission(payload) {
  const flags = [];
  const lineClearCounts = getLineClearCounts(payload);
  const clearEvents = getLineClearTotal(lineClearCounts);
  const linesFromEvents = getLineTotal(lineClearCounts);
  const score = Math.max(0, Math.floor(safeNumber(payload.score, 0)));
  const lines = Math.max(0, Math.floor(safeNumber(payload.lines, 0)));
  const level = Math.max(1, Math.floor(safeNumber(payload.level, 1)));
  const activeMs = Math.max(0, Math.floor(safeNumber(payload.activeMs, 0)));
  const piecesLocked = Math.max(0, Math.floor(safeNumber(payload.piecesLocked, 0)));
  const generousPerClear = (4800 + COMBO_BONUS_MAX) * level;
  const generousScoreCeiling = Math.max(12000, Math.max(1, clearEvents) * generousPerClear + level * 2000);

  if (!safeString(payload.uid)) flags.push("missing_uid");
  if (!safeString(payload.name)) flags.push("missing_name");
  if (score > SOLO_SCORE_HARD_CAP) flags.push("score_hard_cap");
  if (lines !== linesFromEvents) flags.push("line_count_mismatch");
  if (piecesLocked <= 0) flags.push("no_locked_pieces");
  if (score >= 10000 && activeMs < SOLO_SCORE_MIN_ACTIVE_MS) flags.push("too_short_playtime");
  if (piecesLocked > 0 && score / piecesLocked > SOLO_SCORE_MAX_PER_PIECE) flags.push("score_per_piece_high");
  if (score > generousScoreCeiling) flags.push("score_above_line_ceiling");

  return {
    accepted: flags.length === 0,
    flags,
    entry: {
      uid: safeString(payload.uid),
      name: normalizeName(payload.name),
      score,
      lines,
      level,
      date: Math.floor(safeNumber(payload.submittedAt, Date.now()))
    }
  };
}

exports.reviewSoloScoreSubmission = functions
  .region("asia-southeast1")
  .database
  .ref("/scoreSubmissions/{date}/{submissionId}")
  .onCreate(async (snapshot) => {
    const payload = snapshot.val() || {};
    const result = validateSubmission(payload);
    const reviewedAt = Date.now();

    await snapshot.ref.update({
      serverReviewedAt: reviewedAt,
      serverAccepted: result.accepted,
      serverFlags: result.flags
    });

    if (!result.accepted) return null;

    const rankingRef = admin.database().ref("/leaderboards/soloTop10");
    await rankingRef.transaction((current) => {
      const list = normalizeRankingList(current);
      list.push(result.entry);
      return normalizeRankingList(list);
    });

    return null;
  });
