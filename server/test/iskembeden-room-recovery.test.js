'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createIskResumeToken, matchesIskResumeToken, resumeIskPlayer, RESUME_GRACE_MS } = require('../iskembeden-room-recovery');

const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
function fixture(now = 100_000) {
  const room = {
    code: 'ABC234', hostId: 'hostTemp', disconnectedHostId: 'oldHost', status: 'playing',
    players: {
      oldHost: { id: 'oldHost', name: 'Ada', connected: false, resumeToken: tokenA, disconnectedAt: now - 1000 },
      hostTemp: { id: 'hostTemp', name: 'Bora', connected: true, resumeToken: tokenB }
    },
    game: {
      phase: 'playing', scores: { oldHost: { score: 123, rounds: 1, bestDiff: 2 }, hostTemp: { score: 50, rounds: 1, bestDiff: 5 } },
      submissions: { oldHost: { guess: 42, diff: 2, earned: 123 }, hostTemp: { guess: 45, diff: 5, earned: 50 } },
      history: [{ round: 1, results: { oldHost: { guess: 42, diff: 2, earned: 123 }, hostTemp: { guess: 45, diff: 5, earned: 50 } } }],
      winnerIds: ['oldHost']
    }
  };
  return room;
}

test('Iskembeden resume tokens are random, fixed-length and compared safely', () => {
  const a = createIskResumeToken(), b = createIskResumeToken();
  assert.match(a, /^[a-f0-9]{64}$/); assert.match(b, /^[a-f0-9]{64}$/); assert.notEqual(a, b);
  assert.equal(matchesIskResumeToken(a, a), true); assert.equal(matchesIskResumeToken(a, 'bad'), false); assert.equal(matchesIskResumeToken(a, b), false);
});

test('recovery preserves score, current submission, history, winner and restores original host', () => {
  const room = fixture();
  const result = resumeIskPlayer(room, 'freshHost', tokenA, () => 'c'.repeat(64), 100_000);
  assert.ok(result); assert.equal(result.oldSocketId, 'oldHost'); assert.equal(result.player.name, 'Ada');
  assert.equal(result.player.connected, true); assert.equal(result.player.resumeToken, 'c'.repeat(64)); assert.equal(result.reclaimedHost, true);
  assert.equal(room.hostId, 'freshHost'); assert.equal(room.disconnectedHostId, null); assert.equal(room.players.oldHost, undefined);
  assert.deepEqual(room.game.scores.freshHost, { score: 123, rounds: 1, bestDiff: 2 });
  assert.deepEqual(room.game.submissions.freshHost, { guess: 42, diff: 2, earned: 123 });
  assert.ok(!Object.hasOwn(room.game.scores, 'oldHost')); assert.deepEqual(room.game.winnerIds, ['freshHost']);
  assert.ok(room.game.history[0].results.freshHost); assert.ok(!Object.hasOwn(room.game.history[0].results, 'oldHost'));
});

test('rotated token cannot be replayed and a connected player cannot be taken over', () => {
  const room = fixture();
  assert.ok(resumeIskPlayer(room, 'freshHost', tokenA, () => 'c'.repeat(64), 100_000));
  assert.equal(resumeIskPlayer(room, 'replay', tokenA, () => 'd'.repeat(64), 100_000), null);
  assert.equal(resumeIskPlayer(room, 'attacker', tokenB, () => 'd'.repeat(64), 100_000), null);
});

test('resume is rejected outside the grace window and tokens are never added to public room data by recovery helper', () => {
  const room = fixture();
  assert.equal(resumeIskPlayer(room, 'tooLate', tokenA, () => 'c'.repeat(64), 100_000 + RESUME_GRACE_MS + 1), null);
  assert.equal(room.players.oldHost.connected, false);
  assert.equal(room.players.oldHost.resumeToken, tokenA);
});
