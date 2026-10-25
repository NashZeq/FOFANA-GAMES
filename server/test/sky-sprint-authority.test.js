'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sky = require('../sky-sprint-engine');

test('Sky Sprint progress rejects a single-packet teleport and accepts bounded movement', () => {
  const start = 100_000;
  const room = Sky.createRoom({ code: 'ABC123', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  Sky.updateProgress(room, 'p1', 10_000, start + 100);
  assert.ok(room.players.p1.distance <= Sky.PROGRESS_GRACE_DISTANCE + 100 * Sky.MAX_PROGRESS_SPEED / 1000);
  const before = room.players.p1.distance;
  Sky.updateProgress(room, 'p1', 10_000, start + 200);
  assert.ok(room.players.p1.distance <= before + Sky.PROGRESS_GRACE_DISTANCE + 100 * Sky.MAX_PROGRESS_SPEED / 1000);
});

test('Sky Sprint progress never moves backward and finish state comes from accepted progress', () => {
  const start = 200_000;
  const room = Sky.createRoom({ code: 'DEF456', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  Sky.updateProgress(room, 'p1', 400, start + 1000);
  const accepted = room.players.p1.distance;
  Sky.updateProgress(room, 'p1', 1, start + 1100);
  assert.ok(room.players.p1.distance >= accepted);
  assert.notEqual(room.status, 'finished');
});

test('Sky Sprint derives race distance from server time and ignores forged client distance', () => {
  const start = 300_000;
  const room = Sky.createRoom({ code: 'GHI789', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  room.track = []; // isolate baseline movement from server-simulated hazards/effects
  Sky.updateProgress(room, 'p1', 999_999, start + 1000);
  assert.equal(room.players.p1.distance, Sky.SERVER_RACE_SPEED);
  Sky.updateProgress(room, 'p1', 0, start + 2000);
  assert.equal(room.players.p1.distance, Sky.SERVER_RACE_SPEED * 2);
  assert.equal(room.status, 'racing');
});

test('Sky Sprint server time determines the finish and winner, not a client packet', () => {
  const start = 400_000;
  const room = Sky.createRoom({ code: 'JKL789', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  room.track = []; // no obstacle effect should change the controlled finish-time test
  Sky.updateProgress(room, 'p1', 999_999, start + (Sky.RACE_DISTANCE / Sky.SERVER_RACE_SPEED) * 1000);
  assert.equal(room.players.p1.distance, Sky.RACE_DISTANCE);
  assert.ok(Math.abs(room.players.p1.finishedAt - (start + (Sky.RACE_DISTANCE / Sky.SERVER_RACE_SPEED) * 1000)) <= 20, 'finish time is determined within one server physics step');
  assert.equal(room.winnerId, 'p1');
});

test('Sky Sprint rate-limits jump intents on the server', () => {
  const start = 500_000;
  const room = Sky.createRoom({ code: 'MNO789', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  assert.equal(Sky.registerJump(room, 'p1', start + 100).accepted, true);
  assert.throws(() => Sky.registerJump(room, 'p1', start + 200), /hızlı/);
  assert.equal(Sky.registerJump(room, 'p1', start + 300).jumpCount, 2);
});

test('Sky Sprint public room exposes authoritative jump count and airborne state', () => {
  const start = Date.now();
  const room = Sky.createRoom({ code: 'PQR789', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  Sky.registerJump(room, 'p1', start + 100);
  Sky.advanceJumpPhysics(room.players.p1, start + 120);
  const state = Sky.publicRoom(room);
  const player = state.players.find(p => p.id === 'p1');
  assert.equal(player.jumpCount, 1);
  assert.equal(player.airborne, true);
  assert.ok(player.jumpHeight > 0);
});

test('Sky Sprint produces one deterministic shared obstacle track for all clients', () => {
  const a = Sky.generateTrack(12345);
  const b = Sky.generateTrack(12345);
  assert.deepEqual(a, b);
  const types = new Set(a.map(e => e.type));
  for (const type of ['saw', 'blade', 'boost', 'gap', 'platform']) assert.ok(types.has(type), `track must include ${type}`);
  assert.ok(a.every(e => typeof e.id === 'string' && Number.isFinite(e.x)));
});

test('Sky Sprint server applies a boost when a player intersects a boost pad', () => {
  const start = 700_000;
  const room = Sky.createRoom({ code: 'BST234', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  room.track = [{ id: 'boost-test', type: 'boost', x: 5, y: 411, w: 76, h: 9 }];
  Sky.updateProgress(room, 'p1', 999_999, start + 100);
  assert.ok(room.players.p1.boostRemaining > 0);
  assert.ok(room.players.p1.speed > Sky.SERVER_RACE_SPEED);
});

test('Sky Sprint server applies a slowdown when a player intersects a blade', () => {
  const start = 800_000;
  const room = Sky.createRoom({ code: 'BLD234', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  room.track = [{ id: 'blade-test', type: 'blade', x: 5, y: 412, w: 78 }];
  Sky.updateProgress(room, 'p1', 999_999, start + 100);
  assert.ok(room.players.p1.slowRemaining > 0);
  assert.ok(room.players.p1.speed < Sky.SERVER_RACE_SPEED);
});

test('Sky Sprint server makes an un-jumped gap fatal and ends the room when all racers fall', () => {
  const start = 900_000;
  const room = Sky.createRoom({ code: 'GAP234', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  room.track = [{ id: 'gap-test', type: 'gap', x: 0, w: 220 }];
  Sky.updateProgress(room, 'p1', 999_999, start + 1000);
  assert.equal(room.players.p1.alive, false);
  assert.equal(room.players.p2.alive, false);
  assert.equal(room.status, 'finished');
  assert.equal(room.winnerId, null, 'a race where everyone falls has no fabricated winner');
  const state = Sky.publicRoom(room, { now: start + 1000 });
  assert.ok(state.players.every(p => p.fallen));
});

test('Sky Sprint rejects excessive progress heartbeats without affecting server physics', () => {
  const start = 1_000_000;
  const room = Sky.createRoom({ code: 'RAT234', hostId: 'p1', name: 'Ali', now: start });
  Sky.joinRoom(room, { playerId: 'p2', name: 'Ece', now: start });
  Sky.startRace(room, 'p1', start);
  room.track = [];
  assert.doesNotThrow(() => Sky.updateProgress(room, 'p1', 99_999, start + 100));
  const before = room.players.p1.distance;
  assert.throws(() => Sky.updateProgress(room, 'p1', 99_999, start + 120), /çok sık/);
  assert.equal(room.players.p1.distance, before);
});


test('Sky Sprint player names reject non-strings and strip control characters', () => {
  assert.throws(() => Sky.createRoom({ code: 'NAM234', hostId: 'p1', name: { value: 'Ali' }, now: 10 }), /Oyuncu adı/);
  assert.throws(() => Sky.createRoom({ code: 'NAM234', hostId: 'p1', name: 123, now: 10 }), /Oyuncu adı/);
  const room = Sky.createRoom({ code: 'NAM234', hostId: 'p1', name: 'Ali\u0000\u001b', now: 10 });
  assert.equal(room.players.p1.name, 'Ali');
  assert.throws(() => Sky.joinRoom(room, { playerId: 'p2', name: {} , now: 10 }), /Oyuncu adı/);
});
