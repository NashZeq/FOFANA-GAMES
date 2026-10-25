'use strict';

const WORDS = {
  genel: ['Astronot','Dondurma','Kütüphane','Düğün','Uçak','Kamp','Tiyatro','Şemsiye','Asansör','Piknik','Fenerbahçe','Yağmur','Saat','Tren','Fotoğraf'],
  yemek: ['Mantı','Lahmacun','Menemen','Baklava','Simit','Kumpir','Mercimek çorbası','İskender kebap','Sarma','Künefe'],
  yer: ['Hastane','Havalimanı','AVM','Üniversite','Plaj','Stadyum','Müze','Kamp alanı','Kütüphane','Lunapark'],
  nesne: ['Kulaklık','Matkap','Valiz','Klavye','Termos','Bisiklet','Mikrofon','Şemsiye','Kamera','Kumanda']
};
const HINTS = {
  'Astronot':'Uzay','Dondurma':'Soğuk','Kütüphane':'Kitap','Düğün':'Nikâh','Uçak':'Pilot','Kamp':'Çadır','Tiyatro':'Sahne','Şemsiye':'Yağmur','Asansör':'Kat','Piknik':'Örtü','Fenerbahçe':'Sarı-lacivert','Yağmur':'Bulut','Saat':'Zaman','Tren':'Ray','Fotoğraf':'Kare',
  'Mantı':'Yoğurt','Lahmacun':'Fırın','Menemen':'Yumurta','Baklava':'Şerbet','Simit':'Susam','Kumpir':'Patates','Mercimek çorbası':'Kaşık','İskender kebap':'Döner','Sarma':'Yaprak','Künefe':'Peynir',
  'Hastane':'Doktor','Havalimanı':'Uçuş','AVM':'Mağaza','Üniversite':'Kampüs','Plaj':'Kum','Stadyum':'Tribün','Müze':'Eser','Kamp alanı':'Doğa','Lunapark':'Eğlence',
  'Kulaklık':'Ses','Matkap':'Delik','Valiz':'Seyahat','Klavye':'Tuş','Termos':'Sıcak','Bisiklet':'Pedal','Mikrofon':'Ses','Kamera':'Lens','Kumanda':'Televizyon'
};
const CATEGORIES = ['genel','yemek','yer','nesne'];
const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
const shuffle = (arr, rng = Math.random) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

function makeGame(players, settings = {}, rng = Math.random) {
  const ids = players.map(p => p.id);
  if (ids.length < 4 || ids.length > 12) throw new Error('Oyuncu sayısı 4 ile 12 arasında olmalı.');
  const imposters = Number(settings.imposters) === 2 ? 2 : 1;
  if (imposters >= ids.length - imposters) throw new Error('Masum oyuncu sayısı Imposter sayısından fazla olmalı.');
  const category = CATEGORIES.includes(settings.category) ? settings.category : 'genel';
  const pool = WORDS[category];
  const word = pool[Math.floor(rng() * pool.length)];
  const chosen = new Set(shuffle(ids, rng).slice(0, imposters));
  const roles = Object.fromEntries(ids.map(id => [id, { imposter: chosen.has(id), alive: true, ready: false }]));
  return { word, hint: HINTS[word] || 'Gündelik hayat', roles, alive: [...ids], votes: {}, phase: 'reveal', round: 1, lastResult: null, winner: null };
}

function resolveVotes(game, players) {
  const active = game.alive;
  const tally = active.map(id => ({ id, name: players[id]?.name || 'Ayrılan oyuncu', votes: Object.values(game.votes).filter(target => target === id).length }));
  const max = Math.max(0, ...tally.map(x => x.votes));
  const leaders = tally.filter(x => x.votes === max && max > 0);
  const base = { tally, eliminatedId: null, eliminatedName: null, eliminatedRole: null, tied: leaders.length !== 1, winner: null, word: null };
  if (leaders.length !== 1) {
    game.round += 1;
    game.votes = {};
    game.phase = 'discussion';
    game.lastResult = { ...base, message: 'Oylama berabere kaldı. Kimse elenmedi.' };
    return game.lastResult;
  }
  const eliminatedId = leaders[0].id;
  const wasImposter = !!game.roles[eliminatedId]?.imposter;
  game.alive = active.filter(id => id !== eliminatedId);
  const livingImposters = game.alive.filter(id => game.roles[id]?.imposter).length;
  const livingCivilians = game.alive.length - livingImposters;
  const result = { ...base, tied: false, eliminatedId, eliminatedName: leaders[0].name, eliminatedRole: wasImposter ? 'imposter' : 'civilian', livingImposters, livingCivilians };
  if (wasImposter && livingImposters === 0) {
    game.phase = 'guess'; game.guesserId = eliminatedId;
    result.message = `${leaders[0].name} son Imposter olarak yakalandı. Son bir tahmin hakkı var.`;
  } else if (livingImposters >= livingCivilians) {
    game.phase = 'finished'; game.winner = 'imposter'; result.winner = 'imposter'; result.word = game.word;
    result.message = 'Imposter ekibi kazandı.';
  } else {
    game.round += 1; game.votes = {}; game.phase = 'discussion';
    result.message = wasImposter ? `${leaders[0].name} Imposter olarak yakalandı. Oyun devam ediyor.` : `${leaders[0].name} masum oyuncuydu. Oyun devam ediyor.`;
  }
  game.lastResult = result;
  return result;
}

