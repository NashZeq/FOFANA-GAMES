'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { QUESTIONS, ROUND_OPTIONS, createGame, scoreGuess, publicGame, nextQuestion, finalizeRoundIfReady } = require('../iskembeden-engine');
const players = [{id:'p1',name:'Ada'},{id:'p2',name:'Bora'},{id:'p3',name:'Cem'}];
test('Iskembeden requires at least two players and a valid category', () => {
  assert.throws(() => createGame([players[0]], 'age'), /en az 2/);
  assert.throws(() => createGame(players, 'invalid'), /Geçersiz kategori/);
});
test('question answer is hidden until every player submits', () => {
  const game = createGame(players, 'age');
  const first = publicGame(game, players, 'p1');
  assert.equal(first.answer, null);
  assert.equal(first.allSubmitted, false);
  assert.equal(first.question.q, game.question.q);
  assert.equal(Object.hasOwn(first, 'secretAnswer'), false);
  scoreGuess(game, 'p1', game.question.a);
  const stillPrivate = publicGame(game, players, 'p2');
  assert.equal(stillPrivate.answer, null);
  assert.equal(stillPrivate.players.find(p => p.id === 'p1').submitted, true);
  assert.equal(stillPrivate.results.length, 0);
});
test('exact age guess awards 100 and only once', () => {
  const game = createGame(players, 'age');
  const answer = game.question.a;
  const result = scoreGuess(game, 'p1', answer);
  assert.equal(result.submitted, 1);
  assert.equal(game.scores.p1.score, 100);
  assert.throws(() => scoreGuess(game, 'p1', answer), /zaten tahmin/);
});
test('price scoring uses percentage difference and floors at zero', () => {
  const game = createGame(players, 'market');
  assert.equal(scoreGuess(game, 'p1', game.question.a).submitted, 1);
  assert.equal(game.scores.p1.score, 1000);
  const game2 = createGame(players, 'market');
  scoreGuess(game2, 'p1', game2.question.a * 2);
  assert.equal(game2.scores.p1.score, 0);
});
test('invalid guesses are rejected without changing score', () => {
  const game = createGame(players, 'age');
  for (const value of ['', -1, 'NaN', Infinity]) assert.throws(() => scoreGuess(game, 'p1', value));
  assert.equal(game.scores.p1.rounds, 0);
  assert.equal(Object.keys(game.submissions).length, 0);
});
test('correct answer and leaderboard reveal only after all players submit', () => {
  const game = createGame(players, 'car');
  const answer = game.question.a;
  scoreGuess(game, 'p1', answer);
  scoreGuess(game, 'p2', answer + 500000);
  assert.equal(publicGame(game, players, 'p3').allSubmitted, false);
  const result = scoreGuess(game, 'p3', answer);
  assert.equal(result.allSubmitted, true);
  const publicState = publicGame(game, players, 'p1');
  assert.equal(publicState.answer, answer);
  assert.equal(publicState.results.length, 3);
  assert.equal(publicState.results[0].earned, 1000);
  assert.equal(publicState.players.find(p => p.id === 'p1').score, 1000);
});
test('next question clears submissions and increments round', () => {
  const game = createGame(players, 'age');
  const firstRound = game.round;
  for (const p of players) scoreGuess(game, p.id, game.question.a);
  nextQuestion(game);
  assert.equal(game.round, firstRound + 1);
  assert.equal(Object.keys(game.submissions).length, 0);
  assert.equal(publicGame(game, players, 'p1').answer, null);
});
test('a player not in the room cannot submit a guess', () => {
  const game = createGame(players, 'age');
  assert.throws(() => scoreGuess(game, 'outsider', 30), /bu oyunda değil/);
});


test('question pools support every supported match length without repeats', () => {
  assert.deepEqual(ROUND_OPTIONS, [3, 5]);
  for (const category of ['age', 'market', 'car']) {
    assert.ok(QUESTIONS[category].length >= (category === 'age' ? 15 : 10), `${category} pool has replay variety beyond a five-question match`);
    assert.equal(new Set(QUESTIONS[category].map(q => q.q)).size, QUESTIONS[category].length);
  }
  assert.equal(createGame(players, 'car', 10).maxRounds, 5, 'unsupported limits fall back to a valid five-question game');
});

test('only supported round limits are accepted and the game ends on its last completed round', () => {
  const game = createGame(players, 'age', 3);
  assert.equal(game.maxRounds, 3);
  for (let round = 1; round <= 3; round++) {
    for (const p of players) scoreGuess(game, p.id, game.question.a);
    if (round < 3) nextQuestion(game);
  }
  assert.equal(game.phase, 'finished');
  assert.equal(game.round, 3);
  assert.equal(game.history.length, 3);
  assert.ok(game.winnerIds.length >= 1);
  assert.throws(() => nextQuestion(game), /geçemiyor|Maç tamamlandı/);
});

