'use strict';
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { createTabuResumeToken, resumeTabuPlayer } = require('./tabu-room-recovery');
const express = require('express');
const { Server } = require('socket.io');
const { cleanName, makeGame, castVote, submitGuess, publicRoom, resolveVotes, rebindPlayerIdentity } = require('./game-engine');
const { makeTabuGame, startTurn: startTabuTurn, action: tabuAction, pauseTurn: pauseTabuTurn, resumeTurn: resumeTabuTurn, tick: tickTabu, endTurn: endTabuTurn, resetGame: resetTabuGame, publicTabuGame } = require('./tabu-engine');
const { serializeTabuRoom, chooseTabuTeam } = require('./tabu-room-view');
const { createGame: createMonopolyGame, rollDice: monopolyRoll, useJailCard: monopolyUseJailCard, buyProperty: monopolyBuy, endTurn: monopolyEndTurn, mortgageProperty: monopolyMortgage, manageBuilding: monopolyBuilding, tradeProperties: monopolyTrade, respondTrade: monopolyRespondTrade, publicGame: publicMonopolyGame, bidAuction: monopolyBidAuction, passAuction: monopolyPassAuction, payDebt: monopolyPayDebt, declareBankruptcy: monopolyDeclareBankruptcy, forfeitDisconnectedPlayer: monopolyForfeitDisconnectedPlayer } = require('./monopoly-engine');
const { RESUME_GRACE_MS: MONOPOLY_RECONNECT_GRACE_MS, createMonopolyResumeToken, markMonopolyPlayerDisconnected, resumeMonopolyPlayer } = require('./monopoly-room-recovery');
const { saveMonopolyRooms, loadMonopolyRooms, prepareMonopolyRoomsForRestart } = require('./monopoly-persistence');
const { createGame: createIskGame, nextQuestion: nextIskQuestion, scoreGuess: scoreIskGuess, finalizeRoundIfReady: finalizeIskRound, expireRound: expireIskRound, publicGame: publicIskGame } = require('./iskembeden-engine');
const { RESUME_GRACE_MS: ISK_RECONNECT_GRACE_MS, createIskResumeToken, resumeIskPlayer } = require('./iskembeden-room-recovery');
const Worms = require('./worms-engine');
const { RESUME_GRACE_MS: WORMS_RECONNECT_GRACE_MS, createWormsResumeToken, markWormsPlayerDisconnected, resumeWormsPlayer } = require('./worms-room-recovery');
const { isBlockedServerStaticPath } = require('./static-path-guard');
const SkySprint = require('./sky-sprint-engine');
const GoKart = require('./gokart-engine');
const CasusBelli = require('./casus-belli-room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 25000, pingTimeout: 20000 });
const ROOT = path.resolve(__dirname, '..');
// Set FOFANA_MONOPOLY_STORE_PATH to a durable mounted-disk path in production.
// The /tmp fallback survives ordinary process restarts but not host replacement/redeploys.
const MONOPOLY_ROOM_STORE_PATH = process.env.FOFANA_MONOPOLY_STORE_PATH
  || (process.env.NODE_ENV === 'production' ? path.join(os.tmpdir(), 'fofana-monopoly-rooms.json') : null);
const rooms = new Map();
const tabuRooms = new Map();
const iskRooms = new Map();
const monopolyRooms = new Map();
const wormsRooms = new Map();
const skySprintRooms = new Map();
const gokartRooms = new Map();
const casusBelliRooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 12;
const IMPOSTER_RECONNECT_GRACE_MS = 90_000;
const IMPOSTER_VOTE_DURATION_MS = 45_000;
const IMPOSTER_DISCUSSION_DURATION_MS = 120_000;
const IMPOSTER_DISCUSSION_RETRY_MS = 15_000;
const IMPOSTER_GUESS_DURATION_MS = 30_000;
const makeResumeToken = () => randomBytes(32).toString('hex');
app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true, service: 'fofana-games', rooms: rooms.size, tabuRooms: tabuRooms.size, iskRooms: iskRooms.size, monopolyRooms: monopolyRooms.size, wormsRooms: wormsRooms.size, skySprintRooms: skySprintRooms.size, gokartRooms: gokartRooms.size, casusBelliRooms: casusBelliRooms.size, monopolyPersistence: Boolean(MONOPOLY_ROOM_STORE_PATH), customMonopolyStorePathConfigured: Boolean(process.env.FOFANA_MONOPOLY_STORE_PATH) }));
// The project root also contains server-only modules. Decode/normalize before static serving
// so URL-encoded requests cannot bypass the private server/ directory block.
app.use((req, res, next) => {
  if (isBlockedServerStaticPath(req.path)) return res.sendStatus(404);
  next();
});
app.use(express.static(ROOT, { extensions: ['html'] }));

