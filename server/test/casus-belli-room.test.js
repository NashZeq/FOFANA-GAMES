'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CB = require('../casus-belli-room');
function twoReadyRoom() {
  const room = CB.createRoom({ code: 'ABC234', hostId: 'p1', name: '  Komutan   Ada ' });
  CB.joinRoom(room, { playerId: 'p2', name: 'Komutan Bora' });
  CB.setReady(room, 'p1', true); CB.setReady(room, 'p2', true);
  return room;
}
test('Casus Belli oda adı temizlenir ve gizli resume token public state içinde bulunmaz', () => {
  const room = CB.createRoom({ code: 'ABC234', hostId: 'p1', name: '<Ada>\n' });
  assert.equal(room.players.p1.name, 'Ada');
  const pub = CB.publicRoom(room, 'p1');
  assert.equal(pub.players[0].resumeToken, undefined);
  assert.equal(pub.players[0].isHost, true);
});
test('iki kişilik sınır ve yinelenen isim reddedilir', () => {
  const room = CB.createRoom({ code: 'ABC234', hostId: 'p1', name: 'Ada' });
  assert.throws(() => CB.joinRoom(room, { playerId: 'p2', name: ' ada ' }), /aynı isim/);
  CB.joinRoom(room, { playerId: 'p2', name: 'Bora' });
  assert.throws(() => CB.joinRoom(room, { playerId: 'p3', name: 'Cem' }), /iki oyuncuyla sınırlı/);
});
test('lobiye katılım mevcut oyuncunun kimliğini ezemez ve boş kimliği reddeder', () => {
  const room = CB.createRoom({ code: 'ABC234', hostId: 'p1', name: 'Ada' });
  const host = room.players.p1;
  assert.throws(() => CB.joinRoom(room, { playerId: 'p1', name: 'Saldırgan' }), /zaten kullanılıyor/);
  assert.throws(() => CB.joinRoom(room, { playerId: '', name: 'Bora' }), /kimliği gerekli/);
  assert.throws(() => CB.joinRoom(room, { playerId: '   ', name: 'Bora' }), /kimliği gerekli/);
  assert.equal(room.players.p1, host);
  assert.equal(Object.keys(room.players).length, 1);
});
test('oyun yalnızca oda sahibi tarafından, iki oyuncu da hazırken başlar', () => {
  const room = CB.createRoom({ code: 'ABC234', hostId: 'p1', name: 'Ada' });
  CB.joinRoom(room, { playerId: 'p2', name: 'Bora' });
  assert.throws(() => CB.startGame(room, 'p1'), /hazır olmalı/);
  CB.setReady(room, 'p1', true); CB.setReady(room, 'p2', true);
  assert.throws(() => CB.startGame(room, 'p2'), /yalnızca oda sahibi/);
  CB.startGame(room, 'p1');
  assert.equal(room.status, 'playing'); assert.equal(room.game.phase, 'draw');
  assert.throws(() => CB.setReady(room, 'p1', false), /başladıktan sonra/);
});
test('90 saniye içinde oturum kurtarma oyuncuyu ve host yetkisini yeni soket kimliğine taşır', () => {
  const room = twoReadyRoom();
  const { resumeToken } = CB.markDisconnected(room, 'p1');
  assert.equal(CB.resumePlayer(room, 'p1-new', resumeToken, Date.now() + 1000).id, 'p1-new');
  assert.equal(room.hostId, 'p1-new');
  assert.equal(room.players['p1-new'].connected, true);
});
test('hedef seçimi sırasında yeniden bağlanan oyuncunun Avcı ve Rahip seçimleri kuyruk sırasıyla kurtarılır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.played = [
    { id: 'hunter-reconnect', name: 'Avcı', type: 'support', color: 'green', speed: 'Çok hızlı', usedEffect: 0 },
    { id: 'priest-reconnect', name: 'Rahip', type: 'support', color: 'green', speed: 'Yavaş', usedEffect: 0 }
  ];
  b.played = [
    { id: 'hunter-p2-reconnect', name: 'Avcı', type: 'support', color: 'red', speed: 'Çok hızlı', usedEffect: 0 },
    { id: 'queen-reconnect-target', name: 'Kraliçe', type: 'support', color: 'red', speed: 'Çok yavaş', usedEffect: 1 }
  ];
  b.supportGrave = [{ id: 'support-grave-reconnect', name: 'Simyacı', type: 'support', color: 'red', speed: 'Yavaş', effects: ['Geri al', 'Deste etkisi'] }];
  room.game.phase = 'support-target-choice';
  room.game.supportTargetQueue = [
    { ownerId: 'p1', cardId: 'hunter-reconnect', kind: 'hunter-support', rank: -1 },
    { ownerId: 'p1', cardId: 'priest-reconnect', kind: 'priest-grave', rank: 2 },
    { ownerId: 'p2', cardId: 'hunter-p2-reconnect', kind: 'hunter-support', rank: -1 }
  ];
  room.game.supportTargetIndex = 0;
  room.game.supportTargetOwnerId = 'p1';
  const disconnected = CB.markDisconnected(room, 'p1', 10_000);
  assert.equal(CB.resumePlayer(room, 'p1-reconnected', disconnected.resumeToken, 11_000).id, 'p1-reconnected');
  assert.equal(room.game.supportTargetOwnerId, 'p1-reconnected');
  assert.deepEqual(room.game.supportTargetQueue.map(item => item.ownerId), ['p1-reconnected', 'p1-reconnected', 'p2']);
  let view = CB.publicRoom(room, 'p1-reconnected').game;
  assert.equal(view.canChooseSupportTarget, true);
  assert.equal(view.supportTarget.kind, 'hunter-support');
  assert.deepEqual(view.supportTarget.options.map(option => option.id), ['hunter-p2-reconnect', 'queen-reconnect-target']);

  CB.chooseSupportTarget(room, 'p1-reconnected', { targetCardId: 'queen-reconnect-target' });
  view = CB.publicRoom(room, 'p1-reconnected').game;
  assert.equal(room.game.phase, 'support-target-choice');
  assert.equal(room.game.supportTargetOwnerId, 'p1-reconnected');
  assert.equal(view.supportTarget.kind, 'priest-grave');
  assert.deepEqual(view.supportTarget.options.map(option => option.value), ['support']);

  CB.chooseSupportTarget(room, 'p1-reconnected', { graveType: 'support' });
  assert.equal(room.game.phase, 'support-target-choice');
  assert.equal(room.game.supportTargetOwnerId, 'p2');
  assert.equal(CB.publicRoom(room, 'p2').game.canChooseSupportTarget, true);
  CB.chooseSupportTarget(room, 'p2', { targetCardId: 'hunter-reconnect' });
  assert.equal(room.game.phase, 'revealed');
});

test('çözülmüş çatışmadan sonra yeniden bağlanınca sonuç kazananını ve skor anahtarlarını korur', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  room.game.phase = 'resolved';
  room.game.result = {
    round: 3, winnerId: 'p1', matchWinnerId: 'p1', matchLoserId: 'p2',
    scores: { p1: 8, p2: 4 },
    scoreDetails: { p1: [{ id: 'a', finalPoints: 8 }], p2: [{ id: 'b', finalPoints: 4 }] },
    armyLost: { p1: [], p2: ['Piyade'] }
  };
  const disconnected = CB.markDisconnected(room, 'p1', 20_000);
  CB.resumePlayer(room, 'p1-resumed', disconnected.resumeToken, 21_000);
  assert.equal(room.game.result.winnerId, 'p1-resumed');
  assert.equal(room.game.result.matchWinnerId, 'p1-resumed');
  assert.equal(room.game.result.matchLoserId, 'p2');
  assert.deepEqual(room.game.result.scores, { p2: 4, 'p1-resumed': 8 });
  assert.equal(room.game.result.scoreDetails['p1-resumed'][0].finalPoints, 8);
  assert.deepEqual(room.game.result.armyLost['p1-resumed'], []);
  assert.equal(room.game.result.scores.p1, undefined);
});

test('90 saniyeyi aşan veya yanlış token ile oturum kurtarılamaz', () => {
  const room = twoReadyRoom();
  const { resumeToken, disconnectedAt } = CB.markDisconnected(room, 'p2');
  assert.equal(CB.resumePlayer(room, 'p2-new', 'wrong', disconnectedAt + 1000), null);
  assert.equal(CB.resumePlayer(room, 'p2-new', resumeToken, disconnectedAt + CB.RESUME_GRACE_MS + 1), null);
});

