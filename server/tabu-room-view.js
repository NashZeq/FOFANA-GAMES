'use strict';

/** Create a recipient-specific Tabu room snapshot. Only the current explainer
 * receives the target card; every other participant gets the same public state
 * with its answer hidden. */
function serializeTabuRoom(room, viewerId, publicTabuGame) {
  const game = room.game ? publicTabuGame(room.game) : null;
  if (game) {
    game.speakerId = room.game.speakerId || null;
    // Never publish target words through action history, even to the speaker.
    if (game.lastAction) game.lastAction = { kind: game.lastAction.kind, team: game.lastAction.team };
    if (!game.speakerId || game.speakerId !== viewerId) game.card = null;
  }
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, team: p.team, connected: p.connected !== false })),
    game
  };
}

/** Honour an explicit team choice; otherwise assign the joining player to the
 * smaller team (ties go to Team A). */
function chooseTabuTeam(players, requestedTeam) {
  if (requestedTeam === 0 || requestedTeam === '0') return 0;
  if (requestedTeam === 1 || requestedTeam === '1') return 1;
  const teamA = players.filter(player => player.team === 0).length;
  const teamB = players.filter(player => player.team === 1).length;
  return teamA <= teamB ? 0 : 1;
}

module.exports = { serializeTabuRoom, chooseTabuTeam };
