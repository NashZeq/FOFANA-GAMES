'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeSocket {
  constructor(id, io) { this.id=id; this.io=io; this.connected=true; this.data={}; this.rooms=new Set([id]); this.serverHandlers=new Map(); this.clientHandlers=new Map(); this.clientEvents=[]; }
  on(event, fn) { this.serverHandlers.set(event, fn); return this; }
  clientOn(event, fn) { const a=this.clientHandlers.get(event)||[]; a.push(fn); this.clientHandlers.set(event,a); return this; }
  join(room) { this.rooms.add(room); }
  leave(room) { this.rooms.delete(room); }
  emit(event, ...args) { this.clientEvents.push({event,args}); for(const fn of this.clientHandlers.get(event)||[]) fn(...args); }
  to(room) { return this.io.to(room, this.id); }
  clientEmit(event, payload={}, ack=()=>{}) { const fn=this.serverHandlers.get(event); if(!fn) throw new Error(`No handler for ${event}`); fn(payload, ack); }
  disconnect() { if(!this.connected)return; this.connected=false; this.serverHandlers.get('disconnect')?.('transport close'); this.io.sockets.delete(this.id); }
}
class FakeSocketServer {
  constructor() { this.handlers=new Map(); this.sockets=new Map(); this.namespace={sockets:this.sockets}; }
  on(event, fn) { this.handlers.set(event,fn); return this; }
  of() { return this.namespace; }
  to(target, exceptId=null) { return {emit:(event,...args)=>{ for(const s of this.sockets.values()) if(s.connected && s.id!==exceptId && (s.id===target || s.rooms.has(target))) s.emit(event,...args); }}; }
  connect(id) { const s=new FakeSocket(id,this); this.sockets.set(id,s); this.handlers.get('connection')(s); return s; }
}
function loadServerWithFakeTransport() {
  const originalLoad=Module._load;
  const fakeExpress=()=>{const app=(_req,res)=>res.end('fake');app.disable=()=>app;app.get=()=>app;app.use=()=>app;return app;};
  fakeExpress.static=()=>(_req,_res,next)=>next?.();
  Module._load=function(request,parent,isMain){if(request==='express')return fakeExpress;if(request==='socket.io')return {Server:class extends FakeSocketServer{constructor(){super();global.__fofanaWormsFakeIO=this;}}};return originalLoad.call(this,request,parent,isMain);};
  try{return require('../index');}finally{Module._load=originalLoad;}
}
const app=loadServerWithFakeTransport(), io=global.__fofanaWormsFakeIO, Worms=require('../worms-engine');
let n=0;const connect=()=>io.connect(`worms-socket-${++n}`);
const act=(socket,event,payload={})=>{let result;socket.clientEmit(event,payload,r=>{result=r});return result;};
function initialState(names=['Ali','Ece']) { const terrain=Array.from({length:97},(_,i)=>({x:i*10,y:Worms.initialTerrainY(i*10)}));const surf=x=>{const i=Math.min(95,Math.floor(x/10)),t=(x-i*10)/10;return terrain[i].y*(1-t)+terrain[i+1].y*t};return {terrain,players:[{x:95,y:surf(95)-15,hp:100,color:'#72e3ad',name:names[0]},{x:855,y:surf(855)-15,hp:100,color:'#ff7a86',name:names[1]}],active:0,wind:2,ended:false,winner:null}; }

test('Worms socket room creates a private resume token, joins, pauses on disconnect and resumes the same slot',()=>{
  const host=connect();const created=act(host,'worms:create',{name:'Ali'});assert.equal(created.ok,true);assert.match(created.resumeToken,/^[a-f0-9]{64}$/);
  const guest=connect();const joined=act(guest,'worms:join',{name:'Ece',code:created.code});assert.equal(joined.ok,true);assert.equal(joined.slot,1);assert.match(joined.resumeToken,/^[a-f0-9]{64}$/);
  const room=app.wormsRooms.get(created.code);assert.ok(room);assert.equal(WormsPublicTokenLeak(room),false);
  assert.equal(act(host,'worms:start',{code:created.code}).ok,true);
  assert.equal(act(host,'worms:sync',{code:created.code,state:initialState()}).ok,true);
  const before=structuredClone(room.state);const oldGuestId=guest.id,oldToken=joined.resumeToken;
  guest.disconnect();assert.equal(room.status,'paused');assert.equal(room.players[oldGuestId].connected,false);assert.deepEqual(room.state,before);
  assert.equal(act(host,'worms:pass',{code:created.code}).ok,false);
  const returned=connect();const resumed=act(returned,'worms:resume',{code:created.code,resumeToken:oldToken});
  assert.equal(resumed.ok,true);assert.equal(resumed.slot,1);assert.notEqual(resumed.resumeToken,oldToken);assert.equal(room.status,'playing');assert.equal(room.players[oldGuestId],undefined);assert.equal(room.players[returned.id].name,'Ece');assert.deepEqual(room.state,before);
  const replay=connect();assert.equal(act(replay,'worms:resume',{code:created.code,resumeToken:oldToken}).ok,false);
});