test('yinelenen disconnect bildirimi yeniden bağlanma süresini uzatmaz', () => {
  const room = twoReadyRoom();
  const first = CB.markDisconnected(room, 'p2', 10_000);
  const revisionAfterFirst = room.revision;
  const duplicate = CB.markDisconnected(room, 'p2', 80_000);
  assert.deepEqual(duplicate, first);
  assert.equal(room.revision, revisionAfterFirst);
  assert.equal(CB.resumePlayer(room, 'p2-new', first.resumeToken, 10_000 + CB.RESUME_GRACE_MS + 1), null);
});

test('başarılı oturum kurtarma eski tokenın yeniden kullanılmasını engeller', () => {
  const room = twoReadyRoom();
  const { resumeToken, disconnectedAt } = CB.markDisconnected(room, 'p2', 20_000);
  const resumed = CB.resumePlayer(room, 'p2-new', resumeToken, disconnectedAt + 1000);
  assert.ok(resumed.resumeToken);
  assert.notEqual(resumed.resumeToken, resumeToken);
  assert.equal(CB.resumePlayer(room, 'p2-again', resumeToken, disconnectedAt + 2000), null);
});

test('gelecek zamanlı disconnect damgası ile oturum kurtarma reddedilir', () => {
  const room = twoReadyRoom();
  const { resumeToken } = CB.markDisconnected(room, 'p2', 50_000);
  assert.equal(CB.resumePlayer(room, 'p2-new', resumeToken, 49_999), null);
});
test('oyuncu ayrılınca host aktarılır; boş oda silinmeye hazır olur', () => {
  const room = twoReadyRoom();
  assert.deepEqual(CB.leaveRoom(room, 'p1'), { deleted: false });
  assert.equal(room.hostId, 'p2');
  assert.deepEqual(CB.leaveRoom(room, 'p2'), { deleted: true });
});

test('sunucu kart çekimini ve gizli eli oyuncu bazında sınırlar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const p1 = CB.publicRoom(room, 'p1'), p2 = CB.publicRoom(room, 'p2');
  assert.equal(p1.game.hand.length, 0); assert.equal(p2.game.hand.length, 0);
  CB.drawCard(room, 'p1', 'army'); CB.drawCard(room, 'p1', 'support');
  assert.equal(CB.publicRoom(room, 'p1').game.hand.length, 2);
  assert.equal(CB.publicRoom(room, 'p2').game.opponents[0].handCount, 2);
  assert.equal(CB.publicRoom(room, 'p2').game.hand.length, 0);
  assert.throws(() => CB.drawCard(room, 'p1', 'army'), /iki kart/);
});
test('iki oyuncunun da iki kart çekmesi kapalı hamle aşamasını açar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  for (const id of ['p1', 'p2']) { CB.drawCard(room, id, 'army'); CB.drawCard(room, id, 'support'); }
  assert.equal(room.game.phase, 'play');
  const p1Hand = CB.publicRoom(room, 'p1').game.hand;
  CB.submitCards(room, 'p1', [p1Hand[0].id]);
  assert.equal(CB.publicRoom(room, 'p2').game.opponents[0].submitted, true);
  assert.equal(CB.publicRoom(room, 'p2').game.revealed, null);
  const p2Hand = CB.publicRoom(room, 'p2').game.hand;
  CB.submitCards(room, 'p2', [p2Hand[0].id]);
  assert.equal(room.game.phase, 'revealed');
  assert.equal(CB.publicRoom(room, 'p1').game.revealed.length, 2);
});
test('oyuncu sadece elindeki kartları oynayabilir ve yeni turu sadece host başlatır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  for (const id of ['p1', 'p2']) { CB.drawCard(room, id, 'army'); CB.drawCard(room, id, 'support'); }
  assert.throws(() => CB.submitCards(room, 'p1', ['not-a-card']), /elinde değil/);
  for (const id of ['p1', 'p2']) { const hand = CB.publicRoom(room, id).game.hand; CB.submitCards(room, id, [hand[0].id]); }
  CB.resolveCombat(room, 'p1');
  assert.throws(() => CB.nextRound(room, 'p2'), /yalnızca oda sahibi/);
  CB.nextRound(room, 'p1'); assert.equal(room.game.round, 2); assert.equal(room.game.phase, 'draw');
});

test('çatışma yalnızca oda sahibi tarafından sunucuda çözülür ve ordu puanları hesaplanır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const p1 = room.game.sides.p1, p2 = room.game.sides.p2;
  p1.drew = p2.drew = 2; room.game.phase = 'play';
  p1.hand = [{ id: 'p1-peasant', name: 'Köylü', type: 'army', color: 'green', points: 1, effectType: 'army-neighbor-bonus', icon: '🌾' }, { id: 'p1-foot', name: 'Piyade', type: 'army', color: 'green', points: 4, effectType: 'none', icon: '🪖' }];
  p2.hand = [{ id: 'p2-monk', name: 'Keşiş', type: 'army', color: 'red', points: 2, effectType: 'isolated-bonus', icon: '✴️' }];
  CB.submitCards(room, 'p1', ['p1-peasant', 'p1-foot']);
  CB.submitCards(room, 'p2', ['p2-monk']);
  assert.throws(() => CB.resolveCombat(room, 'p2'), /yalnızca oda sahibi/);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'resolved');
  assert.equal(result.game.result.scores.p1, 8); // Köylü gets 4 next to another Army card; Piyade 4.
  assert.equal(result.game.result.scores.p2, 6); // isolated Keşiş.
  assert.equal(result.game.result.winnerId, 'p1');
  assert.equal(result.game.result.scoreDetails.p1[0].finalPoints, 4);
  CB.nextRound(room, 'p1');
  assert.equal(room.game.round, 2);
  assert.equal(room.game.phase, 'draw');
});

test('çatışma sonucu gizli oturum anahtarlarını veya rakibin elini açığa çıkarmaz', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  for (const id of ['p1', 'p2']) { CB.drawCard(room, id, 'army'); CB.drawCard(room, id, 'support'); }
  for (const id of ['p1', 'p2']) { const hand = CB.publicRoom(room, id).game.hand; CB.submitCards(room, id, [hand[0].id]); }
  CB.resolveCombat(room, 'p1');
  const otherView = CB.publicRoom(room, 'p2');
  assert.equal(otherView.players.some(player => player.resumeToken), false);
  assert.equal(otherView.game.hand.length, 0);
  assert.ok(otherView.game.result);
  assert.equal(otherView.game.revealed.length, 2);
});

