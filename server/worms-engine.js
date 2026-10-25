'use strict';
function cleanName(value) { return String(value || '').trim().replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, 18); }
function initialTerrainY(x) { return 350 + Math.sin(x * 0.012) * 28 + Math.sin(x * 0.031) * 12 + Math.cos(x * 0.006) * 18; }
function createRoom(code, id, name) {
  name = cleanName(name); if (!name) throw new Error('Oyuncu adı gerekli.');
  return { code, hostId: id, disconnectedHostId: null, status: 'lobby', players: { [id]: { id, name, slot: 0, connected: true } }, state: null, revision: 0, lastActionAt: {} };
}
function joinRoom(room, id, name) {
  name = cleanName(name); if (!name) throw new Error('Oyuncu adı gerekli.');
  if (room.status !== 'lobby') throw new Error('Maç başlamış; yeni oyuncu alınmıyor.');
  if (Object.keys(room.players).length >= 2) throw new Error('Worms odası dolu. İki oyuncu katılabilir.');
  if (Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor.');
  const player = { id, name, slot: 1, connected: true }; room.players[id] = player;
  if (room.players[room.hostId]?.connected === false) room.hostId = id;
  return player;
}
function startGame(room, id) {
  if (room.hostId !== id) throw new Error('Maçı yalnızca oda sahibi başlatabilir.');
  if (room.status !== 'lobby') throw new Error('Maç zaten başladı.');
  if (Object.keys(room.players).length !== 2) throw new Error('Başlamak için iki oyuncu gerekli.');
  if (Object.values(room.players).some(p => p.connected === false)) throw new Error('İki oyuncu da bağlı olmalı.');
  room.status = 'playing'; room.state = null; room.revision = 0; room.lastActionAt = {}; return room;
}
function validateState(state) {
  if (!state || !Array.isArray(state.terrain) || state.terrain.length !== 97 || !Array.isArray(state.players) || state.players.length !== 2) throw new Error('Geçersiz Worms oyun durumu.');
  if (!state.terrain.every((p, i) => p && typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y) && p.x === i * 10 && p.y >= 0 && p.y <= 500)) throw new Error('Arazi verisi geçersiz.');
  if (!state.players.every(p => p && typeof p.x === 'number' && Number.isFinite(p.x) && p.x >= 0 && p.x <= 960 && typeof p.y === 'number' && Number.isFinite(p.y) && p.y >= 0 && p.y <= 500 && typeof p.hp === 'number' && Number.isFinite(p.hp) && p.hp >= 0 && p.hp <= 100)) throw new Error('Oyuncu verisi geçersiz.');
  if (typeof state.active !== 'number' || ![0, 1].includes(state.active) || typeof state.wind !== 'number' || !Number.isInteger(state.wind) || Math.abs(state.wind) > 6) throw new Error('Tur veya rüzgâr verisi geçersiz.');
  if (state.winner != null && ![0, 1, 'draw'].includes(state.winner)) throw new Error('Kazanan bilgisi geçersiz.');
  const moveRemaining = state.moveRemaining == null ? 60 : state.moveRemaining;
  if (typeof moveRemaining !== 'number' || !Number.isInteger(moveRemaining) || moveRemaining < 0 || moveRemaining > 60) throw new Error('Hareket mesafesi geçersiz.');
  return { terrain: state.terrain.map(p => ({ x: p.x, y: p.y })), players: state.players.map(p => ({ x: p.x, y: p.y, hp: p.hp, color: p.color === '#ff7a86' ? '#ff7a86' : '#72e3ad', name: cleanName(p.name) || 'Oyuncu' })), active: state.active, wind: state.wind, moveRemaining, ended: !!state.ended, winner: state.winner == null ? null : state.winner };
}
// Clients may submit only the initial board generated when the host starts a match.
// All subsequent terrain, damage, and turn changes are calculated by this engine.
function syncState(room, id, state) {
  if (room.status !== 'playing') throw new Error('Worms maçı aktif değil.');
  if (!room.players[id]) throw new Error('Bu odada oyuncu değilsin.');
  if (room.state) throw new Error('Oyun durumu sunucu tarafından yönetiliyor.');
  if (room.hostId !== id || room.players[id].slot !== 0) throw new Error('İlk oyun durumunu yalnızca oda sahibi gönderebilir.');
  const clean = validateState(state);
  if (clean.active !== 0 || clean.ended || clean.winner !== null) throw new Error('Başlangıç durumu geçersiz.');
  // The host may initialize geometry, but cannot choose either player's movement budget.
  clean.moveRemaining = 60;
  if (!clean.terrain.every(p => Math.abs(p.y - initialTerrainY(p.x)) <= 0.02)) throw new Error('Başlangıç arazisi sunucu tarafından beklenen harita değil.');
  if (clean.players[0].x !== 95 || clean.players[1].x !== 855 || clean.players.some(p => p.hp !== 100)) throw new Error('Başlangıç oyuncu konumları veya can değerleri değiştirilemez.');
  if (clean.players.some(p => Math.abs(p.y - (surfaceAt(clean.terrain, p.x) - 15)) > 1)) throw new Error('Başlangıç oyuncuları arazinin üstünde başlamalı.');
  // Names and positions are anchored to the room's assigned players, not client-provided identities.
  clean.players[0].name = room.players[Object.keys(room.players).find(pid => room.players[pid].slot === 0)].name;
  clean.players[1].name = room.players[Object.keys(room.players).find(pid => room.players[pid].slot === 1)].name;
  room.state = clean; room.revision += 1; return { revision: room.revision, state: room.state };
}
function surfaceAt(terrain, x) {
  x = Math.max(0, Math.min(960, x)); const i = Math.min(95, Math.floor(x / 10)); const t = (x - i * 10) / 10;
  return terrain[i].y * (1 - t) + terrain[i + 1].y * t;
}
function nextTurn(state) {
  if (state.players.some(p => p.hp <= 0)) {
    state.ended = true;
    state.winner = state.players[0].hp <= 0 && state.players[1].hp <= 0 ? 'draw' : (state.players[0].hp <= 0 ? 1 : 0);
    return;
  }
  state.ended = false; state.winner = null;
  state.active = 1 - state.active;
  state.moveRemaining = 60;
  // Deterministic wind rotation avoids trusting client-provided randomness.
  state.wind = ((state.wind + 10) % 13) - 6;
}
function passTurn(room, id) {
  assertTurn(room, id);
  const now = Date.now();
  if (room.lastActionAt[id] && now - room.lastActionAt[id] < 250) throw new Error('Çok hızlı işlem gönderildi.');
  nextTurn(room.state); room.lastActionAt[id] = now; room.revision += 1;
  return { revision: room.revision, state: room.state, action: 'pass' };
}
function assertTurn(room, id) {
  if (room.status === 'paused') throw new Error('Rakibin bağlantısı bekleniyor; maç duraklatıldı.');
  if (room.status !== 'playing' || !room.state) throw new Error('Worms maçı henüz hazır değil.');
  const player = room.players[id]; if (!player || player.connected === false) throw new Error('Bu odada bağlı bir oyuncu değilsin.');
  if (room.state.ended) throw new Error('Maç zaten bitti.');
  if (player.slot !== room.state.active) throw new Error('Sıra sende değil.');
}
function movePlayer(room, id, request = {}) {
  assertTurn(room, id);
  const now = Date.now();
  if (room.lastActionAt[id] && now - room.lastActionAt[id] < 250) throw new Error('Çok hızlı işlem gönderildi.');
  const direction = request && request.direction, distance = request && request.distance;
  if (![-1, 1].includes(direction) || typeof direction !== 'number' || !Number.isInteger(distance) || distance < 5 || distance > 30) throw new Error('Hareket yönü veya mesafesi geçersiz.');
  const state = room.state;
  const remaining = state.moveRemaining == null ? 60 : state.moveRemaining;
  if (distance > remaining) throw new Error(`Bu turda yalnızca ${remaining} birim hareket hakkın kaldı.`);
  const player = state.players[state.active], opponent = state.players[1 - state.active];
  const nextX = player.x + direction * distance;
  if (nextX < 20 || nextX > 940) throw new Error('Arazi sınırının dışına hareket edemezsin.');
  if (Math.abs(nextX - opponent.x) < 38) throw new Error('Rakibe bu kadar yaklaşamazsın.');
  player.x = nextX;
  player.y = surfaceAt(state.terrain, player.x) - 15;
  state.moveRemaining = remaining - distance;
  room.lastActionAt[id] = now; room.revision += 1;
  return { revision: room.revision, state, action: 'move', result: { name: player.name, slot: state.active, direction, distance, moveRemaining: state.moveRemaining, x: player.x } };
}
function fireShot(room, id, shot) {
  assertTurn(room, id);
  const now = Date.now(); if (room.lastActionAt[id] && now - room.lastActionAt[id] < 250) throw new Error('Çok hızlı işlem gönderildi.');
  const angle = shot && shot.angle, power = shot && shot.power, weapon = shot && shot.weapon == null ? 'normal' : shot && shot.weapon;
  if (typeof angle !== 'number' || !Number.isFinite(angle) || angle < 10 || angle > 80 || typeof power !== 'number' || !Number.isFinite(power) || power < 25 || power > 100 || typeof weapon !== 'string' || !['normal', 'heavy', 'dig', 'cluster'].includes(weapon)) throw new Error('Atış ayarları geçersiz.');
  const state = room.state, shooter = state.players[state.active], target = state.players[1 - state.active];
  const rad = angle * Math.PI / 180, dir = state.active === 0 ? 1 : -1, speed = power * 0.105;
  let x = shooter.x + dir * Math.cos(rad) * 20, y = shooter.y - 7 - Math.sin(rad) * 20;
  let vx = dir * Math.cos(rad) * speed, vy = -Math.sin(rad) * speed, impact = null, directHit = false;
  for (let step = 0; step < 1200; step++) {
    vy += 0.12; vx += state.wind * 0.003; x += vx; y += vy;
    directHit = Math.hypot(target.x - x, target.y - y) < 18;
    const hit = x < 0 || x > 960 || y > surfaceAt(state.terrain, x) || y > 500;
    if (directHit) { impact = { x: target.x, y: target.y }; break; }
    if (hit) { impact = { x: Math.max(0, Math.min(960, x)), y: Math.min(500, y) }; break; }
  }
  if (!impact) impact = { x: Math.max(0, Math.min(960, x)), y: Math.min(500, y) };
  const isCluster = weapon === 'cluster';
  const radius = weapon === 'dig' ? 62 : (weapon === 'heavy' ? 46 : (isCluster ? 23 : 34));
  const damage = weapon === 'dig' ? 18 : (weapon === 'heavy' ? 45 : (isCluster ? 24 : 32));
  const depthMax = weapon === 'dig' ? 40 : (weapon === 'heavy' ? 31 : (isCluster ? 15 : 24));
  const impacts = isCluster ? [-26, 0, 26].map(offset => ({ x: Math.max(0, Math.min(960, impact.x + offset)), y: impact.y })) : [impact];
  const damageTotals = new Map();
  for (const blast of impacts) {
    for (const p of state.players) {
      const dist = Math.hypot(p.x - blast.x, p.y - blast.y);
      if (dist < radius + 22) {
        let amount = Math.round(damage * (1 - dist / (radius + 22)));
        if (dist < 12) amount += 8;
        amount = Math.min(p.hp, amount); p.hp = Math.max(0, p.hp - amount);
        if (amount > 0) damageTotals.set(p.name, (damageTotals.get(p.name) || 0) + amount);
      }
    }
    const first = Math.max(0, Math.floor((blast.x - radius) / 10)), last = Math.min(96, Math.ceil((blast.x + radius) / 10));
    for (let i = first; i <= last; i++) {
      const dx = state.terrain[i].x - blast.x; if (Math.abs(dx) > radius) continue;
      const profile = (1 + Math.cos(Math.PI * dx / radius)) / 2;
      state.terrain[i].y = Math.min(468, state.terrain[i].y + profile * depthMax);
    }
  }
  state.players.forEach(p => { p.y = surfaceAt(state.terrain, p.x) - 15; });
  const damages = [...damageTotals.entries()].map(([name, amount]) => ({ name, amount, hp: state.players.find(p => p.name === name)?.hp ?? 0 }));
  const result = { impact, impacts, directHit, weapon, radius, damages };
  nextTurn(state); room.lastActionAt[id] = now; room.revision += 1;
  return { revision: room.revision, state, action: 'fire', result };
}
function removePlayer(room, id) {
  const leaving = room.players[id];
  if (leaving?.resumeTimer) clearTimeout(leaving.resumeTimer);
  delete room.players[id];
  if (room.lastActionAt) delete room.lastActionAt[id];
  if (room.disconnectedHostId === id) room.disconnectedHostId = null;
  const remaining = Object.values(room.players);
  if (!remaining.length) return false;
  // If a grace period expires, the interrupted match returns to a clean lobby.
  room.status = 'lobby'; room.state = null; room.revision = 0; room.lastActionAt = {};
  if (remaining.length === 1) remaining[0].slot = 0;
  if (!room.players[room.hostId] || room.players[room.hostId].connected === false) {
    room.hostId = (remaining.find(p => p.connected !== false) || remaining[0]).id;
  }
  return true;
}
function resetGame(room, id) {
  if (!room.players[id] || room.players[id].connected === false) throw new Error('Bu odada bağlı bir oyuncu değilsin.');
  if (room.hostId !== id) throw new Error('Yeni maçı yalnızca oda sahibi başlatabilir.');
  if (room.status !== 'playing' || !room.state?.ended) throw new Error('Yeni maç yalnızca maç bittikten sonra başlatılabilir.');
  room.status = 'lobby'; room.state = null; room.revision = 0; room.lastActionAt = {};
  return publicRoom(room);
}
function publicRoom(room) { return { code: room.code, hostId: room.hostId, status: room.status, revision: room.revision, players: Object.values(room.players).map(({ id, name, slot, connected }) => ({ id, name, slot, connected: connected !== false })), state: room.state }; }
module.exports = { cleanName, createRoom, joinRoom, startGame, validateState, syncState, passTurn, movePlayer, fireShot, removePlayer, resetGame, publicRoom, surfaceAt, initialTerrainY };
