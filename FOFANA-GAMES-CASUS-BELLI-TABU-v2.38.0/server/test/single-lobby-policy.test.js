'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const tabuServer=fs.readFileSync(path.join(root,'server/tabu-online.js'),'utf8');
const tabuUi=fs.readFileSync(path.join(root,'games/tabu/index.html'),'utf8');
const cbServer=fs.readFileSync(path.join(root,'server/index.js'),'utf8');
const cbUi=fs.readFileSync(path.join(root,'games/casus-belli/index.html'),'utf8');
const cbClient=fs.readFileSync(path.join(root,'games/casus-belli/casus-belli-online.js'),'utf8');
test('Tabu tek ortak lobiye doğrudan giriş kullanır, oda oluşturma/kodu yoktur',()=>{
 assert.match(tabuServer,/SHARED_LOBBY_CODE = 'TABU01'/);
 assert.match(tabuServer,/tabu:enter/);
 assert.doesNotMatch(tabuServer,/tabu:create|tabu:join/);
 assert.match(tabuUi,/tabu:enter/);
 assert.doesNotMatch(tabuUi,/tabu:create|tabu:join|joinRoomCode|createRoomBtn/);
});
test('Casus Belli tek ortak lobiye sahiptir',()=>{
 assert.match(cbServer,/ROOM_CODES = \['CASUS01'\]/);
 assert.equal((cbUi.match(/data-game-room=/g)||[]).length,1);
 assert.match(cbClient,/casus-belli:room-join/);
});