test('Destek kartı yetenek seçimi sunucu tarafından doğrulanır ve sonuçta kaydedilir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const p1 = room.game.sides.p1, p2 = room.game.sides.p2;
  p1.drew = p2.drew = 2; room.game.phase = 'play';
  p1.hand = [{ id: 'p1-smith', name: 'Demirci', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['Çöp kartını yeniden oynayın', 'Dost Ordu kartlarını ikiye katlayın'] }, { id: 'p1-foot', name: 'Piyade', type: 'army', color: 'green', points: 4, effectType: 'none' }];
  p2.hand = [{ id: 'p2-foot', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  assert.throws(() => CB.submitCards(room, 'p1', ['p1-smith'], { 'p1-smith': 3 }), /Geçersiz destek/);
  CB.submitCards(room, 'p1', ['p1-smith', 'p1-foot'], { 'p1-smith': 1 });
  CB.submitCards(room, 'p2', ['p2-foot']);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(result.game.result.scores.p1, 8);
  assert.ok(result.game.result.supportLog.some(line => line.includes('Demirci')));
});

test('Prens etkisi sunucuda hesaplanır ve seçilen destek yeteneği saklanır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const p1 = room.game.sides.p1, p2 = room.game.sides.p2;
  p1.drew = p2.drew = 2; room.game.phase = 'play';
  p1.hand = [{ id: 'prens', name: 'Prens', type: 'army', color: 'green', points: 3, effectType: 'friendly-army-plus-three' }, { id: 'foot', name: 'Piyade', type: 'army', color: 'green', points: 4, effectType: 'none' }];
  p2.hand = [{ id: 'king-support', name: 'Kral', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Rakip Ordu kartlarını 1 puan kabul edin', 'Fazladan kart çekin'] }, { id: 'red-foot', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['prens', 'foot']); CB.submitCards(room, 'p2', ['king-support', 'red-foot'], { 'king-support': 1 });
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(result.game.result.scoreDetails.p1.find(c => c.name === 'Piyade').finalPoints, 7);
  assert.equal(result.game.result.scoreDetails.p2.find(c => c.name === 'Piyade').finalPoints, 4);
});


test('Kralın ilk yeteneği mevcut çatışmayı etkilemez, sonraki iki turu 1 puana indirir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const p1 = room.game.sides.p1, p2 = room.game.sides.p2;
  p1.drew = p2.drew = 2; room.game.phase = 'play';
  p1.hand = [{ id: 'red-target', name: 'Şövalye', type: 'army', color: 'green', points: 8, effectType: 'none' }];
  p2.hand = [{ id: 'king-support-2', name: 'Kral', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Rakip Ordu kartlarını 1 puan kabul edin', 'Fazladan kart çekin'] }, { id: 'red-target-2', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['red-target']); CB.submitCards(room, 'p2', ['king-support-2', 'red-target-2'], { 'king-support-2': 0 });
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(result.game.result.scoreDetails.p1[0].finalPoints, 8);
  assert.equal(p1.status.armyOnePointTurns, 3);
  assert.ok(result.game.result.supportLog.some(line => line.includes('sonraki 2 turundaki Ordu kartlarını 1 puan')));
  CB.nextRound(room, 'p1');
  assert.equal(p1.status.armyOnePointTurns, 2);
  p1.hand = [{ id: 'future-round-army', name: 'Şövalye', type: 'army', color: 'green', points: 8, effectType: 'none' }];
  p2.hand = [{ id: 'future-round-enemy-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  p1.drew = p2.drew = 2; p1.submitted = p2.submitted = false; room.game.phase = 'play';
  CB.submitCards(room, 'p1', ['future-round-army']); CB.submitCards(room, 'p2', ['future-round-enemy-army']);
  const next = CB.resolveCombat(room, 'p1');
  assert.equal(next.game.result.scoreDetails.p1[0].finalPoints, 1);
});

test('Cellat sonraki tur Destek kartı oynamayı sunucu tarafında engeller', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'executioner', name: 'Cellat', type: 'army', color: 'green', points: 3, effectType: 'opponent-no-support-next-turn' }];
  b.hand = [{ id: 'red-support', name: 'Avcı', type: 'support', color: 'red', speed: 'Çok hızlı', effects: ['Destek at', 'Ordu al'] }, { id: 'red-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['executioner']); CB.submitCards(room, 'p2', ['red-army']); CB.resolveCombat(room, 'p1');
  CB.nextRound(room, 'p1');
  const side = room.game.sides.p2;
  side.drew = 2; room.game.phase = 'play'; side.hand = [{ id: 'support-blocked', name: 'Avcı', type: 'support', color: 'red', speed: 'Çok hızlı', effects: ['Destek at'] }];
  assert.throws(() => CB.submitCards(room, 'p2', ['support-blocked']), /Destek yasağı/);
});

test('Rahibe Ordu destesinin üstündeki kartı çatışmaya ekler', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.armyDeck = [{ id: 'extra-top', name: 'Piyade', type: 'army', color: 'green', points: 4, effectType: 'none' }];
  a.hand = [{ id: 'nun', name: 'Rahibe', type: 'army', color: 'green', points: 3, effectType: 'play-top-army' }];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['nun']); CB.submitCards(room, 'p2', ['enemy']);
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(result.game.result.scoreDetails.p1.some(c => c.name === 'Piyade'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Rahibe')));
  assert.equal(a.armyDeck.some(c => c.id === 'extra-top'), false);
});

test('Büyücü kendi turunda oynanan Destek kartlarını desteye döndürür', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [
    { id: 'wizard', name: 'Büyücü', type: 'army', color: 'green', points: 6, effectType: 'return-own-supports' },
    { id: 'own-support', name: 'Demirci', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['Çöp kartı', 'İkiye katla'] }
  ];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['wizard', 'own-support'], { 'own-support': 1 }); CB.submitCards(room, 'p2', ['enemy']);
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(a.supportDeck.some(c => c.id === 'own-support'));
  assert.ok(!a.played.some(c => c.id === 'own-support'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Büyücü')));
});



test('Kraliçe ilk yeteneği sonraki tur rakibin elinden bir kartı sunucu tarafında alır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'queen-steal', name: 'Kraliçe', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['Kart çal', '3 tur Destek yasağı'] }];
  b.hand = [{ id: 'enemy-card', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['queen-steal'], { 'queen-steal': 0 });
  CB.submitCards(room, 'p2', ['enemy-card']);
  const resolved = CB.resolveCombat(room, 'p1');
  assert.ok(resolved.game.result.supportLog.some(line => line.includes('Kraliçe') && line.includes('sonraki tur')));
  assert.equal(a.status.queenStealNextTurn, true);
  CB.nextRound(room, 'p1');
  a.drew = b.drew = 1;
  a.hand = [{ id: 'a-existing', name: 'Köylü', type: 'army', color: 'green', points: 2, effectType: 'none' }];
  b.hand = [{ id: 'b-existing', name: 'Okçu', type: 'army', color: 'red', points: 3, effectType: 'none' }];
  const nextEnemyCardId = b.armyDeck[0].id;
  CB.drawCard(room, 'p1', 'army');
  CB.drawCard(room, 'p2', 'army');
  assert.equal(room.game.phase, 'queen-choice');
  CB.chooseQueenSteal(room, 'p1', 0);
  assert.equal(a.status.queenStealNextTurn, false);
  assert.equal(a.hand.length, 3);
  assert.equal(b.hand.length, 1);
  assert.ok(a.hand.some(card => ['b-existing', nextEnemyCardId].includes(card.id)));
});

test('Kraliçe kart seçimi yalnızca yetenek sahibine açık kapalı yuvalar sunar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = 1; b.drew = 2; room.game.phase = 'draw';
  a.status.queenStealNextTurn = true;
  a.hand = [{ id: 'own', name: 'Köylü', type: 'army', color: 'green', points: 2, effectType: 'none' }];
  b.hand = [
    { id: 'secret-1', name: 'Gizli Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' },
    { id: 'secret-2', name: 'Gizli Okçu', type: 'army', color: 'red', points: 3, effectType: 'none' }
  ];
  CB.drawCard(room, 'p1', 'army');
  assert.equal(room.game.phase, 'queen-choice');
  assert.equal(CB.publicRoom(room, 'p1').game.canChooseQueenSteal, true);
  const enemyView = CB.publicRoom(room, 'p2').game;
  assert.equal(enemyView.canChooseQueenSteal, false);
  assert.equal(JSON.stringify(CB.publicRoom(room, 'p1').game).includes('secret-1'), false);
  assert.throws(() => CB.chooseQueenSteal(room, 'p2', 0), /yalnızca Kraliçe etkisinin sahibi/);
  for (const invalid of [true, '1', 1.5, -1, {}, []]) {
    assert.throws(() => CB.chooseQueenSteal(room, 'p1', invalid), /Geçersiz kart yuvası/);
  }
  assert.equal(b.hand.length, 2, 'Geçersiz seçimler rakibin elini değiştirmemeli');
  CB.chooseQueenSteal(room, 'p1', 1);
  assert.equal(a.hand.some(card => card.id === 'secret-2'), true);
  assert.equal(b.hand.some(card => card.id === 'secret-2'), false);
  assert.equal(room.game.phase, 'play');
});

test('Kraliçe ikinci yeteneği sonraki üç tur Destek kartlarını engeller', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'queen', name: 'Kraliçe', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['Kart çal', '3 tur Destek yasağı'] }];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['queen'], { queen: 1 }); CB.submitCards(room, 'p2', ['enemy']); CB.resolveCombat(room, 'p1');
  for (let round = 0; round < 3; round++) {
    CB.nextRound(room, 'p1');
    b.drew = 2; room.game.phase = 'play'; b.hand = [{ id: `blocked-${round}`, name: 'Avcı', type: 'support', color: 'red', speed: 'Çok hızlı', effects: ['Destek kaldır', 'Ordu al'] }];
    assert.throws(() => CB.submitCards(room, 'p2', [`blocked-${round}`]), /Destek yasağı/);
    // End this synthetic round cleanly without requiring card draw UI.
    a.drew = 2; a.hand = [{ id: `a-${round}`, name: 'Piyade', type: 'army', color: 'green', points: 3, effectType: 'none' }];
    CB.submitCards(room, 'p1', [`a-${round}`]); b.hand = [{ id: `b-${round}`, name: 'Piyade', type: 'army', color: 'red', points: 3, effectType: 'none' }];
    CB.submitCards(room, 'p2', [`b-${round}`]); CB.resolveCombat(room, 'p1');
  }
  CB.nextRound(room, 'p1'); b.drew = 2; room.game.phase = 'play'; b.hand = [{ id: 'allowed-again', name: 'Avcı', type: 'support', color: 'red', speed: 'Çok hızlı', effects: ['Destek kaldır', 'Ordu al'] }];
  assert.doesNotThrow(() => CB.submitCards(room, 'p2', ['allowed-again']));
});

