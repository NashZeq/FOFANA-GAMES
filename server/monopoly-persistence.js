'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const MAX_STORE_BYTES = 8 * 1024 * 1024;
const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/i;

function sanitizeForStorage(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) throw new Error('Monopoly oda verisinde döngüsel nesne var.');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map(item => {
      const clean = sanitizeForStorage(item, seen);
      return clean === undefined ? null : clean;
    });
  } else {
    result = {};
    for (const [key, item] of Object.entries(value)) {
      // Timeout handles and process-local timers are never persisted.
      if (/(?:^|_)(?:resume)?timer$/i.test(key) || /^resumeTimer$/i.test(key)) continue;
      if (typeof item === 'function' || typeof item === 'symbol' || item === undefined) continue;
      const clean = sanitizeForStorage(item, seen);
      if (clean !== undefined) result[key] = clean;
    }
  }
  seen.delete(value);
  return result;
}

function validateStoredRoom(room) {
  if (!room || typeof room !== 'object' || !ROOM_CODE_RE.test(String(room.code || ''))) return false;
  if (!room.players || typeof room.players !== 'object' || Array.isArray(room.players)) return false;
  const players = Object.entries(room.players);
  if (players.length < 1 || players.length > 12) return false;
  if (!players.every(([id, player]) => id && player && typeof player === 'object'
      && typeof player.name === 'string' && player.name.trim().length > 0
      && TOKEN_RE.test(String(player.resumeToken || '')))) return false;
  if (room.hostId && !Object.hasOwn(room.players, room.hostId)) return false;
  if (room.game !== null && room.game !== undefined && typeof room.game !== 'object') return false;
  return true;
}

function saveMonopolyRooms(filePath, roomMap, now = Date.now()) {
  if (!filePath) return { saved: false, reason: 'disabled' };
  if (!(roomMap instanceof Map)) throw new TypeError('roomMap Map olmalı.');
  const rooms = [...roomMap.values()].map(room => sanitizeForStorage(room));
  const payload = JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: now, rooms });
  if (Buffer.byteLength(payload, 'utf8') > MAX_STORE_BYTES) throw new Error('Monopoly oda kaydı 8 MB sınırını aşıyor.');

  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  const tempPath = `${absolutePath}.tmp-${process.pid}`;
  let fd;
  try {
    fd = fs.openSync(tempPath, 'w', 0o600);
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, absolutePath);
    try {
      const dirFd = fs.openSync(path.dirname(absolutePath), 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch { /* Some filesystems do not support syncing directories. */ }
    return { saved: true, rooms: rooms.length, bytes: Buffer.byteLength(payload, 'utf8') };
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}

function loadMonopolyRooms(filePath) {
  if (!filePath) return null;
  let raw;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_STORE_BYTES) throw new Error('Monopoly oda kayıt dosyası geçersiz veya 8 MB sınırını aşıyor.');
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.rooms)) {
    throw new Error('Monopoly oda kayıt dosyasının sürümü veya biçimi desteklenmiyor.');
  }
  const rooms = new Map();
  for (const room of parsed.rooms) {
    if (!validateStoredRoom(room)) continue;
    if (rooms.has(room.code)) continue;
    rooms.set(room.code, room);
  }
  return { savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : null, rooms };
}

/**
 * After a process restart all Socket.IO IDs are stale. Keep game state and
 * recovery tokens, but require every player to resume with a fresh socket ID.
 */
function prepareMonopolyRoomsForRestart(roomMap, now = Date.now(), graceMs = 90_000) {
  const recovered = [];
  for (const [code, room] of roomMap) {
    for (const player of Object.values(room.players)) {
      player.id = player.id || Object.keys(room.players).find(id => room.players[id] === player);
      // A previously connected player lost their socket only at this restart.
      // An already-disconnected player's grace window must not restart forever.
      const wasAlreadyDisconnected = player.connected === false;
      const originalDisconnectAt = Number(player.disconnectedAt);
      player.connected = false;
      player.disconnectedAt = wasAlreadyDisconnected && Number.isFinite(originalDisconnectAt) ? originalDisconnectAt : now;
      player.resumeTimer = null;
    }
    if (room.hostId && room.players[room.hostId] && !room.disconnectedHostId) {
      room.disconnectedHostId = room.hostId;
    }
    room.revision = Number.isSafeInteger(room.revision) && room.revision >= 0 ? room.revision : 0;
    if (room.game) room.status = room.game.phase === 'finished' ? 'finished' : 'paused';
    else room.status = 'lobby';
    recovered.push({ code, room, playerIds: Object.keys(room.players), graceMs });
  }
  return recovered;
}

module.exports = {
  SCHEMA_VERSION,
  MAX_STORE_BYTES,
  sanitizeForStorage,
  validateStoredRoom,
  saveMonopolyRooms,
  loadMonopolyRooms,
  prepareMonopolyRoomsForRestart
};
