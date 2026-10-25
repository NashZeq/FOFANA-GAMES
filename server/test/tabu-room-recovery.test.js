'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeTabuGame, startTurn, pauseTurn, publicTabuGame } = require('../tabu-engine');
const { serializeTabuRoom } = require('../tabu-room-view');
const { createTabuResumeToken, matchesResumeToken, resumeTabuPlayer } = require('../tabu-room-recovery');

const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
function roomFixture() {
  const players = {
    oldHost: { id: 'oldHost', name: 'Anlatıcı', team: 0, connected: false, resumeToken: tokenA },
    guesser: { id: 'guesser', name: 'Tahminci', team: 1, connected: true, resumeToken: tokenB }
  };
  const game = makeTabuGame(Object.values(players), { duration: 45, targetScore: 20 }, () => 0.1);
  startTurn(game, 0, () => 0.1);
  pauseTurn(game, 0);
  game.speakerId = 'oldHost';
  return {
    code: 'ABC234', hostId: 'guesser', disconnectedHostId: 'oldHost', status: 'playing', players, game,
    reconnectPausedSpeakerId: 'oldHost', reconnectWasActiveBeforeDisconnect: true
  };
}

test('resume tokens are cryptographically random-sized and malformed tokens fail safely', () => {
  const a = createTabuResumeToken();
  const b = createTabuResumeToken();
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.match(b, /^[a-f0-9]{64}$/);
  assert.notEqual(a, b);
  assert.equal(matchesResumeToken(a, a), true);
  assert.equal(matchesResumeToken(a, 'not-a-token'), false);
  assert.equal(matchesResumeToken(a, b), false);
});

test('disconnected speaker resumes with role, team and host privileges rebound to new socket ID', () => {
  const room = roomFixture();
  const beforeCard = room.game.cardIndex;
  const result = resumeTabuPlayer(room, 'freshSocket', tokenA, () => 'c'.repeat(64));
  assert.ok(result);
  assert.equal(result.oldSocketId, 'oldHost');
  assert.equal(result.player.name, 'Anlatıcı');
  assert.equal(result.player.team, 0);
  assert.equal(result.player.connected, true);
  assert.equal(result.player.resumeToken, 'c'.repeat(64));
  assert.equal(result.shouldResumeTurn, true);
  assert.equal(room.hostId, 'freshSocket');
  assert.equal(room.game.speakerId, 'freshSocket');
  assert.equal(room.game.cardIndex, beforeCard);
  assert.equal(room.reconnectPausedSpeakerId, null);
  assert.equal(room.players.oldHost, undefined);
  assert.equal(room.players.freshSocket.id, 'freshSocket');
});

test('a rotated token cannot be replayed after successful recovery', () => {
  const room = roomFixture();
  const result = resumeTabuPlayer(room, 'freshSocket', tokenA, () => 'c'.repeat(64));
  assert.ok(result);
  assert.equal(resumeTabuPlayer(room, 'thirdSocket', tokenA, () => 'd'.repeat(64)), null);
  assert.equal(resumeTabuPlayer(room, 'thirdSocket', 'c'.repeat(64), () => 'd'.repeat(64)), null, 'connected players cannot be resumed twice');
});

test('connected players cannot be taken over even if the token is valid', () => {
  const room = roomFixture();
  assert.equal(resumeTabuPlayer(room, 'attacker', tokenB, () => 'd'.repeat(64)), null);
  assert.equal(room.players.guesser.connected, true);
  assert.ok(room.players.guesser);
});

test('reconnect data and resume token never leak through room snapshots', () => {
  const room = roomFixture();
  const state = serializeTabuRoom(room, 'guesser', publicTabuGame);
  const json = JSON.stringify(state);
  assert.equal(state.players.find(p => p.id === 'oldHost').connected, false);
  assert.equal(json.includes(tokenA), false);
  assert.equal(json.includes('resumeToken'), false);
  assert.equal(state.game.card, null);
});