test('Kralın ikinci yeteneği sonraki turda iki ekstra kart çekme hakkı verir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'king-extra', name: 'Kral', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['Orduyu 1 puan say', '2 ekstra kart'] }];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['king-extra'], { 'king-extra': 1 }); CB.submitCards(room, 'p2', ['enemy']); CB.resolveCombat(room, 'p1'); CB.nextRound(room, 'p1');
  assert.equal(a.status.drawBonusThisTurn, 2);
  CB.drawCard(room, 'p1', 'army'); CB.drawCard(room, 'p1', 'army'); CB.drawCard(room, 'p1', 'support'); CB.drawCard(room, 'p1', 'support');
  assert.equal(a.drew, 4);
  assert.throws(() => CB.drawCard(room, 'p1', 'army'), /4 kart/);
});

test('Kralın bonus çekişi publicRoom drawsRemaining alanına yansır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const side = room.game.sides.p1;
  side.status.drawBonusThisTurn = 2;
  side.drew = 2;
  room.game.phase = 'draw';
  assert.equal(CB.publicRoom(room, 'p1').game.drawsRemaining, 2);
  side.drew = 3;
  assert.equal(CB.publicRoom(room, 'p1').game.drawsRemaining, 1);
  side.drew = 4;
  assert.equal(CB.publicRoom(room, 'p1').game.drawsRemaining, 0);
});

test('Okçu ilk yeteneği yalnızca rakip Ordu destesinin üstteki üç kartını kontrol eder', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'archer', name: 'Okçu', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Üstteki üç Ordu kartını kontrol et', 'Deste etkilerini engelle'] }];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.armyDeck = [
    { id: 'low-1', name: 'Köylü', type: 'army', color: 'red', points: 1 },
    { id: 'high', name: 'Şövalye', type: 'army', color: 'red', points: 8 },
    { id: 'low-2', name: 'Piyade', type: 'army', color: 'red', points: 3 },
    { id: 'low-4', name: 'Köylü', type: 'army', color: 'red', points: 2 }
  ];
  CB.submitCards(room, 'p1', ['archer'], { archer: 0 }); CB.submitCards(room, 'p2', ['enemy']);
  const result = CB.resolveCombat(room, 'p1');
  assert.deepEqual(b.armyGrave.map(c => c.id), ['low-1', 'low-2']);
  assert.deepEqual(b.armyDeck.slice(0, 2).map(c => c.id), ['high', 'low-4']);
  assert.ok(result.game.result.supportLog.some(line => line.includes('Okçu') && line.includes('2 kartı')));
});

test('Simyacı ilk yeteneği Çöp kartını hemen değil sonraki turun başında ele verir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'alchemist-first', name: 'Simyacı', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Çöp kartını sonraki tur al', 'Üstteki yavaş Destek kartını at'] }];
  b.hand = [{ id: 'enemy-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  a.supportGrave = [{ id: 'grave-support', name: 'Rahip', type: 'support', color: 'green', speed: 'Yavaş', effects: ['A', 'B'] }];
  CB.submitCards(room, 'p1', ['alchemist-first'], { 'alchemist-first': 0 });
  CB.submitCards(room, 'p2', ['enemy-army']);
  CB.resolveCombat(room, 'p1');
  assert.equal(a.hand.some(c => c.id === 'grave-support'), false, 'kart çatışma çözülür çözülmez ele gelmemeli');
  assert.equal(a.status.alchemistCardsNextTurn[0].id, 'grave-support');
  CB.nextRound(room, 'p1');
  assert.equal(a.hand.some(c => c.id === 'grave-support'), true, 'kart sonraki turun başında ele gelmeli');
  assert.equal(a.status.alchemistCardsNextTurn.length, 0, 'bekleyen kart ikinci kez dağıtılmamalı');
});

test('Simyacı ikinci yeteneği rakibin en üst Yavaş Destek kartını Çöp alanına yollar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'alchemist', name: 'Simyacı', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Çöp kartını al', 'Üstteki yavaş Destek kartını at'] }];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.supportDeck = [
    { id: 'slow-top', name: 'Rahip', type: 'support', color: 'red', speed: 'Yavaş', effects: ['A', 'B'] },
    { id: 'fast-next', name: 'Avcı', type: 'support', color: 'red', speed: 'Hızlı', effects: ['A', 'B'] }
  ];
  CB.submitCards(room, 'p1', ['alchemist'], { alchemist: 1 }); CB.submitCards(room, 'p2', ['enemy']);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(b.supportDeck[0].id, 'fast-next');
  assert.ok(b.supportGrave.some(c => c.id === 'slow-top'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Simyacı') && line.includes('Rahip')));
});

test('Prenses ilk yeteneği rakibin sonraki iki tur çektiği kart adlarını açıklar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'princess-open', name: 'Prenses', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Rakip açık çeker', 'Prens/Kralı etkisizleştir'] }];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['princess-open'], { 'princess-open': 0 }); CB.submitCards(room, 'p2', ['enemy']);
  CB.resolveCombat(room, 'p1'); CB.nextRound(room, 'p1');
  b.armyDeck.unshift({ id: 'visible-card', name: 'Barbar', type: 'army', color: 'red', points: 7, effectType: 'immune' });
  CB.drawCard(room, 'p2', 'army');
  const view = CB.publicRoom(room, 'p1');
  assert.deepEqual(view.game.opponents[0].openDrawnCards, [{ name: 'Barbar', type: 'army' }]);
  assert.equal(view.game.opponents[0].handCount, 1);
  assert.equal(CB.publicRoom(room, 'p2').game.hand[0].name, 'Barbar');
});

test('Prenses ikinci yeteneği rakibin Prens ve Kral kartlarını sonraki tur kendi eline alır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'princess-take', name: 'Prenses', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Açık çekme', 'Prens ve Kralı al'] }];
  b.hand = [
    { id: 'enemy-prince', name: 'Prens', type: 'army', color: 'red', points: 5, effectType: 'friendly-army-plus-three' },
    { id: 'enemy-king', name: 'Kral', type: 'support', color: 'red', speed: 'Yavaş', effects: ['A', 'B'] }
  ];
  CB.submitCards(room, 'p1', ['princess-take'], { 'princess-take': 1 });
  CB.submitCards(room, 'p2', ['enemy-prince', 'enemy-king'], { 'enemy-king': 0 });
  CB.resolveCombat(room, 'p1');
  assert.ok(!b.played.some(c => c.id === 'enemy-prince' || c.id === 'enemy-king'));
  assert.ok(!b.armyGrave?.some(c => c.id === 'enemy-prince'));
  assert.ok(!b.supportGrave?.some(c => c.id === 'enemy-king'));
  assert.deepEqual(a.status.princessCardsNextTurn.map(c => c.id), ['enemy-prince', 'enemy-king']);
  CB.nextRound(room, 'p1');
  assert.deepEqual(a.hand.map(c => c.id), ['enemy-prince', 'enemy-king']);
  assert.ok(a.hand.every(card => card.color === 'green'));
  assert.deepEqual(a.status.princessCardsNextTurn, []);
  assert.ok(room.game.sides.p2.hand.every(c => c.id !== 'enemy-prince' && c.id !== 'enemy-king'));
});

test('Şaklaban ilk yeteneği sonraki turun sonunda oynanan Destek kartlarını desteye döndürür', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'jester', name: 'Şaklaban', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['Sonraki tur Destek kartlarını döndür', 'Deste altlarını değiştir'] }];
  b.hand = [{ id: 'enemy', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['jester'], { jester: 0 }); CB.submitCards(room, 'p2', ['enemy']); CB.resolveCombat(room, 'p1');
  assert.ok(a.supportGrave.some(c => c.id === 'jester'), 'Şaklaban kendisi oynandığı turda Çöp alanına gitmeli');
  CB.nextRound(room, 'p1');
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'next-support', name: 'Demirci', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['A', 'B'] }];
  b.hand = [{ id: 'enemy-2', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['next-support'], { 'next-support': 1 }); CB.submitCards(room, 'p2', ['enemy-2']); CB.resolveCombat(room, 'p1');
  assert.ok(a.supportDeck.some(c => c.id === 'next-support'));
  assert.ok(!a.supportGrave.some(c => c.id === 'next-support'));
  assert.ok(room.game.result.supportLog.some(line => line.includes('Şaklaban etkisiyle')));
});

test('Avcı ilk yeteneği rakibin en hızlı Destek kartını iptal eder', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'hunter', name: 'Avcı', type: 'support', color: 'green', speed: 'Çok hızlı', effects: ['Destek kaldır', 'Ordu al'] }];
  b.hand = [{ id: 'enemy-support', name: 'Demirci', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Çöp kartı', 'İkiye katla'] }, { id: 'enemy-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['hunter'], { hunter: 0 }); CB.submitCards(room, 'p2', ['enemy-support', 'enemy-army']);
  CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'support-target-choice');
  CB.chooseSupportTarget(room, 'p1', { targetCardId: 'enemy-support' });
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(b.supportGrave.some(c => c.id === 'enemy-support'));
  assert.ok(!b.played.some(c => c.id === 'enemy-support'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Avcı') && line.includes('iptal')));
});

