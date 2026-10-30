'use strict';
const { randomBytes, randomInt } = require('node:crypto');
const cardsData = require('../games/casus-belli/data/cards.json');
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 2;
const RESUME_GRACE_MS = 90_000;
function cleanName(value) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 18); }
function token() { return randomBytes(32).toString('hex'); }
function shuffle(list) { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out; }
function makeDeck(templates, type, color) { return shuffle(templates.map((t, i) => ({ ...t, id: `${color}-${type}-${i}-${randomBytes(3).toString('hex')}`, type, color }))); }
function transferCardToColor(card, color) {
  if (!card || typeof card !== 'object') return card;
  const transferred = { ...card, color };
  // Cross-owner transfers must not carry the previous owner's pending choices,
  // temporary battle modifiers, or a previously consumed Support ability.
  for (const key of ['targetCardId', 'targetChoice', 'targetGraveType', 'targetResolved', 'temporaryOnePoint', 'temporaryDoublePoints']) delete transferred[key];
  if (transferred.type === 'support') transferred.usedEffect = null;
  return transferred;
}
function cleanSupportForGrave(card) {
  const clean = { ...card, usedEffect: null };
  // Target selections and temporary modifiers belong to one combat only. Do
  // not persist them in the graveyard where a later recovery/replay can revive
  // stale choices or modifiers.
  for (const key of ['targetCardId', 'targetChoice', 'targetGraveType', 'targetResolved', 'temporaryOnePoint', 'temporaryDoublePoints']) delete clean[key];
  return clean;
}
function makeSide(color) { return { color, armyDeck: makeDeck(cardsData.armyCards, 'army', color), supportDeck: makeDeck(cardsData.supportCards, 'support', color), hand: [], played: [], drew: 0, submitted: false, status: { noSupportTurns: 0, armyOnePointTurns: 0, openDrawTurns: 0, deckEffectsBlocked: 0, returnSupportsNextTurn: false, returnSupportsActiveThisTurn: false, openDrawnCards: [], nextDrawBonus: 0, drawBonusThisTurn: 0, queenStealNextTurn: false, alchemistCardsNextTurn: [] } }; }
function createRoom({ code, hostId, name }) {
  const safeName = cleanName(name); if (!safeName) throw new Error('Oyuncu adı gerekli.');
  return { code, hostId, status: 'lobby', createdAt: Date.now(), players: { [hostId]: { id: hostId, name: safeName, ready: false, color: null, connected: true, resumeToken: token(), disconnectedAt: null } }, game: null, revision: 1 };
}
function joinRoom(room, { playerId, name }) {
  if (!room || room.status !== 'lobby') throw new Error('Bu Casus Belli odası yeni oyuncu kabul etmiyor.');
  if (typeof playerId !== 'string' || !playerId.trim()) throw new Error('Oyuncu bağlantı kimliği gerekli.');
  if (room.players[playerId]) throw new Error('Bu bağlantı kimliği odada zaten kullanılıyor.');
  if (Object.keys(room.players).length >= MAX_PLAYERS) throw new Error('Bu sürümde Casus Belli odası iki oyuncuyla sınırlı.');
  const safeName = cleanName(name); if (!safeName) throw new Error('Oyuncu adı gerekli.');
  if (Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr') === safeName.toLocaleLowerCase('tr'))) throw new Error('Bu odada aynı isim zaten kullanılıyor.');
  room.players[playerId] = { id: playerId, name: safeName, ready: false, color: null, connected: true, resumeToken: token(), disconnectedAt: null }; room.revision++; return room.players[playerId];
}
function setKingdom(room, playerId, color) {
  if (!room || room.status !== 'lobby') throw new Error('Krallık seçimi yalnızca lobide yapılabilir.');
  if (!['green', 'red'].includes(color)) throw new Error('Yeşil veya Kırmızı Krallık seçmelisin.');
  const player = room.players[playerId];
  if (!player || player.connected === false) throw new Error('Oyuncu bu odada bağlı değil.');
  if (player.ready) throw new Error('Krallık değiştirmek için önce hazır durumundan çık.');
  if (Object.values(room.players).some(p => p.id !== playerId && p.color === color)) throw new Error('Bu krallıkta zaten bir oyuncu var.');
  player.color = color; room.revision++; return publicRoom(room, playerId);
}

function supportTargetOptions(room, request) {
  const game = room?.game;
  const owner = game?.sides?.[request?.ownerId];
  const enemyEntry = Object.entries(game?.sides || {}).find(([id]) => id !== request?.ownerId);
  const enemy = enemyEntry?.[1];
  if (!owner || !enemy) return [];
  if (request.kind === 'hunter-support') {
    return enemy.played.filter(card => card.type === 'support').map(card => ({ id: card.id, name: card.name, type: card.type, speed: card.speed || '' }));
  }
  if (request.kind === 'hunter-army') {
    return enemy.played.filter(card => card.type === 'army').map(card => ({ id: card.id, name: card.name, type: card.type, points: Number(card.points) || 0 }));
  }
  if (request.kind === 'priest-grave') {
    const armyCount = (enemy.armyGrave || []).length;
    const supportCount = (enemy.supportGrave || []).length;
    return [
      ...(armyCount ? [{ value: 'army', name: 'Rakip Ordu Çöpü', count: armyCount }] : []),
      ...(supportCount ? [{ value: 'support', name: 'Rakip Destek Çöpü', count: supportCount }] : [])
    ];
  }
  return [];
}
function supportTargetView(room, viewerId) {
  const game = room?.game;
  if (game?.phase !== 'support-target-choice' || game.supportTargetOwnerId !== viewerId) return null;
  const request = game.supportTargetQueue?.[game.supportTargetIndex || 0];
  if (!request) return null;
  const card = game.sides?.[viewerId]?.played?.find(item => item.id === request.cardId);
  if (!card) return null;
  return { kind: request.kind, cardName: card.name, options: supportTargetOptions(room, request) };
}
function buildSupportTargetQueue(room) {
  const game = room.game;
  const rank = card => card.name === 'Avcı' ? -1 : ({ 'Çok hızlı': 0, 'Hızlı': 1, 'Yavaş': 2, 'Çok yavaş': 3 }[card.speed] ?? 4);
  const queue = [];
  for (const [ownerId, side] of Object.entries(game.sides)) {
    for (const card of side.played) {
      if (card.type !== 'support' || card.targetResolved) continue;
      const choice = Number(card.usedEffect ?? 0);
      if (card.name === 'Avcı' && choice === 1 && (side.status?.deckEffectsBlocked || 0) > 0) {
        // Match the local client: a previously active Okçu lock makes this target
        // meaningless, so do not interrupt the game with an impossible selection.
        continue;
      }
      if (card.name === 'Avcı' && (choice === 0 || choice === 1)) {
        queue.push({ ownerId, cardId: card.id, kind: choice === 0 ? 'hunter-support' : 'hunter-army', rank: rank(card) });
      } else if (card.name === 'Rahip' && choice === 0) {
        queue.push({ ownerId, cardId: card.id, kind: 'priest-grave', rank: rank(card) });
      }
    }
  }
  queue.sort((a, b) => a.rank - b.rank);
  return queue;
}
function advanceSupportTargetSelection(room) {
  const game = room.game;
  while ((game.supportTargetIndex || 0) < (game.supportTargetQueue || []).length) {
    const request = game.supportTargetQueue[game.supportTargetIndex];
    const card = game.sides?.[request.ownerId]?.played?.find(item => item.id === request.cardId);
    if (!card || card.targetResolved) { game.supportTargetIndex++; continue; }
    const options = supportTargetOptions(room, request);
    if (!options.length) {
      card.targetResolved = true;
      game.supportTargetLogs = game.supportTargetLogs || [];
      if (request.kind === 'priest-grave') game.supportTargetLogs.push(`${game.sides[request.ownerId].color}: Rahip'in seçebileceği rakip Çöp alanı boştu.`);
      else game.supportTargetLogs.push(`${game.sides[request.ownerId].color}: Avcı için uygun rakip ${request.kind === 'hunter-support' ? 'Destek' : 'Ordu'} hedefi yoktu.`);
      game.supportTargetIndex++;
      continue;
    }
    game.supportTargetOwnerId = request.ownerId;
    game.phase = 'support-target-choice';
    game.notice = request.kind === 'priest-grave'
      ? 'Rahip yeteneği: Rakibin hangi Çöp alanından kart alacağını seç.'
      : `Avcı yeteneği: Rakibin oynadığı hangi ${request.kind === 'hunter-support' ? 'Destek' : 'Ordu'} kartını hedefleyeceğini seç.`;
    return true;
  }
  delete game.supportTargetOwnerId;
  game.phase = 'revealed';
  if ((game.supportTargetQueue || []).length) game.notice = 'Hedef seçimleri tamamlandı. Oda sahibi çatışmayı çözümleyebilir.';
  return false;
}
function chooseSupportTarget(room, playerId, choice = {}) {
  const game = room?.game;
  if (room?.status !== 'playing' || game?.phase !== 'support-target-choice') throw new Error('Şu anda yetenek hedefi seçilemiyor.');
  if (game.supportTargetOwnerId !== playerId) throw new Error('Bu hedefi yalnızca yeteneğin sahibi seçebilir.');
  if (!choice || typeof choice !== 'object' || Array.isArray(choice)) throw new Error('Hedef seçimi geçersiz.');
  const request = game.supportTargetQueue?.[game.supportTargetIndex || 0];
  if (!request || request.ownerId !== playerId) throw new Error('Bekleyen hedef seçimi bulunamadı.');
  const card = game.sides[playerId]?.played?.find(item => item.id === request.cardId);
  if (!card) throw new Error('Hedef seçen kart artık çatışmada değil.');
  const options = supportTargetOptions(room, request);
  if (request.kind === 'hunter-support' || request.kind === 'hunter-army') {
    if (typeof choice.targetCardId !== 'string' || !options.some(option => option.id === choice.targetCardId)) throw new Error('Seçilen Avcı hedefi rakibin oynadığı uygun bir kart değil.');
    card.targetCardId = choice.targetCardId;
  } else if (request.kind === 'priest-grave') {
    if (!['army', 'support'].includes(choice.graveType) || !options.some(option => option.value === choice.graveType)) throw new Error('Seçilen Rahip Çöp alanında alınabilecek kart yok.');
    card.targetGraveType = choice.graveType;
  } else {
    throw new Error('Bilinmeyen hedef seçimi türü.');
  }
  card.targetResolved = true;
  game.supportTargetIndex++;
  advanceSupportTargetSelection(room);
  game.revision++; room.revision++;
  return publicRoom(room, playerId);
}

function publicRoom(room, viewerId) {
  const players = Object.values(room.players).map(p => ({ id: p.id, name: p.name, color: p.color || null, ready: !!p.ready, connected: p.connected !== false, isHost: p.id === room.hostId }));
  let game = null;
  if (room.game) {
    const own = room.game.sides[viewerId];
    game = { round: room.game.round, phase: room.game.phase, revision: room.game.revision, canChooseQueenSteal: room.game.phase === 'queen-choice' && room.game.queenStealOwnerId === viewerId,
      canChoosePriestCards: room.game.phase === 'priest-choice' && room.game.priestChoiceOwnerId === viewerId,
      canChooseSupportTarget: room.game.phase === 'support-target-choice' && room.game.supportTargetOwnerId === viewerId,
      supportTarget: supportTargetView(room, viewerId),
      priestOptions: room.game.phase === 'priest-choice' && room.game.priestChoiceOwnerId === viewerId ? { army: (own?.armyDeck || []).slice(0, 2).map(c => ({ id: c.id, name: c.name, points: c.points, type: c.type })), support: (own?.supportDeck || []).slice(0, 2).map(c => ({ id: c.id, name: c.name, speed: c.speed, type: c.type })) } : null,
      ownSide: own ? own.color : null, hand: own ? own.hand.map(c => ({ ...c })) : [],
      armyDeckCount: own ? own.armyDeck.length : 0, supportDeckCount: own ? own.supportDeck.length : 0,
      drawsRemaining: own ? Math.max(0, 2 + Math.max(0, Number(own.status?.drawBonusThisTurn) || 0) - own.drew) : 0, hasSubmitted: !!own?.submitted,
      opponents: Object.entries(room.game.sides).filter(([id]) => id !== viewerId).map(([id, s]) => ({ playerId: id, color: s.color, handCount: s.hand.length, armyDeckCount: s.armyDeck.length, supportDeckCount: s.supportDeck.length, drew: s.drew, submitted: s.submitted, openDrawnCards: (s.status?.openDrawTurns || 0) > 0 ? (s.status.openDrawnCards || []).map(c => ({ name: c.name, type: c.type })) : [] })),
      revealed: ['revealed', 'support-target-choice', 'resolved', 'finished'].includes(room.game.phase) ? Object.entries(room.game.sides).map(([id, s]) => ({ playerId: id, color: s.color, cards: s.played.map(c => ({ ...c })) })) : null,
      result: room.game.result ? JSON.parse(JSON.stringify(room.game.result)) : null,
      notice: room.game.notice || '' };
  }
  return { code: room.code, status: room.status, hostId: room.hostId, players, rematchVotes: [...(room.rematchVotes || [])], minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, revision: room.revision,
    canStart: room.status === 'lobby' && room.hostId === viewerId && players.length === MAX_PLAYERS && players.every(p => p.connected && p.ready && p.color) && new Set(players.map(p => p.color)).size === 2, game };
}
function setReady(room, playerId, ready) { const p = room?.players?.[playerId]; if (!p || p.connected === false) throw new Error('Oyuncu bu odada bağlı değil.'); if (room.status !== 'lobby') throw new Error('Oyun başladıktan sonra hazır durumu değiştirilemez.'); p.ready = Boolean(ready); room.revision++; return publicRoom(room, playerId); }
function advanceDrawPhase(game) {
  for (const side of Object.values(game.sides)) if (!side.armyDeck.length && !side.supportDeck.length) side.drew = 2 + Math.max(0, Number(side.status?.drawBonusThisTurn) || 0);
  if (!Object.values(game.sides).every(side => side.drew >= 2 + Math.max(0, Number(side.status?.drawBonusThisTurn) || 0))) return;
  const pending = Object.entries(game.sides).find(([, side]) => side.status?.queenStealNextTurn);
  if (pending) {
    const [ownerId, owner] = pending;
    const enemy = Object.entries(game.sides).find(([id]) => id !== ownerId)?.[1];
    if (enemy?.hand?.length) {
      game.phase = 'queen-choice'; game.queenStealOwnerId = ownerId;
      game.notice = 'Kraliçe etkisi: Rakibin elinden alınacak kapalı kart yuvasını seç.';
      return;
    }
    owner.status.queenStealNextTurn = false;
    game.notice = 'Kraliçe etkisi çözümlendi; rakibin elinde alınabilecek kart yoktu.';
  }
  game.phase = 'play';
  if (!game.notice.startsWith('Kraliçe etkisi')) game.notice = 'İki oyuncu da kart çekti. Her oyuncu elinden en az bir kartı kapalı oynamalı.';
}
function chooseQueenSteal(room, playerId, slotIndex) {
  const game = room?.game;
  if (room?.status !== 'playing' || game?.phase !== 'queen-choice') throw new Error('Şu anda Kraliçe kart seçimi yapılamaz.');
  if (game.queenStealOwnerId !== playerId) throw new Error('Bu kartı yalnızca Kraliçe etkisinin sahibi seçebilir.');
  if (!Number.isInteger(slotIndex) || slotIndex < 0) throw new Error('Geçersiz kart yuvası.');
  const owner = game.sides[playerId];
  const enemyEntry = Object.entries(game.sides).find(([id]) => id !== playerId);
  const enemy = enemyEntry?.[1];
  if (!enemy || slotIndex >= enemy.hand.length) throw new Error('Seçilen kart yuvası artık mevcut değil.');
  const [stolen] = enemy.hand.splice(slotIndex, 1);
  owner.hand.push(transferCardToColor(stolen, owner.color));
  owner.status.queenStealNextTurn = false;
  delete game.queenStealOwnerId;
  const next = Object.entries(game.sides).find(([, side]) => side.status?.queenStealNextTurn);
  if (next && Object.entries(game.sides).find(([id]) => id !== next[0])?.[1]?.hand?.length) {
    game.queenStealOwnerId = next[0];
    game.notice = 'Kraliçe etkisi: Diğer oyuncu rakibin elinden alınacak kapalı kart yuvasını seçiyor.';
  } else {
    if (next) next[1].status.queenStealNextTurn = false;
    game.phase = 'play';
    game.notice = 'Kraliçe etkisi çözümlendi. Her oyuncu elinden en az bir kartı kapalı oynamalı.';
  }
  game.revision++; room.revision++;
  return publicRoom(room, playerId);
}

function startGame(room, playerId) {
  if (!room || room.status !== 'lobby') throw new Error('Bu oda yeni oyun başlatamaz.');
  if (room.hostId !== playerId) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
  const players = Object.values(room.players); if (players.length !== MIN_PLAYERS || players.some(p => p.connected === false || !p.ready || !p.color) || new Set(players.map(p => p.color)).size !== 2) throw new Error('İki oyuncu da farklı krallıkları seçip hazır olmalı.');
  const ids = players.map(p => p.id);
  room.game = { round: 1, phase: 'draw', revision: 1, sides: Object.fromEntries(players.map(p => [p.id, makeSide(p.color)])), notice: 'İki oyuncu da Ordu veya Destek destesinden toplam iki kart çeksin.' };
  room.status = 'playing'; room.revision++; return publicRoom(room, playerId);
}
function drawCard(room, playerId, type) {
  if (room?.status !== 'playing' || room.game?.phase !== 'draw') throw new Error('Şu anda kart çekme aşaması değil.');
  const side = room.game.sides[playerId]; if (!side) throw new Error('Oyuncu bu maçta değil.');
  const drawLimit = 2 + Math.max(0, Number(side.status?.drawBonusThisTurn) || 0);
  if (side.drew >= drawLimit) throw new Error(drawLimit === 2 ? 'Bu tur iki kart çektin.' : `Bu tur ${drawLimit} kart çektin.`);
  if (type !== 'army' && type !== 'support') throw new Error('Geçersiz deste türü.');
  const deck = type === 'army' ? side.armyDeck : side.supportDeck;
  if (!deck.length) throw new Error('Bu deste boş. Diğer desteyi seç.');
  const card = deck.shift(); side.hand.push(card); side.drew++; if ((side.status?.openDrawTurns || 0) > 0) { side.status.openDrawnCards = side.status.openDrawnCards || []; side.status.openDrawnCards.push({ name: card.name, type: card.type }); } room.game.revision++; room.revision++;
  advanceDrawPhase(room.game);
  return publicRoom(room, playerId);
}
function submitCards(room, playerId, cardIds, supportChoices = {}, supportTargets = {}) {
  if (room?.status !== 'playing' || room.game?.phase !== 'play') throw new Error('Şu anda kapalı kart oynama aşaması değil.');
  const side = room.game.sides[playerId]; if (!side) throw new Error('Oyuncu bu maçta değil.');
  if (side.submitted) throw new Error('Bu tur kartlarını zaten oynadın.');
  if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > side.hand.length) throw new Error('Elinden en az bir geçerli kart seç.');
  if (supportChoices == null || typeof supportChoices !== 'object' || Array.isArray(supportChoices)) throw new Error('Destek yeteneği seçimleri geçersiz.');
  if (supportTargets == null || typeof supportTargets !== 'object' || Array.isArray(supportTargets)) throw new Error('Destek hedef seçimleri geçersiz.');
  const unique = [...new Set(cardIds)]; if (unique.length !== cardIds.length) throw new Error('Aynı kartı birden fazla seçemezsin.');
  if ((side.status?.noSupportTurns || 0) > 0 && unique.some(id => side.hand.some(c => c.id === id && c.type === 'support'))) throw new Error('Destek yasağı nedeniyle bu tur Destek kartı oynayamazsın.');
  const selected = unique.map(id => side.hand.find(c => c.id === id)); if (selected.some(c => !c)) throw new Error('Seçilen kartlardan biri elinde değil.');
  const selectedSupportIds = new Set(selected.filter(c => c.type === 'support').map(c => c.id));
  if (Object.keys(supportChoices).some(id => !selectedSupportIds.has(id))) throw new Error('Seçim yapılmayan veya elinde olmayan Destek kartı için yetenek gönderilemez.');
  if (Object.keys(supportTargets).some(id => !selectedSupportIds.has(id))) throw new Error('Seçilmeyen Destek kartı için hedef gönderilemez.');
  const unplayed = side.hand.filter(c => !unique.includes(c.id));
  side.played = selected.map(c => {
    const copy = { ...c };
    if (copy.type === 'support') {
      const choice = Object.prototype.hasOwnProperty.call(supportChoices, copy.id) ? supportChoices[copy.id] : 0;
      const max = Array.isArray(copy.effects) ? copy.effects.length : 1;
      if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= max) throw new Error(`Geçersiz destek yeteneği seçimi: ${copy.name}.`);
      copy.usedEffect = choice;
      if (Object.prototype.hasOwnProperty.call(supportTargets, copy.id)) {
        const target = supportTargets[copy.id];
        if (copy.name !== 'Hırsız' || !target || typeof target !== 'object' || !['army', 'support'].includes(target.deck) || !['top', 'bottom'].includes(target.edge)) throw new Error('Hırsız hedef seçimi geçersiz.');
        copy.targetChoice = { deck: target.deck, edge: target.edge };
      } else if (copy.name === 'Hırsız') {
        throw new Error('Hırsız yeteneği için deste ve uç seçimi yapmalısın.');
      }
    }
    return copy;
  });
  // Unplayed cards return to the bottom of their original deck, matching the local game loop.
  for (const card of unplayed) (card.type === 'army' ? side.armyDeck : side.supportDeck).push(card);
  side.hand = []; side.submitted = true; room.game.revision++; room.revision++;
  if (Object.values(room.game.sides).every(s => s.submitted)) { room.game.phase = 'revealed'; room.game.notice = 'İki tarafın kapalı hamleleri açıldı. Oda sahibi çatışmayı sunucuda çözümleyebilir.'; }
  return publicRoom(room, playerId);
}

