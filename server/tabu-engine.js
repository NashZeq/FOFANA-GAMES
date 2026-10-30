'use strict';
const { randomBytes, randomInt } = require('node:crypto');
const tabuCards = require('./tabu-cards');

function cleanName(value) {
  return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 18);
}
function token() { return randomBytes(24).toString('hex'); }
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function createRoom({ code, hostId, name }) {
  const safeName = cleanName(name);
  if (!safeName) throw new Error('Oyuncu adı gerekli.');
  return {
    code,
    hostId,
    status: 'lobby', // lobby | playing | finished
    createdAt: Date.now(),
    settings: { turnSeconds: 60, passLimit: 3, targetScore: 25 },
    players: {
      [hostId]: { id: hostId, name: safeName, team: 'A', ready: false, connected: true, resumeToken: token() }
    },
    game: null,
    revision: 1
  };
}

function joinRoom(room, { playerId, name }) {
  if (!room || room.status !== 'lobby') throw new Error('Bu Tabu odası şu an yeni oyuncu kabul etmiyor.');
  if (Object.keys(room.players).length >= 12) throw new Error('Oda dolu. En fazla 12 oyuncu katılabilir.');
  const safeName = cleanName(name);
  if (!safeName) throw new Error('Oyuncu adı gerekli.');
  const countA = Object.values(room.players).filter(p => p.team === 'A').length;
  const countB = Object.values(room.players).filter(p => p.team === 'B').length;
  room.players[playerId] = {
    id: playerId,
    name: safeName,
    team: countA <= countB ? 'A' : 'B',
    ready: false,
    connected: true,
    resumeToken: token()
  };
  room.revision++;
  return publicRoom(room, playerId);
}

// Takım seçimi (A veya B) - Takım değiştiğinde hazır durumu güvenlik için sıfırlanır
function setTeam(room, playerId, team) {
  if (!room || room.status !== 'lobby') throw new Error('Takım seçimi yalnızca lobide yapılabilir.');
  if (!['A', 'B'].includes(team)) throw new Error('Geçersiz takım seçimi (A veya B seçilmeli).');
  const p = room.players[playerId];
  if (!p) throw new Error('Oyuncu odada bulunamadı.');
  p.team = team;
  p.ready = false;
  room.revision++;
  return publicRoom(room, playerId);
}

// Hazır verme işlemi
function setReady(room, playerId, ready) {
  if (!room || room.status !== 'lobby') throw new Error('Oyun başladıktan sonra hazır durumu değiştirilemez.');
  const p = room.players[playerId];
  if (!p) throw new Error('Oyuncu odada bulunamadı.');
  p.ready = Boolean(ready);
  room.revision++;
  return publicRoom(room, playerId);
}

function canStartRoom(room) {
  const list = Object.values(room.players).filter(p => p.connected !== false);
  const teamA = list.filter(p => p.team === 'A');
  const teamB = list.filter(p => p.team === 'B');
  return room.status === 'lobby' && teamA.length >= 1 && teamB.length >= 1 && list.every(p => p.ready);
}

function startGame(room, playerId, options = {}) {
  if (room.hostId !== playerId) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
  if (!canStartRoom(room)) throw new Error('Her iki takımda oyuncu olmalı ve herkes HAZIR vermelidir.');

  room.settings = {
    turnSeconds: Math.max(15, Math.min(180, Number(options.turnSeconds) || 60)),
    passLimit: Math.max(0, Math.min(10, Number.isFinite(Number(options.passLimit)) ? Number(options.passLimit) : 3)),
    targetScore: [10, 15, 20, 25, 30, 40].includes(Number(options.targetScore)) ? Number(options.targetScore) : 25
  };
  room.status = 'playing';
  room.game = {
    scores: { A: 0, B: 0 },
    activeTeam: 'A',
    turnPhase: 'waiting', // waiting | active
    describerIndex: { A: 0, B: 0 },
    passesLeft: room.settings.passLimit,
    turnEndsAt: null,
    deck: shuffle(Array.isArray(tabuCards) ? tabuCards.map(([word, forbidden]) => ({ word, forbidden })) : []),
    currentCard: null
  };
  assignNextDescriber(room);
  room.revision++;
  return publicRoom(room, playerId);
}