test('Avcı ikinci yeteneği rakibin oynadığı Ordu kartını kendi destesine alır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'hunter2', name: 'Avcı', type: 'support', color: 'green', speed: 'Çok hızlı', effects: ['Destek kaldır', 'Ordu al'] }];
  b.hand = [{ id: 'enemy-army2', name: 'Şövalye', type: 'army', color: 'red', points: 8, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['hunter2'], { hunter2: 1 }); CB.submitCards(room, 'p2', ['enemy-army2']);
  CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'support-target-choice');
  CB.chooseSupportTarget(room, 'p1', { targetCardId: 'enemy-army2' });
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(a.armyDeck.some(c => c.id === 'enemy-army2'));
  assert.equal(a.armyDeck.find(c => c.id === 'enemy-army2').color, 'green');
  assert.ok(!b.played.some(c => c.id === 'enemy-army2'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Avcı') && line.includes('Şövalye')));
});

test('Hırsız ilk yeteneği rakip Ordu destesinin üst kartını çalar ve kendisini Çöp alanına yollar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'thief', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Deste kartı çal', 'Deste sırasını değiştir'] }];
  b.hand = [{ id: 'enemy-army3', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.armyDeck = [{ id: 'stolen-top', name: 'Köylü', type: 'army', color: 'red', points: 2, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['thief'], { thief: 0 }, { thief: { deck: 'army', edge: 'top' } }); CB.submitCards(room, 'p2', ['enemy-army3']);
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(a.armyDeck.some(c => c.id === 'stolen-top'));
  assert.equal(a.armyDeck.find(c => c.id === 'stolen-top').color, 'green');
  assert.ok(a.supportGrave.some(c => c.id === 'thief'));
  assert.ok(!a.played.some(c => c.id === 'thief'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Hırsız') && line.includes('çaldı')));
});

test('Rahip ilk yeteneği rakibin Ordu Çöp alanındaki son kartı kendi Ordu destesine alır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'priest', name: 'Rahip', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Çöp kartını al', 'Desteden kart seç'] }];
  b.hand = [{ id: 'enemy-army4', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.armyGrave = [{ id: 'grave-card', name: 'Barbar', type: 'army', color: 'red', points: 7, effectType: 'immune' }];
  CB.submitCards(room, 'p1', ['priest'], { priest: 0 }); CB.submitCards(room, 'p2', ['enemy-army4']);
  CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'support-target-choice');
  CB.chooseSupportTarget(room, 'p1', { graveType: 'army' });
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(a.armyDeck.some(c => c.id === 'grave-card'));
  assert.equal(a.armyDeck.find(c => c.id === 'grave-card').color, 'green');
  assert.equal(b.armyGrave.some(c => c.id === 'grave-card'), false);
  assert.ok(result.game.result.supportLog.some(line => line.includes('Rahip') && line.includes('Barbar')));
});

