'use strict';
const CODE_RE = /^[A-Z0-9]{6}$/;
const MAX_PLAYERS = 6;
const MAX_PROGRESS_SPEED = 520; // Legacy export; client distance is intentionally ignored.
const PROGRESS_GRACE_DISTANCE = 42; // Legacy export; no client-supplied position is trusted.
const SERVER_RACE_SPEED = 270;
const RACE_DISTANCE = 4500;
const GROUND = 420;
const GRAVITY = 1550;
const JUMP_VELOCITIES = [-610, -535];
const STEP_SECONDS = 1 / 60;
const FALL_GRACE_MS = 780;

function cleanName(value) {
  if (typeof value !== 'string') return '';
  const name = value.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 18);
  return name || '';
}
function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return function random() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeTrackSeed(code, now) {
  let hash = (Number(now) >>> 0) ^ 0x9E3779B9;
  for (const ch of String(code)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash >>> 0 || 1;
}
function generateTrack(seed) {
  const random = createRng(seed);
  const track = [];
  let id = 0;
  const add = item => track.push({ id: `e${++id}`, ...item });
  function spawnPlatformRoute(x) {
    const upper = random() < 0.52;
    const base = upper ? GROUND - 150 - random() * 35 : GROUND - 78 - random() * 20;
    let px = x + 18;
    for (let i = 0; i < 3; i++) {
      const y = Math.max(GROUND - 205, Math.min(GROUND - 52, base + (random() - 0.5) * 36));
      const w = 148 + random() * 62;
      add({ type: 'platform', x: px, y, w, h: 15, route: upper ? 'upper' : 'lower' });
      px += w - 15 + random() * 18;
    }
    if (random() < 0.72) {
      const lowY = upper ? GROUND - 68 : GROUND - 174;
      add({ type: 'platform', x: x + 96, y: lowY, w: 190 + random() * 70, h: 13, route: upper ? 'lower' : 'upper' });
    }
    if (random() < 0.58) add({ type: 'gap', x: x + 42, w: 185 + random() * 95 });
  }
  function spawnSet(x) {
    const roll = random();
    if (roll < 0.32) add({ type: 'saw', x, y: [GROUND - 22, GROUND - 93, GROUND - 160][Math.floor(random() * 3)], r: 19, rot: random() * 6 });
    else if (roll < 0.60) add({ type: 'boost', x, y: GROUND - 9, w: 76, h: 9 });
    else if (roll < 0.73) add({ type: 'gap', x, w: 118 + random() * 68 });
    else if (roll < 0.90) spawnPlatformRoute(x);
    else if (roll < 0.96) add({ type: 'blade', x, y: GROUND - (65 + random() * 90), w: 78 });
    else add({ type: 'blade', x, y: GROUND - 8, w: 78 });
  }
  let x = 390;
  while (x < RACE_DISTANCE + 700) {
    spawnSet(x);
    x += 155 + random() * 190;
  }
  return track;
}
function newPlayer(playerId, name, now) {
  return {
    id: playerId, name, connected: true, distance: 0, finishedAt: null, lastProgressAt: now,
    lastJumpAt: null, jumpCount: 0, jumpHeight: 0, jumpVelocity: 0, jumpPhysicsAt: now,
    world: 0, speed: SERVER_RACE_SPEED, baseSpeed: SERVER_RACE_SPEED, boostRemaining: 0, slowRemaining: 0,
    groundHeight: 0, supportPlatformId: null, alive: true, falling: false, fallStartedAt: null,
    hitTrackIds: []
  };
}
function createRoom({ code, hostId, name, now = Date.now() }) {
  if (!CODE_RE.test(String(code || ''))) throw new Error('Oda kodu geçersiz.');
  const clean = cleanName(name);
  if (!clean) throw new Error('Oyuncu adı gerekli.');
  return { code, hostId, originalHostId: hostId, status: 'lobby', createdAt: now, startedAt: null, lastTickAt: now,
    players: { [hostId]: newPlayer(hostId, clean, now) }, winnerId: null, trackSeed: null, track: [] };
}
function joinRoom(room, { playerId, name, now = Date.now() }) {
  if (!room || room.status !== 'lobby') throw new Error('Yarış başlamış veya oda bulunamadı.');
  if (typeof playerId !== 'string' || !playerId.trim()) throw new Error('Oyuncu kimliği geçersiz.');
  if (Object.prototype.hasOwnProperty.call(room.players, playerId)) throw new Error('Bu oyuncu kimliği odada zaten kayıtlı.');
  const clean = cleanName(name);
  if (!clean) throw new Error('Oyuncu adı gerekli.');
  if (Object.keys(room.players).length >= MAX_PLAYERS) throw new Error('Oda dolu. En fazla 6 oyuncu katılabilir.');
  if (Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr-TR') === clean.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor.');
  room.players[playerId] = newPlayer(playerId, clean, now);
  return room;
}
function startRace(room, playerId, now = Date.now()) {
  if (!room || room.hostId !== playerId) throw new Error('Yarışı yalnızca oda sahibi başlatabilir.');
  if (room.status !== 'lobby') throw new Error('Yarış zaten başlamış.');
  const active = Object.values(room.players).filter(p => p.connected);
  if (active.length < 2) throw new Error('Yarış için en az 2 bağlı oyuncu gerekli.');
  room.status = 'racing'; room.startedAt = now; room.lastTickAt = now; room.winnerId = null;
  room.trackSeed = makeTrackSeed(room.code, now);
  room.track = generateTrack(room.trackSeed);
  for (const p of active) Object.assign(p, newPlayer(p.id, p.name, now), { resumeToken: p.resumeToken });
  return room;
}
function obstacleOverlap(player, e) {
  return player.world + 24 > e.x && player.world + 4 < e.x + (e.w || (e.r || 0) * 2 || 2);
}
function inGap(room, world) {
  return room.track.some(e => e.type === 'gap' && world + 18 > e.x && world - 5 < e.x + e.w);
}
function simulateStep(room, player, dt, stepNow) {
  if (!player.alive || player.finishedAt) return;
  if (player.falling) {
    if (player.fallStartedAt !== null && stepNow - player.fallStartedAt >= FALL_GRACE_MS) player.alive = false;
    return;
  }
  const previousWorld = player.world;
  const previousHeight = player.jumpHeight;
  if (player.supportPlatformId) {
    const support = room.track.find(e => e.id === player.supportPlatformId && e.type === 'platform');
    if (!support || player.world + 24 <= support.x || player.world + 4 >= support.x + support.w) {
      player.supportPlatformId = null;
      player.groundHeight = 0;
    }
  }
  player.boostRemaining = Math.max(0, player.boostRemaining - dt);
  player.slowRemaining = Math.max(0, player.slowRemaining - dt);
  player.speed = player.slowRemaining > 0 ? player.baseSpeed * 0.56 : player.boostRemaining > 0 ? player.baseSpeed * 1.72 : player.baseSpeed;
  player.world += player.speed * dt;

  const onFloor = Math.abs(player.jumpHeight - player.groundHeight) < 0.01 && Math.abs(player.jumpVelocity) < 0.01;
  if (!onFloor || player.jumpVelocity !== 0) {
    player.jumpVelocity += GRAVITY * dt;
    player.jumpHeight = Math.max(0, player.jumpHeight - player.jumpVelocity * dt);
  }
  if (player.jumpVelocity >= 0) {
    let landing = null;
    for (const platform of room.track) {
      if (platform.type !== 'platform') continue;
      const height = GROUND - platform.y;
      if (height < player.groundHeight - 0.5 || height > previousHeight + 0.5) continue;
      if (player.world + 24 <= platform.x || player.world + 4 >= platform.x + platform.w) continue;
      if (previousHeight >= height && player.jumpHeight <= height) {
        if (!landing || height > GROUND - landing.y) landing = platform;
      }
    }
    if (landing) {
      player.groundHeight = GROUND - landing.y;
      player.supportPlatformId = landing.id;
      player.jumpHeight = player.groundHeight;
      player.jumpVelocity = 0;
      player.jumpCount = 0;
    }
  }
  const gapNow = player.groundHeight <= 0.01 && inGap(room, player.world);
  if (player.jumpHeight <= player.groundHeight && player.jumpVelocity >= 0) {
    if (gapNow && player.groundHeight <= 0.01) {
      player.falling = true;
      player.fallStartedAt = stepNow;
      player.jumpVelocity = 0;
    } else {
      player.jumpHeight = player.groundHeight;
      player.jumpVelocity = 0;
      player.jumpCount = 0;
    }
  }
  if (player.falling) return;

  const hit = new Set(player.hitTrackIds);
  for (const e of room.track) {
    if (!['saw', 'blade', 'boost'].includes(e.type) || hit.has(e.id) || !obstacleOverlap(player, e)) continue;
    const playerCenterY = GROUND - (player.jumpHeight + 22);
    const obstacleY = e.y || GROUND - 9;
    const threshold = e.type === 'saw' ? e.r + 16 : 22;
    if (Math.abs(playerCenterY - obstacleY) >= threshold) continue;
    hit.add(e.id);
    if (e.type === 'saw' || e.type === 'blade') {
      player.slowRemaining = 2;
      player.boostRemaining = 0;
    } else {
      player.boostRemaining = 1.15;
      player.slowRemaining = 0;
    }
  }
  player.hitTrackIds = [...hit];
  if (player.world >= RACE_DISTANCE - 0.001) {
    player.world = RACE_DISTANCE;
    player.distance = RACE_DISTANCE;
    player.finishedAt = stepNow;
    if (!room.winnerId || player.finishedAt < (room.players[room.winnerId]?.finishedAt ?? Infinity)) room.winnerId = player.id;
  } else player.distance = Math.floor(player.world + 0.001);
}
function advanceRoom(room, now = Date.now()) {
  if (!room || room.status !== 'racing') return room;
  for (const player of Object.values(room.players)) {
    if (player.finishedAt || !player.alive) continue;
    let elapsed = Math.max(0, Math.min(30, (now - (Number.isFinite(player.jumpPhysicsAt) ? player.jumpPhysicsAt : now)) / 1000));
    player.jumpPhysicsAt = now;
    while (elapsed > 0 && room.status === 'racing' && player.alive && !player.finishedAt) {
      const dt = Math.min(STEP_SECONDS, elapsed);
      simulateStep(room, player, dt, now - Math.round((elapsed - dt) * 1000));
      elapsed -= dt;
    }
  }
  const racersDone = Object.values(room.players).length > 0 && Object.values(room.players).every(p => !p.alive || !!p.finishedAt);
  if (racersDone) room.status = 'finished';
  room.lastTickAt = now;
  return room;
}
function updateProgress(room, playerId, _clientDistance, now = Date.now()) {
  if (!room || room.status !== 'racing') throw new Error('Aktif yarış bulunamadı.');
  const player = room.players[playerId];
  if (!player || !player.connected) throw new Error('Bu oyuncu yarış odasında bağlı değil.');
  if (Number.isFinite(player.lastProgressAt) && now - player.lastProgressAt < 80) throw new Error('Durum güncellemesi çok sık gönderiliyor.');
  advanceRoom(room, now);
  player.lastProgressAt = now;
  return room;
}
function advanceJumpPhysics(player, now = Date.now()) {
  const previous = Number.isFinite(player.jumpPhysicsAt) ? player.jumpPhysicsAt : now;
  let remaining = Math.max(0, Math.min(5, (now - previous) / 1000));
  player.jumpPhysicsAt = now;
  const floor = Number.isFinite(player.groundHeight) ? player.groundHeight : 0;
  while (remaining > 0 && (player.jumpHeight > floor || player.jumpVelocity !== 0)) {
    const dt = Math.min(STEP_SECONDS, remaining);
    player.jumpVelocity += GRAVITY * dt;
    player.jumpHeight = Math.max(floor, player.jumpHeight - player.jumpVelocity * dt);
    remaining -= dt;
    if (player.jumpHeight <= floor && player.jumpVelocity >= 0) {
      player.jumpHeight = floor; player.jumpVelocity = 0; player.jumpCount = 0; break;
    }
  }
  return player;
}
function registerJump(room, playerId, now = Date.now()) {
  if (!room || room.status !== 'racing') throw new Error('Aktif yarış bulunamadı.');
  advanceRoom(room, now);
  if (room.status !== 'racing') throw new Error('Aktif yarış bulunamadı.');
  const player = room.players[playerId];
  if (!player || !player.connected) throw new Error('Bu oyuncu yarış odasında bağlı değil.');
  if (player.finishedAt) throw new Error('Yarışı bitiren oyuncu zıplayamaz.');
  if (!player.alive || player.falling) throw new Error('Düşüşte olan oyuncu zıplayamaz.');
  if (player.lastJumpAt !== null && now - player.lastJumpAt < 180) throw new Error('Çok hızlı zıplama isteği.');
  if ((player.jumpCount || 0) >= 2) throw new Error('Havada en fazla iki kez zıplayabilirsin.');
  player.lastJumpAt = now;
  player.jumpCount = (player.jumpCount || 0) + 1;
  player.jumpVelocity = JUMP_VELOCITIES[player.jumpCount - 1];
  player.jumpPhysicsAt = now;
  return { accepted: true, jumpCount: player.jumpCount, jumpHeight: player.jumpHeight, at: now };
}
function publicRoom(room, { includeTrack = false, now = Date.now() } = {}) {
  advanceRoom(room, now);
  const out = { code: room.code, status: room.status, hostId: room.hostId, startedAt: room.startedAt,
    winnerId: room.winnerId, trackSeed: room.trackSeed,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, connected: p.connected, distance: Math.floor(p.distance || 0), finished: !!p.finishedAt,
      alive: !!p.alive, falling: !!p.falling, fallen: !p.alive && !p.finishedAt,
      jumpHeight: Math.round(p.jumpHeight || 0), jumpCount: p.jumpCount || 0,
      airborne: Math.abs(p.jumpVelocity || 0) > 0.5 || (p.jumpHeight || 0) > (p.groundHeight || 0) + 0.5,
      speed: Math.round(p.speed || SERVER_RACE_SPEED), boost: Number((p.boostRemaining || 0).toFixed(2)),
      slow: Number((p.slowRemaining || 0).toFixed(2))
    })) };
  if (includeTrack && room.track) out.track = room.track.map(e => ({ ...e }));
  return out;
}
function disconnectPlayer(room, playerId) {
  if (!room || !room.players[playerId]) return room;
  if (room.status === 'lobby') {
    delete room.players[playerId];
    const remaining = Object.values(room.players).filter(p => p.connected);
    if (!remaining.length) return null;
    if (room.hostId === playerId) room.hostId = remaining[0].id;
    return room;
  }
  room.players[playerId].connected = false;
  const remaining = Object.values(room.players).filter(p => p.connected);
  if (!remaining.length) return ['racing', 'finished'].includes(room.status) ? room : null;
  if (room.hostId === playerId) room.hostId = remaining[0].id;
  advanceRoom(room);
  return room;
}
function resumePlayer(room, newPlayerId, resumeToken, now = Date.now()) {
  if (!room || !resumeToken || !['racing', 'finished'].includes(room.status)) return null;
  const entry = Object.entries(room.players).find(([, p]) => p.resumeToken && p.resumeToken === resumeToken && !p.connected);
  if (!entry) return null;
  const [oldId, player] = entry;
  if (oldId === newPlayerId) return null;
  if (player.resumeTimer) clearTimeout(player.resumeTimer);
  delete room.players[oldId];
  player.id = newPlayerId;
  player.connected = true;
  player.lastProgressAt = now;
  player.jumpPhysicsAt = now;
  room.players[newPlayerId] = player;
  if (room.originalHostId === oldId || room.hostId === oldId || !room.players[room.hostId]) room.hostId = newPlayerId;
  if (!Object.values(room.players).some(p => p.alive && !p.finishedAt) && room.status === 'racing') room.status = 'finished';
  return { player, oldId };
}
module.exports = { CODE_RE, MAX_PLAYERS, MAX_PROGRESS_SPEED, PROGRESS_GRACE_DISTANCE, SERVER_RACE_SPEED, RACE_DISTANCE, cleanName, createRng, generateTrack, createRoom, joinRoom, startRace, updateProgress, registerJump, advanceJumpPhysics, advanceRoom, publicRoom, disconnectPlayer, resumePlayer };
