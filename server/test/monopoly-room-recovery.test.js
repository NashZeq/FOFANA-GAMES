'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Monopoly = require('../monopoly-engine');
const Recovery = require('../monopoly-room-recovery');

const oldHostToken = 'a'.repeat(64);
const guestToken = 'b'.repeat(64);
function makeRoom() {
  const room = {
    code: 'ABC234',
    hostId: 'host-old',
    disconnectedHostId: null,
    status: 'playing',
    players: {
      'host-old': { id: 'host-old', name: 'Ali', connected: true, resumeToken: oldHostToken, resumeTimer: null },
      'guest-old': { id: 'guest-old', name: 'Ece', connected: true, resumeToken: guestToken, resumeTimer: null }
    },
    game: Monopoly.createGame([{ id: 'host-old', name: 'Ali' }, { id: 'guest-old', name: 'Ece' }])
  };
  room.game.current = 1;
  room.game.players[1].cash = 720;
  room.game.players[1].properties = [1, 3];
  room.game.players[1].mortgaged = [3];
  room.game.players[1].inJail = true;
  room.game.players[1].jailTurns = 2;
  room.game.pendingDebt = {
    debtorId: 'guest-old', amount: 50, creditorId: 'host-old', reason: 'hapishane',
    effect: { type: 'jail_bail_roll', playerId: 'guest-old', steps: 8 }
  };
  return room;
}

test('Monopoly recovery tokens are random, 64-char hex and timing-safe checked', () => {
  const a = Recovery.createMonopolyResumeToken();
  const b = Recovery.createMonopolyResumeToken();
  assert.match(a, /^[a-f0-9]{64}$/); assert.match(b, /^[a-f0-9]{64}$/); assert.notEqual(a, b);
  assert.equal(Recovery.matchesMonopolyResumeToken(a, a), true);
  assert.equal(Recovery.matchesMonopolyResumeToken(a, b), false);
  assert.equal(Recovery.matchesMonopolyResumeToken(a, 'not-a-token'), false);
});

test('disconnect pauses Monopoly and reconnect preserves turn, money, properties, debt and bail-roll continuation', () => {
  const room = makeRoom();
  const beforeCash = room.game.players[1].cash;
  const beforeProperties = [...room.game.players[1].properties];
  Recovery.markMonopolyPlayerDisconnected(room, 'guest-old', 100_000);
  assert.equal(room.status, 'paused');
  assert.equal(room.players['guest-old'].connected, false);
  const restored = Recovery.resumeMonopolyPlayer(room, 'guest-new', guestToken, () => 'c'.repeat(64), 100_500);
  assert.ok(restored); assert.equal(restored.oldSocketId, 'guest-old');
  assert.equal(room.players['guest-old'], undefined);
  assert.equal(room.players['guest-new'].name, 'Ece');
  assert.equal(room.players['guest-new'].connected, true);
  assert.equal(room.players['guest-new'].resumeToken, 'c'.repeat(64));
  assert.equal(room.game.players[1].id, 'guest-new');
  assert.equal(room.game.players[1].cash, beforeCash);
  assert.deepEqual(room.game.players[1].properties, beforeProperties);
  assert.equal(room.game.players[1].inJail, true);
  assert.equal(room.game.current, 1);
  assert.equal(room.game.pendingDebt.debtorId, 'guest-new');
  assert.equal(room.game.pendingDebt.creditorId, 'host-old');
  assert.equal(room.game.pendingDebt.effect.playerId, 'guest-new');
  assert.equal(room.status, 'playing');
});

test('expired, malformed and replayed tokens are rejected without changing room state', () => {
  const room = makeRoom();
  Recovery.markMonopolyPlayerDisconnected(room, 'guest-old', 100_000);
  const before = room.game.players[1].cash;
  assert.equal(Recovery.resumeMonopolyPlayer(room, 'late', guestToken, () => 'c'.repeat(64), 100_000 + Recovery.RESUME_GRACE_MS + 1), null);
  assert.equal(Recovery.resumeMonopolyPlayer(room, 'bad', 'bad-token', () => 'c'.repeat(64), 100_500), null);
  const restored = Recovery.resumeMonopolyPlayer(room, 'guest-new', guestToken, () => 'c'.repeat(64), 100_500);
  assert.ok(restored);
  assert.equal(Recovery.resumeMonopolyPlayer(room, 'replay', guestToken, () => 'd'.repeat(64), 100_600), null);
  assert.equal(room.players['guest-new'].resumeToken, 'c'.repeat(64));
  assert.equal(room.game.players[1].cash, before);
});

test('live player sessions cannot be stolen, and original host can reclaim after temporary handoff', () => {
  const room = makeRoom();
  assert.equal(Recovery.resumeMonopolyPlayer(room, 'takeover', oldHostToken), null);
  Recovery.markMonopolyPlayerDisconnected(room, 'host-old', 100_000);
  assert.equal(room.hostId, 'guest-old');
  assert.equal(room.disconnectedHostId, 'host-old');
  Recovery.markMonopolyPlayerDisconnected(room, 'guest-old', 100_100);
  const guest = Recovery.resumeMonopolyPlayer(room, 'guest-new', guestToken, () => 'c'.repeat(64), 100_500);
  assert.ok(guest); assert.equal(room.hostId, 'guest-new'); assert.equal(room.status, 'paused');
  const host = Recovery.resumeMonopolyPlayer(room, 'host-new', oldHostToken, () => 'd'.repeat(64), 100_700);
  assert.ok(host); assert.equal(host.reclaimedOriginalHost, true);
  assert.equal(room.hostId, 'host-new'); assert.equal(room.disconnectedHostId, null); assert.equal(room.status, 'playing');
});

test('auction and pending trade identities are rebound when the player resumes', () => {
  const room = makeRoom();
  room.game.pendingDebt = null;
  room.game.pendingAuction = { propertyIndex: 1, highBid: 80, highBidderId: 'guest-old', currentBidderId: 'guest-old', participantIds: ['host-old', 'guest-old'], passedIds: [] };
  room.game.pendingTrade = null;
  Recovery.markMonopolyPlayerDisconnected(room, 'guest-old', 50_000);
  const result = Recovery.resumeMonopolyPlayer(room, 'guest-new', guestToken, () => 'e'.repeat(64), 50_100);
  assert.ok(result);
  assert.equal(room.game.pendingAuction.highBidderId, 'guest-new');
  assert.equal(room.game.pendingAuction.currentBidderId, 'guest-new');
  assert.deepEqual(room.game.pendingAuction.participantIds, ['host-old', 'guest-new']);
  room.game.pendingAuction = null;
  room.game.pendingTrade = { fromId: 'guest-new', toId: 'host-old', giveIndex: 1, takeIndex: 3, cashOut: 0, cashIn: 0 };
  Recovery.markMonopolyPlayerDisconnected(room, 'guest-new', 50_200);
  const result2 = Recovery.resumeMonopolyPlayer(room, 'guest-final', 'e'.repeat(64), () => 'f'.repeat(64), 50_300);
  assert.ok(result2);
  assert.equal(room.game.pendingTrade.fromId, 'guest-final');
  assert.equal(room.game.pendingTrade.toId, 'host-old');
});
