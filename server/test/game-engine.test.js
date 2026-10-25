'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WORDS, HINTS, makeGame, castVote, submitGuess, publicRoom, rebindPlayerIdentity } = require('../game-engine');
const players = n => Array.from({ length: n }, (_, i) => ({ id: `p${i+1}`, name: `Oyuncu ${i+1}`, connected: true }));
const fixedRng = () => 0.01;

test('every secret word has an Imposter hint', () => {
  const all = [...new Set(Object.values(WORDS).flat())];
  assert.equal(all.length, Object.keys(HINTS).length);
  assert.ok(all.every(word => HINTS[word]));
});
test('game creation respects player and Imposter counts', () => {
  const game = makeGame(players(6), { imposters: 2, category: 'yemek' }, fixedRng);
  assert.equal(game.alive.length, 6);
  assert.equal(Object.values(game.roles).filter(r => r.imposter).length, 2);
  assert.ok(WORDS.yemek.includes(game.word));
  assert.throws(() => makeGame(players(3), {}, fixedRng), /4 ile 12/);
  assert.throws(() => makeGame(players(4), { imposters: 2 }, fixedRng), /Masum oyuncu/);
});
test('public room state never leaks secret word or private roles', () => {
  const list = players(4); const room = { code:'ABC234', hostId:'p1', status:'playing', settings:{imposters:1,category:'genel'}, players:Object.fromEntries(list.map(p=>[p.id,p])), game:makeGame(list,{},fixedRng) };
  const state = publicRoom(room);
  assert.equal(Object.hasOwn(state, 'word'), false);
  assert.equal(JSON.stringify(state).includes(room.game.word), false);
  assert.ok(state.players.every(p => !Object.hasOwn(p, 'imposter')));
});
test('vote is accepted once per alive player and cannot target self', () => {
  const list = players(4); const byId = Object.fromEntries(list.map(p=>[p.id,p])); const game = makeGame(list,{},fixedRng); game.phase='voting';
  assert.throws(() => castVote(game, byId, 'p1', 'p1'), /Geçersiz/);
  assert.equal(castVote(game, byId, 'p1', 'p2'), null);
  assert.throws(() => castVote(game, byId, 'p1', 'p3'), /zaten oy/);
});
test('unanimous votes resolve and remove the selected player', () => {
  const list = players(4); const byId = Object.fromEntries(list.map(p=>[p.id,p])); const game = makeGame(list,{},fixedRng); game.phase='voting';
  const target = game.alive[3]; let result;
  for (const voter of game.alive.filter(id=>id!==target)) result = castVote(game, byId, voter, target);
  // A vote must be from every active player, so the target casts a vote too.
  if (!result) result = castVote(game, byId, target, game.alive.find(id=>id!==target));
  assert.ok(result);
  assert.equal(game.alive.includes(target), false);
  assert.equal(result.eliminatedId, target);
});
test('final Imposter guess rejects non-string and oversized payloads without ending the round', () => {
  const list = players(4);
  const game = makeGame(list, {}, () => 0.2);
  const imposterId = Object.keys(game.roles).find(id => game.roles[id].imposter);
  game.phase = 'guess'; game.alive = []; game.guesserId = imposterId;
  assert.throws(() => submitGuess(game, imposterId, [game.word]), /Tahmin metin olmalı/);
  assert.throws(() => submitGuess(game, imposterId, { value: game.word }), /Tahmin metin olmalı/);
  assert.throws(() => submitGuess(game, imposterId, 'x'.repeat(101)), /Tahmin metin olmalı/);
  assert.equal(game.phase, 'guess');
  assert.equal(game.winner, null);
});