function makeCode() {
  let code;
  do { code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(code) || tabuRooms.has(code) || iskRooms.has(code) || monopolyRooms.has(code) || wormsRooms.has(code) || skySprintRooms.has(code) || gokartRooms.has(code) || casusBelliRooms.has(code));
  return code;
}
function getRoom(socket) {
  const code = socket.data.roomCode;
  const room = code && rooms.get(code);
  if (!room || !room.players[socket.id]) throw new Error('Önce bir odaya katılmalısın.');
  return room;
}
function emitRoom(room) { io.to(room.code).emit('room:state', publicRoom(room)); }
function sendPrivateRoles(room) {
  const game = room.game;
  for (const [id, role] of Object.entries(game.roles)) {
    if (!room.players[id]) continue;
    io.to(id).emit('game:private-role', role.imposter
      ? { imposter: true, hint: game.hint }
      : { imposter: false, word: game.word });
  }
}
function clearImposterDiscussionTimer(room) {
  if (!room) return;
  if (room.discussionTimer) clearTimeout(room.discussionTimer);
  room.discussionTimer = null;
  room.discussionEndsAt = null;
}
function clearImposterGuessTimer(room) {
  if (!room) return;
  if (room.guessTimer) clearTimeout(room.guessTimer);
  room.guessTimer = null;
  room.guessEndsAt = null;
}
function startImposterGuessTimer(room, duration = IMPOSTER_GUESS_DURATION_MS) {
  clearImposterGuessTimer(room);
  if (!room?.game || room.game.phase !== 'guess') return;
  room.guessEndsAt = Date.now() + duration;
  const code = room.code;
  room.guessTimer = setTimeout(() => {
    const current = rooms.get(code);
    if (!current?.game || current.game.phase !== 'guess') {
      clearImposterGuessTimer(current);
      return;
    }
    clearImposterGuessTimer(current);
    current.game.phase = 'finished';
    current.game.winner = 'civilians';
    current.game.lastResult = {
      ...(current.game.lastResult || {}), winner: 'civilians', word: current.game.word,
      guessCorrect: false, message: 'Son Imposter 30 saniye içinde kelimeyi tahmin edemedi. Masum oyuncular kazandı.'
    };
    ensureImposterHost(current);
    emitRoom(current);
    io.to(code).emit('game:result', current.game.lastResult);
    io.to(code).emit('game:notice', { message: 'Son kelime tahmini için süre doldu; maç tamamlandı.' });
  }, Math.max(1, duration));
  room.guessTimer.unref?.();
}
function startImposterDiscussionTimer(room, duration = IMPOSTER_DISCUSSION_DURATION_MS) {
  clearImposterDiscussionTimer(room);
  if (!room?.game || room.game.phase !== 'discussion') return;
  room.discussionEndsAt = Date.now() + duration;
  const code = room.code;
  room.discussionTimer = setTimeout(() => {
    const current = rooms.get(code);
    if (!current?.game || current.game.phase !== 'discussion') {
      clearImposterDiscussionTimer(current);
      return;
    }
    const connectedAlive = current.game.alive.filter(id => current.players[id]?.connected !== false);
    if (connectedAlive.length < 3) {
      io.to(code).emit('game:notice', { message: `Oylama için en az 3 aktif oyuncu gerekli. Bağlantı bekleniyor; ${Math.round(IMPOSTER_DISCUSSION_RETRY_MS / 1000)} saniye sonra tekrar kontrol edilecek.` });
      startImposterDiscussionTimer(current, IMPOSTER_DISCUSSION_RETRY_MS);
      emitRoom(current);
      return;
    }
    beginImposterVote(current, true);
  }, Math.max(1, duration));
  room.discussionTimer.unref?.();
}
function startDiscussion(room) {
  if (!room.game || room.game.phase !== 'reveal') return;
  room.game.phase = 'discussion';
  room.game.roles && Object.values(room.game.roles).forEach(role => { role.ready = false; });
  startImposterDiscussionTimer(room);
  emitRoom(room);
  io.to(room.code).emit('game:notice', { message: 'Roller herkese özel olarak gösterildi. Tartışma başladı; süre bitince oylama otomatik açılacak.' });
}
function clearImposterVoteTimer(room) {
  if (!room) return;
  if (room.voteTimer) clearTimeout(room.voteTimer);
  room.voteTimer = null;
  room.voteEndsAt = null;
}
function beginImposterVote(room, automatic = false) {
  const game = room?.game;
  if (!game || game.phase !== 'discussion') return false;
  const connectedAlive = game.alive.filter(id => room.players[id]?.connected !== false);
  if (connectedAlive.length < 3) return false;
  clearImposterDiscussionTimer(room);
  game.phase = 'voting';
  game.votes = {};
  game.lastResult = null;
  startImposterVoteTimer(room);
  emitRoom(room);
  io.to(room.code).emit('game:notice', { message: automatic
    ? 'Tartışma süresi doldu. Oylama otomatik başladı; 45 saniye içinde herkes oy versin.'
    : 'Oylama başladı. 45 saniye içinde herkes kendi telefonundan bir oyuncu seçsin.' });
  return true;
}
function publishImposterVoteResult(room, result) {
  clearImposterVoteTimer(room);
  ensureImposterHost(room);
  if (room.game?.phase === 'discussion') startImposterDiscussionTimer(room);
  else clearImposterDiscussionTimer(room);
  if (room.game?.phase === 'guess') startImposterGuessTimer(room);
  else clearImposterGuessTimer(room);
  io.to(room.code).emit('game:result', result);
  if (room.game?.phase === 'guess' && result.eliminatedId) {
    const target = io.of('/').sockets.get(result.eliminatedId);
    if (target) target.emit('game:guess-turn', { allowed: true });
  }
}
function startImposterVoteTimer(room) {
  clearImposterVoteTimer(room);
  room.voteEndsAt = Date.now() + IMPOSTER_VOTE_DURATION_MS;
  const code = room.code;
  room.voteTimer = setTimeout(() => {
    const current = rooms.get(code);
    if (!current?.game || current.game.phase !== 'voting') { clearImposterVoteTimer(current); return; }
    const result = resolveVotes(current.game, current.players);
    publishImposterVoteResult(current, result);
    emitRoom(current);
    io.to(code).emit('game:notice', { message: 'Oylama süresi doldu. Gelen oylar değerlendirildi; oy gelmediyse kimse elenmedi.' });
  }, IMPOSTER_VOTE_DURATION_MS);
  room.voteTimer.unref?.();
}
function resolvePendingImposterVotes(room) {
  const game = room?.game;
  if (!game || game.phase !== 'voting') return false;
  const connectedAlive = game.alive.filter(id => room.players[id]?.connected !== false);
  if (!connectedAlive.length || !connectedAlive.every(id => Object.hasOwn(game.votes, id))) return false;
  const result = resolveVotes(game, room.players);
  publishImposterVoteResult(room, result);
  return true;
}
function ensureImposterHost(room) {
  if (!room || !Object.keys(room.players || {}).length) return null;
  const eligible = id => {
    const player = room.players[id];
    if (!player || player.connected === false) return false;
    if (room.game && room.game.phase !== 'finished' && !room.game.alive.includes(id)) return false;
    return true;
  };
  if (eligible(room.hostId)) return room.hostId;
  const next = Object.keys(room.players).find(eligible)
    || Object.keys(room.players).find(id => room.players[id].connected !== false)
    || Object.keys(room.players)[0];
  if (next) room.hostId = next;
  return next || null;
}
function evaluateImposterEndAfterDeparture(room, playerWasActive, playerWasImposter, wasGuessingPlayer) {
  const game = room?.game;
  if (!game || game.phase === 'finished') return;
  if (wasGuessingPlayer && game.phase === 'guess') {
    clearImposterVoteTimer(room); clearImposterDiscussionTimer(room); clearImposterGuessTimer(room);
    game.phase = 'finished'; game.winner = 'civilians';
    game.lastResult = { ...(game.lastResult || {}), winner: 'civilians', word: game.word, message: 'Son Imposter bağlantı süresi içinde dönmedi. Masum oyuncular kazandı.' };
    io.to(room.code).emit('game:result', game.lastResult);
    return;
  }
  if (!playerWasActive) return;
  const livingImposters = game.alive.filter(id => game.roles[id]?.imposter).length;
  const livingCivilians = game.alive.length - livingImposters;
  if (livingImposters === 0) {
    clearImposterVoteTimer(room); clearImposterDiscussionTimer(room); clearImposterGuessTimer(room);
    game.phase = 'finished'; game.winner = 'civilians';
    game.lastResult = { ...(game.lastResult || {}), winner: 'civilians', word: game.word, message: playerWasImposter ? 'Son Imposter oyundan ayrıldı. Masum oyuncular kazandı.' : 'Oyunda Imposter kalmadı. Masum oyuncular kazandı.' };
    io.to(room.code).emit('game:result', game.lastResult);
  } else if (livingImposters >= livingCivilians) {
    clearImposterVoteTimer(room); clearImposterDiscussionTimer(room); clearImposterGuessTimer(room);
    game.phase = 'finished'; game.winner = 'imposter';
    game.lastResult = { ...(game.lastResult || {}), winner: 'imposter', word: game.word, message: 'Imposter sayısı masum oyuncu sayısına ulaştı. Imposter ekibi kazandı.' };
    io.to(room.code).emit('game:result', game.lastResult);
  }
}
function removeImposterPlayer(room, playerId, notice = 'Bir oyuncu odadan ayrıldı.') {
  const player = room?.players?.[playerId];
  if (!room || !player) return;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  const wasHost = room.hostId === playerId;
  const wasActive = !!room.game && room.game.alive.includes(playerId);
  const wasImposter = !!room.game && !!room.game.roles[playerId]?.imposter;
  const wasGuessingPlayer = !!room.game && room.game.guesserId === playerId && room.game.phase === 'guess';
  delete room.players[playerId];
  if (room.game) {
    room.game.alive = room.game.alive.filter(id => id !== playerId);
    delete room.game.roles[playerId];
    delete room.game.votes[playerId];
    for (const [voter, target] of Object.entries(room.game.votes)) if (target === playerId) delete room.game.votes[voter];
  }
  if (!Object.keys(room.players).length) { clearImposterVoteTimer(room); clearImposterDiscussionTimer(room); clearImposterGuessTimer(room); rooms.delete(room.code); return; }
  // Eliminated spectators may leave without cancelling a healthy match. During live
  // play, only the normal victory conditions end the game when an active player leaves.
  evaluateImposterEndAfterDeparture(room, wasActive, wasImposter, wasGuessingPlayer);
  ensureImposterHost(room);
  resolvePendingImposterVotes(room);
  emitRoom(room);
  io.to(room.code).emit('game:notice', { message: `${player.name || 'Bir oyuncu'} ${notice}` });
}
function handleDisconnect(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  const player = room?.players?.[socket.id];
  if (!room || !player) return;
  player.connected = false;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  player.resumeTimer = setTimeout(() => {
    const currentRoom = rooms.get(code);
    const currentPlayer = currentRoom?.players?.[socket.id];
    if (currentPlayer && currentPlayer.connected === false) {
      removeImposterPlayer(currentRoom, socket.id, 'yeniden bağlanmadığı için odadan çıkarıldı.');
    }
  }, IMPOSTER_RECONNECT_GRACE_MS);
  player.resumeTimer.unref?.();
  // Keep a disconnected player and their role/vote for a 90-second recovery window.
  // Host control must belong to an online active player while a match is running.
  ensureImposterHost(room);
  resolvePendingImposterVotes(room);
  emitRoom(room);
  io.to(code).emit('game:notice', { message: `${player.name || cleanName(socket.data.playerName) || 'Bir oyuncu'} bağlantısını kaybetti. 90 saniye içinde aynı sekmeden/oturumdan geri dönebilir.` });
}

function emitTabuRoom(room) {
  // Tabu cards are recipient-specific: only the player who started the current
  // turn as explainer receives the target word and forbidden words.
  for (const id of Object.keys(room.players)) {
    io.to(id).emit('tabu:state', serializeTabuRoom(room, id, publicTabuGame));
  }
}
function clearTabuTimer(room) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
}
function startTabuTimer(room) {
  clearTabuTimer(room);
  room.timer = setInterval(() => {
    if (!room.game || !room.game.active) { clearTabuTimer(room); return; }
    tickTabu(room.game);
    if (!room.game.active) {
      clearTabuTimer(room);
      room.game.speakerId = null;
      emitTabuRoom(room);
      io.to(room.code).emit('tabu:notice', { message: `Süre bitti. Sıra ${room.game.teams[room.game.team]} takımında.` });
      return;
    }
    emitTabuRoom(room);
  }, 1000);
}
function getTabuRoom(socket) {
  const code = socket.data.tabuRoomCode, room = code && tabuRooms.get(code);
  if (!room || !room.players[socket.id]) throw new Error('Önce bir Tabu odasına katılmalısın.');
  return room;
}
function cleanTabuName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24); }
function removeTabuPlayer(room, playerId, reason = 'odadan ayrıldı.') {
  const player = room?.players?.[playerId];
  if (!room || !player) return;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);

  const wasCurrentHost = room.hostId === playerId;
  const wasDisconnectedHost = room.disconnectedHostId === playerId;
  const wasSpeaker = !!room.game && room.game.speakerId === playerId;
  let speakerTurnEnded = false;
  delete room.players[playerId];
  if (wasDisconnectedHost) room.disconnectedHostId = null;

  if (wasCurrentHost) {
    const available = Object.values(room.players).find(candidate => candidate.connected !== false);
    const replacement = available || Object.values(room.players)[0];
    room.hostId = replacement?.id || Object.keys(room.players)[0] || null;
  }

  if (wasSpeaker && room.game && room.game.phase !== 'finished') {
    clearTabuTimer(room);
    endTabuTurn(room.game);
    room.game.speakerId = null;
    room.reconnectPausedSpeakerId = null;
    room.reconnectWasActiveBeforeDisconnect = false;
    speakerTurnEnded = true;
  }

  if (!Object.keys(room.players).length) {
    clearTabuTimer(room);
    tabuRooms.delete(room.code);
    return;
  }

  if (room.status === 'playing' && room.game) {
    const presentTeams = new Set(Object.values(room.players).map(candidate => candidate.team));
    if (presentTeams.size < 2) {
      clearTabuTimer(room);
      room.game = null;
      room.status = 'lobby';
      room.reconnectPausedSpeakerId = null;
      room.reconnectWasActiveBeforeDisconnect = false;
      io.to(room.code).emit('tabu:notice', { message: 'Takımlardan biri boş kaldığı için maç durduruldu. Aynı oda koduyla yeniden oyuncu çağırıp başlayabilirsiniz.' });
    }
  }

  emitTabuRoom(room);
  io.to(room.code).emit('tabu:notice', { message: `${player.name} ${reason}${speakerTurnEnded ? ' Anlatıcı ayrıldığı için tur sona erdi.' : ''}` });
}

function onTabuDisconnect(socket) {
  const code = socket.data.tabuRoomCode;
  if (!code) return;
  const room = tabuRooms.get(code);
  const player = room?.players?.[socket.id];
  if (!room || !player || player.connected === false) return;

  player.connected = false;
  player.disconnectedAt = Date.now();
  const wasHost = room.hostId === socket.id;
  const wasSpeaker = !!room.game && room.game.speakerId === socket.id;
  if (wasHost) {
    // Preserve the original room owner's recovery claim while temporary hosts
    // disconnect in succession. Otherwise the latest temporary host overwrites
    // the owner ID and the original owner cannot reclaim the room.
    const currentRecoveryOwner = room.disconnectedHostId && room.players[room.disconnectedHostId];
    if (!currentRecoveryOwner || currentRecoveryOwner.connected !== false) {
      room.disconnectedHostId = socket.id;
    }
    const replacement = Object.values(room.players).find(candidate => candidate.id !== socket.id && candidate.connected !== false);
    if (replacement) room.hostId = replacement.id;
  }

  // Freeze the speaker's remaining time during the reconnect grace period.
  // Non-speaker disconnects do not interrupt the current turn.
  if (wasSpeaker && room.game && room.game.phase !== 'finished') {
    const wasActive = room.game.active;
    clearTabuTimer(room);
    if (wasActive) pauseTabuTurn(room.game, player.team);
    room.reconnectPausedSpeakerId = socket.id;
    room.reconnectWasActiveBeforeDisconnect = wasActive;
  }

  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  player.resumeTimer = setTimeout(() => {
    const currentRoom = tabuRooms.get(code);
    const currentPlayer = currentRoom?.players?.[socket.id];
    if (currentPlayer && currentPlayer.connected === false) {
      removeTabuPlayer(currentRoom, socket.id, '90 saniye içinde yeniden bağlanmadığı için');
    }
  }, 90_000);
  player.resumeTimer.unref?.();

  emitTabuRoom(room);
  io.to(code).emit('tabu:notice', { message: `${player.name} bağlantısını kaybetti. Oda ve takım bilgisi 90 saniye korunacak.` });
}

