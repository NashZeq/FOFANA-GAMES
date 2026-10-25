'use strict';

const { randomBytes, timingSafeEqual } = require('node:crypto');
const RESUME_GRACE_MS = 90_000;
const TOKEN_RE = /^[a-f0-9]{64}$/i;

function createIskResumeToken() {
  return randomBytes(32).toString('hex');
}

function matchesIskResumeToken(stored, supplied) {
  if (typeof stored !== 'string' || typeof supplied !== 'string') return false;
  if (!TOKEN_RE.test(stored) || !TOKEN_RE.test(supplied)) return false;
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(supplied, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function moveKey(object, oldId, newId) {
  if (!object || !Object.hasOwn(object, oldId)) return;
  object[newId] = object[oldId];
  delete object[oldId];
}

/** Rebind a disconnected guesser without changing their score, current guess or rank. */
function resumeIskPlayer(room, newSocketId, suppliedToken, tokenFactory = createIskResumeToken, now = Date.now()) {
  if (!room?.players || typeof newSocketId !== 'string' || !newSocketId || room.players[newSocketId]) return null;
  let oldSocketId = null;
  let player = null;
  for (const [id, candidate] of Object.entries(room.players)) {
    if (candidate.connected !== false || !matchesIskResumeToken(candidate.resumeToken, suppliedToken)) continue;
    if (!Number.isFinite(candidate.disconnectedAt) || now - candidate.disconnectedAt > RESUME_GRACE_MS) continue;
    oldSocketId = id;
    player = candidate;
    break;
  }
  if (!player) return null;

  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  player.resumeTimer = null;
  delete room.players[oldSocketId];
  player.id = newSocketId;
  player.connected = true;
  player.resumeToken = tokenFactory();
  delete player.disconnectedAt;
  room.players[newSocketId] = player;

  if (room.game) {
    moveKey(room.game.scores, oldSocketId, newSocketId);
    moveKey(room.game.submissions, oldSocketId, newSocketId);
    if (Array.isArray(room.game.winnerIds)) room.game.winnerIds = room.game.winnerIds.map(id => id === oldSocketId ? newSocketId : id);
    for (const entry of room.game.history || []) {
      if (entry.results && Object.hasOwn(entry.results, oldSocketId)) moveKey(entry.results, oldSocketId, newSocketId);
    }
  }

  const reclaimedHost = room.hostId === oldSocketId || room.disconnectedHostId === oldSocketId;
  if (reclaimedHost) {
    room.hostId = newSocketId;
    room.disconnectedHostId = null;
  } else if (!room.players[room.hostId] || room.players[room.hostId].connected === false) {
    room.hostId = newSocketId;
  }

  return { oldSocketId, player, reclaimedHost };
}

module.exports = { RESUME_GRACE_MS, createIskResumeToken, matchesIskResumeToken, resumeIskPlayer };
