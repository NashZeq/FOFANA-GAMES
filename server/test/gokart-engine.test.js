'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../gokart-engine');
const token = c => c.repeat(64);
function room(now=100_000, random=()=>0.1) {
  const r=G.createRoom('ABC234','p1','Ada',{now,random,token:token('a')});
  G.joinRoom(r,'p2','Bora',{token:token('b')});
  return r;
}

test('Go-Kart validates rooms, names, duplicate names and player cap',()=>{
  assert.throws(()=>G.createRoom('BAD','p1','Ada'),/6 harf/);
  assert.throws(()=>G.createRoom('ABC234','p1','   '),/Oyuncu adı/);
  const r=room();
  assert.throws(()=>G.joinRoom(r,'p3','ada'),/kullanılıyor/);
  for(let i=3;i<=G.MAX_PLAYERS;i++) G.joinRoom(r,`p${i}`,`Oyuncu ${i}`);
  assert.equal(Object.keys(r.players).length,G.MAX_PLAYERS);
  assert.throws(()=>G.joinRoom(r,'extra','Fazla'),/Oda dolu/);
});

test('only the connected host can start, and online races require two players',()=>{
  const r=G.createRoom('ABC234','p1','Ada');
  assert.throws(()=>G.startRace(r,'p1'),/en az iki/);
  G.joinRoom(r,'p2','Bora');
  assert.throws(()=>G.startRace(r,'p2'),/oda sahibi/);
  assert.equal(G.startRace(r,'p1',5000).status,'racing');
  assert.equal(r.players.p1.lap,0);assert.equal(r.players.p2.lap,0);
});

test('server advances kart position from control intent, not client-submitted coordinates',()=>{
  const r=room();G.startRace(r,'p1',100_000);
  assert.equal(G.setControls(r,'p1',{forward:true,x:999999,z:-999999},100_050),true);
  G.tickRoom(r,100_150);
  assert.ok(r.players.p1.x>-132,'server should integrate controls and movement');
  assert.ok(Math.abs(r.players.p1.x)<157);assert.ok(Math.abs(r.players.p1.z)<247);
  assert.equal(r.players.p1.z,-207.5);
  assert.equal(Object.hasOwn(r.players.p1,'clientX'),false);
  assert.throws(()=>G.setControls(r,'p1',{forward:true},100_060),/çok sık/);
});

test('input can only change controls and stale control heartbeats release the throttle',()=>{
  const r=room();G.startRace(r,'p1',100_000);
  G.setControls(r,'p1',{forward:true},100_050);G.tickRoom(r,100_150);
  assert.ok(r.players.p1.speed>0);
  G.tickRoom(r,100_700);
  assert.ok(r.players.p1.speed<4,'stale controls should release acceleration and start friction');
  assert.throws(()=>G.setControls(r,'ghost',{forward:true},100_800),/Go-Kart odasına katılmalısın/);
});

test('server collision stops kart at the outer wall and inner island',()=>{
  const r=room();G.startRace(r,'p1',100_000);const p=r.players.p1;
  p.x=156.9;p.z=-207.5;p.yaw=Math.PI/2;p.speed=20;p.controls={forward:true,reverse:false,left:false,right:false};p.lastInputAt=100_100;
  G.tickRoom(r,100_200);assert.equal(p.x,156.9);assert.equal(p.speed,0);
  p.x=53;p.z=0;p.yaw=-Math.PI/2;p.speed=20;p.controls={forward:false,reverse:false,left:false,right:true};p.lastInputAt=100_200;
  G.tickRoom(r,100_300);assert.ok(Math.abs(p.x)>=52.2 || Math.abs(p.z)>=167.2);
});

test('deterministic checkpoints count three full laps before finishing',()=>{
  const p={x:-100,z:-207.5,lap:0,checkpoint:0};
  G.updateCheckpoint(p,-110,-207.5);assert.equal(p.checkpoint,0);
  p.x=90;p.z=-207.5;G.updateCheckpoint(p,80,-207.5);assert.equal(p.checkpoint,1);
  p.x=100;p.z=160;G.updateCheckpoint(p,100,150);assert.equal(p.checkpoint,2);
  p.x=-90;p.z=200;G.updateCheckpoint(p,-70,200);assert.equal(p.checkpoint,3);
  p.x=-100;p.z=-160;G.updateCheckpoint(p,-100,-150);assert.equal(p.checkpoint,4);
  p.x=1;p.z=-207.5;G.updateCheckpoint(p,-1,-207.5);assert.equal(p.lap,1);assert.equal(p.checkpoint,0);
});