test('Okçu engeli rakip Hırsız ve Rahip deste etkilerini sunucuda durdurur', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.status.deckEffectsBlocked = 2;
  a.hand = [{ id: 'thief-blocked', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Deste kartı çal', 'Deste sırasını değiştir'] }];
  b.hand = [{ id: 'enemy-army-block-test', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  a.armyDeck = []; b.armyDeck = [{ id: 'protected-top', name: 'Köylü', type: 'army', color: 'red', points: 2, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['thief-blocked'], { 'thief-blocked': 0 }, { 'thief-blocked': { deck: 'army', edge: 'top' } }); CB.submitCards(room, 'p2', ['enemy-army-block-test']);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(b.armyDeck[0].id, 'protected-top');
  assert.ok(result.game.result.supportLog.some(line => line.includes('Hırsız') && line.includes('Okçu') && line.includes('engeli')));
});

test('Hırsız ikinci yeteneği rakibin üstteki beş Ordu kartını ters sıraya dizer', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'thief-order', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Deste kartı çal', 'Deste sırasını değiştir'] }];
  b.hand = [{ id: 'enemy-order-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.armyDeck = [1, 2, 3, 4, 5, 6].map(n => ({ id: `army-${n}`, name: `Ordu${n}`, type: 'army', color: 'red', points: n, effectType: 'none' }));
  CB.submitCards(room, 'p1', ['thief-order'], { 'thief-order': 1 }, { 'thief-order': { deck: 'army', edge: 'top' } }); CB.submitCards(room, 'p2', ['enemy-order-army']);
  const result = CB.resolveCombat(room, 'p1');
  assert.deepEqual(b.armyDeck.slice(0, 6).map(c => c.id), ['army-5', 'army-4', 'army-3', 'army-2', 'army-1', 'army-6']);
  assert.ok(result.game.result.supportLog.some(line => line.includes('Hırsız') && line.includes('sırasını tersine çevirdi')));
});

test('Okçu engeli Hırsızın ikinci yeteneğini de sunucuda durdurur', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play'; a.status.deckEffectsBlocked = 2;
  a.hand = [{ id: 'thief-order-blocked', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Deste kartı çal', 'Deste sırasını değiştir'] }];
  b.hand = [{ id: 'enemy-order-block-test', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.armyDeck = [1, 2, 3].map(n => ({ id: `blocked-army-${n}`, name: `Ordu${n}`, type: 'army', color: 'red', points: n, effectType: 'none' }));
  const before = b.armyDeck.map(c => c.id);
  CB.submitCards(room, 'p1', ['thief-order-blocked'], { 'thief-order-blocked': 1 }, { 'thief-order-blocked': { deck: 'army', edge: 'top' } }); CB.submitCards(room, 'p2', ['enemy-order-block-test']);
  const result = CB.resolveCombat(room, 'p1');
  assert.deepEqual(b.armyDeck.slice(0, before.length).map(c => c.id), before);
  assert.ok(result.game.result.supportLog.some(line => line.includes('Hırsız') && line.includes('Okçu') && line.includes('engeli')));
});

test('Hırsız hedef seçimiyle rakip Destek destesinin alt kartını çalar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'thief-bottom-support', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Kart çal', 'Sıralamayı değiştir'] }];
  b.hand = [{ id: 'enemy-unit-bottom', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.supportDeck = [{ id: 'support-top', name: 'Simyacı', type: 'support', color: 'red', speed: 'Yavaş' }, { id: 'support-bottom', name: 'Demirci', type: 'support', color: 'red', speed: 'Yavaş' }];
  CB.submitCards(room, 'p1', ['thief-bottom-support'], { 'thief-bottom-support': 0 }, { 'thief-bottom-support': { deck: 'support', edge: 'bottom' } });
  CB.submitCards(room, 'p2', ['enemy-unit-bottom']);
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(a.supportDeck.some(c => c.id === 'support-bottom'));
  assert.deepEqual(b.supportDeck.map(c => c.id), ['support-top']);
  assert.ok(result.game.result.supportLog.some(line => line.includes('alt Destek destesinden Demirci kartını çaldı')));
});

test('Hırsız ikinci yeteneği rakibin seçilen destenin altındaki beş kartı tersine çevirir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'thief-bottom-order', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Kart çal', 'Sıralamayı değiştir'] }];
  b.hand = [{ id: 'enemy-unit-bottom-order', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.supportDeck = [1, 2, 3, 4, 5, 6].map(n => ({ id: `support-${n}`, name: `Destek${n}`, type: 'support', color: 'red', speed: 'Yavaş' }));
  CB.submitCards(room, 'p1', ['thief-bottom-order'], { 'thief-bottom-order': 1 }, { 'thief-bottom-order': { deck: 'support', edge: 'bottom' } });
  CB.submitCards(room, 'p2', ['enemy-unit-bottom-order']);
  CB.resolveCombat(room, 'p1');
  assert.deepEqual(b.supportDeck.map(c => c.id), ['support-1', 'support-6', 'support-5', 'support-4', 'support-3', 'support-2']);
});

test('Hırsız hedef seçimi geçersiz değerleri reddeder ve hamleyi değiştirmez', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1; a.drew = room.game.sides.p2.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'thief-invalid-target', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Kart çal', 'Sıralamayı değiştir'] }];
  assert.throws(() => CB.submitCards(room, 'p1', ['thief-invalid-target'], { 'thief-invalid-target': 0 }, { 'thief-invalid-target': { deck: 'gold', edge: 'top' } }), /hedef seçimi geçersiz/);
  assert.equal(a.submitted, false); assert.equal(a.hand[0].id, 'thief-invalid-target');
});

test('Şaklaban ikinci yeteneği iki destenin en alt kartlarını değiştirir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'joker-swap', name: 'Şaklaban', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ['Destekleri geri döndür', 'En alt kartları değiştir'] }];
  b.hand = [{ id: 'enemy-swap-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  a.armyDeck = [{ id: 'own-bottom', name: 'Köylü', type: 'army', color: 'green', points: 2, effectType: 'none' }];
  b.supportDeck = [{ id: 'enemy-bottom', name: 'Kral', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['A', 'B'] }];
  CB.submitCards(room, 'p1', ['joker-swap'], { 'joker-swap': 1 }); CB.submitCards(room, 'p2', ['enemy-swap-army']);
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(!a.armyDeck.some(card => card.id === 'own-bottom'));
  assert.ok(!b.supportDeck.some(card => card.id === 'enemy-bottom'));
  const transferredSupport = a.supportDeck.find(card => card.id === 'enemy-bottom');
  const transferredArmy = b.armyDeck.find(card => card.id === 'own-bottom');
  assert.equal(transferredSupport.id, 'enemy-bottom');
  assert.equal(transferredSupport.type, 'support');
  assert.equal(transferredSupport.color, 'green');
  assert.equal(transferredSupport.usedEffect, null);
  assert.equal(transferredArmy.id, 'own-bottom');
  assert.equal(transferredArmy.type, 'army');
  assert.equal(transferredArmy.color, 'red');
  assert.ok(result.game.result.supportLog.some(line => line.includes('Şaklaban') && line.includes('değiştirdi')));
});

test('Demirci ilk yeteneği Ordu Çöpündeki kartı sunucuda çatışmaya yeniden oynar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'smith-replay', name: 'Demirci', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ["Ordu Çöp'ünden kart oyna", 'Ordu puanlarını ikiye katla'] }];
  b.hand = [{ id: 'enemy-smith-test', name: 'Piyade', type: 'army', color: 'red', points: 1, effectType: 'none' }];
  a.armyGrave = [{ id: 'grave-archer', name: 'Okçu', type: 'army', color: 'green', points: 5, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['smith-replay'], { 'smith-replay': 0 });
  CB.submitCards(room, 'p2', ['enemy-smith-test']);
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(result.game.result.scoreDetails.p1.some(card => card.id === 'grave-archer'));
  assert.equal(a.armyGrave.some(card => card.id === 'grave-archer'), false);
  assert.ok(result.game.result.supportLog.some(line => line.includes('Demirci') && line.includes('yeniden çatışmaya oynadı')));
});


test('Demirci karışık içerikli Ordu Çöpünde Ordu kartını bulur ve diğer kartları korur', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'smith-mixed-grave', name: 'Demirci', type: 'support', color: 'green', speed: 'Çok yavaş', effects: ["Ordu Çöp'ünden kart oyna", 'Ordu puanlarını ikiye katla'] }];
  b.hand = [{ id: 'enemy-mixed-grave', name: 'Piyade', type: 'army', color: 'red', points: 1, effectType: 'none' }];
  const supportResidue = { id: 'unexpected-support', name: 'Kral', type: 'support', color: 'green', speed: 'Çok yavaş' };
  const armyToReplay = { id: 'army-below-support', name: 'Okçu', type: 'army', color: 'green', points: 5, effectType: 'none', temporaryDoublePoints: true, targetCardId: 'stale-target' };
  a.armyGrave = [armyToReplay, supportResidue];
  CB.submitCards(room, 'p1', ['smith-mixed-grave'], { 'smith-mixed-grave': 0 });
  CB.submitCards(room, 'p2', ['enemy-mixed-grave']);
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(result.game.result.scoreDetails.p1.some(card => card.id === 'army-below-support'));
  assert.deepEqual(a.armyGrave, [supportResidue]);
  const replayed = a.played.find(card => card.id === 'army-below-support');
  assert.equal(replayed.temporaryDoublePoints, false);
  assert.equal(Object.hasOwn(replayed, 'targetCardId'), false);
});


test('Geçersiz destek yeteneği seçimi eli ve tur durumunu değiştirmez', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const side = room.game.sides.p1;
  side.drew = room.game.sides.p2.drew = 2; room.game.phase = 'play';
  const queen = { id: 'queen-invalid-choice', name: 'Kraliçe', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Rakibin elinden kart al', 'Rakip Destek kartı oynayamasın'] };
  side.hand = [queen];
  const handBefore = side.hand.map(card => card.id);
  assert.throws(() => CB.submitCards(room, 'p1', [queen.id], { [queen.id]: 99 }), /Geçersiz destek yeteneği/);
  assert.deepEqual(side.hand.map(card => card.id), handBefore);
  assert.equal(side.submitted, false);
  assert.equal(room.game.phase, 'play');
});


test('Destek yeteneği seçimleri nesne değilse hamle durumu değişmeden reddedilir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const side = room.game.sides.p1;
  side.drew = room.game.sides.p2.drew = 2; room.game.phase = 'play';
  const card = { id: 'queen-shape-check', name: 'Kraliçe', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Kart çal', 'Destek yasağı'] };
  side.hand = [card];
  const beforeHand = JSON.stringify(side.hand);
  assert.throws(() => CB.submitCards(room, 'p1', [card.id], ['0']), /seçimleri geçersiz/);
  assert.equal(JSON.stringify(side.hand), beforeHand);
  assert.equal(side.submitted, false);
  assert.equal(room.game.phase, 'play');
});


test('Destek yeteneği yalnızca oynanan Destek kartları için gönderilebilir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const side = room.game.sides.p1;
  side.drew = room.game.sides.p2.drew = 2; room.game.phase = 'play';
  const selected = { id: 'support-selected', name: 'Kraliçe', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Kart al', 'Destek engeli'] };
  const notSelected = { id: 'support-not-selected', name: 'Hırsız', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Kart çal', 'Deste sırasını değiştir'] };
  side.hand = [selected, notSelected];
  const beforeHand = side.hand.map(card => card.id);
  assert.throws(() => CB.submitCards(room, 'p1', [selected.id], { [selected.id]: 0, [notSelected.id]: 1 }), /Seçim yapılmayan/);
  assert.deepEqual(side.hand.map(card => card.id), beforeHand);
  assert.equal(side.submitted, false);
  assert.equal(room.game.phase, 'play');
});

test('Destek yeteneği seçiminde sayısal metin reddedilir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const side = room.game.sides.p1;
  side.drew = room.game.sides.p2.drew = 2; room.game.phase = 'play';
  const card = { id: 'support-string-choice', name: 'Kraliçe', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Kart al', 'Destek engeli'] };
  side.hand = [card];
  assert.throws(() => CB.submitCards(room, 'p1', [card.id], { [card.id]: '1' }), /Geçersiz destek yeteneği/);
  assert.equal(side.hand[0].id, card.id);
  assert.equal(side.submitted, false);
});

test('Rahip ikinci yeteneği yalnızca sahibine üstteki iki kartı gösterir ve seçilen kartları çatışmaya ekler', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'priest-choice', name: 'Rahip', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Çöp kartını al', 'Desteden kart seç'] }];
  b.hand = [{ id: 'enemy-priest-choice', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  a.armyDeck = [{ id: 'a1', name: 'Köylü', type: 'army', points: 2 }, { id: 'a2', name: 'Barbar', type: 'army', points: 5 }, { id: 'a3', name: 'Gizli Ordu', type: 'army', points: 9 }];
  a.supportDeck = [{ id: 's1', name: 'Simyacı', type: 'support', speed: 'Hızlı' }, { id: 's2', name: 'Demirci', type: 'support', speed: 'Yavaş' }, { id: 's3', name: 'Gizli Destek', type: 'support', speed: 'Çok hızlı' }];
  CB.submitCards(room, 'p1', ['priest-choice'], { 'priest-choice': 1 });
  CB.submitCards(room, 'p2', ['enemy-priest-choice']);
  CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'priest-choice');
  assert.equal(CB.publicRoom(room, 'p1').game.priestOptions.army.length, 2);
  assert.equal(CB.publicRoom(room, 'p1').game.priestOptions.support.length, 2);
  assert.equal(CB.publicRoom(room, 'p2').game.priestOptions, null);
  assert.throws(() => CB.choosePriestCards(room, 'p2', { armyCardId: 'a1' }), /yalnızca yeteneğin sahibi/);
  assert.throws(() => CB.choosePriestCards(room, 'p1', { armyCardId: 'a3' }), /üstündeki iki kart/);
  assert.throws(() => CB.choosePriestCards(room, 'p1', {}), /Ordu destesinden bir kart seçmelisin/);
  assert.equal(room.game.phase, 'priest-choice');
  assert.equal(a.armyDeck.length, 3);
  CB.choosePriestCards(room, 'p1', { armyCardId: 'a2', supportCardId: 's1' });
  assert.equal(room.game.phase, 'revealed');
  assert.ok(a.played.some(c => c.id === 'a2'));
  assert.ok(a.played.some(c => c.id === 's1'));
  assert.equal(a.armyDeck.some(c => c.id === 'a2'), false);
  assert.equal(a.supportDeck.some(c => c.id === 's1'), false);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(result.game.phase, 'resolved');
  assert.ok(result.game.result.supportLog.some(line => line.includes('Rahip')));
});

test('oturum kurtarma mevcut oyuncunun soket kimliğini ezemez', () => {
  const room = twoReadyRoom();
  const originalHost = room.players.p1;
  const originalGuest = room.players.p2;
  const { resumeToken } = CB.markDisconnected(room, 'p1');
  const result = CB.resumePlayer(room, 'p2', resumeToken, Date.now() + 1000);
  assert.equal(result, null);
  assert.equal(room.players.p1, originalHost);
  assert.equal(room.players.p2, originalGuest);
  assert.equal(room.players.p1.connected, false);
  assert.equal(room.players.p2.connected, true);
  assert.equal(room.hostId, 'p1');
});

test('oturum kurtarma boş veya geçersiz yeni soket kimliğini reddeder', () => {
  const room = twoReadyRoom();
  const { resumeToken } = CB.markDisconnected(room, 'p1');
  assert.equal(CB.resumePlayer(room, '', resumeToken, Date.now() + 1000), null);
  assert.equal(CB.resumePlayer(room, null, resumeToken, Date.now() + 1000), null);
  assert.equal(room.players.p1.connected, false);
});

test('oturum kurtarma Kraliçe bekleyen gizli kart seçimini yeni soket kimliğine taşır', () => {
  const room = twoReadyRoom();
  CB.startGame(room, 'p1');
  const owner = room.game.sides.p1;
  const enemy = room.game.sides.p2;
  owner.status.queenStealNextTurn = true;
  enemy.hand = [{ id: 'hidden-enemy-card', name: 'Gizli kart', type: 'army', color: 'red' }];
  room.game.phase = 'queen-choice';
  room.game.queenStealOwnerId = 'p1';
  const { resumeToken } = CB.markDisconnected(room, 'p1');
  CB.resumePlayer(room, 'p1-reconnected', resumeToken, Date.now() + 1000);
  assert.equal(room.game.queenStealOwnerId, 'p1-reconnected');
  assert.equal(CB.publicRoom(room, 'p1-reconnected').game.canChooseQueenSteal, true);
  CB.chooseQueenSteal(room, 'p1-reconnected', 0);
  assert.equal(owner.hand[0].id, 'hidden-enemy-card');
});

test('oturum kurtarma Rahip özel kart seçimini yeni soket kimliğine taşır', () => {
  const room = twoReadyRoom();
  CB.startGame(room, 'p1');
  const owner = room.game.sides.p1;
  owner.armyDeck = [{ id: 'army-top', name: 'Piyade', type: 'army', points: 3, color: 'green' }];
  owner.supportDeck = [{ id: 'support-top', name: 'Rahibe', type: 'support', speed: 'Hızlı', color: 'green' }];
  room.game.phase = 'priest-choice';
  room.game.priestChoiceOwnerId = 'p1';
  room.game.priestChoiceCardId = 'priest-pending';
  const { resumeToken } = CB.markDisconnected(room, 'p1');
  CB.resumePlayer(room, 'p1-reconnected', resumeToken, Date.now() + 1000);
  const privateState = CB.publicRoom(room, 'p1-reconnected').game;
  const enemyState = CB.publicRoom(room, 'p2').game;
  assert.equal(room.game.priestChoiceOwnerId, 'p1-reconnected');
  assert.equal(privateState.canChoosePriestCards, true);
  assert.equal(privateState.priestOptions.army[0].id, 'army-top');
  assert.equal(enemyState.canChoosePriestCards, false);
  assert.equal(enemyState.priestOptions, null);
  CB.choosePriestCards(room, 'p1-reconnected', { armyCardId: 'army-top', supportCardId: 'support-top' });
  assert.equal(owner.played.length, 2);
});


test('Suikastçı Çok Yavaş aşamasına gelmeden rakibin Kral yeteneğini iptal edip Kralı Çöp alanına yollar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'assassin-king-order', name: 'Suikastçı', type: 'army', color: 'green', points: 2, effectType: 'cancel-prince-king' }];
  b.hand = [
    { id: 'king-assassin-test', name: 'Kral', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Rakip Ordu kartlarını 1 puan say', 'Fazladan kart çek'] },
    { id: 'red-army-assassin-test', name: 'Şövalye', type: 'army', color: 'red', points: 7, effectType: 'none' }
  ];
  CB.submitCards(room, 'p1', ['assassin-king-order']);
  CB.submitCards(room, 'p2', ['king-assassin-test', 'red-army-assassin-test'], { 'king-assassin-test': 1 });
  const result = CB.resolveCombat(room, 'p1');
  assert.ok(b.supportGrave.some(card => card.id === 'king-assassin-test'));
  assert.equal(b.status.nextDrawBonus || 0, 0);
  assert.ok(result.game.result.supportLog.some(line => line.includes('Suikastçı') && line.includes('Kral')));
});

test('Okçu yeni koyduğu üç turluk engeli aynı çatışmada oynanmış Hırsız kartına geriye dönük uygulamaz', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'archer-new-block', name: 'Okçu', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Üstteki düşük Ordu kartlarını at', 'Rakibin deste etkilerini engelle'], usedEffect: 1 }];
  b.hand = [{ id: 'thief-same-round', name: 'Hırsız', type: 'support', color: 'red', speed: 'Hızlı', effects: ['Kart çal', 'Sırayı değiştir'], usedEffect: 0 }];
  a.armyDeck = [{ id: 'archer-target-card', name: 'Köylü', type: 'army', color: 'green', points: 1, effectType: 'army-neighbor-bonus' }];
  b.armyDeck = [{ id: 'b-keep-1', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }, { id: 'b-keep-2', name: 'Şövalye', type: 'army', color: 'red', points: 8, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['archer-new-block'], { 'archer-new-block': 1 });
  CB.submitCards(room, 'p2', ['thief-same-round'], { 'thief-same-round': 0 }, { 'thief-same-round': { deck: 'army', edge: 'top' } });
  CB.resolveCombat(room, 'p1');
  assert.equal(b.armyDeck.some(card => card.id === 'archer-target-card'), true);
  assert.equal(a.armyDeck.some(card => card.id === 'archer-target-card'), false);
  assert.equal(b.status.deckEffectsBlocked, 4);
});

test('iki destesi de tükenen krallık maçı kaybeder ve çevrimiçi sonuç kalıcı son aşama olarak görünür', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'exhausted-low', name: 'Köylü', type: 'army', color: 'green', points: 1, effectType: 'army-neighbor-bonus' }];
  b.hand = [{ id: 'winner-high', name: 'Şövalye', type: 'army', color: 'red', points: 8, effectType: 'none' }];
  a.armyDeck = []; a.supportDeck = [];
  b.armyDeck = [{ id: 'remaining-b', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }]; b.supportDeck = [];
  CB.submitCards(room, 'p1', ['exhausted-low']); CB.submitCards(room, 'p2', ['winner-high']);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(room.status, 'finished');
  assert.equal(room.game.phase, 'finished');
  assert.equal(result.game.result.matchOver, true);
  assert.equal(result.game.result.matchOutcome, 'win');
  assert.equal(result.game.result.matchLoserId, 'p1');
  assert.equal(result.game.result.matchWinnerId, 'p2');
  assert.equal(CB.publicRoom(room, 'p2').game.revealed.length, 2);
  assert.throws(() => CB.nextRound(room, 'p1'), /Yeni tura/);
});