function castVote(game, players, voterId, targetId) {
  if (game.phase !== 'voting') throw new Error('Şu anda oylama açık değil.');
  if (!game.alive.includes(voterId)) throw new Error('Elenen oyuncu oy veremez.');
  if (!game.alive.includes(targetId) || voterId === targetId) throw new Error('Geçersiz hedef.');
  if (Object.prototype.hasOwnProperty.call(game.votes, voterId)) throw new Error('Bu turda zaten oy verdin.');
  game.votes[voterId] = targetId;
  // A disconnected player remains recoverable for a short grace period, but must not
  // freeze the vote. Their already-cast vote still counts; otherwise connected alive
  // players determine when the ballot can resolve.
  const connectedAlive = game.alive.filter(id => players[id]?.connected !== false);
  if (connectedAlive.every(id => Object.prototype.hasOwnProperty.call(game.votes, id))) return resolveVotes(game, players);
  return null;
}

function submitGuess(game, playerId, guess) {
  if (game.phase !== 'guess') throw new Error('Şu anda kelime tahmini yapılamaz.');
  if (!game.roles[playerId]?.imposter || game.guesserId !== playerId) throw new Error('Bu tahmini yalnızca son yakalanan Imposter yapabilir.');
  // Socket payloads are untrusted: arrays/objects can stringify to a valid word.
  // Accept only a bounded string so implicit JavaScript coercion cannot win a guess.
  if (typeof guess !== 'string' || guess.length > 100) throw new Error('Tahmin metin olmalı ve en fazla 100 karakter içermeli.');
  const normalize = value => value.trim().toLocaleLowerCase('tr-TR');
  const correct = normalize(guess) === normalize(game.word);
  game.phase = 'finished'; game.winner = correct ? 'imposter' : 'civilians';
  game.lastResult = { ...(game.lastResult || {}), winner: game.winner, word: game.word, guessCorrect: correct, message: correct ? 'Imposter gizli kelimeyi doğru tahmin etti ve kazandı.' : 'Imposter kelimeyi bulamadı. Masum oyuncular kazandı.' };
  return game.lastResult;
}

function rebindPlayerIdentity(game, oldId, newId) {
  if (!game || !oldId || !newId || oldId === newId) return game;
  if (game.roles && Object.prototype.hasOwnProperty.call(game.roles, oldId)) {
    game.roles[newId] = game.roles[oldId];
    delete game.roles[oldId];
  }
  if (Array.isArray(game.alive)) game.alive = game.alive.map(id => id === oldId ? newId : id);
  if (game.votes) {
    const votes = {};
    for (const [voter, target] of Object.entries(game.votes)) votes[voter === oldId ? newId : voter] = target === oldId ? newId : target;
    game.votes = votes;
  }
  if (game.guesserId === oldId) game.guesserId = newId;
  if (game.lastResult) {
    if (game.lastResult.eliminatedId === oldId) game.lastResult.eliminatedId = newId;
    if (Array.isArray(game.lastResult.tally)) game.lastResult.tally = game.lastResult.tally.map(row => ({ ...row, id: row.id === oldId ? newId : row.id }));
  }
  return game;
}

function publicRoom(room) {
  const game = room.game;
  return {
    code: room.code, hostId: room.hostId, status: room.status,
    settings: { ...room.settings },
    players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, connected: p.connected, alive: game ? game.alive.includes(p.id) : true, ready: !!game?.roles?.[p.id]?.ready, voted: !!game && Object.prototype.hasOwnProperty.call(game.votes, p.id) })),
    phase: game?.phase || 'lobby', round: game?.round || 0,
    aliveCount: game?.alive.length || Object.keys(room.players).length,
    votesReceived: game ? Object.keys(game.votes).length : 0,
    readyCount: game && game.phase === 'reveal' ? game.alive.filter(id => room.players[id]?.connected !== false && game.roles[id]?.ready).length : 0,
    connectedCount: Object.values(room.players).filter(p => p.connected !== false).length,
    connectedAliveCount: game ? game.alive.filter(id => room.players[id]?.connected !== false).length : Object.values(room.players).filter(p => p.connected !== false).length,
    votesExpected: game ? game.alive.filter(id => room.players[id]?.connected !== false || Object.prototype.hasOwnProperty.call(game.votes, id)).length : 0,
    voteEndsAt: game?.phase === 'voting' ? (room.voteEndsAt || null) : null,
    discussionEndsAt: game?.phase === 'discussion' ? (room.discussionEndsAt || null) : null,
    guessEndsAt: game?.phase === 'guess' ? (room.guessEndsAt || null) : null,
    lastResult: game?.lastResult || null,
    winner: game?.winner || null
  };
}

module.exports = { WORDS, HINTS, CATEGORIES, cleanName, makeGame, castVote, submitGuess, publicRoom, resolveVotes, rebindPlayerIdentity };
