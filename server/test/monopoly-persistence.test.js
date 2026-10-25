'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  saveMonopolyRooms,
  loadMonopolyRooms,
  prepareMonopolyRoomsForRestart,
  sanitizeForStorage,
  validateStoredRoom
} = require('../monopoly-persistence');

function makeRoom() {
  const code = 'ABC234';
  const tokenA = 'a'.repeat(64);
  const tokenB = 'b'.repeat(64);
  return {
    code,
    revision: 14,
    hostId: 'socket-a',
    disconnectedHostId: null,
    status: 'playing',
    players: {
      'socket-a': { id: 'socket-a', name: 'Ada', connected: true, resumeToken: tokenA, resumeTimer: { secret: 'not serialized' } },
      'socket-b': { id: 'socket-b', name: 'Linus', connected: true, resumeToken: tokenB, resumeTimer: null }
    },
    game: {
      phase: 'playing', turnPlayerId: 'socket-b',
      players: [{ id: 'socket-a', cash: 1200, properties: [1] }, { id: 'socket-b', cash: 900, properties: [4] }],
      pendingDebt: { debtorId: 'socket-b', amount: 50 }
    }
  };
}

test('Monopoly persistence writes atomically, omits timeout handles, and preserves complete game state', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fofana-monopoly-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'rooms.json');
  const rooms = new Map([['ABC234', makeRoom()]]);
  const result = saveMonopolyRooms(file, rooms, 123456);
  assert.equal(result.saved, true);
  assert.equal(result.rooms, 1);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(`${file}.tmp-${process.pid}`), false);

  const loaded = loadMonopolyRooms(file);
  assert.equal(loaded.savedAt, 123456);
  assert.equal(loaded.rooms.size, 1);
  const restored = loaded.rooms.get('ABC234');
  assert.equal(restored.revision, 14);
  assert.equal(restored.game.pendingDebt.debtorId, 'socket-b');
  assert.equal(restored.players['socket-a'].resumeToken, 'a'.repeat(64));
  assert.equal(Object.hasOwn(restored.players['socket-a'], 'resumeTimer'), false);
});

test('startup preparation invalidates stale socket connectivity without losing room/game identity', () => {
  const room = makeRoom();
  const rooms = new Map([[room.code, room]]);
  const recovered = prepareMonopolyRoomsForRestart(rooms, 5000);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].playerIds.length, 2);
  assert.equal(room.players['socket-a'].connected, false);
  assert.equal(room.players['socket-a'].disconnectedAt, 5000);
  assert.equal(room.players['socket-a'].resumeTimer, null);
  assert.equal(room.status, 'paused');
  assert.equal(room.disconnectedHostId, 'socket-a');
  assert.equal(room.game.pendingDebt.amount, 50);
});

test('lobby restoration remains lobby and finished games remain finished', () => {
  const lobby = makeRoom(); lobby.game = null; lobby.status = 'lobby';
  const finished = makeRoom(); finished.game.phase = 'finished'; finished.status = 'finished';
  const rooms = new Map([[lobby.code, lobby], ['ABC235', { ...finished, code: 'ABC235', players: structuredClone(finished.players), game: structuredClone(finished.game) }]]);
  prepareMonopolyRoomsForRestart(rooms, 8000);
  assert.equal(lobby.status, 'lobby');
  assert.equal(rooms.get('ABC235').status, 'finished');
});

test('corrupt/unsupported snapshots fail closed and missing optional stores are ignored', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fofana-monopoly-store-'));
  try {
    assert.equal(loadMonopolyRooms(null), null);
    assert.equal(loadMonopolyRooms(path.join(dir, 'missing.json')), null);
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{broken');
    assert.throws(() => loadMonopolyRooms(file));
    assert.equal(validateStoredRoom({ ...makeRoom(), code: 'BAD/!!' }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('restart does not renew a previously disconnected player grace window forever', () => {
  const room = makeRoom();
  const player = room.players['socket-b'];
  player.connected = false;
  player.disconnectedAt = 1000;
  const rooms = new Map([[room.code, room]]);
  const [entry] = prepareMonopolyRoomsForRestart(rooms, 50_000, 90_000);
  assert.equal(player.disconnectedAt, 1000);
  assert.equal(Math.max(0, 90_000 - (50_000 - player.disconnectedAt)), 41_000);
  assert.equal(entry.room.players['socket-a'].disconnectedAt, 50_000);
});

test('storage sanitizer strips timer fields and refuses circular room data', () => {
  const safe = sanitizeForStorage({ value: 1, timer: { handle: true }, player: { resumeTimer: 12, name: 'Ada' } });
  assert.deepEqual(safe, { value: 1, player: { name: 'Ada' } });
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => sanitizeForStorage(cyclic), /döngüsel/);
});
