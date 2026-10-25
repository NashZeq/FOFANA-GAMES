'use strict';

const { randomBytes, timingSafeEqual } = require('node:crypto');

const RESUME_TOKEN_BYTES = 32;
const RESUME_TOKEN_RE = /^[a-f0-9]{64}$/i;

function createTabuResumeToken() {
  return randomBytes(RESUME_TOKEN_BYTES).toString('hex');
}

function matchesResumeToken(storedToken, suppliedToken) {
  if (typeof storedToken !== 'string' || typeof suppliedToken !== 'string') return false;
  if (!RESUME_TOKEN_RE.test(storedToken) || !RESUME_TOKEN_RE.test(suppliedToken)) return false;
  const stored = Buffer.from(storedToken, 'hex');
  const supplied = Buffer.from(suppliedToken, 'hex');
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

/**
 * Atomically rebind a disconnected Tabu participant to a fresh Socket.IO ID.
 * This is deliberately pure apart from clearing the participant's grace timer,
 * which prevents a unit test or caller from needing a live Socket.IO server.
 * The returned token is rotated so an old token cannot be replayed.
 */
function resumeTabuPlayer(room, newSocketId, suppliedToken, tokenFactory = createTabuResumeToken) {
  if (!room || !room.players || typeof newSocketId !== 'string' || !newSocketId) return null;
  if (room.players[newSocketId]) return null;

  let oldSocketId = null;
  let player = null;
  for (const [id, candidate] of Object.entries(room.players)) {
    if (candidate.connected === false && matchesResumeToken(candidate.resumeToken, suppliedToken)) {
      oldSocketId = id;
      player = candidate;
      break;
    }
  }
  if (!player) return null;

  const reclaimedHost = room.hostId === oldSocketId || room.disconnectedHostId === oldSocketId;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  player.resumeTimer = null;
  delete room.players[oldSocketId];
  player.id = newSocketId;
  player.connected = true;
  player.resumeToken = tokenFactory();
  delete player.disconnectedAt;
  room.players[newSocketId] = player;

  if (room.hostId === oldSocketId || room.disconnectedHostId === oldSocketId) {
    room.hostId = newSocketId;
    room.disconnectedHostId = null;
  } else if (!room.players[room.hostId] || room.players[room.hostId].connected === false) {
    // If the current host is also offline, let the first returning participant
    // keep the room usable. The disconnected host can still reclaim ownership
    // within the recovery window through disconnectedHostId.
    room.hostId = newSocketId;
  }
  if (room.game && room.game.speakerId === oldSocketId) room.game.speakerId = newSocketId;

  const shouldResumeTurn = room.reconnectPausedSpeakerId === oldSocketId && room.reconnectWasActiveBeforeDisconnect === true;
  const recoveredSpeaker = room.reconnectPausedSpeakerId === oldSocketId;
  if (recoveredSpeaker) {
    room.reconnectPausedSpeakerId = null;
    room.reconnectWasActiveBeforeDisconnect = false;
  }

  return { oldSocketId, player, shouldResumeTurn, reclaimedHost };
}

module.exports = { RESUME_TOKEN_BYTES, createTabuResumeToken, matchesResumeToken, resumeTabuPlayer };
