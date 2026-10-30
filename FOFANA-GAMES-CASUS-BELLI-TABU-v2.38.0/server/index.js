'use strict';
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const CasusBelli = require('./casus-belli-room');
const { attachTabu } = require('./tabu-online');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 25000, pingTimeout: 20000 });
const ROOT = path.resolve(__dirname, '..');
const rooms = new Map();
const tabuRooms = attachTabu(io);
const ROOM_CODES = ['CASUS01'];

app.get('/health', (_req, res) => res.json({ ok: true, service: 'fofana-games', rooms: roomStatus(), tabuRooms: tabuRooms.size }));
app.use(express.static(ROOT, { extensions: ['html'] }));

function roomStatus() {
  return ROOM_CODES.map((code, index) => {
    const room = rooms.get(code);
    const players = room ? Object.values(room.players).filter(p => p.connected !== false).length : 0;
    return { slot: index + 1, players, status: room?.status || 'open', full: players >= 2 || room?.status === 'playing' };
  });
}
function emitRoom(room) {
  for (const player of Object.values(room.players)) {
    io.to(player.id).emit('casus-belli:room-state', CasusBelli.publicRoom(room, player.id));
  }
}
function emitRoomStatus() { io.emit('casus-belli:room-status', { rooms: roomStatus() }); }
function disconnectPlayer(socket) {
  const code = socket.data.casusBelliRoomCode;
  socket.data.casusBelliRoomCode = undefined;
  const room = code && rooms.get(code);
  if (!room || !room.players[socket.id]) return;
  const player = room.players[socket.id];
  CasusBelli.markDisconnected(room, socket.id);
  player.reconnectTimer = setTimeout(() => {
    const current = rooms.get(code), disconnected = current?.players?.[socket.id];
    if (!current || !disconnected || disconnected.connected !== false ||
        Date.now() - disconnected.disconnectedAt < CasusBelli.RESUME_GRACE_MS) return;
    const result = CasusBelli.leaveRoom(current, socket.id);
    if (result.deleted) rooms.delete(code);
    else {
      if (current.status === 'interrupted') current.status = 'lobby';
      emitRoom(current);
    }
    emitRoomStatus();
  }, CasusBelli.RESUME_GRACE_MS);
  player.reconnectTimer.unref?.();
  emitRoom(room);
  emitRoomStatus();
}