test('iki krallığın da Ordu ve Destek destesi tükenirse maç berabere tamamlanır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'draw-a', name: 'Piyade', type: 'army', color: 'green', points: 4, effectType: 'none' }];
  b.hand = [{ id: 'draw-b', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  a.armyDeck = []; a.supportDeck = []; b.armyDeck = []; b.supportDeck = [];
  CB.submitCards(room, 'p1', ['draw-a']); CB.submitCards(room, 'p2', ['draw-b']);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(room.status, 'finished');
  assert.equal(result.game.result.matchOutcome, 'draw');
  assert.equal(result.game.result.matchWinnerId, null);
});


test('Barbar bağışıklığı Kralın 1 puan etkisinden ve Demirci çarpanından korunur', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [
    { id: 'immune-barbar', name: 'Barbar', type: 'army', color: 'green', points: 7, effectType: 'immune', temporaryOnePoint: true, temporaryDoublePoints: true },
    { id: 'ordinary-green-army', name: 'Piyade', type: 'army', color: 'green', points: 4, effectType: 'none' }
  ];
  b.hand = [
    { id: 'king-vs-barbar', name: 'Kral', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Rakip Ordu kartları 1 puan', 'Fazladan kart çek'] },
    { id: 'ordinary-red-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }
  ];
  CB.submitCards(room, 'p1', ['immune-barbar', 'ordinary-green-army']);
  CB.submitCards(room, 'p2', ['king-vs-barbar', 'ordinary-red-army'], { 'king-vs-barbar': 0 });
  const result = CB.resolveCombat(room, 'p1');
  const barbar = result.game.result.scoreDetails.p1.find(card => card.id === 'immune-barbar');
  assert.equal(barbar.finalPoints, 7);
  assert.equal(barbar.modifiers.some(modifier => modifier.includes('Kral') || modifier.includes('Demirci')), false);
});


test('Hırsız seçilen rakip destesi boşsa çatışma çözümlenir ve kart kaybı yaşanmaz', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'thief-empty-target', name: 'Hırsız', type: 'support', color: 'green', speed: 'Hızlı', effects: ['Kart çal', 'Sırayı değiştir'] }];
  b.hand = [{ id: 'enemy-empty-target-army', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.armyDeck = [];
  CB.submitCards(room, 'p1', ['thief-empty-target'], { 'thief-empty-target': 0 }, { 'thief-empty-target': { deck: 'army', edge: 'top' } });
  CB.submitCards(room, 'p2', ['enemy-empty-target-army']);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'resolved');
  assert.ok(a.supportGrave.some(card => card.id === 'thief-empty-target'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Hırsız') && line.includes('boştu')));
});


test('Avcı sahibine hedef kart seçtirir ve seçilen Destek kartını kaldırır', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'hunter-select', name: 'Avcı', type: 'support', color: 'green', speed: 'Çok hızlı', effects: ['Bir rakip Destek kartını Çöp’e gönder', 'Bir rakip Ordu kartını destene al'] }];
  b.hand = [
    { id: 'queen-select', name: 'Kraliçe', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Kart al', 'Destek yasağı'] },
    { id: 'king-select', name: 'Kral', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Ordu 1 puan', 'Ek kart çek'] }
  ];
  CB.submitCards(room, 'p1', ['hunter-select'], { 'hunter-select': 0 });
  CB.submitCards(room, 'p2', ['queen-select', 'king-select'], { 'queen-select': 1, 'king-select': 1 });
  let result = CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'support-target-choice');
  assert.equal(result.game.canChooseSupportTarget, true);
  assert.deepEqual(result.game.supportTarget.options.map(option => option.id), ['queen-select', 'king-select']);
  assert.equal(CB.publicRoom(room, 'p2').game.canChooseSupportTarget, false);
  assert.throws(() => CB.chooseSupportTarget(room, 'p2', { targetCardId: 'king-select' }), /yalnızca yeteneğin sahibi/);
  result = CB.chooseSupportTarget(room, 'p1', { targetCardId: 'king-select' });
  assert.equal(room.game.phase, 'revealed');
  result = CB.resolveCombat(room, 'p1');
  assert.ok(b.supportGrave.some(card => card.id === 'king-select'));
  assert.ok(b.played.some(card => card.id === 'queen-select'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Avcı rakibin Kral Destek kartını')));
});

test('Rahip ilk yeteneğinde rakibin Ordu veya Destek Çöp alanını seçebilir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'priest-grave-select', name: 'Rahip', type: 'support', color: 'green', speed: 'Yavaş', effects: ['Rakibin Çöp kartını al', 'Desteden kart seç'] }];
  b.hand = [{ id: 'enemy-army-grave-target', name: 'Piyade', type: 'army', color: 'red', points: 4, effectType: 'none' }];
  b.armyGrave = [{ id: 'army-grave-old', name: 'Şövalye', type: 'army', color: 'red', points: 8, effectType: 'none' }];
  b.supportGrave = [{ id: 'support-grave-old', name: 'Simyacı', type: 'support', color: 'red', speed: 'Yavaş', effects: ['Geri al', 'Deste kartı'] }];
  CB.submitCards(room, 'p1', ['priest-grave-select'], { 'priest-grave-select': 0 });
  CB.submitCards(room, 'p2', ['enemy-army-grave-target']);
  let result = CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'support-target-choice');
  assert.deepEqual(result.game.supportTarget.options.map(option => option.value), ['army', 'support']);
  result = CB.chooseSupportTarget(room, 'p1', { graveType: 'support' });
  assert.equal(room.game.phase, 'revealed');
  result = CB.resolveCombat(room, 'p1');
  assert.ok(a.supportDeck.some(card => card.id === 'support-grave-old'));
  assert.ok(b.armyGrave.some(card => card.id === 'army-grave-old'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Destek Çöp alanından Simyacı')));
});

test('Avcı geçersiz veya rakibin oynamadığı kartı hedefleyemez', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'hunter-invalid', name: 'Avcı', type: 'support', color: 'green', speed: 'Çok hızlı', effects: ['Bir rakip Destek kartını Çöp’e gönder', 'Bir rakip Ordu kartını destene al'] }];
  b.hand = [{ id: 'enemy-support-invalid', name: 'Kraliçe', type: 'support', color: 'red', speed: 'Çok yavaş', effects: ['Kart al', 'Destek yasağı'] }];
  CB.submitCards(room, 'p1', ['hunter-invalid'], { 'hunter-invalid': 0 });
  CB.submitCards(room, 'p2', ['enemy-support-invalid'], { 'enemy-support-invalid': 1 });
  CB.resolveCombat(room, 'p1');
  assert.throws(() => CB.chooseSupportTarget(room, 'p1', { targetCardId: 'not-on-the-field' }), /uygun bir kart değil/);
  assert.equal(room.game.phase, 'support-target-choice');
});