function cleanMonopolyName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24); }
function getMonopolyRoom(socket) {
  const code = socket.data.monopolyRoomCode, room = code && monopolyRooms.get(code);
  if (!room || !room.players[socket.id] || room.players[socket.id].connected === false) throw new Error('Önce Monopoly çevrimiçi odasına katılmalısın.');
  return room;
}
function persistMonopolyRooms() {
  if (!MONOPOLY_ROOM_STORE_PATH) return;
  try { saveMonopolyRooms(MONOPOLY_ROOM_STORE_PATH, monopolyRooms); }
  catch (error) { console.error(`[monopoly-persistence] Kayıt başarısız: ${error.message}`); }
}
function emitMonopolyRoom(room) {
  if (room.game && room.game.phase === 'finished') room.status = 'finished';
  // A monotonically increasing room revision lets clients discard a delayed/stale snapshot
  // after reconnecting, while every recipient of the same broadcast sees the same revision.
  room.revision = Number.isSafeInteger(room.revision) && room.revision >= 0 ? room.revision + 1 : 1;
  io.to(room.code).emit('monopoly:state', {
    code: room.code, revision: room.revision, hostId: room.hostId, status: room.status,
    players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, connected: p.connected !== false })),
    game: room.game ? publicMonopolyGame(room.game) : null
  });
  persistMonopolyRooms();
}
function removeMonopolyPlayer(room, socketId, reason = 'Oyuncu odadan ayrıldı.') {
  const player = room?.players?.[socketId];
  if (!player) return false;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  player.resumeTimer = null;
  if (room.game && room.game.phase === 'playing') monopolyForfeitDisconnectedPlayer(room.game, socketId);
  delete room.players[socketId];
  if (room.disconnectedHostId === socketId) room.disconnectedHostId = null;
  if (room.hostId === socketId) {
    const replacement = Object.values(room.players).find(candidate => candidate.connected !== false) || Object.values(room.players)[0];
    room.hostId = replacement?.id || null;
  }
  if (!Object.keys(room.players).length) {
    monopolyRooms.delete(room.code);
    persistMonopolyRooms();
    return true;
  }
  if (room.game?.phase === 'finished') room.status = 'finished';
  else if (room.game) room.status = Object.values(room.players).some(candidate => candidate.connected === false) ? 'paused' : 'playing';
  else room.status = 'lobby';
  emitMonopolyRoom(room);
  io.to(room.code).emit('monopoly:notice', { message: `${player.name}: ${reason}` });
  return true;
}
function expireMonopolyDisconnectedPlayer(room, socketId) {
  const currentRoom = room && monopolyRooms.get(room.code);
  const currentPlayer = currentRoom?.players?.[socketId];
  if (currentRoom && currentPlayer && currentPlayer.connected === false) {
    removeMonopolyPlayer(currentRoom, socketId, '90 saniyelik yeniden bağlanma süresi dolduğu için oyundan çıkarıldı.');
  }
}
function disconnectMonopolyPlayer(socket) {
  const code = socket.data.monopolyRoomCode;
  socket.data.monopolyRoomCode = undefined;
  const room = code && monopolyRooms.get(code);
  if (!room || !room.players[socket.id]) return;
  const player = markMonopolyPlayerDisconnected(room, socket.id);
  if (!player) return;
  player.resumeTimer = setTimeout(() => expireMonopolyDisconnectedPlayer(room, socket.id), MONOPOLY_RECONNECT_GRACE_MS);
  player.resumeTimer.unref?.();
  emitMonopolyRoom(room);
  io.to(code).emit('monopoly:notice', { message: `${player.name} bağlantısını kaybetti. Oyun 90 saniye boyunca duraklatılacak ve oyuncu geri dönebilir.` });
}

function restoreMonopolyStoreOnStartup() {
  if (!MONOPOLY_ROOM_STORE_PATH) return;
  try {
    const stored = loadMonopolyRooms(MONOPOLY_ROOM_STORE_PATH);
    if (!stored || !stored.rooms.size) return;
    const restored = prepareMonopolyRoomsForRestart(stored.rooms);
    for (const [code, room] of stored.rooms) monopolyRooms.set(code, room);
    for (const entry of restored) {
      for (const playerId of entry.playerIds) {
        const player = entry.room.players[playerId];
        const elapsed = Math.max(0, Date.now() - player.disconnectedAt);
        const remaining = Math.max(0, MONOPOLY_RECONNECT_GRACE_MS - elapsed);
        player.resumeTimer = setTimeout(() => expireMonopolyDisconnectedPlayer(entry.room, playerId), remaining);
        player.resumeTimer.unref?.();
      }
    }
    console.log(`[monopoly-persistence] ${restored.length} oda geri yüklendi; oyuncuların 90 saniye içinde yeniden bağlanması bekleniyor.`);
    persistMonopolyRooms();
  } catch (error) {
    console.error(`[monopoly-persistence] Kayıt dosyası geri yüklenemedi: ${error.message}`);
  }
}
restoreMonopolyStoreOnStartup();

function cleanIskName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24); }
function getIskRoom(socket) {
  const code = socket.data.iskRoomCode, room = code && iskRooms.get(code);
  if (!room || !room.players[socket.id]) throw new Error('Önce İşkembeden Sallama odasına katılmalısın.');
  return room;
}
function emitIskRoom(room) {
  if (room.game && room.game.phase === 'finished') room.status = 'finished';
  const players = Object.values(room.players).map(p => ({ id: p.id, name: p.name, connected: p.connected !== false, ready: p.ready === true, categoryVote: p.categoryVote || null }));
  for (const id of Object.keys(room.players)) io.to(id).emit('isk:state', {
    code: room.code, hostId: room.hostId, status: room.status, players,
    game: room.game ? publicIskGame(room.game, Object.values(room.players), id) : null
  });
}
function clearIskTimer(room) {
  if (room?.timer) clearInterval(room.timer);
  if (room) room.timer = null;
}
function startIskTimer(room) {
  clearIskTimer(room);
  if (!room?.game || room.game.phase !== 'playing') return;
  room.timer = setInterval(() => {
    if (!room.game || room.game.phase !== 'playing') { clearIskTimer(room); return; }
    if (Object.keys(room.game.scores).every(id => Object.hasOwn(room.game.submissions, id))) { clearIskTimer(room); return; }
    room.game.remainingSeconds = Math.max(0, Number(room.game.remainingSeconds || 0) - 1);
    if (room.game.remainingSeconds <= 0) {
      expireIskRound(room.game);
      clearIskTimer(room);
      if (room.game.phase === 'finished') room.status = 'finished';
      emitIskRoom(room);
      io.to(room.code).emit('isk:notice', { message: 'Süre bitti. Yanıt göndermeyen oyuncular bu tur 0 puan aldı.' });
      return;
    }
    emitIskRoom(room);
  }, 1000);
}

function removeIskPlayer(room, playerId, reason = '90 saniye içinde geri dönmediği için odadan çıkarıldı.') {
  const player = room?.players?.[playerId];
  if (!room || !player) return;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  const wasHost = room.hostId === playerId;
  if (room.disconnectedHostId === playerId) room.disconnectedHostId = null;
  delete room.players[playerId];

  if (room.game) {
    delete room.game.scores[playerId];
    delete room.game.submissions[playerId];
    if (Array.isArray(room.game.winnerIds)) room.game.winnerIds = room.game.winnerIds.filter(id => id !== playerId);
    for (const entry of room.game.history || []) if (entry.results) delete entry.results[playerId];
  }

  if (wasHost) {
    const candidates = Object.values(room.players);
    const replacement = candidates.find(p => p.connected !== false) || candidates[0];
    room.hostId = replacement?.id || null;
  }
  if (!Object.keys(room.players).length) {
    clearIskTimer(room);
    iskRooms.delete(room.code);
    return;
  }

  if (room.game && room.game.phase === 'playing') {
    if (Object.keys(room.game.scores).length < 2) {
      room.game.phase = 'finished';
      room.game.finishReason = 'Oyuncu sayısı iki kişinin altına düştüğü için maç iptal edildi.';
      room.game.winnerIds = [];
      room.status = 'finished';
      clearIskTimer(room);
    } else if (finalizeIskRound(room.game)) {
      clearIskTimer(room);
      if (room.game.phase === 'finished') room.status = 'finished';
    }
  }
  emitIskRoom(room);
  io.to(room.code).emit('isk:notice', { message: `${player.name} ${reason}` });
}

function leaveIskRoom(socket) {
  const code = socket.data.iskRoomCode;
  if (!code) return;
  socket.data.iskRoomCode = undefined;
  const room = iskRooms.get(code);
  const player = room?.players?.[socket.id];
  if (!room || !player || player.connected === false) return;

  player.connected = false;
  player.disconnectedAt = Date.now();
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  if (room.hostId === socket.id) {
    // Retain the original host's recovery claim if temporary hosts disconnect too.
    const pendingOwner = room.disconnectedHostId && room.players[room.disconnectedHostId];
    if (!pendingOwner || pendingOwner.connected !== false) room.disconnectedHostId = socket.id;
    const replacement = Object.values(room.players).find(candidate => candidate.id !== socket.id && candidate.connected !== false);
    if (replacement) room.hostId = replacement.id;
  }
  player.resumeTimer = setTimeout(() => {
    const currentRoom = iskRooms.get(code);
    const currentPlayer = currentRoom?.players?.[socket.id];
    if (currentPlayer && currentPlayer.connected === false) removeIskPlayer(currentRoom, socket.id);
  }, ISK_RECONNECT_GRACE_MS);
  player.resumeTimer.unref?.();
  emitIskRoom(room);
  io.to(code).emit('isk:notice', { message: `${player.name} bağlantısını kaybetti. Oda ve puanı 90 saniye korunacak.` });
}

