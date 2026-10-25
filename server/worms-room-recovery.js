'use strict';

const { randomBytes, timingSafeEqual } = require('node:crypto');

const RESUME_GRACE_MS = 90_000;
const TOKEN_RE = /^[a-f0-9]{64}$/i;

function createWormsResumeToken() {
  return randomBytes(32).toString('hex');
}

function matchesWormsResumeToken(stored, supplied) {
  if (typeof stored !== 'string' || typeof supplied !== 'string') return false;
  if (!TOKEN_RE.test(stored) || !TOKEN_RE.test(supplied)) return false;
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(supplied, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function markWormsPlayerDisconnected(room, socketId, now = Date.now()) {
  const player = room?.players?.[socketId];
  if (!player || player.connected === false) return null;
  player.connected = false;
  player.disconnectedAt = now;

  if (room.hostId === socketId) {
    if (!room.disconnectedHostId) room.disconnectedHostId = socketId;
    const replacement = Object.values(room.players).find(candidate => candidate.id !== socketId && candidate.connected !== false);
    if (replacement) room.hostId = replacement.id;
  }

  if (room.status === 'playing' && !room.state?.ended) room.status = 'paused';
  return player;
}

/** Restore a temporarily disconnected Worms player without changing slot, game state or current turn. */
function resumeWormsPlayer(room, newSocketId, suppliedToken, tokenFactory = createWormsResumeToken, now = Date.now()) {
  if (!room?.players || typeof newSocketId !== 'string' || !newSocketId || room.players[newSocketId]) return null;

  let oldSocketId = null;
  let player = null;
  for (const [id, candidate] of Object.entries(room.players)) {
    if (candidate.connected !== false || !matchesWormsResumeToken(candidate.resumeToken, suppliedToken)) continue;
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

  if (room.lastActionAt && Object.hasOwn(room.lastActionAt, oldSocketId)) {
    room.lastActionAt[newSocketId] = room.lastActionAt[oldSocketId];
    delete room.lastActionAt[oldSocketId];
  }

  const reclaimedOriginalHost = room.disconnectedHostId === oldSocketId;
  if (reclaimedOriginalHost) {
    room.hostId = newSocketId;
    room.disconnectedHostId = null;
  } else if (room.hostId === oldSocketId) {
    // A temporary host may reconnect while the original host is still within its grace period.
    room.hostId = newSocketId;
  } else if (!room.players[room.hostId] || room.players[room.hostId].connected === false) {
    room.hostId = newSocketId;
  }

  if (room.status === 'paused' && Object.values(room.players).every(candidate => candidate.connected !== false)) {
    room.status = 'playing';
  }
  return { oldSocketId, player, reclaimedOriginalHost };
}

module.exports = {
  RESUME_GRACE_MS,
  createWormsResumeToken,
  matchesWormsResumeToken,
  markWormsPlayerDisconnected,
  resumeWormsPlayer
};
