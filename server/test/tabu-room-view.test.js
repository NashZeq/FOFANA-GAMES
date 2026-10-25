'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeTabuRoom, chooseTabuTeam } = require('../tabu-room-view');
const { makeTabuGame, startTurn, publicTabuGame } = require('../tabu-engine');

function createRoom() {
  const players = {
    host: { id: 'host', name: 'Anlatıcı', team: 0 },
    guest: { id: 'guest', name: 'Tahminci', team: 1 }
  };
  const game = makeTabuGame(Object.values(players), { duration: 30 }, () => 0.1);
  startTurn(game, 0, () => 0.1);
  game.speakerId = 'host';
  game.lastAction = { kind: 'correct', team: 0, word: 'SECRET_NEXT_WORD' };
  return { code: 'ABC234', hostId: 'host', status: 'playing', players, game };
}

test('online Tabu sends target card only to the active explainer and never publishes it in action history', () => {
  const room = createRoom();
  const speakerState = serializeTabuRoom(room, 'host', publicTabuGame);
  const guesserState = serializeTabuRoom(room, 'guest', publicTabuGame);
  assert.ok(speakerState.game.card?.word);
  assert.equal(guesserState.game.card, null);
  assert.equal(guesserState.game.lastAction.word, undefined);
  assert.equal(speakerState.game.lastAction.word, undefined);
  assert.equal(guesserState.game.speakerId, 'host');
  assert.deepEqual(guesserState.game.score, [0, 0]);
});

test('a card from a completed turn is hidden until a new explainer starts', () => {
  const room = createRoom();
  room.game.speakerId = null;
  room.game.active = false;
  room.game.phase = 'ready';
  const state = serializeTabuRoom(room, 'host', publicTabuGame);
  assert.equal(state.game.card, null);
});

test('joining players are balanced automatically, explicit team choice is respected', () => {
  const players = [{ id: 'host', team: 0 }];
  assert.equal(chooseTabuTeam(players, 'auto'), 1);
  assert.equal(chooseTabuTeam([...players, { id: 'b', team: 1 }], 'auto'), 0);
  assert.equal(chooseTabuTeam(players, '1'), 1);
  assert.equal(chooseTabuTeam(players, '0'), 0);
});
