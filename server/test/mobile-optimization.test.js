'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const html = (name) => fs.readFileSync(path.join(root, 'games', name, 'index.html'), 'utf8');

test('all eight game pages load shared touch-first mobile optimization', () => {
  const games = ['casus-belli', 'go-kart', 'imposter', 'iskembeden-sallama', 'monopoly', 'sky-sprint', 'tabu', 'worms'];
  for (const game of games) assert.match(html(game), /\.\.\/\.\.\/css\/mobile-games\.css/, `${game} must load mobile styles`);
  const css = fs.readFileSync(path.join(root, 'css', 'mobile-games.css'), 'utf8');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /font-size:\s*max\(16px,\s*1em\)/);
  assert.match(css, /safe-area-inset-bottom/);
});

test('Tabu provides room-code and invite-link cross-phone flow', () => {
  const page = html('tabu');
  assert.match(page, /tabuOnlineCreate/);
  assert.match(page, /tabuOnlineJoin/);
  assert.match(page, /tabuOnlineShare/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /tabuOnlineCodeInput/);
  assert.match(page, /aynı Wi-Fi ağında olmanız gerekmez/);
});

test('Go-Kart client exposes race lap progress and the server rule is three laps', () => {
  const page = html('go-kart');
  const engine = require('../gokart-engine');
  assert.equal(engine.LAPS_TO_WIN, 3);
  assert.match(page, /TUR \$\{Math\.min\(3,localLap\+1\)\}\/3/);
  assert.match(page, /\[92,-110,0\]/, 'track must include the added chicane barriers');
  assert.equal(engine.insideTrack(92, -110), false);
});

test('Worms exposes forward/back movement and a multi-impact weapon on the mobile page', () => {
  const page = html('worms');
  const engine = require('../worms-engine');
  assert.match(page, /id="moveBack"/);
  assert.match(page, /id="moveForward"/);
  assert.match(page, /value="cluster"/);
  assert.equal(typeof engine.movePlayer, 'function');
});

test('Monopoly frontend and engine keep the property when purchase is declined without auction', () => {
  const page = html('monopoly');
  const engine = require('../monopoly-engine');
  const game = engine.createGame([{ id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bora' }]);
  game.pendingBuy = 1; game.rolled = true;
  const state = engine.buyProperty(game, 'p1', false);
  assert.equal(state.pendingAuction, null);
  assert.equal(state.players.some(player => player.properties.includes(1)), false);
  assert.throws(() => engine.bidAuction(game, 'p1', 10), /açık artırma kaldırıldı/);
  assert.match(page, /mülk bankada kalacak/);
});

test('celebrity photo attribution is included with the game', () => {
  const page = html('iskembeden-sallama');
  const credits = fs.readFileSync(path.join(root, 'games', 'iskembeden-sallama', 'PHOTO-CREDITS.md'), 'utf8');
  assert.match(page, /onlineCelebrityPhoto/);
  assert.match(page, /celebrityPhoto/);
  for (const celebrity of ['Tarkan', 'Acun Ilıcalı', 'Hande Erçel', 'Cem Yılmaz', 'Kenan İmirzalıoğlu']) assert.ok(credits.includes(celebrity));
});
