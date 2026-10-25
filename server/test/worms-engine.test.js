'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../worms-engine');
function state(active=0) { const terrain=Array.from({length:97},(_,i)=>({x:i*10,y:W.initialTerrainY(i*10)})); const surface=x=>{const i=Math.min(95,Math.floor(x/10)),t=(x-i*10)/10;return terrain[i].y*(1-t)+terrain[i+1].y*t}; return { terrain, players:[{x:95,y:surface(95)-15,hp:100,color:'#72e3ad',name:'Yeşil'},{x:855,y:surface(855)-15,hp:100,color:'#ff7a86',name:'Kırmızı'}], active, wind:2, ended:false, winner:null }; }
function playingRoom() { const r=W.createRoom('ABC234','a','Ali'); W.joinRoom(r,'b','Ece'); W.startGame(r,'a'); W.syncState(r,'a',state()); return r; }
test('room creation sanitizes player names',()=>{const r=W.createRoom('ABC234','a',' <Ali> ');assert.equal(r.players.a.name,'Ali');});
test('second player joins and third player is rejected',()=>{const r=W.createRoom('ABC234','a','Ali');assert.equal(W.joinRoom(r,'b','Ece').slot,1);assert.throws(()=>W.joinRoom(r,'c','Mert'),/dolu/);});
test('only host can start and both players are required',()=>{const r=W.createRoom('ABC234','a','Ali');assert.throws(()=>W.startGame(r,'a'),/iki oyuncu/);W.joinRoom(r,'b','Ece');assert.throws(()=>W.startGame(r,'b'),/oda sahibi/);assert.equal(W.startGame(r,'a').status,'playing');});
test('initial state can only be submitted once by the host',()=>{const r=W.createRoom('ABC234','a','Ali');W.joinRoom(r,'b','Ece');W.startGame(r,'a');const out=W.syncState(r,'a',state());assert.equal(out.revision,1);assert.equal(out.state.wind,2);assert.equal(out.state.players[0].name,'Ali');assert.equal(out.state.players[1].name,'Ece');assert.throws(()=>W.syncState(r,'a',state()),/sunucu tarafından/);});
test('host cannot cheat the initial board by reducing enemy HP, moving players or changing terrain',()=>{const r=W.createRoom('ABC234','a','Ali');W.joinRoom(r,'b','Ece');W.startGame(r,'a');const badHp=state();badHp.players[1].hp=0;assert.throws(()=>W.syncState(r,'a',badHp),/konumları veya can değerleri/);const badPos=state();badPos.players[1].x=500;assert.throws(()=>W.syncState(r,'a',badPos),/konumları veya can değerleri/);const badTerrain=state();badTerrain.terrain[20].y+=40;assert.throws(()=>W.syncState(r,'a',badTerrain),/beklenen harita/);});
test('Worms host cannot reduce the initial movement budget in the first snapshot',()=>{
 const r=W.createRoom('ABC234','a','Ali');W.joinRoom(r,'b','Ece');W.startGame(r,'a');const initial=state();initial.moveRemaining=0;
 const out=W.syncState(r,'a',initial);assert.equal(out.state.moveRemaining,60);
});
test('second player cannot initialize the game state',()=>{const r=W.createRoom('ABC234','a','Ali');W.joinRoom(r,'b','Ece');W.startGame(r,'a');assert.throws(()=>W.syncState(r,'b',state()),/yalnızca oda sahibi/);});
test('malformed terrain, player values and excessive health are rejected',()=>{assert.throws(()=>W.validateState({terrain:[],players:[],active:0,wind:0}),/Geçersiz/);const s=state();s.players[0].hp=900;assert.throws(()=>W.validateState(s),/Oyuncu verisi/);const t=state();t.terrain[4].x=43;assert.throws(()=>W.validateState(t),/Arazi/);});
test('server resolves a shot, damages units and changes turn',()=>{const r=playingRoom();const before=r.state.terrain.map(p=>p.y);const out=W.fireShot(r,'a',{angle:45,power:100,weapon:'heavy'});assert.equal(out.action,'fire');assert.equal(out.state.active,1);assert.equal(out.revision,2);assert.ok(out.result.impact.x>=0&&out.result.impact.x<=960);assert.ok(out.state.terrain.some((p,i)=>p.y!==before[i]));});
test('inactive player cannot fire or pass',()=>{const r=playingRoom();assert.throws(()=>W.fireShot(r,'b',{angle:45,power:65,weapon:'normal'}),/Sıra sende değil/);assert.throws(()=>W.passTurn(r,'b'),/Sıra sende değil/);});
test('invalid angle, power and weapon are rejected',()=>{const r=playingRoom();assert.throws(()=>W.fireShot(r,'a',{angle:95,power:65,weapon:'normal'}),/Atış ayarları/);assert.throws(()=>W.fireShot(r,'a',{angle:45,power:120,weapon:'normal'}),/Atış ayarları/);assert.throws(()=>W.fireShot(r,'a',{angle:45,power:65,weapon:'nuke'}),/Atış ayarları/);});
test('passing the turn changes active player and wind on the server',()=>{const r=playingRoom();const before=r.state.wind;const out=W.passTurn(r,'a');assert.equal(out.state.active,1);assert.notEqual(out.state.wind,before);assert.equal(out.revision,2);});
test('game ends when server-calculated damage reduces a player to zero',()=>{const r=playingRoom();r.state.players[1].x=120;r.state.players[1].y=335;r.state.players[1].hp=1;const out=W.fireShot(r,'a',{angle:10,power:25,weapon:'heavy'});assert.ok(out.state.players.some(p=>p.hp===0));assert.equal(out.state.ended,true);});
test('disconnect resets room to lobby and changes host',()=>{const r=W.createRoom('ABC234','a','Ali');W.joinRoom(r,'b','Ece');W.startGame(r,'a');assert.equal(W.removePlayer(r,'a'),true);assert.equal(r.hostId,'b');assert.equal(r.status,'lobby');assert.equal(W.removePlayer(r,'b'),false);});
test('public state exposes no private implementation details',()=>{const r=W.createRoom('ABC234','a','Ali');assert.equal(W.publicRoom(r).players[0].slot,0);assert.equal(W.publicRoom(r).players[0].secret,undefined);});

