'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const ui=fs.readFileSync(path.join(root,'games/tabu/index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server/index.js'),'utf8');
const online=fs.readFileSync(path.join(root,'server/tabu-online.js'),'utf8');
test('Tabu arayüzü Socket.IO üzerinden tek ortak lobiye katılır',()=>{
 assert.match(ui,/socket\.io\/socket\.io\.js/);
 assert.match(ui,/tabu:enter/);assert.doesNotMatch(ui,/tabu:create|tabu:join/);
 assert.match(ui,/tabu:state/);assert.match(ui,/tabu:action/);
 assert.doesNotMatch(ui,/Eren|Osman|Oğuzhan|Serhat/);
});
test('Tabu sunucusu ana Socket.IO sunucusuna bağlanır',()=>{
 assert.match(server,/attachTabu\(io\)/);
 assert.match(online,/tabu:start-turn/);
 assert.match(online,/tabu:back-to-lobby/);
});