function emitWormsRoom(room) { io.to(room.code).emit('worms:room-state', Worms.publicRoom(room)); }
function disconnectWormsPlayer(socket) {
  const code = socket.data.wormsRoomCode;
  if (!code) return;
  socket.data.wormsRoomCode = null;
  const room = wormsRooms.get(code);
  if (!room || !room.players[socket.id]) return;
  const player = room.players[socket.id];
  const name = player.name;
  if (!markWormsPlayerDisconnected(room, socket.id)) return;
  player.resumeTimer = setTimeout(() => {
    const currentRoom = wormsRooms.get(code);
    const currentPlayer = currentRoom?.players?.[socket.id];
    if (!currentPlayer || currentPlayer.connected !== false) return;
    const remains = Worms.removePlayer(currentRoom, socket.id);
    if (!remains) { wormsRooms.delete(code); return; }
    emitWormsRoom(currentRoom);
    io.to(code).emit('worms:notice', { message: `${name} için 90 saniyelik bağlantı kurtarma süresi doldu. Maç lobiye döndü.` });
  }, WORMS_RECONNECT_GRACE_MS);
  player.resumeTimer.unref?.();
  emitWormsRoom(room);
  io.to(code).emit('worms:notice', { message: `${name} bağlantısını kaybetti. Maç duraklatıldı; 90 saniye içinde aynı oturumla geri dönebilir.` });
}
const SKY_SPRINT_RECONNECT_GRACE_MS = 90_000;
function disconnectSkySprintPlayer(socket) {
  const code = socket.data.skySprintRoomCode, room = code && skySprintRooms.get(code);
  if (!room) return;
  const player = room.players[socket.id];
  const wasRacing = room.status === 'racing' || room.status === 'finished';
  const next = SkySprint.disconnectPlayer(room, socket.id);
  socket.data.skySprintRoomCode = undefined;
  if (!next) { skySprintRooms.delete(code); return; }
  if (wasRacing && player && player.resumeToken) {
    if (player.resumeTimer) clearTimeout(player.resumeTimer);
    player.resumeTimer = setTimeout(() => {
      const current = skySprintRooms.get(code);
      const disconnected = current?.players[socket.id];
      if (disconnected && !disconnected.connected) {
        delete current.players[socket.id];
        if (!Object.keys(current.players).length) skySprintRooms.delete(code);
        else emitSkySprintRoomGlobal(current);
      }
    }, SKY_SPRINT_RECONNECT_GRACE_MS);
    player.resumeTimer.unref?.();
  }
  emitSkySprintRoomGlobal(next);
}
function emitSkySprintRoomGlobal(room) { io.to(room.code).emit('sky:state', SkySprint.publicRoom(room)); }
// Run race physics on the server even if one client stops sending heartbeats.
const skySprintPhysicsTicker = setInterval(() => {
  for (const room of skySprintRooms.values()) {
    if (room.status !== 'racing') continue;
    const previousStatus = room.status;
    SkySprint.advanceRoom(room);
    emitSkySprintRoomGlobal(room);
    if (previousStatus !== 'finished' && room.status === 'finished') io.to(room.code).emit('sky:finished', SkySprint.publicRoom(room));
  }
}, 100);
skySprintPhysicsTicker.unref?.();

function emitGoKartRoom(room) { io.to(room.code).emit('gokart:state', GoKart.publicRoom(room)); }
function disconnectGoKartPlayer(socket) {
  const code = socket.data.gokartRoomCode;
  if (!code) return;
  socket.data.gokartRoomCode = undefined;
  const room = gokartRooms.get(code), player = room?.players?.[socket.id];
  if (!room || !player) return;
  const changed = GoKart.disconnectPlayer(room, socket.id);
  if (!changed) return;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  player.resumeTimer = setTimeout(() => {
    const current = gokartRooms.get(code), disconnected = current?.players?.[socket.id];
    if (disconnected && disconnected.connected === false) {
      const kept = GoKart.removePlayer(current, socket.id);
      if (!kept) gokartRooms.delete(code);
      else emitGoKartRoom(current);
      io.to(code).emit('gokart:notice', { message: `${disconnected.name} kurtarma süresi dolduğu için odadan çıkarıldı.` });
    }
  }, GoKart.RECONNECT_GRACE_MS);
  player.resumeTimer.unref?.();
  emitGoKartRoom(room);
  io.to(code).emit('gokart:notice', { message: `${player.name} bağlantısını kaybetti. Yarış 90 saniyeliğine duraklatıldı.` });
}
const goKartPhysicsTicker = setInterval(() => {
  for (const room of gokartRooms.values()) {
    if (room.status !== 'racing') continue;
    const before = room.status;
    const state = GoKart.tickRoom(room);
    io.to(room.code).emit('gokart:state', state);
    if (before !== 'finished' && state.status === 'finished') io.to(room.code).emit('gokart:finished', state);
  }
}, 100);
goKartPhysicsTicker.unref?.();

function disconnectCasusBelliPlayer(socket) {
  const code = socket.data.casusBelliRoomCode;
  socket.data.casusBelliRoomCode = undefined;
  const room = code && casusBelliRooms.get(code);
  if (!room || !room.players[socket.id]) return;
  const player = room.players[socket.id];
  CasusBelli.markDisconnected(room, socket.id);
  player.reconnectTimer = setTimeout(() => {
    const currentRoom = casusBelliRooms.get(code), currentPlayer = currentRoom?.players?.[socket.id];
    if (!currentRoom || !currentPlayer || currentPlayer.connected !== false || Date.now() - currentPlayer.disconnectedAt < CasusBelli.RESUME_GRACE_MS) return;
    const result = CasusBelli.leaveRoom(currentRoom, socket.id);
    if (result.deleted) casusBelliRooms.delete(code);
    else { if (currentRoom.status === 'interrupted') currentRoom.status = 'lobby'; emitCasusBelliRoomGlobal(currentRoom); }
  }, CasusBelli.RESUME_GRACE_MS);
  player.reconnectTimer.unref?.();
  emitCasusBelliRoomGlobal(room);
}
function emitCasusBelliRoomGlobal(room) {
  for (const player of Object.values(room.players)) io.to(player.id).emit('casus-belli:room-state', CasusBelli.publicRoom(room, player.id));
}

