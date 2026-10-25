'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isBlockedServerStaticPath } = require('../static-path-guard');

test('static path guard blocks direct and encoded server source requests', () => {
  for (const url of ['/server/tabu-cards.js', '/server%2ftabu-cards.js', '/%73erver%252ftabu-cards.js', '/foo/../server/tabu-engine.js']) {
    assert.equal(isBlockedServerStaticPath(url), true, `${url} should be blocked`);
  }
});

test('static path guard blocks malformed escapes but permits public game assets', () => {
  assert.equal(isBlockedServerStaticPath('/server/%E0%A4%A'), true);
  for (const url of ['/games/tabu/index.html', '/games/tabu/cards.js', '/assets/site.css', '/health']) {
    assert.equal(isBlockedServerStaticPath(url), false, `${url} should remain reachable`);
  }
});