test('online box pickup is server-owned and only one item can be held',()=>{
  const r=room(100_000,()=>0.1);G.startRace(r,'p1',100_000);const p=r.players.p1;
  const box=r.boxes[0];p.x=box.x;p.z=box.z;G.tickRoom(r,100_100);
  assert.equal(p.currentPowerup,'rocket');assert.ok(box.availableAt>100_100);
  const next=r.boxes[1];p.x=next.x;p.z=next.z;G.tickRoom(r,100_200);
  assert.equal(p.currentPowerup,'rocket','holding an item prevents a second pickup');
});

test('rocket power-up is consumed server-side and affects only a player ahead',()=>{
  const r=room(100_000,()=>0.1);G.startRace(r,'p1',100_000);const a=r.players.p1,b=r.players.p2;
  a.x=-100;a.z=-207.5;a.yaw=Math.PI/2;a.currentPowerup='rocket';b.x=-60;b.z=-207.5;b.speed=18;
  const result=G.usePowerup(r,'p1',101_000);
  assert.equal(result.kind,'rocket');assert.equal(result.targetId,'p2');assert.equal(a.currentPowerup,null);assert.ok(b.slowUntil>101_000);
  assert.throws(()=>G.usePowerup(r,'p1',101_100),/güçlendirme yok/);
});

test('banana trap is synchronized and slows an opponent who touches it',()=>{
  const r=room();G.startRace(r,'p1',100_000);const a=r.players.p1,b=r.players.p2;
  a.x=-100;a.z=-207.5;a.yaw=Math.PI/2;a.currentPowerup='banana';
  const result=G.usePowerup(r,'p1',101_000);assert.equal(result.kind,'banana');assert.equal(r.bananas.length,1);
  const trap=r.bananas[0];b.x=trap.x;b.z=trap.z;G.tickRoom(r,101_100);
  assert.ok(b.slowUntil>101_100);assert.equal(r.bananas.length,0);
});

test('disconnect pauses the race; valid token restores slot, state and rotates the token',()=>{
  const r=room();G.startRace(r,'p1',100_000);r.players.p2.x=33;r.players.p2.lap=1;
  const original=token('b');G.disconnectPlayer(r,'p2',100_500);assert.equal(r.status,'paused');
  assert.throws(()=>G.setControls(r,'p1',{forward:true},100_550),/Yarış duraklatıldı/);
  const restored=G.resumePlayer(r,'p2-new',original,()=>token('c'),101_000);
  assert.ok(restored);assert.equal(restored.player.slot,1);assert.equal(restored.player.x,33);assert.equal(restored.player.lap,1);
  assert.equal(restored.player.resumeToken,token('c'));assert.equal(r.status,'racing');
  assert.equal(G.resumePlayer(r,'replay',original,()=>token('d'),101_100),null);
});

test('resume rejects expired tokens and explicit removal transfers host',()=>{
  const r=room();G.disconnectPlayer(r,'p1',100_000);
  assert.equal(G.resumePlayer(r,'late',token('a'),()=>token('d'),100_000+G.RECONNECT_GRACE_MS+1),null);
  const r2=room();G.removePlayer(r2,'p1',100_100);assert.equal(r2.hostId,'p2');assert.equal(r2.status,'lobby');
});

test('Go-Kart rejects recovery when the stored disconnect timestamp is in the future',()=>{
  const r=room();
  G.disconnectPlayer(r,'p2',100_500);
  assert.equal(G.resumePlayer(r,'p2-new',token('b'),()=>token('c'),100_499),null);
  assert.equal(r.players.p2.connected,false);
  assert.equal(r.players.p2.resumeToken,token('b'));
});

test('public Go-Kart state omits recovery secrets and timeouts',()=>{
  const r=room();const pub=G.publicRoom(r);
  assert.equal(pub.players[0].resumeToken,undefined);assert.equal(pub.players[0].resumeTimer,undefined);
  assert.equal(pub.lapsToWin,3);assert.equal(pub.boxes.length,12);
});


test('Go-Kart player names must be strings and control characters are stripped',()=>{
  assert.throws(()=>G.createRoom('ABC234','p1',{name:'not a string'}),/Oyuncu adı/);
  assert.throws(()=>G.createRoom('ABC234','p1',42),/Oyuncu adı/);
  const r=G.createRoom('ABC234','p1','Ada\u0000\u001b');
  assert.equal(r.players.p1.name,'Ada');
  assert.throws(()=>G.joinRoom(r,'p2',{}),/Oyuncu adı/);
});

test('Go-Kart chicane obstacles block straight-line shortcuts on both long sides',()=>{
  assert.equal(G.insideTrack(92,-110),false);
  assert.equal(G.insideTrack(128,-40),false);
  assert.equal(G.insideTrack(-92,110),false);
  assert.equal(G.LAPS_TO_WIN,3);
});
