'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeSocket {
  constructor(id, io) {
    this.id = id; this.io = io; this.connected = true; this.data = {};
    this.rooms = new Set([id]); this.serverHandlers = new Map(); this.clientHandlers = new Map();
    this.clientEvents = [];
  }
  on(event, fn) { this.serverHandlers.set(event, fn); return this; }
  clientOn(event, fn) { const a = this.clientHandlers.get(event) || []; a.push(fn); this.clientHandlers.set(event, a); return this; }
  join(room) { this.rooms.add(room); }
  leave(room) { this.rooms.delete(room); }
  emit(event, ...args) {
    this.clientEvents.push({ event, args });
    for (const fn of this.clientHandlers.get(event) || []) fn(...args);
  }
  clientEmit(event, payload = {}, ack = () => {}) {
    const fn = this.serverHandlers.get(event);
    if (!fn) throw new Error(`No server handler for ${event}`);
    fn(payload, ack);
  }
  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    const fn = this.serverHandlers.get('disconnect');
    if (fn) fn('transport close');
    this.io.sockets.delete(this.id);
  }
}
class FakeSocketServer {
  constructor() {
    this.handlers = new Map(); this.sockets = new Map();
    this.namespace = { sockets:this.sockets };
  }
  on(event, fn) { this.handlers.set(event, fn); return this; }
  of() { return this.namespace; }
  to(target) {
    return { emit:(event, ...args) => {
      for (const socket of this.sockets.values()) {
        if (socket.connected && (socket.id === target || socket.rooms.has(target))) socket.emit(event, ...args);
      }
    }};
  }
  connect(id) {
    const socket = new FakeSocket(id, this); this.sockets.set(id, socket);
    this.handlers.get('connection')(socket); return socket;
  }
}
function loadServerWithFakeTransport() {
  const originalLoad = Module._load;
  const fakeExpress = () => {
    const app = (_req, res) => res.end('fake');
    app.disable = () => app; app.get = () => app; app.use = () => app;
    return app;
  };
  fakeExpress.static = () => (_req, _res, next) => next?.();
  Module._load = function(request, parent, isMain) {
    if (request === 'express') return fakeExpress;
    if (request === 'socket.io') return { Server: class extends FakeSocketServer { constructor() { super(); global.__fofanaFakeIO = this; } } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require('../index'); }
  finally { Module._load = originalLoad; }
}
const app = loadServerWithFakeTransport();
const io = global.__fofanaFakeIO;
let counter = 0;
const connect = () => io.connect(`fake-socket-${++counter}`);
const act = (socket, event, payload = {}) => {
  let response; socket.clientEmit(event, payload, result => { response = result; });
  return response;
};
const createRoom = (socket, name) => act(socket, 'room:create', { name, imposters:'1', category:'genel' });
const joinRoom = (socket, code, name) => act(socket, 'room:join', { code, name });

test('Imposter reconnect restores the same role, vote and game identity with a rotated token', () => {
  const host = connect(); const hostCreated = createRoom(host, 'Ev Sahibi');
  assert.equal(hostCreated.ok, true);
  const b = connect(), c = connect(), d = connect();
  assert.equal(joinRoom(b, hostCreated.code, 'Oyuncu B').ok, true);
  assert.equal(joinRoom(c, hostCreated.code, 'Oyuncu C').ok, true);
  assert.equal(joinRoom(d, hostCreated.code, 'Oyuncu D').ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(hostCreated.code);
  const oldId = b.id, hostId = host.id;
  const oldToken = joinRoomToken(room, oldId);
  const oldRole = room.game.roles[oldId].imposter;
  room.game.phase = 'voting'; room.game.votes[oldId] = hostId; room.game.guesserId = oldId;
  b.disconnect();
  assert.equal(room.players[oldId].connected, false);
  const restored = connect();
  let privateRole = null; restored.clientOn('game:private-role', role => { privateRole = role; });
  const resumed = act(restored, 'room:resume', { code:hostCreated.code, resumeToken:oldToken });
  assert.equal(resumed.ok, true);
  assert.notEqual(resumed.resumeToken, oldToken);
  assert.equal(room.players[oldId], undefined);
  assert.equal(room.players[restored.id].connected, true);
  assert.equal(room.game.roles[restored.id].imposter, oldRole);
  assert.ok(room.game.alive.includes(restored.id));
  assert.equal(room.game.votes[restored.id], hostId);
  assert.equal(room.game.guesserId, restored.id);
  assert.equal(privateRole.imposter, oldRole);
  assert.equal(JSON.stringify(require('../game-engine').publicRoom(room)).includes(resumed.resumeToken), false);
});

test('Imposter explicit leave removes the player immediately and frees the room when empty', () => {
  const player = connect(); const created = createRoom(player, 'Ayrılan');
  assert.equal(created.ok, true);
  const room = app.rooms.get(created.code);
  assert.ok(room.players[player.id]);
  const left = act(player, 'room:leave', {});
  assert.equal(left.ok, true);
  assert.equal(app.rooms.has(created.code), false);
  assert.equal(player.data.roomCode, undefined);
});

test('Imposter rejects an incorrect recovery token without mutating room identity', () => {
  const host = connect(); const created = createRoom(host, 'Sahip');
  const beforeId = host.id; const intruder = connect();
  const result = act(intruder, 'room:resume', { code:created.code, resumeToken:'wrong-token-'.padEnd(64,'x') });
  assert.equal(result.ok, false);
  assert.ok(app.rooms.get(created.code).players[beforeId]);
  assert.equal(intruder.data.roomCode, undefined);
});

function joinRoomToken(room, id) { return room.players[id]?.resumeToken || ''; }

test('an active socket cannot have its Imposter session stolen by a second connection', () => {
  const host = connect();
  const created = createRoom(host, 'Aktif Oturum');
  assert.equal(created.ok, true);
  const room = app.rooms.get(created.code);
  const token = room.players[host.id].resumeToken;
  const attacker = connect();
  const result = act(attacker, 'room:resume', { code: created.code, resumeToken: token });
  assert.equal(result.ok, false);
  assert.match(result.error, /başka bir bağlantıda hâlâ açık/i);
  assert.ok(room.players[host.id]);
  assert.equal(room.players[host.id].connected, true);
  assert.equal(room.hostId, host.id);
  assert.equal(attacker.data.roomCode, undefined);
});

test('resume tokens must be 64 hex characters and a rotated token is single-use', () => {
  const host = connect();
  const created = createRoom(host, 'Token biçimi');
  const invalid = connect();
  assert.equal(act(invalid, 'room:resume', { code: created.code, resumeToken: 'z'.repeat(64) }).ok, false);
  const room = app.rooms.get(created.code);
  const oldToken = room.players[host.id].resumeToken;
  host.disconnect();
  const restored = connect();
  const ok = act(restored, 'room:resume', { code: created.code, resumeToken: oldToken });
  assert.equal(ok.ok, true);
  assert.notEqual(ok.resumeToken, oldToken);
  const replay = connect();
  assert.equal(act(replay, 'room:resume', { code: created.code, resumeToken: oldToken }).ok, false);
  assert.equal(room.players[restored.id].connected, true);
});

test('leaving eliminated spectator does not cancel a legal three-player endgame', () => {
  const host = connect(); const created = createRoom(host, 'Üç kişi devam');
  const b = connect(), c = connect(), d = connect();
  assert.equal(joinRoom(b, created.code, 'Oyuncu B').ok, true);
  assert.equal(joinRoom(c, created.code, 'Oyuncu C').ok, true);
  assert.equal(joinRoom(d, created.code, 'Oyuncu D').ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code), game = room.game;
  game.roles[host.id].imposter = false;
  game.roles[b.id].imposter = true;
  game.roles[c.id].imposter = false;
  game.roles[d.id].imposter = false;
  game.phase = 'voting'; game.votes = {};
  assert.equal(act(host, 'game:vote', { targetId: c.id }).ok, true);
  assert.equal(act(b, 'game:vote', { targetId: c.id }).ok, true);
  assert.equal(act(d, 'game:vote', { targetId: c.id }).ok, true);
  const finalVote = act(c, 'game:vote', { targetId: b.id });
  assert.equal(finalVote.ok, true);
  assert.equal(game.phase, 'discussion');
  assert.equal(game.alive.length, 3);
  assert.equal(game.alive.includes(c.id), false);
  assert.equal(act(c, 'room:leave', {}).ok, true);
  assert.equal(game.phase, 'discussion');
  assert.equal(game.alive.length, 3);
  assert.notEqual(game.winner, 'cancelled');
  assert.equal(room.status, 'playing');
});

test('host authority transfers to a living player when the host is eliminated', () => {
  const host = connect(); const created = createRoom(host, 'Canlı ev sahibi');
  const imposter = connect(), civilA = connect(), civilB = connect();
  assert.equal(joinRoom(imposter, created.code, 'Imposter').ok, true);
  assert.equal(joinRoom(civilA, created.code, 'Masum A').ok, true);
  assert.equal(joinRoom(civilB, created.code, 'Masum B').ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code), game = room.game;
  for (const id of game.alive) game.roles[id].imposter = false;
  game.roles[imposter.id].imposter = true;
  game.phase = 'voting'; game.votes = {};
  act(host, 'game:vote', { targetId: civilA.id });
  act(imposter, 'game:vote', { targetId: host.id });
  act(civilA, 'game:vote', { targetId: host.id });
  const resolved = act(civilB, 'game:vote', { targetId: host.id });
  assert.equal(resolved.ok, true);
  assert.equal(game.phase, 'discussion');
  assert.equal(game.alive.includes(host.id), false);
  assert.notEqual(room.hostId, host.id);
  assert.ok(game.alive.includes(room.hostId));
  assert.equal(act(host, 'game:start-vote', {}).ok, false);
  assert.equal(act(io.sockets.get(room.hostId), 'game:start-vote', {}).ok, true);
});

test('vote cannot start with fewer than three connected living players', () => {
  const host = connect(); const created = createRoom(host, 'Az oyuncu');
  const b = connect(), c = connect(), d = connect();
  assert.equal(joinRoom(b, created.code, 'Oyuncu B').ok, true);
  assert.equal(joinRoom(c, created.code, 'Oyuncu C').ok, true);
  assert.equal(joinRoom(d, created.code, 'Oyuncu D').ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code);
  room.game.phase = 'discussion';
  room.players[c.id].connected = false;
  room.players[d.id].connected = false;
  const result = act(host, 'game:start-vote', {});
  assert.equal(result.ok, false);
  assert.match(result.error, /en az 3 aktif oyuncu/i);
  assert.equal(room.game.phase, 'discussion');
});

test('host is reassigned again if the temporary host is eliminated when disconnect resolves pending votes', () => {
  const host = connect(); const created = createRoom(host, 'İki aşamalı ev sahibi');
  const temp = connect(), imposter = connect(), civil = connect();
  assert.equal(joinRoom(temp, created.code, 'Geçici Sahip').ok, true);
  assert.equal(joinRoom(imposter, created.code, 'Imposter').ok, true);
  assert.equal(joinRoom(civil, created.code, 'Masum').ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code), game = room.game;
  game.roles[host.id].imposter = false;
  game.roles[temp.id].imposter = false;
  game.roles[imposter.id].imposter = true;
  game.roles[civil.id].imposter = false;
  game.phase = 'voting'; game.votes = {};
  game.votes[host.id] = imposter.id;
  game.votes[temp.id] = host.id;
  game.votes[imposter.id] = temp.id;
  game.votes[civil.id] = temp.id;
  host.disconnect();
  assert.equal(game.phase, 'discussion');
  assert.equal(game.alive.includes(temp.id), false);
  assert.notEqual(room.hostId, temp.id);
  assert.ok(game.alive.includes(room.hostId));
  assert.equal(room.players[room.hostId].connected, true);
});


test('Imposter vote deadline resolves partial ballots and notifies every player', () => {
  const host = connect(); const created = createRoom(host, 'Zaman Aşımı');
  const players = [host, connect(), connect(), connect()];
  for (const [i, player] of players.slice(1).entries()) assert.equal(joinRoom(player, created.code, `Süre Oyuncu ${i+2}`).ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code), game = room.game;
  // Put the test directly in discussion after all roles are safely initialized.
  game.phase = 'discussion';
  assert.equal(act(host, 'game:start-vote').ok, true);
  assert.equal(game.phase, 'voting');
  assert.equal(typeof room.voteEndsAt, 'number');
  assert.equal(room.voteEndsAt > Date.now(), true);
  assert.equal(act(host, 'game:vote', { targetId: players[1].id }).ok, true);
  const scheduled = room.voteTimer;
  assert.ok(scheduled && typeof scheduled._onTimeout === 'function');
  scheduled._onTimeout(); // deterministically fire the timeout without waiting 45 seconds
  assert.notEqual(game.phase, 'voting');
  assert.equal(room.voteTimer, null);
  assert.equal(room.voteEndsAt, null);
  assert.ok(players.every(player => player.clientEvents.some(event => event.event === 'game:result')));
  assert.ok(players.every(player => player.clientEvents.some(event => event.event === 'game:notice' && String(event.args[0]?.message||'').includes('Oylama süresi doldu'))));
  assert.equal(require('../game-engine').publicRoom(room).voteEndsAt, null);
});

test('Imposter completes a ballot early and cancels the vote deadline', () => {
  const host = connect(); const created = createRoom(host, 'Erken Oylama');
  const ps = [host, connect(), connect(), connect()];
  for (const [i, player] of ps.slice(1).entries()) assert.equal(joinRoom(player, created.code, `Erken Oyuncu ${i+2}`).ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code), game = room.game; game.phase = 'discussion';
  assert.equal(act(host, 'game:start-vote').ok, true);
  const target = ps.find(p=>p.id!==host.id);
  for (const player of ps.filter(p=>p.id!==target.id)) assert.equal(act(player, 'game:vote', { targetId: target.id }).ok, true);
  // Last active player votes for anyone other than themselves; if game has advanced already, the timer must still be cleared.
  if (game.phase === 'voting') assert.equal(act(target, 'game:vote', { targetId: host.id }).ok, true);
  assert.equal(room.voteTimer, null);
  assert.equal(room.voteEndsAt, null);
});

test('Imposter automatically starts voting when the discussion deadline expires', () => {
  const host = connect(); const created = createRoom(host, 'Otomatik oylama');
  const players = [host, connect(), connect(), connect()];
  for (const [i, player] of players.slice(1).entries()) assert.equal(joinRoom(player, created.code, `Otomatik ${i+2}`).ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code);
  for (const player of players) assert.equal(act(player, 'game:ready').ok, true);
  assert.equal(room.game.phase, 'discussion');
  assert.ok(room.discussionEndsAt > Date.now());
  assert.ok(require('../game-engine').publicRoom(room).discussionEndsAt > Date.now());
  const discussionTimer = room.discussionTimer;
  assert.ok(discussionTimer && typeof discussionTimer._onTimeout === 'function');
  discussionTimer._onTimeout();
  assert.equal(room.game.phase, 'voting');
  assert.equal(room.discussionTimer, null);
  assert.equal(room.discussionEndsAt, null);
  assert.ok(room.voteEndsAt > Date.now());
  for (const player of players) {
    assert.ok(player.clientEvents.some(event => event.event === 'room:state' && event.args[0].phase === 'voting'));
    assert.ok(player.clientEvents.some(event => event.event === 'game:notice' && /otomatik başladı/i.test(String(event.args[0]?.message || ''))));
  }
  if (room.voteTimer) clearTimeout(room.voteTimer);
});

test('Imposter waits to start voting while fewer than three living players are connected', () => {
  const host = connect(); const created = createRoom(host, 'Bağlantı bekleme');
  const players = [host, connect(), connect(), connect()];
  for (const [i, player] of players.slice(1).entries()) assert.equal(joinRoom(player, created.code, `Bekleyen ${i+2}`).ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code);
  for (const player of players) assert.equal(act(player, 'game:ready').ok, true);
  assert.equal(room.game.phase, 'discussion');
  room.players[players[2].id].connected = false;
  room.players[players[3].id].connected = false;
  room.discussionTimer._onTimeout();
  assert.equal(room.game.phase, 'discussion');
  assert.ok(room.discussionTimer);
  assert.equal(room.discussionEndsAt > Date.now(), true);
  assert.ok(players.every(player => player.clientEvents.some(event => event.event === 'game:notice' && /en az 3 aktif oyuncu/i.test(String(event.args[0]?.message || '')))));
  room.players[players[2].id].connected = true;
  room.discussionTimer._onTimeout();
  assert.equal(room.game.phase, 'voting');
  assert.equal(room.discussionTimer, null);
  if (room.voteTimer) clearTimeout(room.voteTimer);
});


test('Imposter last-word guess has a 30-second server deadline and awards civilians when time expires', () => {
  const host = connect(); const created = createRoom(host, 'Son tahmin süresi');
  const players = [host, connect(), connect(), connect()];
  for (const [i, player] of players.slice(1).entries()) assert.equal(joinRoom(player, created.code, `Son Tahmin ${i+2}`).ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code), game = room.game;
  for (const player of players) game.roles[player.id].imposter = player.id === host.id;
  game.phase = 'voting'; game.votes = {};
  assert.equal(act(host, 'game:vote', { targetId: players[1].id }).ok, true);
  assert.equal(act(players[1], 'game:vote', { targetId: host.id }).ok, true);
  assert.equal(act(players[2], 'game:vote', { targetId: host.id }).ok, true);
  assert.equal(act(players[3], 'game:vote', { targetId: host.id }).ok, true);
  assert.equal(game.phase, 'guess');
  assert.ok(room.guessEndsAt > Date.now());
  assert.ok(require('../game-engine').publicRoom(room).guessEndsAt > Date.now());
  assert.ok(host.clientEvents.some(event => event.event === 'game:guess-turn' && event.args[0]?.allowed === true));
  const timer = room.guessTimer;
  assert.ok(timer && typeof timer._onTimeout === 'function');
  timer._onTimeout();
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 'civilians');
  assert.equal(room.guessTimer, null);
  assert.equal(room.guessEndsAt, null);
  assert.match(game.lastResult.message, /30 saniye içinde/i);
  assert.ok(players.every(player => player.clientEvents.some(event => event.event === 'game:result' && event.args[0]?.winner === 'civilians')));
  assert.ok(players.every(player => player.clientEvents.some(event => event.event === 'room:state' && event.args[0].phase === 'finished')));
});

test('Imposter correct last-word guess cancels the deadline and ends the match immediately', () => {
  const host = connect(); const created = createRoom(host, 'Kelimeyi bul');
  const players = [host, connect(), connect(), connect()];
  for (const [i, player] of players.slice(1).entries()) assert.equal(joinRoom(player, created.code, `Kelime ${i+2}`).ok, true);
  assert.equal(act(host, 'game:start').ok, true);
  const room = app.rooms.get(created.code), game = room.game;
  for (const player of players) game.roles[player.id].imposter = player.id === host.id;
  game.phase = 'voting'; game.votes = {};
  act(host, 'game:vote', { targetId: players[1].id });
  act(players[1], 'game:vote', { targetId: host.id });
  act(players[2], 'game:vote', { targetId: host.id });
  act(players[3], 'game:vote', { targetId: host.id });
  assert.equal(game.phase, 'guess');
  const correct = act(host, 'game:guess', { guess: game.word });
  assert.equal(correct.ok, true);
  assert.equal(correct.correct, true);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 'imposter');
  assert.equal(room.guessTimer, null);
  assert.equal(room.guessEndsAt, null);
});