function choosePriestCards(room, playerId, choices = {}) {
  const game = room?.game;
  if (room?.status !== 'playing' || game?.phase !== 'priest-choice') throw new Error('Şu anda Rahip kart seçimi yapılamaz.');
  if (game.priestChoiceOwnerId !== playerId) throw new Error('Rahip kartlarını yalnızca yeteneğin sahibi seçebilir.');
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) throw new Error('Rahip kart seçimleri geçersiz.');
  const side = game.sides[playerId];
  const chosen = [];
  for (const [type, field] of [['army', 'armyCardId'], ['support', 'supportCardId']]) {
    const id = choices[field];
    const deck = type === 'army' ? side.armyDeck : side.supportDeck;
    if ((id == null || id === '') && deck.length > 0) {
      throw new Error(`Rahip yeteneği için ${type === 'army' ? 'Ordu' : 'Destek'} destesinden bir kart seçmelisin.`);
    }
    if (id == null || id === '') continue;
    const topTwo = deck.slice(0, 2);
    const index = topTwo.findIndex(card => card.id === id);
    if (index < 0) throw new Error(`Seçilen ${type === 'army' ? 'Ordu' : 'Destek'} kartı destenin üstündeki iki kart arasında değil.`);
    chosen.push({ type, deck, index, card: topTwo[index] });
  }
  for (const item of chosen) {
    const [card] = item.deck.splice(item.index, 1);
    card.usedEffect = null; delete card.targetCardId;
    side.played.push(card);
  }
  game.priestChoicesResolved = game.priestChoicesResolved || [];
  game.priestChoiceLogs = game.priestChoiceLogs || [];
  if (game.priestChoiceCardId) game.priestChoicesResolved.push(game.priestChoiceCardId);
  game.priestChoiceLogs.push(`${side.color}: Rahip seçimiyle ${chosen.length} kart çatışmaya eklendi.`);
  delete game.priestChoiceOwnerId; delete game.priestChoiceCardId;
  game.phase = 'revealed';
  game.notice = `Rahip etkisi çözümlendi. ${chosen.length} kart çatışmaya eklendi; oda sahibi çözümlemeyi sürdürebilir.`;
  game.revision++; room.revision++;
  return publicRoom(room, playerId);
}

