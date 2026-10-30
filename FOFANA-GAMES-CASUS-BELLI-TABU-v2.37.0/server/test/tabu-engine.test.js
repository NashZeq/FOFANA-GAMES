'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../tabu-engine');
test('Tabu odası oyuncuları iki takıma dağıtır ve hazır durumunu doğrular',()=>{
 const r=E.createRoom({code:'ABC234',hostId:'p1',name:'Ada'});
 E.joinRoom(r,{playerId:'p2',name:'Deniz'});
 assert.equal(r.players.p1.team,'A');assert.equal(r.players.p2.team,'B');
 E.setReady(r,'p1',true);E.setReady(r,'p2',true);assert.equal(r.status,'lobby');
 assert.equal(E.publicRoom(r,'p1').canStart,true);
});
test('anlatıcı turu başlatır; doğru, tabu ve pas işlemleri sunucuda işlenir',()=>{
 const r=E.createRoom({code:'ABC234',hostId:'p1',name:'Ada'});
 E.joinRoom(r,{playerId:'p2',name:'Deniz'});
 E.setReady(r,'p1',true);E.setReady(r,'p2',true);
 E.startGame(r,'p1',{turnSeconds:45,passLimit:2,targetScore:10});
 assert.ok(r.game.describerId);
 E.startTurn(r,r.game.describerId);
 assert.equal(r.game.turnPhase,'active');
 assert.ok(E.publicRoom(r,r.game.describerId).game.card);
 E.applyAction(r,r.game.describerId,'correct');
 assert.equal(r.game.scores.A,1);
 E.applyAction(r,r.game.describerId,'pass');
 assert.equal(r.game.passesLeft,1);
});
test('maç bitince yalnızca oda sahibi lobiyi sıfırlayabilir',()=>{
 const r=E.createRoom({code:'ABC234',hostId:'p1',name:'Ada'});
 E.joinRoom(r,{playerId:'p2',name:'Deniz'});
 E.setReady(r,'p1',true);E.setReady(r,'p2',true);E.startGame(r,'p1',{targetScore:10});
 r.status='finished';r.game.winner='A';r.game.turnPhase='finished';
 E.returnToLobby(r,'p1');assert.equal(r.status,'lobby');assert.equal(r.game,null);
});