test('Worms socket room refuses to start with an offline player and only host can restart a finished game',()=>{
  const host=connect();const created=act(host,'worms:create',{name:'Ali'});const guest=connect();const joined=act(guest,'worms:join',{name:'Ece',code:created.code});
  guest.disconnect();assert.equal(act(host,'worms:start',{code:created.code}).ok,false);
  const comeback=connect();assert.equal(act(comeback,'worms:resume',{code:created.code,resumeToken:joined.resumeToken}).ok,true);
  assert.equal(act(host,'worms:start',{code:created.code}).ok,true);assert.equal(act(host,'worms:sync',{code:created.code,state:initialState()}).ok,true);
  const room=app.wormsRooms.get(created.code);room.state.ended=true;
  assert.equal(act(comeback,'worms:new-game',{code:created.code}).ok,false);
  assert.equal(act(host,'worms:new-game',{code:created.code}).ok,true);assert.equal(room.status,'lobby');assert.equal(room.state,null);
});

function WormsPublicTokenLeak(room) { return Object.values(room.players).some(p => Object.hasOwn(p,'resumeToken') && Object.hasOwn(require('../worms-engine').publicRoom(room).players.find(pub=>pub.id===p.id)||{},'resumeToken')); }

test('Worms resolves a fire action once on the server and broadcasts identical state/revision to both players',()=>{
  const host=connect(),created=act(host,'worms:create',{name:'Ali'}),guest=connect();
  const joined=act(guest,'worms:join',{name:'Ece',code:created.code});
  assert.equal(created.ok,true);assert.equal(joined.ok,true);
  assert.equal(act(host,'worms:start',{code:created.code}).ok,true);
  assert.equal(act(host,'worms:sync',{code:created.code,state:initialState(['Ali','Ece'])}).ok,true);
  const room=app.wormsRooms.get(created.code),revisionBefore=room.revision;
  const result=act(host,'worms:fire',{code:created.code,shot:{angle:40,power:90,weapon:'heavy'}});
  assert.equal(result.ok,true);
  assert.ok(result.revision>revisionBefore);
  assert.equal(room.state.active,1,'server-calculated shot advances the active player');
  const hostState=host.clientEvents.filter(e=>e.event==='worms:state').at(-1)?.args?.[0];
  const guestState=guest.clientEvents.filter(e=>e.event==='worms:state').at(-1)?.args?.[0];
  assert.deepEqual(guestState,hostState);
  assert.equal(host.clientEvents.filter(e=>e.event==='worms:action'&&e.args[0]?.action==='fire').at(-1).args[0].revision,result.revision);
  assert.equal(guest.clientEvents.filter(e=>e.event==='worms:action'&&e.args[0]?.action==='fire').at(-1).args[0].revision,result.revision);
  assert.equal(act(host,'worms:fire',{code:created.code,shot:{angle:40,power:90,weapon:'heavy'}}).ok,false,'the player whose turn ended cannot spoof another shot');
  assert.equal(room.revision,result.revision,'rejected fire leaves authoritative revision unchanged');
  for(const player of Object.values(room.players))if(player.resumeTimer)clearTimeout(player.resumeTimer);
});

test('Worms reconnect grace expiry removes the disconnected player and returns the match to a consistent lobby',()=>{
  const host=connect(),created=act(host,'worms:create',{name:'Ali'}),guest=connect();
  const joined=act(guest,'worms:join',{name:'Ece',code:created.code});
  assert.equal(act(guest,'worms:join',{name:'Ece',code:created.code}).ok,false,'duplicate socket join is refused');
  assert.equal(act(guest,'room:join',{name:'duplicate',code:created.code}).ok,false,'one socket cannot occupy a second game room');
  assert.equal(act(guest,'worms:join',{name:'Ece',code:created.code}).ok,false,'socket must not create duplicate slot');
  const room=app.wormsRooms.get(created.code);assert.equal(act(host,'worms:start',{code:created.code}).ok,true);
  assert.equal(act(host,'worms:sync',{code:created.code,state:initialState(['Ali','Ece'])}).ok,true);
  guest.disconnect();assert.equal(room.status,'paused');
  const timer=room.players[guest.id].resumeTimer;
  assert.ok(timer&&typeof timer._onTimeout==='function');
  timer._onTimeout();
  assert.equal(room.players[guest.id],undefined);
  assert.equal(room.status,'lobby');
  assert.equal(room.state,null);
  assert.equal(Object.keys(room.players).length,1);
  assert.equal(room.players[host.id].slot,0);
  assert.ok(host.clientEvents.some(e=>e.event==='worms:notice'&&/kurtarma süresi doldu/i.test(String(e.args[0]?.message||''))));
  for(const player of Object.values(room.players))if(player.resumeTimer)clearTimeout(player.resumeTimer);
});