function resolveCombat(room, playerId) {
  if (room?.status !== 'playing' || room.game?.phase !== 'revealed') throw new Error('Çatışma yalnızca iki hamle açıldıktan sonra çözümlenebilir.');
  if (room.hostId !== playerId) throw new Error('Çatışmayı yalnızca oda sahibi çözümleyebilir.');
  const game = room.game;
  const completedPriests = new Set(game.priestChoicesResolved || []);
  for (const [ownerId, side] of Object.entries(game.sides)) {
    const priest = side.played.find(c => c.type === 'support' && c.name === 'Rahip' && Number(c.usedEffect) === 1 && !completedPriests.has(c.id));
    if (priest && (side.status?.deckEffectsBlocked || 0) > 0) {
      completedPriests.add(priest.id);
      game.priestChoiceLogs = game.priestChoiceLogs || [];
      game.priestChoiceLogs.push(`${side.color}: Rahip'in deste seçimi Okçu tarafından engellendi.`);
      continue;
    }
    if (priest) {
      game.phase = 'priest-choice'; game.priestChoiceOwnerId = ownerId; game.priestChoiceCardId = priest.id;
      game.notice = 'Rahip yeteneği: Ordu ve Destek destelerinin üstteki iki kartından birer kart seç.';
      game.revision++; room.revision++; return publicRoom(room, playerId);
    }
  }
  game.priestChoicesResolved = [...completedPriests];
  if (!Array.isArray(game.supportTargetQueue)) {
    game.supportTargetQueue = buildSupportTargetQueue(room);
    game.supportTargetIndex = 0;
    game.supportTargetLogs = [];
  }
  if ((game.supportTargetIndex || 0) < game.supportTargetQueue.length) {
    if (advanceSupportTargetSelection(room)) {
      game.revision++; room.revision++;
      return publicRoom(room, playerId);
    }
  }
  // Okçu effects apply to future turns, not cards already committed for this combat.
  const deckEffectsBlockedAtStart = Object.fromEntries(Object.entries(game.sides)
    .map(([id, side]) => [id, (side.status?.deckEffectsBlocked || 0) > 0]));
  const sides = Object.values(game.sides);
  const army = {};
  for (const [id, side] of Object.entries(game.sides)) {
    army[id] = side.played.filter(card => card.type === 'army').map(card => ({ ...card }));
    if ((side.status?.armyOnePointTurns || 0) > 0) for (const card of army[id]) card.temporaryOnePoint = true;
  }
  const supportRank = { 'Çok hızlı': 0, 'Hızlı': 1, 'Yavaş': 2, 'Çok yavaş': 3 };
  const supportLog = [...(game.priestChoiceLogs || []), ...(game.supportTargetLogs || [])];
  game.priestChoiceLogs = []; game.supportTargetLogs = [];
  const supportQueue = sides.flatMap(side => side.played
    .filter(card => card.type === 'support')
    .map(card => ({ playerId: Object.keys(game.sides).find(id => game.sides[id] === side), card })))
    .sort((a, b) => {
      const rank = card => card.name === 'Avcı' ? -1 : (supportRank[card.speed] ?? 4);
      return rank(a.card) - rank(b.card);
    });
  const earlySupportQueue = supportQueue.filter(({ card }) => card.name === 'Avcı' || card.speed !== 'Çok yavaş');
  const lateSupportQueue = supportQueue.filter(({ card }) => card.name !== 'Avcı' && card.speed === 'Çok yavaş');
  // Capture only an effect carried over from the previous round. A Şaklaban played
  // during this combat must not return itself or consume its own future-round flag.
  for (const side of sides) side.status.returnSupportsActiveThisTurn = !!side.status.returnSupportsNextTurn;
  const scheduledJesterThisRound = new Set();

  const processedArmyActions = new Set();
  const resolveArmyActions = () => {
    while (true) {
      const pending = Object.entries(game.sides).flatMap(([ownerId, side]) => side.played
        .filter(card => card.type === 'army' && !processedArmyActions.has(card.id))
        .map(card => ({ ownerId, card })))
        .sort((a, b) => (Number(a.card.points) || 0) - (Number(b.card.points) || 0));
      if (!pending.length) break;
      const { ownerId, card } = pending[0];
      processedArmyActions.add(card.id);
      const side = game.sides[ownerId];
      if (!side.played.includes(card)) continue;
      const enemyId = Object.keys(game.sides).find(id => id !== ownerId);
      const enemySide = game.sides[enemyId];
      const enemyPlayed = enemySide.played;
      const blocked = deckEffectsBlockedAtStart[ownerId] === true;
      if (card.effectType === 'play-top-army') {
        if (blocked) supportLog.push(`${side.color}: Rahibe etkisi Okçu tarafından engellendi.`);
        else if (side.armyDeck.length) {
          const extra = side.armyDeck.shift();
          if ((side.status?.armyOnePointTurns || 0) > 0) extra.temporaryOnePoint = true;
          side.played.push(extra); army[ownerId].push(extra);
          supportLog.push(`${side.color}: Rahibe destenin üstündeki ${extra.name} kartını çatışmaya ekledi.`);
        } else supportLog.push(`${side.color}: Rahibe etkisi uygulanmadı (Ordu destesi boş).`);
      } else if (card.effectType === 'opponent-no-support-next-turn') {
        enemySide.status.noSupportTurns = Math.max(enemySide.status.noSupportTurns || 0, 2);
        supportLog.push(`${side.color}: Cellat rakibin sonraki tur Destek oynamasını engelledi.`);
      } else if (card.effectType === 'return-opponent-very-slow-support') {
        if (blocked) supportLog.push(`${side.color}: Kuzeyli etkisi Okçu tarafından engellendi.`);
        else {
          const returned = enemyPlayed.filter(c => c.type === 'support' && c.speed === 'Çok yavaş');
          for (const target of returned) {
            enemyPlayed.splice(enemyPlayed.indexOf(target), 1);
            target.usedEffect = null; delete target.targetCardId; delete target.targetChoice;
            enemySide.supportDeck.push(target);
          }
          supportLog.push(`${side.color}: Kuzeyli ${returned.length} rakip Çok Yavaş Destek kartını destenin altına gönderdi.`);
        }
      } else if (card.effectType === 'cancel-prince-king') {
        const king = enemyPlayed.find(c => c.type === 'support' && c.name === 'Kral');
        if (king) {
          enemyPlayed.splice(enemyPlayed.indexOf(king), 1);
          enemySide.supportGrave = enemySide.supportGrave || [];
          const cancelled = cleanSupportForGrave(king);
          enemySide.supportGrave.push(cancelled);
          supportLog.push(`${side.color}: Suikastçı rakibin Kral Destek kartını iptal edip Çöp'e gönderdi.`);
        }
        if (enemyPlayed.some(c => c.type === 'army' && c.name === 'Prens')) {
          supportLog.push(`${side.color}: Suikastçı rakip Prens'in pasif yeteneğini bu çatışma boyunca iptal etti.`);
        }
      }
      // Büyücü's return effect is applied after all Support cards resolve, not here.
    }
  };

  const resolveSupportQueue = queue => {
    for (const { playerId: ownerId, card } of queue) {
    if (!game.sides[ownerId].played.includes(card)) continue;
    const enemyId = Object.keys(game.sides).find(id => id !== ownerId);
    const enemyPlayed = game.sides[enemyId].played;
    const choice = Number(card.usedEffect || 0);
    const deckTargeting = (card.name === 'Avcı' && choice === 1) || card.name === 'Hırsız' ||
      (card.name === 'Okçu' && choice === 0) || (card.name === 'Rahip' && choice === 1) ||
      (card.name === 'Simyacı' && choice === 1) || (card.name === 'Şaklaban' && choice === 1);
    if (deckTargeting && deckEffectsBlockedAtStart[ownerId]) {
      supportLog.push(`${game.sides[ownerId].color}: ${card.name} yeteneği Okçu'nun deste etkisi engeli nedeniyle uygulanmadı.`);
      continue;
    }
    if (card.name === 'Kral' && choice === 0) {
      // The card text says the next two turns. Use three here because nextRound
      // decrements the duration immediately when advancing away from this turn.
      // Do not modify army[] in this combat; the effect starts next round.
      game.sides[enemyId].status.armyOnePointTurns = Math.max(game.sides[enemyId].status.armyOnePointTurns || 0, 3);
      supportLog.push(`${game.sides[ownerId].color}: Kral rakibin sonraki 2 turundaki Ordu kartlarını 1 puan saydıracak.`);
    } else if (card.name === 'Kral' && choice === 1) {
      game.sides[ownerId].status.nextDrawBonus = Math.max(game.sides[ownerId].status.nextDrawBonus || 0, 2);
      supportLog.push(`${game.sides[ownerId].color}: Kral sonraki tur için 2 ekstra kart çekme hakkı verdi.`);
    } else if (card.name === 'Kraliçe' && choice === 0) {
      game.sides[ownerId].status.queenStealNextTurn = true;
      supportLog.push(`${game.sides[ownerId].color}: Kraliçe sonraki tur rakibin elinden bir kart alacak.`);
    } else if (card.name === 'Kraliçe' && choice === 1) {
      game.sides[enemyId].status.noSupportTurns = Math.max(game.sides[enemyId].status.noSupportTurns || 0, 4);
      supportLog.push(`${game.sides[ownerId].color}: Kraliçe rakibin sonraki 3 tur Destek kartı oynamasını engelledi.`);
    } else if (card.name === 'Okçu' && choice === 1) {
      game.sides[enemyId].status.deckEffectsBlocked = Math.max(game.sides[enemyId].status.deckEffectsBlocked || 0, 4);
      supportLog.push(`${game.sides[ownerId].color}: Okçu rakibin deste hedefleyen yeteneklerini sonraki 3 tur engelledi.`);
    } else if (card.name === 'Prenses' && choice === 0) {
      game.sides[enemyId].status.openDrawTurns = Math.max(game.sides[enemyId].status.openDrawTurns || 0, 3);
      game.sides[enemyId].status.openDrawnCards = [];
      supportLog.push(`${game.sides[ownerId].color}: Prenses rakibin sonraki 2 tur çektiği kartların açık gösterilmesini sağladı.`);
    } else if (card.name === 'Prenses' && choice === 1) {
      const owner = game.sides[ownerId];
      owner.status.princessCardsNextTurn = owner.status.princessCardsNextTurn || [];
      const targets = enemyPlayed.filter(c => c.type === 'army' && c.name === 'Prens');
      for (const target of targets) {
        enemyPlayed.splice(enemyPlayed.indexOf(target), 1);
        army[enemyId] = army[enemyId].filter(c => c.id !== target.id);
        const clean = transferCardToColor(target, owner.color);
        owner.status.princessCardsNextTurn.push(clean);
      }
      const kings = enemyPlayed.filter(c => c.type === 'support' && c.name === 'Kral');
      for (const target of kings) {
        enemyPlayed.splice(enemyPlayed.indexOf(target), 1);
        const clean = transferCardToColor(target, owner.color);
        owner.status.princessCardsNextTurn.push(clean);
      }
      supportLog.push(`${owner.color}: Prenses etkisi uygulandı; ${targets.length} Prens ve ${kings.length} Kral etkisizleştirilip sonraki tur ele alınmak üzere alındı.`);
    } else if (card.name === 'Okçu' && choice === 0) {
      const targetSide = game.sides[enemyId];
      const inspected = targetSide.armyDeck.slice(0, 3);
      const removed = inspected.filter(c => Number(c.points) <= 3);
      targetSide.armyGrave = targetSide.armyGrave || [];
      for (const target of removed) { targetSide.armyDeck.splice(targetSide.armyDeck.indexOf(target), 1); targetSide.armyGrave.push(target); }
      supportLog.push(`${game.sides[ownerId].color}: Okçu rakibin Ordu destesinin üstteki 3 kartını kontrol etti; ${removed.length} kartı Çöp'e gönderdi.`);
    } else if (card.name === 'Avcı' && choice === 0) {
      // The rules allow the player to choose any rival Support card on the field.
      const target = enemyPlayed.find(c => c.type === 'support' && c.id === card.targetCardId);
      if (target) {
        enemyPlayed.splice(enemyPlayed.indexOf(target), 1);
        const targetSide = game.sides[enemyId]; targetSide.supportGrave = targetSide.supportGrave || []; targetSide.supportGrave.push(cleanSupportForGrave(target));
        supportLog.push(`${game.sides[ownerId].color}: Avcı rakibin ${target.name} Destek kartını iptal edip Çöp'e gönderdi.`);
      } else supportLog.push(`${game.sides[ownerId].color}: Avcı'nın kaldıracağı rakip Destek kartı yoktu.`);
    } else if (card.name === 'Avcı' && choice === 1) {
      const target = enemyPlayed.find(c => c.type === 'army' && c.id === card.targetCardId);
      if (target) {
        enemyPlayed.splice(enemyPlayed.indexOf(target), 1); army[enemyId] = army[enemyId].filter(c => c.id !== target.id);
        game.sides[ownerId].armyDeck.push(transferCardToColor(target, game.sides[ownerId].color));
        supportLog.push(`${game.sides[ownerId].color}: Avcı rakibin ${target.name} Ordu kartını kendi Ordu destesinin altına aldı.`);
      } else supportLog.push(`${game.sides[ownerId].color}: Avcı'nın alabileceği rakip Ordu kartı yoktu.`);
    } else if (card.name === 'Hırsız' && choice === 0) {
      const owner = game.sides[ownerId], targetSide = game.sides[enemyId];
      const target = card.targetChoice || { deck: 'army', edge: 'top' };
      const targetDeck = target.deck === 'support' ? targetSide.supportDeck : targetSide.armyDeck;
      const index = target.edge === 'bottom' ? targetDeck.length - 1 : 0;
      if (index >= 0 && targetDeck.length > 0) {
        const [stolen] = targetDeck.splice(index, 1);
        (stolen.type === 'support' ? owner.supportDeck : owner.armyDeck).push(transferCardToColor(stolen, owner.color));
        owner.played.splice(owner.played.indexOf(card), 1); owner.supportGrave = owner.supportGrave || [];
        owner.supportGrave.push(cleanSupportForGrave(card));
        supportLog.push(`${owner.color}: Hırsız rakibin ${target.edge === 'top' ? 'üst' : 'alt'} ${target.deck === 'support' ? 'Destek' : 'Ordu'} destesinden ${stolen.name} kartını çaldı; Hırsız Çöp'e gitti.`);
      } else supportLog.push(`${owner.color}: Hırsız'ın seçtiği rakip destesi boştu; kart çalınamadı.`);
      delete card.targetChoice;
    } else if (card.name === 'Hırsız' && choice === 1) {
      const owner = game.sides[ownerId], targetSide = game.sides[enemyId];
      const target = card.targetChoice || { deck: 'army', edge: 'top' };
      const targetDeck = target.deck === 'support' ? targetSide.supportDeck : targetSide.armyDeck;
      const affected = Math.min(5, targetDeck.length);
      if (affected > 1) {
        const start = target.edge === 'bottom' ? targetDeck.length - affected : 0;
        const segment = targetDeck.splice(start, affected).reverse();
        targetDeck.splice(start, 0, ...segment);
        supportLog.push(`${owner.color}: Hırsız rakibin ${target.edge === 'bottom' ? 'alt' : 'üst'} ${affected} ${target.deck === 'support' ? 'Destek' : 'Ordu'} kartının sırasını tersine çevirdi.`);
      } else supportLog.push(`${owner.color}: Hırsız'ın sıralamasını değiştirebileceği yeterli rakip deste kartı yoktu.`);
      delete card.targetChoice;
    } else if (card.name === 'Şaklaban' && choice === 1) {
      const owner = game.sides[ownerId], targetSide = game.sides[enemyId];
      const ownArmyBottom = owner.armyDeck.length - 1;
      const enemySupportBottom = targetSide.supportDeck.length - 1;
      if (ownArmyBottom >= 0 && enemySupportBottom >= 0) {
        const ownCard = owner.armyDeck.pop();
        const enemyCard = targetSide.supportDeck.pop();
        // Preserve each card's type/deck and swap ownership, as the rules specify.
        owner.supportDeck.push(transferCardToColor(enemyCard, owner.color));
        targetSide.armyDeck.push(transferCardToColor(ownCard, targetSide.color));
        supportLog.push(`${owner.color}: Şaklaban kendi Ordu destesinin en alt kartını rakibin Destek destesinin en alt kartıyla değiştirdi.`);
      } else {
        supportLog.push(`${owner.color}: Şaklaban'ın kart değiştirmesi için iki destede de kart bulunmalı.`);
      }
    } else if (card.name === 'Rahip' && choice === 0) {
      const owner = game.sides[ownerId], targetSide = game.sides[enemyId];
      targetSide.armyGrave = targetSide.armyGrave || []; targetSide.supportGrave = targetSide.supportGrave || [];
      const targetGrave = card.targetGraveType === 'support' ? targetSide.supportGrave : targetSide.armyGrave;
      const recovered = targetGrave.pop();
      if (recovered) {
        const clean = transferCardToColor(recovered, owner.color);
        (clean.type === 'support' ? owner.supportDeck : owner.armyDeck).push(clean);
        supportLog.push(`${owner.color}: Rahip rakibin ${card.targetGraveType === 'support' ? 'Destek' : 'Ordu'} Çöp alanından ${clean.name} kartını kendi destesine aldı.`);
      } else supportLog.push(`${owner.color}: Rahip'in seçtiği rakip Çöp alanında alınabilecek kart yoktu.`);
      delete card.targetGraveType;
    } else if (card.name === 'Simyacı' && choice === 0) {
      const ownSide = game.sides[ownerId]; ownSide.supportGrave = ownSide.supportGrave || [];
      const returned = ownSide.supportGrave.pop();
      if (returned) { ownSide.status.alchemistCardsNextTurn = ownSide.status.alchemistCardsNextTurn || []; ownSide.status.alchemistCardsNextTurn.push({ ...returned, usedEffect: undefined }); supportLog.push(`${ownSide.color}: Simyacı ${returned.name} kartını sonraki turun başında ele almak üzere ayırdı.`); }
      else supportLog.push(`${ownSide.color}: Simyacı'nın Destek Çöp'ü boştu; kart alınamadı.`);
    } else if (card.name === 'Simyacı' && choice === 1) {
      const targetSide = game.sides[enemyId];
      const top = targetSide.supportDeck[0];
      if (top && ['Yavaş', 'Çok yavaş'].includes(top.speed)) { targetSide.supportDeck.shift(); targetSide.supportGrave = targetSide.supportGrave || []; targetSide.supportGrave.push(cleanSupportForGrave(top)); supportLog.push(`${game.sides[ownerId].color}: Simyacı rakibin ${top.name} Destek kartını Çöp'e gönderdi.`); }
      else supportLog.push(`${game.sides[ownerId].color}: Simyacı rakibin üst Destek kartını kontrol etti; kart Yavaş/Çok Yavaş olmadığı için etkilenmedi.`);
    } else if (card.name === 'Şaklaban' && choice === 0) {
      game.sides[ownerId].status.returnSupportsNextTurn = true;
      scheduledJesterThisRound.add(ownerId);
      supportLog.push(`${game.sides[ownerId].color}: Şaklaban sonraki tur oynanacak Destek kartlarının tur sonunda desteye dönmesini ayarladı.`);
    } else if (card.name === 'Demirci' && choice === 0) {
      const owner = game.sides[ownerId];
      owner.armyGrave = owner.armyGrave || [];
      // Find the most recently discarded Army card, rather than blindly popping
      // the graveyard top: imported/older saves may contain mixed card types.
      let graveIndex = -1;
      for (let i = owner.armyGrave.length - 1; i >= 0; i--) {
        if (owner.armyGrave[i]?.type === 'army') { graveIndex = i; break; }
      }
      const recovered = graveIndex >= 0 ? owner.armyGrave.splice(graveIndex, 1)[0] : null;
      if (recovered) {
        const replayed = { ...recovered, usedEffect: null, temporaryOnePoint: false, temporaryDoublePoints: false };
        delete replayed.targetCardId;
        owner.played.push(replayed);
        army[ownerId].push(replayed);
        supportLog.push(`${owner.color}: Demirci ${replayed.name} kartını Ordu Çöp'ünden yeniden çatışmaya oynadı.`);
      } else {
        supportLog.push(`${owner.color}: Demirci'nin yeniden oynayabileceği Ordu Çöp kartı yoktu.`);
      }
    } else if (card.name === 'Demirci' && choice === 1) {
      for (const armyCard of army[ownerId]) armyCard.temporaryDoublePoints = true;
      supportLog.push(`${game.sides[ownerId].color}: Demirci dost Ordu puanlarını ikiye katladı.`);
    } else if (card.name === 'Rahip' && choice === 1) {
      supportLog.push(deckEffectsBlockedAtStart[ownerId]
        ? `${game.sides[ownerId].color}: Rahip'in deste seçim yeteneği Okçu tarafından engellendi.`
        : `${game.sides[ownerId].color}: Rahip'in desteden seçtiği kartlar çatışmaya eklendi.`);
    } else if (card.name === 'Kraliçe' || card.name === 'Hırsız' || card.name === 'Okçu' || card.name === 'Simyacı' || card.name === 'Şaklaban' || card.name === 'Kral' || card.name === 'Prenses' || card.name === 'Demirci') {
      supportLog.push(`${game.sides[ownerId].color}: ${card.name} yeteneği ${card.effects?.[choice] || ''} hedef seçimi veya sonraki tur durumu gerektiriyor; henüz uygulanmadı.`);
    }
    }
  };
  resolveSupportQueue(earlySupportQueue);
  resolveArmyActions();
  resolveSupportQueue(lateSupportQueue);
  // A very-slow Support such as Demirci may add a new Army card; resolve only
  // those new Army actions and never re-trigger cards already processed above.
  resolveArmyActions();
  const wizardReturns = new Set();
  for (const [id, side] of Object.entries(game.sides)) {
    if (!side.played.some(card => card.type === 'army' && card.effectType === 'return-own-supports')) continue;
    if (deckEffectsBlockedAtStart[id]) {
      supportLog.push(`${side.color}: Büyücü etkisi Okçu tarafından engellendi; Destek kartları tur sonunda desteye dönmeyecek.`);
    } else {
      wizardReturns.add(id);
      supportLog.push(`${side.color}: Büyücü bu çatışmada oynanan dost Destek kartlarını tur sonunda desteye döndürecek.`);
    }
  }
  for (const [id, side] of Object.entries(game.sides)) {
    if (side.status?.returnSupportsActiveThisTurn || wizardReturns.has(id)) {
      const returning = side.played.filter(c => c.type === 'support');
      for (const card of returning) {
        side.played.splice(side.played.indexOf(card), 1);
        card.usedEffect = null; delete card.targetCardId; delete card.targetChoice;
        side.supportDeck.push(card);
      }
      const labels = [];
      if (side.status?.returnSupportsActiveThisTurn) labels.push('Şaklaban');
      if (wizardReturns.has(id)) labels.push('Büyücü');
      if (side.status?.returnSupportsActiveThisTurn && !scheduledJesterThisRound.has(id)) side.status.returnSupportsNextTurn = false;
      side.status.returnSupportsActiveThisTurn = false;
      supportLog.push(`${side.color}: ${labels.join('/')} etkisiyle ${returning.length} Destek kartı tur sonunda desteye döndü.`);
    }
  }
  const details = {};
  for (const [id, side] of Object.entries(game.sides)) {
    const own = army[id];
    const enemyId = Object.keys(game.sides).find(otherId => otherId !== id);
    const enemy = army[enemyId];
    const hasAssassin = enemy.some(card => card.effectType === 'cancel-prince-king');
    const hasNinja = enemy.some(card => card.effectType === 'halve-even-opponent-army');
    details[id] = own.map(card => {
      let points = Number(card.points) || 0;
      const modifiers = [];
      if (card.effectType === 'army-neighbor-bonus' && own.length > 1) { points = 4; modifiers.push('Köylü komşu ordu bonusu: 4 puan'); }
      if (card.effectType === 'isolated-bonus' && own.length === 1) { points = 6; modifiers.push('Keşiş yalnızlık bonusu: 6 puan'); }
      if (card.effectType === 'friendly-army-plus-three' && !hasAssassin) { /* Prens's own card does not receive +3. */ }
      else if (own.some(c => c.effectType === 'friendly-army-plus-three') && card.name !== 'Prens' && !hasAssassin && card.effectType !== 'immune') { points += 3; modifiers.push('Prens: +3 dost Ordu puanı'); }
      if (card.temporaryOnePoint && card.effectType !== 'immune') { points = 1; modifiers.push('Kral: 1 puan'); }
      if (card.temporaryDoublePoints && card.effectType !== 'immune') { points *= 2; modifiers.push('Demirci: ×2'); }
      if (hasAssassin && card.name === 'Prens') modifiers.push('Suikastçı: Prens yeteneği iptal edildi');
      if (hasNinja && card.effectType !== 'immune' && points > 0 && points % 2 === 0) { points = 2; modifiers.push('Rakip Ninja: çift puanlı ordu 2 puan sayıldı'); }
      return { id: card.id, name: card.name, basePoints: card.points, finalPoints: points, modifiers };
    });
  }
  const scores = {};
  for (const id of Object.keys(game.sides)) scores[id] = details[id].reduce((sum, card) => sum + card.finalPoints, 0);
  const ids = Object.keys(game.sides);
  let winnerId = null;
  if (scores[ids[0]] > scores[ids[1]]) winnerId = ids[0];
  else if (scores[ids[1]] > scores[ids[0]]) winnerId = ids[1];
  const lost = {};
  for (const id of ids) {
    const side = game.sides[id];
    const ownArmy = army[id];
    const ownScore = details[id];
    const supportPlayed = side.played.filter(card => card.type === 'support');
    side.supportGrave = side.supportGrave || [];
    side.armyGrave = side.armyGrave || [];
    side.supportGrave.push(...supportPlayed.map(cleanSupportForGrave));
    if (!winnerId) {
      side.armyGrave.push(...ownArmy);
      lost[id] = ownArmy.map(card => card.name);
    } else if (winnerId !== id) {
      side.armyGrave.push(...ownArmy);
      lost[id] = ownArmy.map(card => card.name);
    } else {
      const enemyId = ids.find(otherId => otherId !== id);
      const enemyMax = Math.max(0, ...(details[enemyId] || []).map(card => card.finalPoints));
      const survivors = [];
      const lostNames = [];
      for (const card of ownArmy) {
        const score = ownScore.find(item => item.id === card.id)?.finalPoints ?? card.points;
        if (score <= enemyMax) { side.armyGrave.push(card); lostNames.push(card.name); }
        else survivors.push(card);
      }
      side.armyDeck.push(...survivors);
      lost[id] = lostNames;
    }
    // Preserve the played cards until the next round so both clients can see
    // the revealed combat after the server has moved cards into their zones.
    side.submitted = true;
  }
  for (const side of Object.values(game.sides)) {
    for (const card of side.played) {
      delete card.targetResolved;
      delete card.targetCardId;
      delete card.targetGraveType;
    }
  }
  game.result = { round: game.round, scores, winnerId, scoreDetails: details, armyLost: lost, supportLog };
  game.phase = 'resolved';
  const winnerName = winnerId ? room.players[winnerId]?.name || game.sides[winnerId].color : null;
  game.notice = winnerId ? `${winnerName} bu çatışmayı ${scores[winnerId]} puanla kazandı.` : `Berabere! İki taraf da ${scores[ids[0]]} puan aldı.`;
  const exhausted = ids.filter(id => game.sides[id].armyDeck.length === 0 && game.sides[id].supportDeck.length === 0);
  if (exhausted.length) {
    room.status = 'finished';
    game.phase = 'finished';
    game.result.matchOver = true;
    game.result.matchReason = 'Bir krallığın hem Ordu hem Destek destesi tükendiğinde maç sona erer.';
    if (exhausted.length === 2) {
      game.result.matchOutcome = 'draw';
      game.result.matchWinnerId = null;
      game.result.matchLoserId = null;
      game.notice = 'Maç berabere bitti. İki krallığın da Ordu ve Destek destesi tükendi.';
    } else {
      const loserId = exhausted[0];
      const matchWinnerId = ids.find(id => id !== loserId);
      game.result.matchOutcome = 'win';
      game.result.matchWinnerId = matchWinnerId;
      game.result.matchLoserId = loserId;
      game.notice = `Maç sona erdi: ${room.players[matchWinnerId]?.name || game.sides[matchWinnerId].color} kazandı. ${room.players[loserId]?.name || game.sides[loserId].color} krallığının iki destesi de tükendi.`;
    }
  }
  game.revision++; room.revision++;
  return publicRoom(room, playerId);
}

