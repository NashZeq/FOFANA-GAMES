'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { saveMonopolyRooms } = require('../monopoly-persistence');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

test('server startup restores Monopoly rooms and marks old socket IDs disconnected', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fofana-monopoly-startup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const moduleRoot = path.join(dir, 'node_modules');
  fs.mkdirSync(path.join(moduleRoot, 'express'), { recursive: true });
  fs.mkdirSync(path.join(moduleRoot, 'socket.io'), { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'express', 'index.js'), `
    function express(){const app=function(){};app.disable=()=>app;app.get=()=>app;app.use=()=>app;return app;}
    express.static=()=>function(){};module.exports=express;
  `);
  fs.writeFileSync(path.join(moduleRoot, 'socket.io', 'index.js'), `
    class Server{constructor(){this.handlers={};}on(k,v){this.handlers[k]=v;return this;}to(){return{emit(){}};}of(){return{sockets:{get(){return null;}}};}}
    module.exports={Server};
  `);

  const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64);
  const room = {
    code: 'ABC234', revision: 6, hostId: 'old-host', disconnectedHostId: null, status: 'playing',
    players: {
      'old-host': { id: 'old-host', name: 'Ada', connected: true, resumeToken: tokenA },
      'old-guest': { id: 'old-guest', name: 'Linus', connected: true, resumeToken: tokenB }
    },
    game: {
      phase: 'playing', players: [{ id: 'old-host', cash: 1500 }, { id: 'old-guest', cash: 1200 }],
      pendingDebt: { debtorId: 'old-guest', amount: 80 }, pendingAuction: null, pendingTrade: null
    }
  };
  const storePath = path.join(dir, 'rooms.json');
  saveMonopolyRooms(storePath, new Map([[room.code, room]]));

  const script = `
    const assert=require('node:assert/strict');
    const app=require('./server/index');
    const r=app.monopolyRooms.get('ABC234');
    assert.ok(r);
    assert.equal(r.status,'paused');
    assert.equal(r.players['old-host'].connected,false);
    assert.equal(r.players['old-guest'].connected,false);
    assert.equal(r.players['old-host'].resumeToken,'${tokenA}');
    assert.equal(r.game.pendingDebt.amount,80);
    console.log('RESTORE_OK');
  `;
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      FOFANA_MONOPOLY_STORE_PATH: storePath,
      NODE_PATH: moduleRoot
    }
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.match(child.stdout, /RESTORE_OK/);
  assert.match(child.stdout, /1 oda geri yüklendi/);
});
