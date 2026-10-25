'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '../../games/sky-sprint/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(match, 'Sky Sprint must include its single inline script');
const source = match[1];

function makeHarness({ fixedRandom = 0.5, storageThrows = false } = {}) {
  const callbacks = new Map();
  const windowEvents = new Map();
  const documentEvents = new Map();
  const storage = new Map();
  let nextRaf = 1;
  let now = 0;
  let preventCount = 0;
  let currentTx = 0, currentTy = 0;
  let botJumpSeen = false;
  const transformStack = [];

  const ctx = {
    greenRects: [],
    setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {},
    moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, save() { transformStack.push([currentTx, currentTy]); }, translate(x, y) { currentTx += x; currentTy += y; },
    rotate() {}, restore() { const pos = transformStack.pop(); if (pos) [currentTx, currentTy] = pos; }, ellipse() {}, roundRect(x, y, w, h) { const color=this.fillStyle, gx=currentTx+x, gy=currentTy+y; if (color === '#53f3a1') this.greenRects.push({ x: gx, y: gy, w, h }); if ((color === '#ff596b' || color === '#56a8ff') && w === 29 && h === 34 && gy < 382) botJumpSeen = true; }, fillText() {}, strokeRect() {},
    createLinearGradient() { return { addColorStop() {} }; }
  };

  class FakeElement {
    constructor(id) {
      this.id = id; this.hidden = false; this.disabled = false; this.textContent = '';
      this.style = {}; this.listeners = new Map(); this.parentElement = {};
    }
    addEventListener(name, callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(callback);
    }
    dispatch(name, event = {}) {
      for (const fn of this.listeners.get(name) || []) fn({ preventDefault() { preventCount++; }, repeat: false, ...event });
    }
    getBoundingClientRect() { return { width: 960, height: 540 }; }
    getContext() { return ctx; }
  }

  const ids = ['game','distance','speed','position','startOverlay','pauseOverlay','finishOverlay',
    'pauseBtn','bestRecord','startBtn','resumeBtn','restartBtn','jumpBtn','finishTitle','finishText','onlineStatus','onlinePlayers','createRoomBtn','joinRoomBtn','startOnlineBtn','copyRoomBtn','leaveRoomBtn','onlineName','roomCodeInput'];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
  elements.startOverlay.hidden = false;
  elements.finishOverlay.hidden = true;
  elements.pauseOverlay.hidden = true;
  elements.pauseBtn.disabled = true; elements.startOnlineBtn.disabled = true; elements.copyRoomBtn.disabled = true; elements.leaveRoomBtn.hidden = true; elements.onlineName.value='Test'; elements.roomCodeInput.value='';
  elements.game.parentElement = {};

  const document = {
    hidden: false,
    getElementById(id) { assert.ok(elements[id], `Missing element #${id}`); return elements[id]; },
    addEventListener(name, callback) {
      if (!documentEvents.has(name)) documentEvents.set(name, []);
      documentEvents.get(name).push(callback);
    },
    dispatch(name, event = {}) {
      for (const fn of documentEvents.get(name) || []) fn(event);
    }
  };
  const fakeWindow = {
    devicePixelRatio: 1,
    addEventListener(name, callback) {
      if (!windowEvents.has(name)) windowEvents.set(name, []);
      windowEvents.get(name).push(callback);
    },
    localStorage: {
      getItem(key) { if (storageThrows) throw new Error('storage blocked'); return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { if (storageThrows) throw new Error('storage blocked'); storage.set(key, String(value)); }
    }
  };
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => fixedRandom;
  const sandbox = {
    document, window: fakeWindow, Math: deterministicMath,
    performance: { now: () => now },
    requestAnimationFrame(callback) { const id = nextRaf++; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    console, Set, Number, String, Object, Array, Date,
  };
  vm.runInNewContext(source, sandbox, { filename: 'sky-sprint-inline.js', timeout: 1000 });

  return {
    elements, storage, get now() { return now; }, get preventCount() { return preventCount; }, get botJumpSeen() { return botJumpSeen; },
    click(id) { elements[id].dispatch('click'); },
    key(code) { for (const fn of windowEvents.get('keydown') || []) fn({ code, repeat: false, preventDefault() { preventCount++; } }); },
    visibility(hidden) { document.hidden = hidden; document.dispatch('visibilitychange'); },
    frame(ms = 16) {
      ctx.greenRects = [];
      now += ms;
      const queued = [...callbacks.entries()];
      for (const [id] of queued) callbacks.delete(id);
      for (const [, callback] of queued) callback(now);
    },
    runFrames(count, ms = 16) { for (let i = 0; i < count; i++) this.frame(ms); },
    greenY() { return ctx.greenRects.filter(r => r.x === 210 && r.w === 29).map(r => r.y).at(-1); }
  };
}

test('Sky Sprint is a self-contained inline Canvas game and its script parses', () => {
  assert.match(html, /<canvas id="game"/);
  assert.match(html, /<script>[\s\S]*?<\/script>/);
  assert.match(html, /<script src="\/socket\.io\/socket\.io\.js"><\/script>/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'sky-sprint-inline.js' }));
});