function nextRound(room, playerId) {
  if (room?.status !== 'playing' || room.game?.phase !== 'resolved') throw new Error('Yeni tura yalnızca çatışma çözümlendikten sonra geçilebilir.');
  if (room.hostId !== playerId) throw new Error('Yeni turu yalnızca oda sahibi başlatabilir.');
  const game = room.game;
  for (const side of Object.values(game.sides)) {
    side.played = []; side.drew = 0; side.submitted = false;
    side.status = side.status || {};
    side.status.drawBonusThisTurn = Math.max(0, Number(side.status.nextDrawBonus) || 0);
    side.status.nextDrawBonus = 0;
    const princessCards = Array.isArray(side.status.princessCardsNextTurn) ? side.status.princessCardsNextTurn : [];
    if (princessCards.length) {
      side.hand.push(...princessCards.map(card => ({ ...card, usedEffect: undefined })));
      side.status.princessCardsNextTurn = [];
    }
    const alchemistCards = Array.isArray(side.status.alchemistCardsNextTurn) ? side.status.alchemistCardsNextTurn : [];
    if (alchemistCards.length) {
      side.hand.push(...alchemistCards.map(card => ({ ...card, usedEffect: undefined })));
      side.status.alchemistCardsNextTurn = [];
    }
    for (const key of ['noSupportTurns', 'armyOnePointTurns', 'openDrawTurns', 'deckEffectsBlocked']) side.status[key] = Math.max(0, (side.status[key] || 0) - 1);
    side.status.openDrawnCards = []; side.status.returnSupportsActiveThisTurn = false;
  }
  delete game.supportTargetQueue; delete game.supportTargetIndex; delete game.supportTargetOwnerId; delete game.supportTargetLogs;
  game.round++; game.phase = 'draw'; game.result = null; game.notice = 'Yeni tur başladı. Her oyuncu iki kart çeksin.'; advanceDrawPhase(game); game.revision++; room.revision++; return publicRoom(room, playerId);
}
function markDisconnected(room, playerId, now = Date.now()) {
  const p = room?.players?.[playerId];
  if (!p) return null;
  // Duplicate disconnect notifications must not extend the reconnect grace period.
  if (p.connected === false && p.disconnectedAt != null) {
    return { resumeToken: p.resumeToken, disconnectedAt: p.disconnectedAt };
  }
  p.connected = false;
  p.disconnectedAt = now;
  p.ready = false;
  room.revision++;
  return { resumeToken: p.resumeToken, disconnectedAt: p.disconnectedAt };
}
function resumePlayer(room, newPlayerId, resumeToken, now = Date.now()) {
  if (!room || typeof newPlayerId !== 'string' || !newPlayerId || !resumeToken) return null;
  const p = Object.values(room.players).find(x => x.connected === false && x.resumeToken === resumeToken);
  if (!p || p.disconnectedAt == null || now - p.disconnectedAt < 0 || now - p.disconnectedAt > RESUME_GRACE_MS) return null;
  const oldId = p.id;
  // Never let a valid resume token overwrite another live room member's socket
  // entry. Socket IDs are normally unique, but the room engine should enforce
  // that invariant rather than trusting every caller forever.
  if (newPlayerId !== oldId && room.players[newPlayerId]) return null;
  delete room.players[oldId]; p.id = newPlayerId; p.connected = true; p.disconnectedAt = null; p.resumeToken = token(); room.players[newPlayerId] = p;
  if (room.hostId === oldId) room.hostId = newPlayerId;
  if (room.game?.sides?.[oldId]) { room.game.sides[newPlayerId] = room.game.sides[oldId]; delete room.game.sides[oldId]; }
  // A reconnect can happen after combat resolves but before the next round.
  // Re-key result references as well as live side state so the resumed client
  // still sees the correct winner and per-player score details.
  if (room.game?.result && typeof room.game.result === 'object') {
    const result = room.game.result;
    for (const key of ['winnerId', 'matchWinnerId', 'matchLoserId']) {
      if (result[key] === oldId) result[key] = newPlayerId;
    }
    for (const key of ['scores', 'scoreDetails', 'armyLost']) {
      const value = result[key];
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, oldId)) {
        value[newPlayerId] = value[oldId];
        delete value[oldId];
      }
    }
  }
  // Pending private choices are keyed by socket ID too. Rebind every owner
  // reference with the player slot, otherwise reconnecting during a choice
  // phase strands the game even though the player/session was recovered.
  const game = room.game;
  if (game?.queenStealOwnerId === oldId) game.queenStealOwnerId = newPlayerId;
  if (game?.priestChoiceOwnerId === oldId) game.priestChoiceOwnerId = newPlayerId;
  if (game?.supportTargetOwnerId === oldId) game.supportTargetOwnerId = newPlayerId;
  if (Array.isArray(game?.supportTargetQueue)) {
    for (const request of game.supportTargetQueue) {
      if (request?.ownerId === oldId) request.ownerId = newPlayerId;
    }
  }
  room.revision++; return p;
}

