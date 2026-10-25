'use strict';

const { randomBytes, timingSafeEqual } = require('node:crypto');

const RESUME_GRACE_MS = 90_000;
const TOKEN_RE = /^[a-f0-9]{64}$/i;

function createMonopolyResumeToken() {
  return randomBytes(32).toString('hex');
}

function matchesMonopolyResumeToken(stored, supplied) {
  if (typeof stored !== 'string' || typeof supplied !== 'string') return false;
  if (!TOKEN_RE.test(stored) || !TOKEN_RE.test(supplied)) return false;
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(supplied, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function moveId(value, oldId, newId) {
  return value === oldId ? newId : value;
}

function markMonopolyPlayerDisconnected(room, socketId, now = Date.now()) {
  const player = room?.players?.[socketId];
  if (!player || player.connected === false) return null;
  player.connected = false;
  player.disconnectedAt = now;

  if (room.hostId === socketId) {
    if (!room.disconnectedHostId) room.disconnectedHostId = socketId;
    const replacement = Object.values(room.players).find(candidate => candidate.id !== socketId && candidate.connected !== false);
    if (replacement) room.hostId = replacement.id;
  }
  if (room.status === 'playing' && room.game?.phase !== 'finished') room.status = 'paused';
  return player;
}

/** Rebind a Monopoly socket id without changing the player's money, assets, turn, debt, auction or trade. */
function resumeMonopolyPlayer(room, newSocketId, suppliedToken, tokenFactory = createMonopolyResumeToken, now = Date.now()) {
  if (!room?.players || typeof newSocketId !== 'string' || !newSocketId || room.players[newSocketId]) return null;

  let oldSocketId = null;
  let player = null;
  for (const [id, candidate] of Object.entries(room.players)) {
    if (candidate.connected !== false || !matchesMonopolyResumeToken(candidate.resumeToken, suppliedToken)) continue;
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

  const game = room.game;
  if (game) {
    const gamePlayer = game.players.find(candidate => candidate.id === oldSocketId);
    if (gamePlayer) gamePlayer.id = newSocketId;
    game.winnerId = moveId(game.winnerId, oldSocketId, newSocketId);
    game.lastDicePlayerId = moveId(game.lastDicePlayerId, oldSocketId, newSocketId);
    if (game.pendingDebt) {
      game.pendingDebt.debtorId = moveId(game.pendingDebt.debtorId, oldSocketId, newSocketId);
      game.pendingDebt.creditorId = moveId(game.pendingDebt.creditorId, oldSocketId, newSocketId);
      if (game.pendingDebt.effect?.recipientIds) game.pendingDebt.effect.recipientIds = game.pendingDebt.effect.recipientIds.map(id => moveId(id, oldSocketId, newSocketId));
      if (game.pendingDebt.effect?.playerId) game.pendingDebt.effect.playerId = moveId(game.pendingDebt.effect.playerId, oldSocketId, newSocketId);
    }
    if (game.pendingAuction) {
      game.pendingAuction.highBidderId = moveId(game.pendingAuction.highBidderId, oldSocketId, newSocketId);
      game.pendingAuction.currentBidderId = moveId(game.pendingAuction.currentBidderId, oldSocketId, newSocketId);
      game.pendingAuction.participantIds = game.pendingAuction.participantIds.map(id => moveId(id, oldSocketId, newSocketId));
      game.pendingAuction.passedIds = game.pendingAuction.passedIds.map(id => moveId(id, oldSocketId, newSocketId));
    }
    if (game.pendingTrade) {
      game.pendingTrade.fromId = moveId(game.pendingTrade.fromId, oldSocketId, newSocketId);
      game.pendingTrade.toId = moveId(game.pendingTrade.toId, oldSocketId, newSocketId);
    }
  }

  const reclaimedOriginalHost = room.disconnectedHostId === oldSocketId;
  if (reclaimedOriginalHost) {
    room.hostId = newSocketId;
    room.disconnectedHostId = null;
  } else if (room.hostId === oldSocketId || !room.players[room.hostId] || room.players[room.hostId].connected === false) {
    room.hostId = newSocketId;
  }

  if (room.status === 'paused' && Object.values(room.players).every(candidate => candidate.connected !== false)) {
    room.status = game?.phase === 'finished' ? 'finished' : 'playing';
  }
  return { oldSocketId, player, reclaimedOriginalHost };
}

module.exports = {
  RESUME_GRACE_MS,
  createMonopolyResumeToken,
  matchesMonopolyResumeToken,
  markMonopolyPlayerDisconnected,
  resumeMonopolyPlayer
};
