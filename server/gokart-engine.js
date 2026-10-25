'use strict';

const { randomBytes, timingSafeEqual } = require('node:crypto');
const MAX_PLAYERS = 6;
const LAPS_TO_WIN = 3;
const MAX_FORWARD_SPEED = 29;
const MAX_REVERSE_SPEED = 9;
const ACCELERATION = 19;
const REVERSE_ACCELERATION = 12;
const FRICTION = 7.5;
const TURN_RATE = 2.1;
const RECONNECT_GRACE_MS = 90_000;
const CODE_RE = /^[A-Z0-9]{6}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/i;
const COLORS = ['#e74c3c', '#2389ff', '#b34dff', '#27ae60', '#ff9f1c', '#16a6a1'];
const BOXES = [[15,-216],[78,-196],[130,-125],[145,5],[92,218],[8,218],[-86,206],[-135,115],[-145,-110],[-72,-218],[120,164],[-120,-174]];
const OBSTACLES = [[39,-207.5],[-82,-194],[126,-95],[145,73],[70,207.5],[-42,194],[-126,95],[-145,-65],[101,-180],[-105,180],[18,-180],[-18,220],[-20,-225],[52,-184],[126,-28],[132,122],[18,225],[-66,184],[-132,28],[-118,-126],[92,-110],[128,-40],[86,45],[120,110],[-92,110],[-128,40],[-86,-45],[-120,-110],[58,-155],[-58,-155],[145,-150],[-145,150],[58,155],[-58,155],[105,65],[-105,-65],[0,-238],[0,238],[76,-130],[-76,130],[76,130],[-76,-130]];
const cleanName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24) : '';
const createResumeToken = () => randomBytes(32).toString('hex');
function matchesToken(stored, supplied) {
  if (typeof stored !== 'string' || typeof supplied !== 'string' || !TOKEN_RE.test(stored) || !TOKEN_RE.test(supplied)) return false;
  const a = Buffer.from(stored, 'hex'), b = Buffer.from(supplied, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
function newPlayer(id, name, slot, token = createResumeToken()) {
  return { id, name, slot, color: COLORS[slot % COLORS.length], connected: true, resumeToken: token, disconnectedAt: null,
    controls: { forward: false, reverse: false, left: false, right: false }, lastInputAt: 0,
    x: -132 + slot * 4, z: -207.5 + (slot % 2 ? 8 : 0), yaw: Math.PI / 2, speed: 0,
    lap: 0, checkpoint: 0, finished: false, finishPosition: null, currentPowerup: null,
    slowUntil: 0, slipUntil: 0, resumeTimer: null };
}
function createRoom(code, hostId, name, options = {}) {
  code = String(code || '').toUpperCase(); name = cleanName(name);
  if (!CODE_RE.test(code)) throw new Error('Oda kodu 6 harf/rakam olmalı.');
  if (!hostId || !name) throw new Error('Oyuncu adı gerekli.');
  const room = { code, hostId, originalHostId: hostId, status: 'lobby', players: {}, createdAt: options.now ?? Date.now(), startedAt: null,
    lastTickAt: null, revision: 0, lastActionAt: {}, pausedFromStatus: null, finishOrder: [],
    boxes: BOXES.map(([x,z], index) => ({ id: index, x, z, availableAt: 0 })), bananas: [], nextHazardId: 1,
    events: [], random: typeof options.random === 'function' ? options.random : Math.random };
  room.players[hostId] = newPlayer(hostId, name, 0, options.token || createResumeToken());
  return room;
}
function joinRoom(room, id, name, options = {}) {
  name = cleanName(name);
  if (!room || room.status !== 'lobby') throw new Error('Yarış başladı; yeni oyuncu alınmıyor.');
  if (!id || room.players[id]) throw new Error('Oyuncu bağlantısı geçersiz.');
  if (!name) throw new Error('Oyuncu adı gerekli.');
  const players = Object.values(room.players);
  if (players.length >= MAX_PLAYERS) throw new Error(`Oda dolu. En fazla ${MAX_PLAYERS} oyuncu katılabilir.`);
  if (players.some(p => p.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor.');
  const used = new Set(players.map(p => p.slot)); let slot = 0; while (used.has(slot)) slot++;
  const player = newPlayer(id, name, slot, options.token || createResumeToken());
  room.players[id] = player; room.revision++;
  return player;
}
function startRace(room, id, now = Date.now()) {
  if (!room?.players?.[id] || room.players[id].connected === false) throw new Error('Bu odada bağlı bir oyuncu değilsin.');
  if (room.hostId !== id) throw new Error('Yarışı yalnızca oda sahibi başlatabilir.');
  if (room.status !== 'lobby') throw new Error('Yarış zaten başladı.');
  const players = Object.values(room.players).filter(p => p.connected !== false);
  if (players.length < 2) throw new Error('Çevrimiçi yarış için en az iki oyuncu gerekli.');
  if (players.length > MAX_PLAYERS) throw new Error('Oyuncu sınırı aşıldı.');
  room.status = 'racing'; room.startedAt = now; room.lastTickAt = now; room.pausedFromStatus = null; room.finishOrder = [];
  room.bananas = []; room.boxes.forEach(b => { b.availableAt = 0; });
  for (const player of players) {
    const slot = player.slot; player.x = -132 + slot * 4; player.z = -207.5 + (slot % 2 ? 8 : 0); player.yaw = Math.PI / 2;
    player.speed = 0; player.lap = 0; player.checkpoint = 0; player.finished = false; player.finishPosition = null;
    player.currentPowerup = null; player.slowUntil = 0; player.slipUntil = 0;
    player.controls = { forward: false, reverse: false, left: false, right: false };
  }
  room.revision++; pushEvent(room, 'start', 'Yarış başladı. İlk üç turu tamamlayan kazanır.', null, now);
  return publicRoom(room);
}
function pushEvent(room, type, message, playerId = null, now = Date.now()) {
  room.events.unshift({ id: `${now}-${room.revision}-${room.events.length}`, type, message: String(message || '').slice(0, 180), playerId, at: now });
  room.events = room.events.slice(0, 12);
}
function setControls(room, id, payload = {}, now = Date.now()) {
  assertRacingPlayer(room, id);
  const player = room.players[id];
  if (player.finished) return false;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Sürüş kontrolü geçersiz.');
  if (player.lastInputAt && now - player.lastInputAt < 25) throw new Error('Sürüş kontrolü çok sık gönderildi.');
  player.controls = { forward: payload.forward === true, reverse: payload.reverse === true, left: payload.left === true, right: payload.right === true };
  player.lastInputAt = now;
  return true;
}
function assertRacingPlayer(room, id) {
  if (!room || !room.players[id] || room.players[id].connected === false) throw new Error('Önce çevrimiçi Go-Kart odasına katılmalısın.');
  if (room.status === 'paused') throw new Error('Bir oyuncunun bağlantısı bekleniyor. Yarış duraklatıldı.');
  if (room.status !== 'racing') throw new Error('Yarış aktif değil.');
}
function insideTrack(x, z) {
  if (x > 157 || x < -157 || z > 247 || z < -247) return false;
  if (Math.abs(x) < 52.2 && Math.abs(z) < 167.2) return false;
  return !OBSTACLES.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < 3.65);
}
function updateCheckpoint(player, oldX, oldZ) {
  const x = player.x, z = player.z;
  if (player.checkpoint === 0 && x >= 85 && z >= -242 && z <= -170) player.checkpoint = 1;
  else if (player.checkpoint === 1 && z >= 155 && x >= 80) player.checkpoint = 2;
  else if (player.checkpoint === 2 && x <= -80 && z >= 155) player.checkpoint = 3;
  else if (player.checkpoint === 3 && z <= -155 && x <= -80) player.checkpoint = 4;
  else if (player.checkpoint === 4 && oldX < 0 && x >= 0 && z >= -242 && z <= -170) {
    player.lap++;
    player.checkpoint = 0;
  }
}
function stepPlayer(room, player, dt, now) {
  if (!player.connected || player.finished) { player.controls = { forward:false, reverse:false, left:false, right:false }; player.speed = approach(player.speed, 0, FRICTION * dt); return; }
  let c = player.controls;
  if (!player.lastInputAt || now - player.lastInputAt > 350) c = { forward:false, reverse:false, left:false, right:false };
  if (c.forward && !c.reverse) player.speed += ACCELERATION * dt;
  else if (c.reverse && !c.forward) player.speed -= REVERSE_ACCELERATION * dt;
  else player.speed = approach(player.speed, 0, FRICTION * dt);
  player.speed = clamp(player.speed, -MAX_REVERSE_SPEED, MAX_FORWARD_SPEED);
  if (now < player.slowUntil) player.speed *= Math.max(0, 1 - 1.8 * dt);
  if (now < player.slipUntil) player.yaw += Math.sin(now / 90) * 0.06;
  const steering = (c.left ? 1 : 0) - (c.right ? 1 : 0), speedFactor = Math.min(Math.abs(player.speed) / 5, 1);
  if (Math.abs(player.speed) > 0.15 && steering) player.yaw += steering * TURN_RATE * speedFactor * Math.sign(player.speed) * dt;
  const oldX = player.x, oldZ = player.z;
  const nextX = oldX + Math.sin(player.yaw) * player.speed * dt, nextZ = oldZ + Math.cos(player.yaw) * player.speed * dt;
  if (!insideTrack(nextX, nextZ)) player.speed = 0;
  else { player.x = nextX; player.z = nextZ; updateCheckpoint(player, oldX, oldZ); }
  for (const box of room.boxes) {
    if (box.availableAt <= now && !player.currentPowerup && Math.hypot(player.x - box.x, player.z - box.z) < 3.1) {
      player.currentPowerup = room.random() < .5 ? 'rocket' : 'banana'; box.availableAt = now + 18_000;
      pushEvent(room, 'pickup', `${player.name}, ${player.currentPowerup === 'rocket' ? 'roket' : 'muz'} güçlendirmesi aldı.`, player.id, now);
    }
  }
  for (let i = room.bananas.length - 1; i >= 0; i--) {
    const trap = room.bananas[i];
    if (trap.expiresAt <= now) { room.bananas.splice(i, 1); continue; }
    if (trap.ownerId !== player.id && Math.hypot(player.x - trap.x, player.z - trap.z) < 2.5) {
      player.slowUntil = Math.max(player.slowUntil, now + 2700); player.slipUntil = Math.max(player.slipUntil, now + 2200);
      pushEvent(room, 'banana', `${player.name} muz kabuğuna bastı!`, player.id, now); room.bananas.splice(i, 1); player.speed *= .35;
    }
  }
  if (player.lap >= LAPS_TO_WIN && !player.finished) {
    player.finished = true; player.finishPosition = room.finishOrder.length + 1; room.finishOrder.push(player.id);
    player.controls = { forward:false, reverse:false, left:false, right:false }; player.speed = 0;
    pushEvent(room, 'finish', `${player.name}, yarışı ${player.finishPosition}. sırada bitirdi.`, player.id, now);
  }
}
function approach(value, target, amount) { return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function tickRoom(room, now = Date.now()) {
  if (!room || room.status !== 'racing') return publicRoom(room);
  const dt = clamp((now - (room.lastTickAt || now)) / 1000, 0, 0.12);
  room.lastTickAt = now;
  if (dt <= 0) return publicRoom(room);
  for (const player of Object.values(room.players)) stepPlayer(room, player, dt, now);
  if (Object.values(room.players).some(p => p.finished) && Object.values(room.players).filter(p => p.connected !== false).every(p => p.finished)) {
    room.status = 'finished'; pushEvent(room, 'finish-all', 'Yarış tamamlandı.', null, now);
  }
  room.revision++;
  return publicRoom(room);
}
function usePowerup(room, id, now = Date.now()) {
  assertRacingPlayer(room, id);
  const player = room.players[id];
  if (player.finished) throw new Error('Yarışı bitirdin. Güçlendirme kullanamazsın.');
  if (!player.currentPowerup) throw new Error('Kullanılabilir güçlendirme yok.');
  const kind = player.currentPowerup; player.currentPowerup = null;
  if (kind === 'banana') {
    const x = player.x - Math.sin(player.yaw) * 4.5, z = player.z - Math.cos(player.yaw) * 4.5;
    room.bananas.push({ id: room.nextHazardId++, ownerId: id, x, z, expiresAt: now + 18_000 });
    pushEvent(room, 'banana-drop', `${player.name} piste muz bıraktı.`, id, now);
    room.revision++; return { kind, targetId: null, room: publicRoom(room) };
  }
  const forwardX = Math.sin(player.yaw), forwardZ = Math.cos(player.yaw);
  let target = null, best = 110;
  for (const candidate of Object.values(room.players)) {
    if (candidate.id === id || candidate.finished || candidate.connected === false) continue;
    const dx = candidate.x - player.x, dz = candidate.z - player.z, distance = Math.hypot(dx, dz), ahead = dx * forwardX + dz * forwardZ;
    if (ahead > 0 && distance < best && ahead / (distance || 1) > 0.15) { target = candidate; best = distance; }
  }
  if (target) { target.slowUntil = Math.max(target.slowUntil, now + 3400); target.slipUntil = Math.max(target.slipUntil, now + 700); target.speed *= .42; }
  pushEvent(room, 'rocket', target ? `${player.name} roketle ${target.name} oyuncusunu vurdu.` : `${player.name} roket attı ama hedef bulamadı.`, id, now);
  room.revision++; return { kind, targetId: target?.id || null, room: publicRoom(room) };
}
function disconnectPlayer(room, id, now = Date.now()) {
  const player = room?.players?.[id]; if (!player || player.connected === false) return null;
  player.connected = false; player.disconnectedAt = now; player.controls = { forward:false, reverse:false, left:false, right:false }; player.speed = 0;
  if (room.status === 'racing') { room.pausedFromStatus = 'racing'; room.status = 'paused'; room.lastTickAt = now; }
  if (room.hostId === id) { const next = Object.values(room.players).find(p => p.id !== id && p.connected !== false); if (next) room.hostId = next.id; }
  room.revision++; pushEvent(room, 'disconnect', `${player.name} bağlantısını kaybetti. Yarış 90 saniyeliğine duraklatıldı.`, id, now);
  return player;
}
function resumePlayer(room, newId, token, tokenFactory = createResumeToken, now = Date.now()) {
  if (!room?.players || typeof newId !== 'string' || !newId || room.players[newId]) return null;
  const entry = Object.entries(room.players).find(([, p]) => p.connected === false && matchesToken(p.resumeToken, token) && Number.isFinite(p.disconnectedAt) && p.disconnectedAt <= now && now - p.disconnectedAt <= RECONNECT_GRACE_MS);
  if (!entry) return null;
  const [oldId, player] = entry;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  delete room.players[oldId]; player.id = newId; player.connected = true; player.resumeToken = tokenFactory(); player.disconnectedAt = null;
  player.controls = { forward:false, reverse:false, left:false, right:false }; player.lastInputAt = now;
  room.players[newId] = player;
  const reclaimedOriginalHost = room.originalHostId === oldId;
  if (reclaimedOriginalHost) {
    room.originalHostId = newId;
    room.hostId = newId;
  } else if (room.hostId === oldId || !room.players[room.hostId] || room.players[room.hostId].connected === false) {
    room.hostId = newId;
  }
  if (room.status === 'paused' && Object.values(room.players).every(p => p.connected !== false)) { room.status = room.pausedFromStatus || 'racing'; room.pausedFromStatus = null; room.lastTickAt = now; }
  room.revision++; pushEvent(room, 'resume', `${player.name} yeniden bağlandı.`, newId, now);
  return { oldSocketId: oldId, player };
}
function removePlayer(room, id, now = Date.now()) {
  const player = room?.players?.[id]; if (!player) return false;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  delete room.players[id]; delete room.lastActionAt[id]; room.finishOrder = room.finishOrder.filter(x => x !== id);
  const remainingPlayers = Object.values(room.players);
  if (room.originalHostId === id) room.originalHostId = (remainingPlayers.find(p => p.connected !== false) || remainingPlayers[0])?.id || null;
  if (room.hostId === id || !room.players[room.hostId]) room.hostId = (remainingPlayers.find(p => p.connected !== false) || remainingPlayers[0])?.id || null;
  if (!Object.keys(room.players).length) return false;
  if (room.status === 'paused' && Object.values(room.players).every(p => p.connected !== false)) { room.status = room.pausedFromStatus || 'racing'; room.pausedFromStatus = null; room.lastTickAt = now; }
  if (room.status === 'racing' && Object.values(room.players).filter(p => p.connected !== false).length < 2) { room.status = 'finished'; pushEvent(room, 'finish', 'Rakip kalmadığı için yarış sona erdi.', null, now); }
  room.revision++; return true;
}
function publicRoom(room) {
  if (!room) return null;
  const players = Object.values(room.players).sort((a,b) => a.slot - b.slot).map(p => ({ id:p.id, name:p.name, slot:p.slot, color:p.color, connected:p.connected !== false, x:p.x, z:p.z, yaw:p.yaw, speed:p.speed, lap:p.lap, checkpoint:p.checkpoint, finished:p.finished, finishPosition:p.finishPosition, currentPowerup:p.currentPowerup }));
  return { code:room.code, hostId:room.hostId, status:room.status, revision:room.revision, lapsToWin:LAPS_TO_WIN, players,
    boxes:room.boxes.map(b => ({ id:b.id, x:b.x, z:b.z, available:b.availableAt <= Date.now() })),
    bananas:room.bananas.map(b => ({ id:b.id, x:b.x, z:b.z, expiresAt:b.expiresAt })), finishOrder:[...room.finishOrder], events:room.events.slice(0, 8), startedAt:room.startedAt };
}
module.exports = { MAX_PLAYERS, LAPS_TO_WIN, RECONNECT_GRACE_MS, cleanName, createResumeToken, matchesToken, createRoom, joinRoom, startRace, setControls, tickRoom, usePowerup, disconnectPlayer, resumePlayer, removePlayer, publicRoom, insideTrack, updateCheckpoint };