function requestRematch(room, playerId) {
  if (!room || room.status !== 'finished' || !room.players?.[playerId]) throw new Error('Yeni maç isteği yalnızca tamamlanmış maçın oyuncuları tarafından verilebilir.');
  room.rematchVotes = room.rematchVotes || [];
  if (!room.rematchVotes.includes(playerId)) room.rematchVotes.push(playerId);
  const playerIds = Object.keys(room.players);
  const started = playerIds.length === 2 && playerIds.every(id => room.rematchVotes.includes(id));
  if (started) {
    room.status = 'lobby';
    room.game = null;
    room.rematchVotes = [];
    for (const player of Object.values(room.players)) { player.ready = false; player.color = null; }
    room.revision++;
  } else room.revision++;
  return { started, room: publicRoom(room, playerId) };
}

function leaveRoom(room, playerId) {
  if (!room?.players?.[playerId]) return { deleted: false };
  delete room.players[playerId];
  room.revision++;
  if (!Object.keys(room.players).length) return { deleted: true };
  if (room.hostId === playerId) room.hostId = Object.keys(room.players)[0];
  if (room.status === 'playing' || room.status === 'finished' || room.status === 'interrupted') {
    room.status = 'lobby';
    room.game = null;
    room.rematchVotes = [];
    for (const player of Object.values(room.players)) { player.ready = false; player.color = null; }
  }
  return { deleted: false };
}
module.exports = { MIN_PLAYERS, MAX_PLAYERS, RESUME_GRACE_MS, cleanName, createRoom, joinRoom, publicRoom, setReady, setKingdom, startGame, drawCard, submitCards, chooseQueenSteal, choosePriestCards, chooseSupportTarget, resolveCombat, nextRound, markDisconnected, resumePlayer, requestRematch, leaveRoom };