io.on('connection', socket => {
  function getRoom() {
    const code = socket.data.casusBelliRoomCode, room = code && rooms.get(code);
    if (!room || !room.players[socket.id]) throw new Error('Önce Casus Belli oyun odasına katılmalısın.');
    return room;
  }
  function action(event, fn) {
    socket.on(event, (payload = {}, ack = () => {}) => {
      try {
        const room = getRoom();
        fn(room, payload);
        emitRoom(room);
        ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) });
        emitRoomStatus();
      } catch (error) { ack({ ok: false, error: error.message }); }
    });
  }
  socket.on('casus-belli:room-status', (_payload = {}, ack = () => {}) => ack({ ok: true, rooms: roomStatus() }));
  socket.on('casus-belli:room-join', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.casusBelliRoomCode) throw new Error('Önce bulunduğun odadan ayrıl.');
      const slot = Number(payload.slot);
      if (slot !== 1) throw new Error('Casus Belli ortak lobisi seçilmeli.');
      const name = CasusBelli.cleanName(payload.name);
      if (!name) throw new Error('Oyuncu adı gerekli.');
      const code = ROOM_CODES[0];
      let room = rooms.get(code);
      if (!room) { room = CasusBelli.createRoom({ code, hostId: socket.id, name }); rooms.set(code, room); }
      else CasusBelli.joinRoom(room, { playerId: socket.id, name });
      socket.join(code);
      socket.data.casusBelliRoomCode = code;
      const player = room.players[socket.id];
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, room: CasusBelli.publicRoom(room, socket.id) });
      emitRoom(room); emitRoomStatus();
    } catch (error) { ack({ ok: false, error: error.message }); }
  });
  socket.on('casus-belli:resume', (payload = {}, ack = () => {}) => {
    try {
      if (socket.data.casusBelliRoomCode) throw new Error('Önce bulunduğun odadan ayrıl.');
      const code = String(payload.code || '').trim().toUpperCase(), room = rooms.get(code);
      if (!ROOM_CODES.includes(code) || !room) throw new Error('Casus Belli ortak lobisi artık mevcut değil.');
      const oldPlayer = Object.values(room.players).find(p => p.connected === false && p.resumeToken === payload.resumeToken);
      const player = CasusBelli.resumePlayer(room, socket.id, payload.resumeToken);
      if (!player) throw new Error('Oturum kurtarılamadı; token geçersiz veya 90 saniyelik süre dolmuş.');
      if (oldPlayer?.reconnectTimer) clearTimeout(oldPlayer.reconnectTimer);
      socket.join(code); socket.data.casusBelliRoomCode = code;
      ack({ ok: true, code, playerId: socket.id, resumeToken: player.resumeToken, room: CasusBelli.publicRoom(room, socket.id) });
      emitRoom(room); emitRoomStatus();
    } catch (error) { ack({ ok: false, error: error.message }); }
  });
  action('casus-belli:kingdom', (room, payload) => CasusBelli.setKingdom(room, socket.id, payload.color));
  socket.on('casus-belli:ready', (payload = {}, ack = () => {}) => {
    try {
      const room = getRoom();
      CasusBelli.setReady(room, socket.id, payload.ready);
      const players = Object.values(room.players);
      const allReady = room.status === 'lobby' && players.length === 2 &&
        players.every(p => p.connected !== false && p.ready && p.color) &&
        new Set(players.map(p => p.color)).size === 2;
      if (allReady) {
        CasusBelli.startGame(room, room.hostId);
        io.to(room.code).emit('casus-belli:started', { message: 'İki krallık da hazır. Maç başladı!' });
      }
      emitRoom(room); emitRoomStatus();
      ack({ ok: true, room: CasusBelli.publicRoom(room, socket.id) });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });
  action('casus-belli:start', room => CasusBelli.startGame(room, socket.id));
  action('casus-belli:draw', (room, payload) => CasusBelli.drawCard(room, socket.id, payload.type));
  action('casus-belli:queen-steal-select', (room, payload) => CasusBelli.chooseQueenSteal(room, socket.id, payload.slotIndex));
  action('casus-belli:play', (room, payload) => CasusBelli.submitCards(room, socket.id, payload.cardIds, payload.supportChoices || {}, payload.supportTargets || {}));
  action('casus-belli:priest-choice', (room, payload) => CasusBelli.choosePriestCards(room, socket.id, payload));
  action('casus-belli:support-target', (room, payload) => CasusBelli.chooseSupportTarget(room, socket.id, payload));
  action('casus-belli:resolve', room => CasusBelli.resolveCombat(room, socket.id));
  socket.on('casus-belli:rematch', (_payload = {}, ack = () => {}) => {
    try {
      const room = getRoom(), result = CasusBelli.requestRematch(room, socket.id);
      emitRoom(room); emitRoomStatus();
      if (result.started) io.to(room.code).emit('casus-belli:notice', { message: 'İki oyuncu da rövanşı kabul etti. Yeni maç için krallık seçin.' });
      ack({ ok: true, room: result.room, started: result.started });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });
  action('casus-belli:next-round', room => CasusBelli.nextRound(room, socket.id));
  socket.on('casus-belli:leave', (_payload = {}, ack = () => {}) => {
    try {
      const room = getRoom(), code = room.code;
      socket.leave(code); socket.data.casusBelliRoomCode = undefined;
      const result = CasusBelli.leaveRoom(room, socket.id);
      if (result.deleted) rooms.delete(code); else emitRoom(room);
      emitRoomStatus(); ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });
  socket.on('disconnect', () => disconnectPlayer(socket));
});

const port = Number(process.env.PORT) || 3000;
if (require.main === module) server.listen(port, '0.0.0.0', () => console.log(`FOFANA GAMES listening on 0.0.0.0:${port}`));
module.exports = { app, server, io, rooms, roomStatus };