test('desktop double jump works, speed uses km/h conversion, and pause/resume freezes the race', () => {
  const game = makeHarness();
  game.click('startBtn');
  assert.equal(game.elements.startOverlay.hidden, true);
  assert.equal(game.elements.pauseBtn.disabled, false);
  game.frame(16);
  assert.equal(game.elements.speed.textContent, '97 km/sa');
  game.key('Space');
  game.frame(16);
  const firstJumpY = game.greenY();
  assert.ok(firstJumpY < 378, 'first Space press must lift the green racer');
  game.key('Space');
  game.frame(16);
  const secondJumpY = game.greenY();
  assert.ok(secondJumpY < firstJumpY, 'second Space press in the air must trigger the double jump');
  const distanceBeforePause = game.elements.distance.textContent;
  game.click('pauseBtn');
  assert.equal(game.elements.pauseOverlay.hidden, false);
  game.runFrames(20);
  assert.equal(game.elements.distance.textContent, distanceBeforePause, 'world progress must stop while paused');
  game.key('KeyP');
  assert.equal(game.elements.pauseOverlay.hidden, true);
  game.runFrames(4);
  assert.notEqual(game.elements.distance.textContent, distanceBeforePause, 'race must resume after P');
  assert.ok(game.preventCount > 0, 'keyboard controls must prevent page scrolling');
});

test('switching away pauses automatically and a race can reach the results screen with a saved record', () => {
  const game = makeHarness({ fixedRandom: 0.5 });
  game.click('startBtn');
  game.frame(16);
  game.visibility(true);
  assert.equal(game.elements.pauseOverlay.hidden, false);
  game.visibility(false);
  game.click('resumeBtn');
  game.runFrames(1100, 16);
  assert.equal(game.elements.finishOverlay.hidden, false, 'long enough simulation should finish the race');
  assert.match(game.elements.finishTitle.textContent, /Sıralama/);
  assert.match(game.elements.finishText.textContent, /Süre:/);
  assert.equal(game.elements.pauseBtn.disabled, true);
  assert.ok(game.storage.has('fofanaSkySprintBest'), 'player finish should save the local best time in the deterministic boost-only track');
});


test('red and blue bot rivals attempt obstacle jumps', () => {
  const game = makeHarness({ fixedRandom: 0.1 });
  game.click('startBtn');
  game.runFrames(260, 16);
  assert.equal(game.botJumpSeen, true, 'at least one bot must visibly jump over the generated saw obstacles');
});

test('blocked localStorage does not prevent the game from loading or starting', () => {
  const game = makeHarness({ storageThrows: true });
  assert.doesNotThrow(() => game.click('startBtn'));
  game.runFrames(5);
  assert.equal(game.elements.startOverlay.hidden, true);
});


test('Sky Sprint client persists private recovery credentials, retries resume on reconnect, and clears them on explicit leave', () => {
  assert.match(source, /fofanaSkySprintResume/);
  assert.match(source, /sky:resume/);
  assert.match(source, /trySkyResume\(\)/);
  assert.match(source, /clearSkyResume\(\)/);
  assert.match(source, /resumeToken/);
  assert.doesNotMatch(source, /URLSearchParams[^;]*resumeToken/);
});
