'use strict';
const CARDS = require('./tabu-cards');
const cleanTeamName = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function makeTabuGame(players, options = {}, rng = Math.random) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 12) throw new Error('Tabu için 2 ile 12 oyuncu gerekli.');
  if (players.some(p => !p || typeof p.id !== 'string' || !p.id.trim() || ![0, 1].includes(p.team))) throw new Error('Her oyuncunun geçerli kimliği ve 0 veya 1 takım numarası olmalı.');
  const ids = players.map(p => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('Oyuncu kimlikleri benzersiz olmalı.');
  if (!players.some(p => p.team === 0) || !players.some(p => p.team === 1)) throw new Error('İki takımda da en az bir oyuncu olmalı.');
  const raw = Number(options.duration);
  const duration = clamp(Number.isFinite(raw) && raw ? raw : 60, 15, 180);
  const requestedTarget = Number(options.targetScore);
  const targetScore = [10, 15, 20, 30].includes(requestedTarget) ? requestedTarget : 15;
  return { phase: 'ready', teams: [cleanTeamName(options.teamA) || 'Takım A', cleanTeamName(options.teamB) || 'Takım B'], score: [0,0], team: 0, duration, targetScore, timeLeft: duration, active: false, paused: false, used: [], cardIndex: -1, round: 0, lastAction: null, winner: null };
}
function nextCard(game, rng = Math.random) {
  if (game.used.length >= CARDS.length) game.used = [];
  const available = CARDS.map((_, i) => i).filter(i => !game.used.includes(i));
  const index = available[Math.floor(rng() * available.length)];
  game.used.push(index); game.cardIndex = index;
  return CARDS[index];
}
function startTurn(game, actorTeam, rng = Math.random) {
  if (game.phase !== 'ready' || game.active || game.paused) throw new Error('Tur şu anda başlatılamıyor.');
  if (actorTeam !== game.team) throw new Error('Sıra diğer takımda.');
  nextCard(game, rng); game.timeLeft = game.duration; game.active = true; game.paused = false; game.phase = 'playing'; game.round += 1;
  return publicTabuGame(game);
}
function action(game, actorTeam, kind, rng = Math.random) {
  if (!game.active || game.phase !== 'playing') throw new Error('Aktif tur yok.');
  if (actorTeam !== game.team) throw new Error('Yalnızca sırası gelen takım işlem yapabilir.');
  const scoringTeam = game.team;
  if (kind === 'correct') game.score[scoringTeam] += 1;
  else if (kind === 'taboo') game.score[scoringTeam] = Math.max(0, game.score[scoringTeam] - 1);
  else if (kind !== 'skip') throw new Error('Geçersiz Tabu işlemi.');
  game.lastAction = { kind, team: scoringTeam };
  if (game.score[scoringTeam] >= game.targetScore) {
    game.phase = 'finished'; game.active = false; game.paused = false; game.winner = scoringTeam;
    return publicTabuGame(game);
  }
  nextCard(game, rng);
  return publicTabuGame(game);
}
function pauseTurn(game, actorTeam) {
  if (!game.active || actorTeam !== game.team) throw new Error('Yalnızca turdaki takım duraklatabilir.');
  game.active = false; game.paused = true; game.phase = 'paused'; return publicTabuGame(game);
}
function resumeTurn(game, actorTeam) {
  if (!game.paused || actorTeam !== game.team) throw new Error('Devam ettirilecek tur yok.');
  game.paused = false; game.active = true; game.phase = 'playing'; return publicTabuGame(game);
}
function tick(game) {
  if (!game.active) return false;
  game.timeLeft = Math.max(0, game.timeLeft - 1);
  if (game.timeLeft === 0) endTurn(game);
  return true;
}
function endTurn(game) {
  game.active = false; game.paused = false; game.phase = 'ready'; game.lastAction = { kind: 'end-turn', team: game.team };
  game.team = 1 - game.team; game.timeLeft = game.duration;
  return publicTabuGame(game);
}
function resetGame(game) {
  game.score = [0,0]; game.team = 0; game.timeLeft = game.duration; game.active = false; game.paused = false; game.phase = 'ready'; game.used = []; game.cardIndex = -1; game.round = 0; game.lastAction = null; game.winner = null;
  return publicTabuGame(game);
}
function publicTabuGame(game) {
  return { phase: game.phase, teams: [...game.teams], score: [...game.score], team: game.team, duration: game.duration, targetScore: game.targetScore, timeLeft: game.timeLeft, active: game.active, paused: game.paused, card: game.cardIndex >= 0 ? { word: CARDS[game.cardIndex][0], forbidden: [...CARDS[game.cardIndex][1]] } : null, round: game.round, lastAction: game.lastAction, winner: Number.isInteger(game.winner) ? game.winner : null };
}
module.exports = { CARDS, cleanTeamName, makeTabuGame, startTurn, action, pauseTurn, resumeTurn, tick, endTurn, resetGame, publicTabuGame };