test('a current-round guess and earned points are hidden until everyone submits', () => {
  const game = createGame(players, 'market', 3);
  const answer = game.question.a;
  scoreGuess(game, 'p1', answer + 10);
  const p2View = publicGame(game, players, 'p2');
  const p1Public = p2View.players.find(p => p.id === 'p1');
  assert.equal(p1Public.submitted, true);
  assert.equal(p1Public.score, 0, 'current-round earned points are not leaked through cumulative score');
  assert.equal(p1Public.rounds, 0, 'current-round stats are masked until reveal');
  assert.equal(p1Public.bestDiff, null, 'the current round must not update visible best difference early');
  assert.deepEqual(p2View.submissions.p1, { submitted: true });
  assert.deepEqual(p2View.ownSubmission, null);
  assert.deepEqual(publicGame(game, players, 'p1').ownSubmission, { submitted: true }, 'the submitter also cannot inspect score/difference before reveal');
  assert.equal(p2View.answer, null);
  scoreGuess(game, 'p2', answer);
  const stillWaiting = publicGame(game, players, 'p3');
  assert.equal(stillWaiting.players.find(p => p.id === 'p1').score, 0);
  assert.equal(stillWaiting.results.length, 0);
  scoreGuess(game, 'p3', answer);
  const revealed = publicGame(game, players, 'p1');
  assert.equal(revealed.ownSubmission.guess, answer + 10);
  assert.equal(revealed.players.find(p => p.id === 'p1').score, game.scores.p1.score);
  assert.equal(revealed.results.length, 3);
});

test('blank and fractional age guesses are rejected without changing statistics', () => {
  const game = createGame(players, 'age', 3);
  assert.throws(() => scoreGuess(game, 'p1', '   '), /geçerli bir sayı/);
  assert.throws(() => scoreGuess(game, 'p1', 52.5), /tam sayı/);
  assert.equal(game.scores.p1.score, 0);
  assert.equal(Object.keys(game.submissions).length, 0);
});

test('next question cannot start while any active player has not submitted', () => {
  const game = createGame(players, 'car', 3);
  scoreGuess(game, 'p1', game.question.a);
  assert.throws(() => nextQuestion(game), /Herkes mevcut soru/);
  assert.equal(game.round, 1);
});

test('a disconnected player can cause a submitted round to close without duplicate history', () => {
  const game = createGame(players, 'age', 3);
  scoreGuess(game, 'p1', game.question.a);
  scoreGuess(game, 'p2', game.question.a + 1);
  delete game.scores.p3;
  delete game.submissions.p3;
  // Removing a player is handled by the server through finalizeRoundIfReady.
  const { finalizeRoundIfReady } = require('../iskembeden-engine');
  assert.equal(finalizeRoundIfReady(game), true);
  assert.equal(game.history.length, 1);
  assert.equal(finalizeRoundIfReady(game), true);
  assert.equal(game.history.length, 1);
});

test('question timer starts at 45 seconds and resets after advancing', () => {
  const { QUESTION_SECONDS } = require('../iskembeden-engine');
  const game = createGame(players, 'age', 3);
  assert.equal(game.remainingSeconds, QUESTION_SECONDS);
  assert.equal(QUESTION_SECONDS, 45);
  for (const p of players) scoreGuess(game, p.id, game.question.a);
  game.remainingSeconds = 1;
  nextQuestion(game);
  assert.equal(game.remainingSeconds, QUESTION_SECONDS);
});

test('round expiry gives missing answers zero points and reveals timeout state only after expiry', () => {
  const { expireRound } = require('../iskembeden-engine');
  const game = createGame(players, 'age', 3);
  scoreGuess(game, 'p1', game.question.a);
  const beforeExpiry = publicGame(game, players, 'p2');
  assert.equal(beforeExpiry.answer, null);
  assert.deepEqual(beforeExpiry.submissions.p1, { submitted: true });
  assert.equal(expireRound(game), true);
  assert.equal(game.scores.p1.score, 100);
  assert.equal(game.scores.p2.score, 0);
  assert.equal(game.scores.p3.score, 0);
  assert.equal(game.submissions.p2.forfeited, true);
  assert.equal(game.submissions.p2.earned, 0);
  assert.equal(game.history.length, 1);
  const afterExpiry = publicGame(game, players, 'p2');
  assert.equal(afterExpiry.allSubmitted, true);
  assert.equal(afterExpiry.ownSubmission.forfeited, true);
  assert.equal(afterExpiry.ownSubmission.guess, null);
  assert.equal(afterExpiry.ownSubmission.earned, 0);
  assert.equal(afterExpiry.results.find(r => r.id === 'p2').forfeited, true);
  assert.equal(afterExpiry.answer, game.question.a);
});