io.on('connection', socket => {
  function getCasusBelliRoom() {
    const code = socket.data.casusBelliRoomCode, room = code && casusBelliRooms.get(code);
    if (!room || !room.players[socket.id]) throw new Error('Önce Casus Belli çevrimiçi odasına katılmalısın.');
    return room;
  }
  function emitCasusBelliRoom(room) {
    for (const player of Object.values(room.players)) {
      io.to(player.id).emit('casus-belli:room-state', CasusBelli.publicRoom(room, player.id));
    }
  }
  socket.on('casus-belli:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const name = CasusBelli.cleanName(payload.name);
      if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = makeCode();
      const room = CasusBelli.createRoom({ code, hostId: socket.id, name });
      casusBelliRooms.set(code, room); socket.join(code); socket.data.casusBelliRoomCode = code;
      ack({ ok: true, code, playerId: socket.id, resumeToken: room.players[socket.id].resumeToken, room: CasusBelli.publicRoom(room, socket.id) });
      emitCasusBelliRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Oda kodu 6 harf/rakam olmalı.');
      const room = casusBelliRooms.get(code);
      if (!room) throw new Error('Bu kodla açık Casus Belli odası bulunamadı.');
      const player = CasusBelli.joinRoom(room, { playerId: socket.id, name: payload.name });
      socket.join(code); socket.data.casusBelliRoomCode = code;
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, room: CasusBelli.publicRoom(room, socket.id) });
      emitCasusBelliRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase(), room = casusBelliRooms.get(code);
      if (!room) throw new Error('Casus Belli odası artık mevcut değil.');
      const disconnectedPlayer = Object.values(room.players).find(candidate => candidate.connected === false && candidate.resumeToken === payload.resumeToken);
      const player = CasusBelli.resumePlayer(room, socket.id, payload.resumeToken);
      if (!player) throw new Error('Oturum kurtarılamadı; token geçersiz veya 90 saniyelik süre dolmuş.');
      if (disconnectedPlayer?.reconnectTimer) clearTimeout(disconnectedPlayer.reconnectTimer);
      socket.join(code); socket.data.casusBelliRoomCode = code;
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, room: CasusBelli.publicRoom(room, socket.id) });
      emitCasusBelliRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:ready', (payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.setReady(room, socket.id, payload.ready); emitCasusBelliRoom(room); ack({ ok: true }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:start', (_payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.startGame(room, socket.id); emitCasusBelliRoom(room); io.to(room.code).emit('casus-belli:started', { message: 'Maç başladı. Her oyuncu iki kartı kendi ekranından çekecek.' }); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:draw', (payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.drawCard(room, socket.id, payload.type); emitCasusBelliRoom(room); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:queen-steal-select', (payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.chooseQueenSteal(room, socket.id, payload.slotIndex); emitCasusBelliRoom(room); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:play', (payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.submitCards(room, socket.id, payload.cardIds, payload.supportChoices || {}, payload.supportTargets || {}); emitCasusBelliRoom(room); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:priest-choice', (payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.choosePriestCards(room, socket.id, payload); emitCasusBelliRoom(room); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:support-target', (payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.chooseSupportTarget(room, socket.id, payload); emitCasusBelliRoom(room); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:resolve', (_payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.resolveCombat(room, socket.id); emitCasusBelliRoom(room); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:next-round', (_payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(); CasusBelli.nextRound(room, socket.id); emitCasusBelliRoom(room); ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('casus-belli:leave', (_payload = {}, ack = () => {}) => {
    try { const room = getCasusBelliRoom(), code = room.code; socket.leave(code); socket.data.casusBelliRoomCode = undefined; const result = CasusBelli.leaveRoom(room, socket.id); if (result.deleted) casusBelliRooms.delete(code); else emitCasusBelliRoom(room); ack({ ok: true }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  function getSkySprintRoom() {
    const code = socket.data.skySprintRoomCode;
    const room = code && skySprintRooms.get(code);
    if (!room || !room.players[socket.id]) throw new Error('Önce bir Sky Sprint odasına katılmalısın.');
    return room;
  }
  function emitSkySprintRoom(room) { io.to(room.code).emit('sky:state', SkySprint.publicRoom(room)); }
  socket.on('sky:resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      const room = skySprintRooms.get(code);
      if (!room) throw new Error('Sky Sprint odası artık mevcut değil.');
      const recovered = SkySprint.resumePlayer(room, socket.id, payload.resumeToken);
      if (!recovered) throw new Error('Bu oturum için yeniden bağlanma bilgisi geçersiz veya süresi dolmuş.');
      recovered.player.resumeToken = makeResumeToken();
      socket.join(code); socket.data.skySprintRoomCode = code;
      ack({ ok: true, code, playerId: socket.id, resumeToken: recovered.player.resumeToken, host: room.hostId === socket.id, room: SkySprint.publicRoom(room, { includeTrack: true }) });
      emitSkySprintRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('sky:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut odadan ayrıl.');
      const name = SkySprint.cleanName(payload.name);
      if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = makeCode();
      const room = SkySprint.createRoom({ code, hostId: socket.id, name });
      room.players[socket.id].resumeToken = makeResumeToken();
      skySprintRooms.set(code, room); socket.join(code); socket.data.skySprintRoomCode = code;
      ack({ ok: true, code, playerId: socket.id, resumeToken: room.players[socket.id].resumeToken, host: true }); emitSkySprintRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('sky:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Oda kodu 6 harf/rakam olmalı.');
      const room = skySprintRooms.get(code);
      if (!room) throw new Error('Bu kodla açık Sky Sprint odası bulunamadı.');
      SkySprint.joinRoom(room, { playerId: socket.id, name: payload.name });
      room.players[socket.id].resumeToken = makeResumeToken();
      socket.join(code); socket.data.skySprintRoomCode = code;
      ack({ ok: true, code, playerId: socket.id, resumeToken: room.players[socket.id].resumeToken, host: false }); emitSkySprintRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('sky:start', (_payload, ack = () => {}) => {
    try { const room = getSkySprintRoom(); SkySprint.startRace(room, socket.id); emitSkySprintRoom(room); io.to(room.code).emit('sky:started', { startedAt: room.startedAt, room: SkySprint.publicRoom(room, { includeTrack: true }) }); ack({ ok: true }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('sky:progress', (payload = {}, ack = () => {}) => {
    try { const room = getSkySprintRoom(); SkySprint.updateProgress(room, socket.id, payload.distance); emitSkySprintRoom(room); if (room.status === 'finished') io.to(room.code).emit('sky:finished', SkySprint.publicRoom(room)); ack({ ok: true }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('sky:jump', (_payload = {}, ack = () => {}) => {
    try {
      const room = getSkySprintRoom();
      const result = SkySprint.registerJump(room, socket.id);
      io.to(room.code).emit('sky:jumpAccepted', { playerId: socket.id, jumpCount: result.jumpCount, jumpHeight: result.jumpHeight, at: result.at });
      emitSkySprintRoom(room);
      ack({ ok: true, jumpCount: result.jumpCount, jumpHeight: result.jumpHeight, at: result.at });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('sky:leave', (_payload, ack = () => {}) => {
    try { const room = getSkySprintRoom(), code = room.code; delete room.players[socket.id]; socket.leave(code); socket.data.skySprintRoomCode = undefined; if (!Object.keys(room.players).length) skySprintRooms.delete(code); else { if (room.hostId === socket.id) room.hostId = Object.keys(room.players)[0]; emitSkySprintRoom(room); } ack({ ok: true }); }
    catch (e) { ack({ ok: false, error: e.message }); }
  });
  function getGoKartRoom() {
    const code = socket.data.gokartRoomCode, room = code && gokartRooms.get(code);
    if (!room || !room.players[socket.id] || room.players[socket.id].connected === false) throw new Error('Önce çevrimiçi Go-Kart odasına katılmalısın.');
    return room;
  }
  socket.on('gokart:resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase(), room = gokartRooms.get(code);
      if (!room) throw new Error('Go-Kart odası artık mevcut değil.');
      const recovered = GoKart.resumePlayer(room, socket.id, payload.resumeToken, makeResumeToken);
      if (!recovered) { ack({ ok:false, retryable:true, error:'Oturum kurtarılamadı; token geçersiz veya 90 saniyelik süre dolmuş.' }); return; }
      socket.join(code); socket.data.gokartRoomCode = code;
      ack({ ok:true, code, playerId:socket.id, resumeToken:recovered.player.resumeToken, name:recovered.player.name, room:GoKart.publicRoom(room) });
      emitGoKartRoom(room);
      io.to(code).emit('gokart:notice', { message:`${recovered.player.name} yeniden bağlandı.` });
    } catch (e) { ack({ ok:false, retryable:false, error:e.message }); }
  });
  socket.on('gokart:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const name = GoKart.cleanName(payload.name);
      if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = makeCode(), room = GoKart.createRoom(code, socket.id, name, { token:makeResumeToken() });
      gokartRooms.set(code, room); socket.join(code); socket.data.gokartRoomCode = code;
      ack({ ok:true, code, playerId:socket.id, resumeToken:room.players[socket.id].resumeToken, room:GoKart.publicRoom(room) });
      emitGoKartRoom(room);
    } catch (e) { ack({ ok:false, error:e.message }); }
  });
  socket.on('gokart:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase(), room = gokartRooms.get(code);
      if (!room) throw new Error('Bu Go-Kart oda koduyla açık oda bulunamadı.');
      const player = GoKart.joinRoom(room, socket.id, payload.name, { token:makeResumeToken() });
      socket.join(code); socket.data.gokartRoomCode = code;
      ack({ ok:true, code, playerId:socket.id, resumeToken:player.resumeToken, room:GoKart.publicRoom(room) });
      emitGoKartRoom(room);
    } catch (e) { ack({ ok:false, error:e.message }); }
  });
  socket.on('gokart:start', (_payload, ack = () => {}) => {
    try {
      const room = getGoKartRoom(); GoKart.startRace(room, socket.id);
      const state = GoKart.publicRoom(room); emitGoKartRoom(room); io.to(room.code).emit('gokart:started', state);
      ack({ ok:true, room:state });
    } catch (e) { ack({ ok:false, error:e.message }); }
  });
  socket.on('gokart:input', (payload = {}, ack = () => {}) => {
    try { const room = getGoKartRoom(); GoKart.setControls(room, socket.id, payload); ack({ ok:true }); }
    catch (e) { ack({ ok:false, error:e.message }); }
  });
  socket.on('gokart:use-item', (_payload = {}, ack = () => {}) => {
    try { const room = getGoKartRoom(); const result = GoKart.usePowerup(room, socket.id); emitGoKartRoom(room); ack({ ok:true, kind:result.kind, targetId:result.targetId }); }
    catch (e) { ack({ ok:false, error:e.message }); }
  });
  socket.on('gokart:leave', (_payload = {}, ack = () => {}) => {
    try {
      const room = getGoKartRoom(), code = room.code, player = room.players[socket.id];
      if (player.resumeTimer) clearTimeout(player.resumeTimer);
      socket.leave(code); socket.data.gokartRoomCode = undefined;
      const kept = GoKart.removePlayer(room, socket.id);
      if (!kept) gokartRooms.delete(code); else emitGoKartRoom(room);
      io.to(code).emit('gokart:notice', { message:`${player.name} odadan ayrıldı.` }); ack({ ok:true });
    } catch (e) { ack({ ok:false, error:e.message }); }
  });

  socket.on('worms:resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      const room = wormsRooms.get(code);
      if (!room) throw new Error('Bu Worms odası artık mevcut değil.');
      const recovered = resumeWormsPlayer(room, socket.id, payload.resumeToken);
      if (!recovered) { ack({ ok: false, retryable: true, error: 'Oturum henüz kurtarılamadı. Birkaç saniye sonra yeniden denenecek.' }); return; }
      socket.join(code); socket.data.wormsRoomCode = code;
      ack({ ok: true, code, slot: recovered.player.slot, resumeToken: recovered.player.resumeToken, room: Worms.publicRoom(room) });
      emitWormsRoom(room);
      io.to(code).emit('worms:notice', { message: `${recovered.player.name} yeniden bağlandı. Maç kaldığı yerden devam ediyor.` });
    } catch (e) { ack({ ok: false, retryable: false, error: e.message }); }
  });
  socket.on('worms:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut oyun odandan ayrıl.');
      const code = makeCode(), room = Worms.createRoom(code, socket.id, payload.name);
      room.players[socket.id].resumeToken = createWormsResumeToken();
      wormsRooms.set(code, room); socket.join(code); socket.data.wormsRoomCode = code;
      ack({ ok: true, code, slot: 0, resumeToken: room.players[socket.id].resumeToken, room: Worms.publicRoom(room) }); emitWormsRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('worms:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut oyun odandan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase(), room = wormsRooms.get(code);
      if (!room) throw new Error('Bu Worms oda kodu bulunamadı.');
      const player = Worms.joinRoom(room, socket.id, payload.name); player.resumeToken = createWormsResumeToken();
      socket.join(code); socket.data.wormsRoomCode = code;
      ack({ ok: true, code, slot: player.slot, resumeToken: player.resumeToken, room: Worms.publicRoom(room) }); emitWormsRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('worms:start', (_payload, ack = () => {}) => {
    try {
      const code = socket.data.wormsRoomCode, room = code && wormsRooms.get(code);
      if (!room || !room.players[socket.id]) throw new Error('Önce bir Worms odasına katıl.');
      Worms.startGame(room, socket.id); emitWormsRoom(room);
      for (const player of Object.values(room.players)) io.to(player.id).emit('worms:started', { code, slot: player.slot });
      ack({ ok: true, slot: room.players[socket.id].slot });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('worms:sync', (payload = {}, ack = () => {}) => {
    try {
      const code = socket.data.wormsRoomCode, room = code && wormsRooms.get(code);
      if (!room || payload.code !== code) throw new Error('Worms oda bağlantısı bulunamadı.');
      const result = Worms.syncState(room, socket.id, payload.state);
      socket.to(code).emit('worms:state', result.state); emitWormsRoom(room); ack({ ok: true, revision: result.revision });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('worms:move', (payload = {}, ack = () => {}) => {
    try {
      const code = socket.data.wormsRoomCode, room = code && wormsRooms.get(code);
      if (!room || payload.code !== code) throw new Error('Worms oda bağlantısı bulunamadı.');
      const result = Worms.movePlayer(room, socket.id, { direction: payload.direction, distance: payload.distance });
      io.to(code).emit('worms:state', result.state);
      io.to(code).emit('worms:action', { action: 'move', result: result.result, revision: result.revision });
      emitWormsRoom(room); ack({ ok: true, revision: result.revision, result: result.result });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('worms:fire', (payload = {}, ack = () => {}) => {
    try {
      const code = socket.data.wormsRoomCode, room = code && wormsRooms.get(code);
      if (!room || payload.code !== code) throw new Error('Worms oda bağlantısı bulunamadı.');
      const result = Worms.fireShot(room, socket.id, payload.shot || payload);
      io.to(code).emit('worms:state', result.state);
      io.to(code).emit('worms:action', { action: 'fire', result: result.result, revision: result.revision });
      emitWormsRoom(room); ack({ ok: true, revision: result.revision, result: result.result });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('worms:pass', (payload = {}, ack = () => {}) => {
    try {
      const code = socket.data.wormsRoomCode, room = code && wormsRooms.get(code);
      if (!room || payload.code !== code) throw new Error('Worms oda bağlantısı bulunamadı.');
      const result = Worms.passTurn(room, socket.id);
      io.to(code).emit('worms:state', result.state); io.to(code).emit('worms:action', { action: 'pass', revision: result.revision });
      emitWormsRoom(room); ack({ ok: true, revision: result.revision });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('worms:new-game', (payload = {}, ack = () => {}) => {
    try {
      const code = socket.data.wormsRoomCode, room = code && wormsRooms.get(code);
      if (!room || payload.code !== code) throw new Error('Worms oda bağlantısı bulunamadı.');
      const result = Worms.resetGame(room, socket.id);
      emitWormsRoom(room); io.to(code).emit('worms:notice', { message: 'Yeni maç için lobiye dönüldü.' });
      ack({ ok: true, room: result });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('monopoly:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const name = cleanMonopolyName(payload.name);
      if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = makeCode();
      const room = { code, revision: 0, hostId: socket.id, disconnectedHostId: null, status: 'lobby', players: {}, game: null };
      const resumeToken = createMonopolyResumeToken();
      room.players[socket.id] = { id: socket.id, name, connected: true, resumeToken, resumeTimer: null };
      monopolyRooms.set(code, room); socket.join(code); socket.data.monopolyRoomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken, name }); emitMonopolyRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('monopoly:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Oda kodu 6 karakter olmalı.');
      const name = cleanMonopolyName(payload.name), room = monopolyRooms.get(code);
      if (!room) throw new Error('Bu Monopoly oda kodu bulunamadı.');
      if (room.status !== 'lobby') throw new Error('Oyun başlamış; yeni oyuncu alınmıyor.');
      if (!name) throw new Error('Oyuncu adı gerekli.');
      if (Object.keys(room.players).length >= 4) throw new Error('Monopoly odası dolu. En fazla 4 oyuncu katılabilir.');
      if (Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor.');
      const resumeToken = createMonopolyResumeToken();
      room.players[socket.id] = { id: socket.id, name, connected: true, resumeToken, resumeTimer: null };
      if (!room.players[room.hostId] || room.players[room.hostId].connected === false) room.hostId = socket.id;
      socket.join(code); socket.data.monopolyRoomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken, name }); emitMonopolyRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('monopoly:resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Bu bağlantı zaten bir oyun odasına bağlı.');
      const code = String(payload.code || '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Monopoly oda kodu geçersiz.');
      const room = monopolyRooms.get(code);
      if (!room) throw new Error('Monopoly odası artık mevcut değil. Yeni oda oluşturmalısın.');
      const rebound = resumeMonopolyPlayer(room, socket.id, String(payload.resumeToken || ''));
      if (!rebound) throw new Error('Oturum anahtarı geçersiz veya 90 saniyelik kurtarma süresi doldu.');
      const { oldSocketId, player, reclaimedOriginalHost } = rebound;
      const oldSocket = io.of('/').sockets.get(oldSocketId);
      if (oldSocket && oldSocket !== socket) {
        oldSocket.data.monopolyRoomCode = undefined;
        oldSocket.leave(code);
        oldSocket.disconnect(true);
      }
      socket.join(code); socket.data.monopolyRoomCode = code; socket.data.playerName = player.name;
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, name: player.name, reclaimedOriginalHost });
      emitMonopolyRoom(room);
      io.to(code).emit('monopoly:notice', { message: `${player.name} yeniden bağlandı; Monopoly durumu korundu.` });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('monopoly:leave', (_payload, ack = () => {}) => {
    try {
      const room = getMonopolyRoom(socket), code = room.code;
      removeMonopolyPlayer(room, socket.id, 'oyuncu kendi isteğiyle ayrıldı.');
      socket.leave(code); socket.data.monopolyRoomCode = undefined;
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('monopoly:start', (_payload, ack = () => {}) => {
    try {
      const room = getMonopolyRoom(socket);
      if (room.hostId !== socket.id) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
      if (room.status !== 'lobby') throw new Error('Oyun zaten başlamış.');
      if (Object.keys(room.players).length < 2) throw new Error('Başlamak için en az 2 oyuncu gerekli.');
      if (Object.values(room.players).some(player => player.connected === false)) throw new Error('Maç başlamadan önce tüm oyuncuların bağlantısı dönmeli.');
      room.game = createMonopolyGame(Object.values(room.players)); room.status = 'playing';
      emitMonopolyRoom(room); io.to(room.code).emit('monopoly:notice', { message: 'Monopoly başladı. Sırası gelen oyuncu zar atsın.' }); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('monopoly:roll', (_payload, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Önce oyunu başlat.'); monopolyRoll(room.game,socket.id); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:use-jail-card', (_payload, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Önce oyunu başlat.'); monopolyUseJailCard(room.game,socket.id); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:buy', (payload = {}, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyBuy(room.game,socket.id,payload.buy!==false); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:auction-bid', (payload = {}, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyBidAuction(room.game,socket.id,payload.amount); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:auction-pass', (_payload, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyPassAuction(room.game,socket.id); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:debt-pay', (_payload, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyPayDebt(room.game,socket.id); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:debt-bankrupt', (_payload, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyDeclareBankruptcy(room.game,socket.id); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:end-turn', (_payload, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyEndTurn(room.game,socket.id); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:mortgage', (payload = {}, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyMortgage(room.game,socket.id,payload.index,payload.remove===true); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:building', (payload = {}, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyBuilding(room.game,socket.id,payload.index,payload.sell===true); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:trade', (payload = {}, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyTrade(room.game,socket.id,payload); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:trade-response', (payload = {}, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.status!=='playing'||!room.game)throw new Error('Aktif oyun yok.'); monopolyRespondTrade(room.game,socket.id,payload.decision); emitMonopolyRoom(room); ack({ok:true}); }
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('monopoly:new-game', (_payload, ack = () => {}) => {
    try { const room=getMonopolyRoom(socket); if(room.hostId!==socket.id)throw new Error('Yeni oyunu yalnızca oda sahibi başlatabilir.'); if(room.status!=='finished')throw new Error('Oyun bitmeden yeniden başlatılamaz.'); room.game=null;room.status='lobby';emitMonopolyRoom(room);ack({ok:true});}
    catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('isk:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const name = cleanIskName(payload.name);
      if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = makeCode();
      const room = { code, hostId: socket.id, disconnectedHostId: null, status: 'lobby', players: {}, game: null, timer: null };
      const resumeToken = createIskResumeToken();
      room.players[socket.id] = { id: socket.id, name, connected: true, resumeToken, resumeTimer: null, ready: false, categoryVote: null };
      iskRooms.set(code, room); socket.join(code); socket.data.iskRoomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken, name }); emitIskRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('isk:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut çevrimiçi odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Oda kodu 6 karakter olmalı.');
      const name = cleanIskName(payload.name), room = iskRooms.get(code);
      if (!room) throw new Error('Bu İşkembeden Sallama oda kodu bulunamadı.');
      if (room.status !== 'lobby') throw new Error('Oyun başlamış; yeni oyuncu alınmıyor.');
      if (!name) throw new Error('Oyuncu adı gerekli.');
      if (Object.keys(room.players).length >= 12) throw new Error('Oda dolu. En fazla 12 oyuncu katılabilir.');
      if (Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor.');
      const resumeToken = createIskResumeToken();
      room.players[socket.id] = { id: socket.id, name, connected: true, resumeToken, resumeTimer: null, ready: false, categoryVote: null };
      if (!room.players[room.hostId] || room.players[room.hostId].connected === false) room.hostId = socket.id;
      socket.join(code); socket.data.iskRoomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken, name }); emitIskRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('isk:session-resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Bu bağlantı zaten bir oyun odasına bağlı.');
      const code = String(payload.code || '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Oda kodu geçersiz.');
      const room = iskRooms.get(code);
      if (!room) throw new Error('İşkembeden Sallama odası artık mevcut değil. Yeni oda oluşturmalısın.');
      const rebound = resumeIskPlayer(room, socket.id, String(payload.resumeToken || ''));
      if (!rebound) throw new Error('Oturum anahtarı geçersiz veya 90 saniyelik kurtarma süresi doldu.');
      const { oldSocketId, player, reclaimedHost } = rebound;
      const oldSocket = io.of('/').sockets.get(oldSocketId);
      if (oldSocket && oldSocket !== socket) {
        oldSocket.data.iskRoomCode = undefined;
        oldSocket.leave(code);
        oldSocket.disconnect(true);
      }
      socket.join(code);
      socket.data.iskRoomCode = code;
      socket.data.playerName = player.name;
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, name: player.name });
      emitIskRoom(room);
      io.to(code).emit('isk:notice', { message: `${player.name} yeniden bağlandı${reclaimedHost ? ' ve oda sahipliğini geri aldı' : ''}. Puanı ve tur durumu korundu.` });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('isk:leave', (_payload, ack = () => {}) => {
    try {
      const room = getIskRoom(socket);
      const code = room.code;
      const playerId = socket.id;
      socket.data.iskRoomCode = undefined;
      socket.leave(code);
      removeIskPlayer(room, playerId, 'odadan ayrıldı.');
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('isk:ready', (payload = {}, ack = () => {}) => {
    try {
      const room = getIskRoom(socket);
      if (room.status !== 'lobby') throw new Error('Oylama yalnızca oyun başlamadan önce yapılabilir.');
      const player = room.players[socket.id];
      const category = ['age', 'market', 'car'].includes(payload.category) ? payload.category : null;
      if (!category) throw new Error('Bir kategori seçmelisin.');
      player.categoryVote = category;
      player.ready = payload.ready !== false;
      const connected = Object.values(room.players).filter(p => p.connected !== false);
      const ready = connected.filter(p => p.ready && p.categoryVote);
      if (connected.length >= 2 && ready.length === connected.length) {
        const votes = { age: 0, market: 0, car: 0 };
        for (const p of ready) votes[p.categoryVote]++;
        const high = Math.max(...Object.values(votes));
        const tied = Object.keys(votes).filter(k => votes[k] === high);
        const winner = tied[Math.floor(Math.random() * tied.length)];
        room.game = createIskGame(connected, winner, 5);
        room.status = 'playing';
        startIskTimer(room);
        emitIskRoom(room);
        io.to(room.code).emit('isk:notice', { message: `Kategori oylaması tamamlandı. Seçilen kategori: ${{age:'Ünlülerin yaşı',market:'Türkiye market fiyatları',car:'İkinci el otomobil fiyatları'}[winner]}. Oyun başladı!` });
      } else {
        emitIskRoom(room);
        io.to(room.code).emit('isk:notice', { message: `${ready.length}/${connected.length} oyuncu hazır. Kategori oylaması sürüyor.` });
      }
      ack({ ok: true, ready: player.ready, readyCount: ready.length, playerCount: connected.length });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });

  socket.on('isk:start', (payload = {}, ack = () => {}) => {
    try {
      const room = getIskRoom(socket);
      if (room.hostId !== socket.id) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
      if (room.status !== 'lobby') throw new Error('Oyun zaten başlamış.');
      for (const [id, player] of Object.entries(room.players)) if (player.connected === false) removeIskPlayer(room, id, 'başlangıçta çevrim dışı olduğu için odadan çıkarıldı.');
      if (!room.players[socket.id] || room.hostId !== socket.id) throw new Error('Oda sahipliği değişti; yeni oda sahibi oyunu başlatmalı.');
      if (Object.values(room.players).filter(p => p.connected !== false).length < 2) throw new Error('Başlamak için en az 2 bağlı oyuncu gerekli.');
      const category = ['age', 'market', 'car'].includes(payload.category) ? payload.category : 'age';
      const maxRounds = [3, 5].includes(Number(payload.rounds)) ? Number(payload.rounds) : 5;
      room.game = createIskGame(Object.values(room.players).filter(p => p.connected !== false), category, maxRounds); room.status = 'playing';
      startIskTimer(room);
      emitIskRoom(room); io.to(room.code).emit('isk:notice', { message: 'Oyun başladı. Herkes kendi tahminini gönderince cevap açıklanacak.' }); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('isk:guess', (payload = {}, ack = () => {}) => {
    try {
      const room = getIskRoom(socket);
      if (room.status !== 'playing' || !room.game) throw new Error('Önce oyunu başlat.');
      const result = scoreIskGuess(room.game, socket.id, payload.guess);
      if (result.allSubmitted) clearIskTimer(room);
      emitIskRoom(room);
      if (result.allSubmitted) io.to(room.code).emit('isk:notice', { message: 'Herkes tahminini gönderdi. Doğru cevap ve puanlar açıklandı.' });
      ack({ ok: true, ...result });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('isk:next', (_payload, ack = () => {}) => {
    try {
      const room = getIskRoom(socket);
      if (room.hostId !== socket.id) throw new Error('Yeni soruya yalnızca oda sahibi geçebilir.');
      if (!room.game || room.status !== 'playing') throw new Error('Aktif oyun yok.');
      if (!Object.keys(room.game.scores).every(id => Object.hasOwn(room.game.submissions, id))) throw new Error('Herkes mevcut soru için tahminini göndermeden devam edemezsiniz.');
      nextIskQuestion(room.game); startIskTimer(room); emitIskRoom(room); io.to(room.code).emit('isk:notice', { message: 'Yeni soru başladı. Tahminini gir!' }); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('isk:back-to-lobby', (_payload, ack = () => {}) => {
    try {
      const room = getIskRoom(socket);
      if (room.hostId !== socket.id) throw new Error('Oda ayarlarını yalnızca oda sahibi değiştirebilir.');
      clearIskTimer(room); room.status = 'lobby'; room.game = null; emitIskRoom(room); io.to(room.code).emit('isk:notice', { message: 'Lobiye dönüldü. Oda sahibi yeni maçı başlatabilir.' }); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut odadan ayrıl.');
      const name = cleanTabuName(payload.name); if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = makeCode();
      const room = { code, hostId: socket.id, status: 'lobby', players: {}, game: null, timer: null };
      const resumeToken = createTabuResumeToken();
      room.players[socket.id] = { id: socket.id, name, team: 0, connected: true, resumeToken };
      tabuRooms.set(code, room); socket.join(code); socket.data.tabuRoomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken, name, team: 0 }); emitTabuRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Oda kodu 6 karakter olmalı.');
      const name = cleanTabuName(payload.name), room = tabuRooms.get(code);
      if (!room) throw new Error('Bu Tabu oda kodu bulunamadı.');
      if (room.status !== 'lobby') throw new Error('Tabu oyunu başlamış; yeni oyuncu alınmıyor.');
      if (!name) throw new Error('Oyuncu adı gerekli.');
      if (Object.keys(room.players).length >= 12) throw new Error('Oda dolu. En fazla 12 oyuncu katılabilir.');
      if (Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor.');
      const team = chooseTabuTeam(Object.values(room.players), payload.team);
      const resumeToken = createTabuResumeToken();
      room.players[socket.id] = { id: socket.id, name, team, connected: true, resumeToken };
      if (!room.players[room.hostId] || room.players[room.hostId].connected === false) room.hostId = socket.id;
      socket.join(code); socket.data.tabuRoomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken, name, team }); emitTabuRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:session-resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Bu bağlantı zaten bir oyun odasına bağlı.');
      const code = String(payload.code || '').trim().toUpperCase();
      const token = String(payload.resumeToken || '');
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Oda kodu geçersiz.');
      const room = tabuRooms.get(code);
      if (!room) throw new Error('Tabu odası artık mevcut değil. Yeni oda oluşturman gerekiyor.');
      const rebound = resumeTabuPlayer(room, socket.id, token);
      if (!rebound) throw new Error('Oturum kurtarma anahtarı geçersiz veya 90 saniyelik süre doldu.');
      const { oldSocketId, player, shouldResumeTurn, reclaimedHost } = rebound;
      socket.join(code);
      socket.data.tabuRoomCode = code;
      socket.data.playerName = player.name;
      if (shouldResumeTurn && room.game && room.game.phase === 'paused') {
        resumeTabuTurn(room.game, player.team);
        startTabuTimer(room);
      }
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, name: player.name, team: player.team });
      emitTabuRoom(room);
      io.to(code).emit('tabu:notice', { message: `${player.name} yeniden bağlandı${reclaimedHost ? ' ve oda sahipliğini geri aldı' : ''}.` });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:leave', (_payload, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket);
      const code = room.code;
      const playerId = socket.id;
      socket.data.tabuRoomCode = null;
      socket.leave(code);
      removeTabuPlayer(room, playerId, 'odadan ayrıldı.');
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:set-team', (payload = {}, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket);
      if (room.status !== 'lobby') throw new Error('Takım yalnızca lobide değiştirilebilir.');
      const player = room.players[socket.id];
      const requestedTeam = Number(payload.team);
      if (requestedTeam !== 0 && requestedTeam !== 1) throw new Error('Takım seçimi geçersiz.');
      if (requestedTeam === player.team) { ack({ ok: true, team: player.team, unchanged: true }); return; }
      const connectedOnCurrentTeam = Object.values(room.players).filter(candidate => candidate.connected !== false && candidate.team === player.team).length;
      if (connectedOnCurrentTeam <= 1) throw new Error('Bu değişiklik takımını boş bırakır. Her iki takımda da en az bir bağlı oyuncu kalmalı.');
      player.team = requestedTeam;
      emitTabuRoom(room);
      ack({ ok: true, team: player.team });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:start', (payload = {}, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket); if (room.hostId !== socket.id) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
      if (room.status !== 'lobby') throw new Error('Oyun zaten başlamış.');
      // A lobby can retain disconnected participants for a short recovery window.
      // Never include those reservations in a newly-started match as ghost players.
      for (const [id, player] of Object.entries(room.players)) {
        if (player.connected === false) removeTabuPlayer(room, id, 'oyun başlamadan önce bağlantısı kesik olduğu için lobiden kaldırıldı.');
      }
      if (!tabuRooms.has(room.code)) throw new Error('Oda artık açık değil. Yeni bir oda oluştur.');
      if (room.hostId !== socket.id) throw new Error('Oda sahipliği değişti. Oyunu yeni oda sahibi başlatmalı.');
      const players = Object.values(room.players).filter(player => player.connected !== false);
      room.game = makeTabuGame(players, { duration: payload.duration, targetScore: payload.targetScore, teamA: payload.teamA, teamB: payload.teamB });
      room.status = 'playing'; emitTabuRoom(room); io.to(room.code).emit('tabu:notice', { message: 'Tabu odası başladı. Sırası gelen takım turu başlatabilir.' }); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:start-turn', (_payload, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket); if (!room.game) throw new Error('Önce oyunu başlat.');
      startTabuTurn(room.game, room.players[socket.id].team);
      room.game.speakerId = socket.id;
      startTabuTimer(room);
      emitTabuRoom(room);
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:action', (payload = {}, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket);
      if (!room.game || room.game.speakerId !== socket.id) throw new Error('Kartı yalnızca turu başlatan anlatıcı yönetebilir.');
      tabuAction(room.game, room.players[socket.id].team, String(payload.kind || ''));
      if (room.game.phase === 'finished') { clearTabuTimer(room); room.game.speakerId = null; }
      emitTabuRoom(room); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:pause', (_payload, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket);
      if (!room.game || room.game.speakerId !== socket.id) throw new Error('Turu yalnızca anlatıcı duraklatabilir.');
      pauseTabuTurn(room.game, room.players[socket.id].team);
      clearTabuTimer(room); emitTabuRoom(room); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:resume', (_payload, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket);
      if (!room.game || room.game.speakerId !== socket.id) throw new Error('Turu yalnızca anlatıcı devam ettirebilir.');
      resumeTabuTurn(room.game, room.players[socket.id].team);
      startTabuTimer(room); emitTabuRoom(room); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:end-turn', (_payload, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket);
      if (!room.game || room.game.speakerId !== socket.id) throw new Error('Turu yalnızca anlatıcı bitirebilir.');
      clearTabuTimer(room); endTabuTurn(room.game); room.game.speakerId = null;
      emitTabuRoom(room); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:back-to-lobby', (_payload, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket);
      if (room.hostId !== socket.id) throw new Error('Lobiye yalnızca oda sahibi dönebilir.');
      if (!room.game || room.game.phase !== 'finished') throw new Error('Lobiye yalnızca maç bittikten sonra dönülebilir.');
      clearTabuTimer(room);
      room.game = null;
      room.status = 'lobby';
      room.reconnectPausedSpeakerId = null;
      room.reconnectWasActiveBeforeDisconnect = false;
      emitTabuRoom(room);
      io.to(room.code).emit('tabu:notice', { message: 'Lobiye dönüldü. Oda sahibi yeni ayarlarla başka bir maç başlatabilir.' });
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('tabu:reset', (_payload, ack = () => {}) => {
    try {
      const room = getTabuRoom(socket); if (room.hostId !== socket.id) throw new Error('Oyunu yalnızca oda sahibi sıfırlayabilir.'); if (!room.game) throw new Error('Oyun başlamadı.');
      clearTabuTimer(room); resetTabuGame(room.game); room.game.speakerId = null; delete room.game.winner; room.status = 'playing';
      emitTabuRoom(room); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('room:create', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut odadan ayrıl.');
      const name = cleanName(payload.name);
      if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = makeCode();
      const settings = { imposters: Number(payload.imposters) === 2 ? 2 : 1, category: ['genel','yemek','yer','nesne'].includes(payload.category) ? payload.category : 'genel' };
      const room = { code, hostId: socket.id, status: 'lobby', settings, players: {}, game: null };
      const resumeToken = makeResumeToken();
      room.players[socket.id] = { id: socket.id, name, connected: true, resumeToken, resumeTimer: null };
      rooms.set(code, room); socket.join(code); socket.data.roomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken }); emitRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('room:join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Önce mevcut odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase();
      const name = cleanName(payload.name);
      const room = rooms.get(code);
      if (!room) throw new Error('Bu oda koduyla açık bir oda bulunamadı.');
      if (room.status !== 'lobby') throw new Error('Oyun başlamış; bu odaya yeni oyuncu alınmıyor.');
      if (!name) throw new Error('Oyuncu adı gerekli.');
      if (Object.keys(room.players).length >= MAX_PLAYERS) throw new Error('Oda dolu. En fazla 12 oyuncu katılabilir.');
      if (Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor. Farklı bir isim seç.');
      const resumeToken = makeResumeToken();
      room.players[socket.id] = { id: socket.id, name, connected: true, resumeToken, resumeTimer: null };
      socket.join(code); socket.data.roomCode = code; socket.data.playerName = name;
      ack({ ok: true, code, playerId: socket.id, resumeToken }); emitRoom(room);
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('room:resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.roomCode || socket.data.tabuRoomCode || socket.data.iskRoomCode || socket.data.monopolyRoomCode || socket.data.wormsRoomCode || socket.data.skySprintRoomCode || socket.data.gokartRoomCode || socket.data.casusBelliRoomCode) throw new Error('Bu bağlantı zaten bir odaya bağlı.');
      const code = String(payload.code || '').trim().toUpperCase();
      const token = String(payload.resumeToken || '');
      if (!/^[A-Z0-9]{6}$/.test(code) || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('Oturum bilgisi geçersiz.');
      const room = rooms.get(code);
      if (!room) throw new Error('Oda artık mevcut değil veya kurtarma süresi doldu.');
      const entry = Object.entries(room.players).find(([, player]) => player.resumeToken === token);
      if (!entry) throw new Error('Oturum kurtarılamadı. Süre dolmuş olabilir; yeniden katılman gerekiyor.');
      const [oldId, oldPlayer] = entry;
      const oldSocket = io.of('/').sockets.get(oldId);
      if (oldId !== socket.id && oldPlayer.connected !== false && oldSocket?.connected) {
        throw new Error('Bu oturum başka bir bağlantıda hâlâ açık. Önce eski bağlantının kesilmesini bekle.');
      }
      if (oldPlayer.resumeTimer) clearTimeout(oldPlayer.resumeTimer);
      if (oldId !== socket.id) {
        delete room.players[oldId];
        room.players[socket.id] = { ...oldPlayer, id: socket.id, connected: true, resumeToken: makeResumeToken(), resumeTimer: null };
        if (room.hostId === oldId) room.hostId = socket.id;
        rebindPlayerIdentity(room.game, oldId, socket.id);
        if (oldSocket) {
          oldSocket.data.roomCode = undefined;
          oldSocket.leave(code);
          oldSocket.disconnect(true);
        }
      } else {
        oldPlayer.connected = true;
        oldPlayer.resumeToken = makeResumeToken();
        oldPlayer.resumeTimer = null;
      }
      socket.join(code); socket.data.roomCode = code; socket.data.playerName = room.players[socket.id].name;
      const player = room.players[socket.id];
      ensureImposterHost(room);
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, name: player.name });
      emitRoom(room);
      const role = room.game?.roles?.[socket.id];
      if (role && room.game) socket.emit('game:private-role', role.imposter ? { imposter: true, hint: room.game.hint } : { imposter: false, word: room.game.word });
      if (room.game?.phase === 'guess' && room.game.guesserId === socket.id) socket.emit('game:guess-turn', { allowed: true });
      io.to(code).emit('game:notice', { message: `${player.name} yeniden bağlandı. Oyun kaldığı yerden sürüyor.` });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('room:leave', (_payload, ack = () => {}) => {
    try {
      const room = getRoom(socket);
      const code = room.code;
      const playerName = room.players[socket.id]?.name || 'Bir oyuncu';
      socket.data.roomCode = undefined; socket.data.playerName = undefined;
      socket.leave(code);
      removeImposterPlayer(room, socket.id, 'odadan ayrıldı.');
      ack({ ok: true, playerName });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('game:start', (_payload, ack = () => {}) => {
    try {
      const room = getRoom(socket);
      if (room.hostId !== socket.id) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
      if (room.status !== 'lobby') throw new Error('Bu oyun zaten başlamış.');
      const players = Object.values(room.players).filter(p => p.connected !== false);
      if (players.length < 4) throw new Error('Başlamak için en az 4 bağlı oyuncu gerekli.');
      // Disconnected lobby reservations are removed when a match actually starts, so
      // nobody is shown as a dead player without having received a role.
      for (const [id, player] of Object.entries(room.players)) {
        if (player.connected === false) { if (player.resumeTimer) clearTimeout(player.resumeTimer); delete room.players[id]; }
      }
      room.game = makeGame(players, room.settings);
      room.status = 'playing';
      emitRoom(room); sendPrivateRoles(room);
      io.to(room.code).emit('game:notice', { message: 'Roller dağıtıldı. Herkes kendi telefonunda rolünü görüp hazır olduğunda onaylasın.' });
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('game:ready', (_payload, ack = () => {}) => {
    try {
      const room = getRoom(socket), game = room.game;
      if (!game || game.phase !== 'reveal') throw new Error('Rol onayı şu anda açık değil.');
      if (!game.alive.includes(socket.id)) throw new Error('Bu oyuncu artık aktif değil.');
      game.roles[socket.id].ready = true;
      const connectedAlive = game.alive.filter(id => room.players[id]?.connected !== false);
      if (connectedAlive.length && connectedAlive.every(id => game.roles[id]?.ready)) startDiscussion(room);
      else emitRoom(room);
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('game:start-vote', (_payload, ack = () => {}) => {
    try {
      const room = getRoom(socket), game = room.game;
      if (!game || game.phase !== 'discussion') throw new Error('Şu anda oylamaya geçilemez.');
      if (room.hostId !== socket.id) throw new Error('Oylamayı oda sahibi başlatır.');
      if (!game.alive.includes(socket.id) || room.players[socket.id]?.connected === false) throw new Error('Oylamayı yalnızca bağlı ve aktif oda sahibi başlatabilir.');
      const connectedAlive = game.alive.filter(id => room.players[id]?.connected !== false);
      if (connectedAlive.length < 3) throw new Error('Oylamaya geçmek için en az 3 aktif oyuncunun bağlantısı olmalı.');
      if (!beginImposterVote(room, false)) throw new Error('Oylama şu anda başlatılamıyor.');
      ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('game:vote', (payload = {}, ack = () => {}) => {
    try {
      const room = getRoom(socket), game = room.game;
      if (!game) throw new Error('Oyun başlamadı.');
      if (room.players[socket.id]?.connected === false) throw new Error('Oy vermek için bağlantın geri gelmeli.');
      const result = castVote(game, room.players, socket.id, String(payload.targetId || ''));
      if (result) publishImposterVoteResult(room, result);
      ensureImposterHost(room);
      emitRoom(room); ack({ ok: true, complete: !!result });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('game:guess', (payload = {}, ack = () => {}) => {
    try {
      const room = getRoom(socket);
      if (!room.game) throw new Error('Oyun başlamadı.');
      const result = submitGuess(room.game, socket.id, payload.guess);
      clearImposterGuessTimer(room);
      io.to(room.code).emit('game:result', result); emitRoom(room); ack({ ok: true, correct: result.guessCorrect });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('game:new-round', (_payload, ack = () => {}) => {
    try {
      const room = getRoom(socket), game = room.game;
      if (room.hostId !== socket.id) throw new Error('Yeni turu oda sahibi başlatabilir.');
      if (!game || game.phase !== 'finished') throw new Error('Oyun bitmeden yeni oyun başlatılamaz.');
      clearImposterVoteTimer(room); clearImposterDiscussionTimer(room); clearImposterGuessTimer(room);
      room.status = 'lobby'; room.game = null;
      emitRoom(room); io.to(room.code).emit('game:notice', { message: 'Oyun bitti. Oda sahibi yeni oyunu başlatabilir.' }); ack({ ok: true });
    } catch (e) { ack({ ok: false, error: e.message }); }
  });
  socket.on('disconnect', () => { handleDisconnect(socket); onTabuDisconnect(socket); leaveIskRoom(socket); disconnectMonopolyPlayer(socket); disconnectWormsPlayer(socket); disconnectSkySprintPlayer(socket); disconnectGoKartPlayer(socket); disconnectCasusBelliPlayer(socket); });
});

const port = Number(process.env.PORT) || 3000;
if (require.main === module) server.listen(port, '0.0.0.0', () => console.log(`FOFANA GAMES server listening on 0.0.0.0:${port}`));
module.exports = { app, server, io, rooms, tabuRooms, iskRooms, monopolyRooms, wormsRooms, skySprintRooms, gokartRooms };