test('çatışma sonunda Çöp alanına giden Destek kartlarından geçici hedef ve yetenek durumu temizlenir', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; room.game.phase = 'play';
  a.hand = [{ id: 'support-cleanup', name: 'Kral', type: 'support', color: 'green', speed: 'Yavaş', effects: ['A', 'B'] }];
  b.hand = [{ id: 'army-cleanup', name: 'Şövalye', type: 'army', color: 'red', points: 1, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['support-cleanup'], { 'support-cleanup': 1 });
  CB.submitCards(room, 'p2', ['army-cleanup']);
  a.played[0].targetCardId = 'stale-target';
  a.played[0].targetChoice = { deck: 'support', edge: 'bottom' };
  a.played[0].targetGraveType = 'support';
  a.played[0].targetResolved = true;
  a.played[0].temporaryDoublePoints = true;
  CB.resolveCombat(room, 'p1');
  const grave = a.supportGrave.find(card => card.id === 'support-cleanup');
  assert.ok(grave);
  assert.equal(grave.usedEffect, null);
  for (const key of ['targetCardId', 'targetChoice', 'targetGraveType', 'targetResolved', 'temporaryOnePoint', 'temporaryDoublePoints']) assert.equal(Object.hasOwn(grave, key), false, `${key} should be cleared`);
});

test('Önceden aktif Okçu engeli Avcı ikinci yeteneği için gereksiz hedef seçimini atlar', () => {
  const room = twoReadyRoom(); CB.startGame(room, 'p1');
  const a = room.game.sides.p1, b = room.game.sides.p2;
  a.drew = b.drew = 2; a.status.deckEffectsBlocked = 2; room.game.phase = 'play';
  a.hand = [{ id: 'hunter-blocked-target', name: 'Avcı', type: 'support', color: 'green', speed: 'Çok hızlı', effects: ['Rakip Destek kartını Çöp\'e gönder', 'Rakip Ordu kartını kendi destene al'] }];
  b.hand = [{ id: 'target-remains', name: 'Şövalye', type: 'army', color: 'red', points: 8, effectType: 'none' }];
  CB.submitCards(room, 'p1', ['hunter-blocked-target'], { 'hunter-blocked-target': 1 });
  CB.submitCards(room, 'p2', ['target-remains']);
  const result = CB.resolveCombat(room, 'p1');
  assert.equal(room.game.phase, 'resolved');
  assert.ok(b.armyGrave?.some(card => card.id === 'target-remains') || result.game.result.scoreDetails.p2.some(card => card.id === 'target-remains'));
  assert.ok(result.game.result.supportLog.some(line => line.includes('Avcı') && line.includes('Okçu') && line.includes('engeli')));
});