test('only the final Imposter can guess and guess is case-insensitive', () => {
  const list = players(4); const game = makeGame(list,{},fixedRng); const imposters = Object.entries(game.roles).filter(([,r])=>r.imposter).map(([id])=>id);
  game.phase='guess'; game.alive = []; game.guesserId = imposters[0];
  assert.throws(() => submitGuess(game, list.find(p=>p.id!==imposters[0]).id, game.word), /yalnızca/);
  const result = submitGuess(game, imposters[0], game.word.toLocaleUpperCase('tr-TR'));
  assert.equal(result.guessCorrect, true); assert.equal(game.winner, 'imposter');
});
test('room serialization exposes only public game status', () => {
  const list = players(4); const room = { code:'XYZ234',hostId:'p1',status:'playing',settings:{imposters:1,category:'genel'},players:Object.fromEntries(list.map(p=>[p.id,p])),game:makeGame(list,{},fixedRng) };
  assert.equal(publicRoom(room).phase, 'reveal');
  assert.equal(publicRoom(room).aliveCount, 4);
});
test('tied vote keeps everyone alive and starts another discussion round', () => {
  const list = players(4); const byId = Object.fromEntries(list.map(p=>[p.id,p])); const game = makeGame(list,{},fixedRng); game.phase='voting';
  castVote(game, byId, 'p1', 'p2'); castVote(game, byId, 'p2', 'p1'); castVote(game, byId, 'p3', 'p4');
  const result = castVote(game, byId, 'p4', 'p3');
  assert.equal(result.tied, true); assert.equal(game.alive.length, 4); assert.equal(game.phase, 'discussion');
});
test('Imposter team wins when remaining imposters reach civilian count', () => {
  const list = players(6); const byId = Object.fromEntries(list.map(p=>[p.id,p])); const game = makeGame(list,{imposters:2},fixedRng);
  game.roles.p1.imposter=true; game.roles.p2.imposter=true;
  game.roles.p3.imposter=false; game.roles.p4.imposter=false;
  game.alive=['p1','p2','p3','p4']; game.phase='voting'; game.votes={};
  castVote(game, byId, 'p1', 'p3'); castVote(game, byId, 'p2', 'p3'); castVote(game, byId, 'p4', 'p3');
  const result=castVote(game, byId, 'p3', 'p4');
  assert.equal(result.winner, 'imposter'); assert.equal(game.phase, 'finished');
});


test('disconnected alive players do not freeze voting during the recovery window', () => {
  const list = players(4);
  const byId = Object.fromEntries(list.map(p => [p.id, p]));
  byId.p4.connected = false;
  const game = makeGame(list, {}, fixedRng);
  game.phase = 'voting';
  game.alive = ['p1', 'p2', 'p3', 'p4'];
  game.roles.p1.imposter = false; game.roles.p2.imposter = false; game.roles.p3.imposter = false; game.roles.p4.imposter = true;
  assert.equal(castVote(game, byId, 'p1', 'p4'), null);
  assert.equal(castVote(game, byId, 'p2', 'p4'), null);
  const result = castVote(game, byId, 'p3', 'p4');
  assert.ok(result, 'vote should resolve without waiting for disconnected p4');
  assert.equal(result.eliminatedId, 'p4');
});

test('reconnecting player identity preserves role, alive status, vote and final guess authority', () => {
  const list = players(4);
  const game = makeGame(list, {}, fixedRng);
  const imposterId = Object.entries(game.roles).find(([, role]) => role.imposter)[0];
  game.phase = 'voting';
  const targetId = game.alive.find(id => id !== imposterId);
  game.votes[imposterId] = targetId;
  game.guesserId = imposterId;
  game.lastResult = { eliminatedId: imposterId, tally: [{ id: imposterId, name: 'Oyuncu', votes: 2 }] };
  rebindPlayerIdentity(game, imposterId, 'restored-player-id');
  assert.ok(game.roles['restored-player-id']?.imposter);
  assert.ok(game.alive.includes('restored-player-id'));
  assert.equal(game.votes['restored-player-id'], targetId);
  assert.equal(game.guesserId, 'restored-player-id');
  assert.equal(game.lastResult.eliminatedId, 'restored-player-id');
  assert.equal(game.lastResult.tally[0].id, 'restored-player-id');
  assert.equal(Object.hasOwn(game.roles, imposterId), false);
});

test('public Imposter room shows connection/readiness/vote state but never the resume token', () => {
  const list = players(4).map(p => ({ ...p, resumeToken: 'secret-resume-token' }));
  const room = { code:'ABC234', hostId:'p1', status:'playing', settings:{imposters:1,category:'genel'}, players:Object.fromEntries(list.map(p=>[p.id,p])), game:makeGame(list,{},fixedRng) };
  room.players.p4.connected = false;
  room.game.phase = 'voting'; room.game.votes.p1 = 'p2'; room.game.votes.p4 = 'p3';
  const state = publicRoom(room);
  assert.equal(state.connectedCount, 3);
  assert.equal(state.connectedAliveCount, 3);
  assert.equal(state.votesExpected, 4, 'a disconnected player with an existing vote remains counted');
  assert.equal(state.players.find(p => p.id === 'p4').connected, false);
  assert.equal(state.players.find(p => p.id === 'p1').voted, true);
  assert.ok(state.players.every(p => !Object.hasOwn(p, 'resumeToken')));
  assert.equal(JSON.stringify(state).includes('secret-resume-token'), false);
});
