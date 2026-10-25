'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../worms-engine');
const R = require('../worms-room-recovery');

const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
function makeRoom() {
  const room = W.createRoom('ABC234', 'host-old', 'Ali');
  room.players['host-old'].resumeToken = tokenA;
  W.joinRoom(room, 'guest-old', 'Ece');
  room.players['guest-old'].resumeToken = tokenB;
  W.startGame(room, 'host-old');
  room.state = { terrain: Array.from({ length: 97 }, (_, i) => ({ x: i * 10, y: W.initialTerrainY(i * 10) })), players: [{ x: 95, y: 335, hp: 100, color: '#72e3ad', name: 'Ali' }, { x: 855, y: 335, hp: 100, color: '#ff7a86', name: 'Ece' }], active: 1, wind: 2, ended: false };
  room.revision = 4;
  room.lastActionAt['guest-old'] = 123;
  return room;
}

test('Worms recovery tokens are random, fixed-length and compared with timing-safe equality', () => {
  const a = R.createWormsResumeToken(), b = R.createWormsResumeToken();
  assert.match(a, /^[a-f0-9]{64}$/); assert.match(b, /^[a-f0-9]{64}$/); assert.notEqual(a, b);
  assert.equal(R.matchesWormsResumeToken(a, a), true);
  assert.equal(R.matchesWormsResumeToken(a, 'bad'), false);
  assert.equal(R.matchesWormsResumeToken(a, b), false);
});

test('disconnect pauses the current match, preserves state and permits same-slot recovery', () => {
  const room = makeRoom(); const previous = structuredClone(room.state);
  R.markWormsPlayerDisconnected(room, 'guest-old', 100_000);
  assert.equal(room.status, 'paused'); assert.equal(room.players['guest-old'].connected, false);
  assert.throws(() => W.passTurn(room, 'host-old'), /duraklatıldı/);
  const result = R.resumeWormsPlayer(room, 'guest-new', tokenB, () => 'c'.repeat(64), 100_500);
  assert.ok(result); assert.equal(result.oldSocketId, 'guest-old'); assert.equal(result.player.slot, 1);
  assert.equal(result.player.name, 'Ece'); assert.equal(result.player.connected, true);
  assert.equal(result.player.resumeToken, 'c'.repeat(64)); assert.equal(room.players['guest-old'], undefined);
  assert.deepEqual(room.state, previous); assert.equal(room.status, 'playing'); assert.equal(room.revision, 4);
  assert.equal(room.lastActionAt['guest-new'], 123); assert.equal(room.lastActionAt['guest-old'], undefined);
});

test('expired, malformed or replayed token is rejected without changing room membership', () => {
  const room = makeRoom(); R.markWormsPlayerDisconnected(room, 'guest-old', 100_000);
  assert.equal(R.resumeWormsPlayer(room, 'late', tokenB, () => 'c'.repeat(64), 100_000 + R.RESUME_GRACE_MS + 1), null);
  assert.equal(R.resumeWormsPlayer(room, 'bad', 'not-a-token', () => 'c'.repeat(64), 100_500), null);
  const result = R.resumeWormsPlayer(room, 'guest-new', tokenB, () => 'c'.repeat(64), 100_500);
  assert.ok(result);
  assert.equal(R.resumeWormsPlayer(room, 'replay', tokenB, () => 'd'.repeat(64), 100_600), null);
  assert.equal(room.players['guest-new'].resumeToken, 'c'.repeat(64));
});

test('original host can reclaim ownership after a temporary host is appointed', () => {
  const room = makeRoom();
  R.markWormsPlayerDisconnected(room, 'host-old', 100_000);
  assert.equal(room.hostId, 'guest-old'); assert.equal(room.disconnectedHostId, 'host-old');
  const newHost = R.resumeWormsPlayer(room, 'host-new', tokenA, () => 'e'.repeat(64), 100_500);
  assert.ok(newHost); assert.equal(newHost.reclaimedOriginalHost, true);
  assert.equal(room.hostId, 'host-new'); assert.equal(room.disconnectedHostId, null);
});

test('if both players disconnect the temporary host can return without erasing original host recovery', () => {
  const room = makeRoom();
  R.markWormsPlayerDisconnected(room, 'host-old', 100_000);
  R.markWormsPlayerDisconnected(room, 'guest-old', 100_100);
  const guest = R.resumeWormsPlayer(room, 'guest-new', tokenB, () => 'c'.repeat(64), 100_500);
  assert.ok(guest); assert.equal(room.disconnectedHostId, 'host-old'); assert.equal(room.hostId, 'guest-new');
  assert.equal(room.status, 'paused');
  const host = R.resumeWormsPlayer(room, 'host-new', tokenA, () => 'd'.repeat(64), 100_700);
  assert.ok(host); assert.equal(room.hostId, 'host-new'); assert.equal(room.disconnectedHostId, null); assert.equal(room.status, 'playing');
});

test('public room status exposes connection flags but never recovery secrets or timer handles', () => {
  const room = makeRoom(); R.markWormsPlayerDisconnected(room, 'guest-old', 100_000);
  const pub = W.publicRoom(room);
  assert.equal(pub.status, 'paused'); assert.equal(pub.players.find(p => p.id === 'guest-old').connected, false);
  assert.equal(pub.players.find(p => p.id === 'guest-old').resumeToken, undefined);
  assert.equal(pub.players.find(p => p.id === 'guest-old').resumeTimer, undefined);
});

test('new online match may only reset after the game has ended and only by connected host', () => {
  const room = makeRoom();
  assert.throws(() => W.resetGame(room, 'guest-old'), /oda sahibi/);
  assert.throws(() => W.resetGame(room, 'host-old'), /maç bittikten sonra/);
  room.state.ended = true;
  const result = W.resetGame(room, 'host-old');
  assert.equal(result.status, 'lobby'); assert.equal(result.state, null); assert.equal(room.revision, 0);
  assert.equal(W.startGame(room, 'host-old').status, 'playing');
});