function assignNextDescriber(room) {
  const g = room.game;
  const teamMembers = Object.values(room.players).filter(p => p.team === g.activeTeam && p.connected !== false);
  const idx = g.describerIndex[g.activeTeam] % Math.max(1, teamMembers.length);
  g.describerId = teamMembers[idx]?.id || null;
}
function startTurn(room, playerId) {
  const g = room.game;
  if (!g || room.status !== 'playing') throw new Error('Oyun başlamadı.');
  if (g.turnPhase !== 'waiting') throw new Error('Tur zaten başladı.');
  if (g.describerId !== playerId) throw new Error('Bu turun anlatıcısı sen değilsin.');
  if (!g.deck.length) g.deck = shuffle(Array.isArray(tabuCards) ? tabuCards.map(([word, forbidden]) => ({ word, forbidden })) : []);
  g.currentCard = g.deck.pop() || null;
  if (!g.currentCard) throw new Error('Kelime kartı bulunamadı.');
  g.passesLeft = room.settings.passLimit;
  g.turnEndsAt = Date.now() + room.settings.turnSeconds * 1000;
  g.turnPhase = 'active';
  room.revision++;
}
function finishTurn(room) {
  const g = room.game;
  g.turnPhase = 'waiting';
  g.turnEndsAt = null;
  g.currentCard = null;
  g.describerIndex[g.activeTeam]++;
  g.activeTeam = g.activeTeam === 'A' ? 'B' : 'A';
  assignNextDescriber(room);
  room.revision++;
}
function applyAction(room, playerId, kind) {
  const g = room.game;
  if (!g || g.turnPhase !== 'active') throw new Error('Aktif tur yok.');
  if (g.describerId !== playerId) throw new Error('Kart işlemlerini yalnızca anlatıcı yapabilir.');
  if (kind === 'correct') g.scores[g.activeTeam]++;
  else if (kind === 'tabu') g.scores[g.activeTeam] = Math.max(0, g.scores[g.activeTeam] - 1);
  else if (kind === 'pass') {
    if (g.passesLeft <= 0) throw new Error('Pas hakkın kalmadı.');
    g.passesLeft--;
  } else throw new Error('Geçersiz işlem.');
  if (g.scores[g.activeTeam] >= room.settings.targetScore) {
    room.status = 'finished';
    g.turnPhase = 'finished';
    g.turnEndsAt = null;
    g.currentCard = null;
    g.winner = g.activeTeam;
  } else {
    if (!g.deck.length) g.deck = shuffle(Array.isArray(tabuCards) ? tabuCards.map(([word, forbidden]) => ({ word, forbidden })) : []);
    g.currentCard = g.deck.pop() || null;
  }
  room.revision++;
}
function returnToLobby(room, playerId) {
  if (room.hostId !== playerId) throw new Error('Lobiye yalnızca oda sahibi dönebilir.');
  if (room.status !== 'finished') throw new Error('Maç bitmeden lobiye dönülemez.');
  room.status = 'lobby'; room.game = null;
  for (const p of Object.values(room.players)) p.ready = false;
  room.revision++;
}
function leaveRoom(room, playerId) {
  if (!room.players[playerId]) throw new Error('Oyuncu odada değil.');
  delete room.players[playerId];
  if (!Object.keys(room.players).length) return true;
  if (room.hostId === playerId) room.hostId = Object.keys(room.players)[0];
  if (room.status === 'playing') { room.status = 'lobby'; room.game = null; }
  for (const p of Object.values(room.players)) p.ready = false;
  room.revision++;
  return false;
}

// Tahmin eden takım üyelerine kelimeyi gizler, sadece Anlatıcı ve Karşı Takım (Denetçi) kartı görür
function publicRoom(room, viewerId) {
  const players = Object.values(room.players).map(p => ({
    id: p.id, name: p.name, team: p.team, ready: p.ready, connected: p.connected, isHost: p.id === room.hostId
  }));
  const viewer = room.players[viewerId];
  let gameView = null;

  if (room.game) {
    const g = room.game;
    const isDescriber = viewerId === g.describerId;
    const isOpponentInspector = viewer && viewer.team !== g.activeTeam;
    const canSeeCard = g.turnPhase === 'active' && (isDescriber || isOpponentInspector);

    gameView = {
      scores: g.scores,
      activeTeam: g.activeTeam,
      turnPhase: g.turnPhase,
      describerId: g.describerId,
      passesLeft: g.passesLeft,
      turnEndsAt: g.turnEndsAt,
      winner: g.winner || null,
      canSeeCard,
      isDescriber,
      card: canSeeCard ? g.currentCard : null
    };
  }

  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    settings: room.settings,
    canStart: canStartRoom(room),
    players,
    game: gameView,
    revision: room.revision
  };
}

module.exports = { cleanName, createRoom, joinRoom, setTeam, setReady, startGame, startTurn, applyAction, finishTurn, returnToLobby, leaveRoom, publicRoom };