test('simultaneous elimination ends in a draw instead of awarding a false winner',()=>{const r=playingRoom();r.state.players[0].x=100;r.state.players[0].y=335;r.state.players[0].hp=1;r.state.players[1].x=120;r.state.players[1].y=335;r.state.players[1].hp=1;const out=W.fireShot(r,'a',{angle:10,power:25,weapon:'heavy'});assert.equal(out.state.ended,true);assert.equal(out.state.players[0].hp,0);assert.equal(out.state.players[1].hp,0);assert.equal(out.state.winner,'draw');});

test('pass-turn requests are rate-limited to prevent automated turn spam',()=>{const r=playingRoom();r.lastActionAt.a=Date.now();assert.throws(()=>W.passTurn(r,'a'),/Çok hızlı/);});

test('Worms state rejects coercible strings, booleans, arrays, and objects for numeric fields',()=>{
  for (const bad of ['0', true, [], {}]) {
    const s=state(); s.players[0].hp=bad;
    assert.throws(()=>W.validateState(s),/Oyuncu verisi/);
  }
  const active=state(); active.active='0'; assert.throws(()=>W.validateState(active),/Tur veya rüzgâr/);
  const wind=state(); wind.wind=true; assert.throws(()=>W.validateState(wind),/Tur veya rüzgâr/);
  const terrain=state(); terrain.terrain[3].y='350'; assert.throws(()=>W.validateState(terrain),/Arazi/);
});

test('Worms shots reject numeric strings and coercible non-number values without mutating game state',()=>{
  for (const [field, value] of [['angle','45'], ['angle',true], ['angle',{}], ['power','65'], ['power',false], ['power',[]]]) {
    const r=playingRoom(); const before=JSON.stringify(r.state); const revision=r.revision;
    assert.throws(()=>W.fireShot(r,'a',{angle:45,power:65,weapon:'normal',[field]:value}),/Atış ayarları/);
    assert.equal(JSON.stringify(r.state),before); assert.equal(r.revision,revision);
  }
});

test('Worms rejects non-string weapon values without mutating game state',()=>{
  for (const weapon of [true, {}, [], 1]) {
    const r=playingRoom(); const before=JSON.stringify(r.state);
    assert.throws(()=>W.fireShot(r,'a',{angle:45,power:65,weapon}),/Atış ayarları/);
    assert.equal(JSON.stringify(r.state),before);
  }
});

test('Worms movement is server-authoritative, limited to 60 units per turn, and does not spend the turn',()=>{
 const r=playingRoom(); const x=r.state.players[0].x;
 const out=W.movePlayer(r,'a',{direction:1,distance:30});
 assert.equal(out.action,'move'); assert.equal(out.state.players[0].x,x+30); assert.equal(out.state.moveRemaining,30); assert.equal(out.state.active,0); assert.equal(out.revision,2);
 r.lastActionAt.a=Date.now()-300; const second=W.movePlayer(r,'a',{direction:-1,distance:30}); assert.equal(second.state.players[0].x,x); assert.equal(second.state.moveRemaining,0);
 r.lastActionAt.a=Date.now()-300; assert.throws(()=>W.movePlayer(r,'a',{direction:1,distance:5}),/hareket hakkın kaldı/);
});
test('Worms movement rejects invalid direction, oversized distance, overlap, and non-turn players without changing state',()=>{
 for (const payload of [{direction:0,distance:10},{direction:1,distance:35},{direction:'1',distance:10},{direction:-1,distance:10.5}]){
  const r=playingRoom(),before=JSON.stringify(r.state),revision=r.revision;
  assert.throws(()=>W.movePlayer(r,'a',payload),/Hareket/);assert.equal(JSON.stringify(r.state),before);assert.equal(r.revision,revision);
 }
 const r=playingRoom();assert.throws(()=>W.movePlayer(r,'b',{direction:-1,distance:10}),/Sıra sende değil/);
 const overlap=playingRoom();overlap.state.players[0].x=800;overlap.state.players[1].x=830;
 assert.throws(()=>W.movePlayer(overlap,'a',{direction:1,distance:20}),/yaklaşamazsın/);
});
test('Worms resets movement allowance when the turn passes',()=>{const r=playingRoom();W.movePlayer(r,'a',{direction:1,distance:20});assert.equal(r.state.moveRemaining,40);r.lastActionAt.a=Date.now()-300;const out=W.passTurn(r,'a');assert.equal(out.state.active,1);assert.equal(out.state.moveRemaining,60);});

test('Worms cluster bomb creates three terrain impacts, damages units and advances turn',()=>{
  const r=playingRoom();
  r.state.players[1].x=360;r.state.players[1].y=300;
  const before=r.state.terrain.map(p=>p.y);
  const out=W.fireShot(r,'a',{angle:45,power:100,weapon:'cluster'});
  assert.equal(out.action,'fire');
  assert.equal(out.result.weapon,'cluster');
  assert.equal(out.result.impacts.length,3);
  assert.equal(out.state.active,1);
  assert.ok(out.state.terrain.some((p,i)=>p.y!==before[i]));
  assert.ok(Array.isArray(out.result.damages));
});