test('a timeout on the last question closes the match and determines the winner', () => {
  const { expireRound } = require('../iskembeden-engine');
  const game = createGame(players, 'age', 3);
  for (let round = 1; round < 3; round++) {
    for (const p of players) scoreGuess(game, p.id, game.question.a);
    nextQuestion(game);
  }
  scoreGuess(game, 'p1', game.question.a);
  assert.equal(expireRound(game), true);
  assert.equal(game.phase, 'finished');
  assert.equal(game.history.length, 3);
  assert.ok(game.winnerIds.includes('p1'));
});


test('mixed units do not use incomparable raw differences to break total-score ties', () => {
  const game = createGame(players, 'market', 3);
  game.round = game.maxRounds;
  game.phase = 'playing';
  game.question = { q: 'Test %', a: 1, unit: '%' };
  game.scores.p1 = { score: 1200, rounds: 3, bestDiff: 50000 };
  game.scores.p2 = { score: 1200, rounds: 3, bestDiff: 0.01 };
  game.scores.p3 = { score: 900, rounds: 3, bestDiff: 0.2 };
  game.submissions = {
    p1: { guess: 1, diff: 0, earned: 1000 },
    p2: { guess: 1, diff: 0, earned: 1000 },
    p3: { guess: 1, diff: 0, earned: 700 }
  };
  assert.equal(finalizeRoundIfReady(game), true);
  assert.deepEqual(game.winnerIds.sort(), ['p1', 'p2']);
  const view = publicGame(game, players, 'p1');
  assert.deepEqual(view.standings.slice(0, 2).map(p => p.id).sort(), ['p1', 'p2']);
});


test('every question has usable numeric answer, unit, and a traceable source', () => {
  for (const [category, questions] of Object.entries(QUESTIONS)) {
    for (const q of questions) {
      assert.equal(typeof q.q, 'string', `${category} question text`);
      assert.ok(q.q.trim().length > 15, `${category} prompt should have enough context`);
      assert.equal(typeof q.a, 'number', `${category} answer is numeric`);
      assert.ok(Number.isFinite(q.a) && q.a >= 0, `${category} answer is finite and nonnegative`);
      assert.ok(['yaş', 'TL', '%'].includes(q.unit), `${category} uses a supported unit`);
      assert.match(q.url, /^https:\/\//, `${category} source uses HTTPS`);
      assert.ok(q.source && q.date && q.note, `${category} question documents source/date/context`);
    }
  }
});

test('market and car best-difference stats are stored per unit, not compared as raw mixed-unit numbers', () => {
  const game = createGame(players, 'market', 3);
  game.question = { q: 'Test TL', a: 100, unit: 'TL', note: '', date: '', url: '', source: '' };
  for (const p of players) scoreGuess(game, p.id, p.id === 'p1' ? 100.01 : 100);
  nextQuestion(game);
  game.question = { q: 'Test percent', a: 1, unit: '%', note: '', date: '', url: '', source: '' };
  scoreGuess(game, 'p1', 21);
  assert.ok(Math.abs(game.scores.p1.bestDiffByUnit.TL - 0.01) < 1e-9);
  assert.equal(game.scores.p1.bestDiffByUnit['%'], 20);
  assert.equal(game.scores.p1.bestDiff, 20, 'legacy bestDiff points to latest unit and does not take minimum across TL and %');
  const otherView = publicGame(game, players, 'p2');
  const p1Public = otherView.players.find(p => p.id === 'p1');
  assert.equal(p1Public.bestDiffByUnit.TL, game.scores.p1.bestDiffByUnit.TL);
  assert.equal(Object.hasOwn(p1Public.bestDiffByUnit, '%'), false, 'current-round percent accuracy remains hidden until everyone answers');
  scoreGuess(game, 'p2', 1); scoreGuess(game, 'p3', 1);
  const revealed = publicGame(game, players, 'p2').players.find(p => p.id === 'p1');
  assert.equal(revealed.bestDiffByUnit['%'], 20);
});

test('celebrity question image attribution is shared to every remote phone with its question',()=>{
  const game=createGame(players,'age');
  game.question=QUESTIONS.age.find(q=>q.image);
  const data=publicGame(game,players,'p1');
  assert.ok(data.question.image.startsWith('https://commons.wikimedia.org/'));
  assert.ok(data.question.imagePage.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert.ok(data.question.imageCredit);
  assert.ok(data.question.imageLicense);
});
