'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeSocket {
  constructor(id, io) { this.id=id; this.io=io; this.connected=true; this.data={}; this.rooms=new Set([id]); this.serverHandlers=new Map(); this.clientHandlers=new Map(); this.clientEvents=[]; }
  on(event, fn) { this.serverHandlers.set(event, fn); return this; }
  clientOn(event, fn) { const list=this.clientHandlers.get(event)||[]; list.push(fn); this.clientHandlers.set(event,list); return this; }
  join(room) { this.rooms.add(room); }
  leave(room) { this.rooms.delete(room); }
  emit(event, ...args) { this.clientEvents.push({event,args}); for(const fn of this.clientHandlers.get(event)||[]) fn(...args); }
  clientEmit(event, payload={}, ack=()=>{}) { const fn=this.serverHandlers.get(event); if(!fn) throw new Error(`No handler for ${event}`); fn(payload,ack); }
  disconnect() { if(!this.connected)return; this.connected=false; this.serverHandlers.get('disconnect')?.('transport close'); this.io.sockets.delete(this.id); }
}
class FakeSocketServer {
  constructor() { this.handlers=new Map(); this.sockets=new Map(); this.namespace={sockets:this.sockets}; }
  on(event,fn) { this.handlers.set(event,fn); return this; }
  of() { return this.namespace; }
  to(target,exceptId=null) { return {emit:(event,...args)=>{ for(const socket of this.sockets.values()) if(socket.connected&&socket.id!==exceptId&&(socket.id===target||socket.rooms.has(target))) socket.emit(event,...args); }}; }
  connect(id) { const socket=new FakeSocket(id,this); this.sockets.set(id,socket); this.handlers.get('connection')(socket); return socket; }
}
function loadServerWithFakeTransport() {
  const originalLoad=Module._load;
  const fakeExpress=()=>{const app=(_req,res)=>res.end('fake');app.disable=()=>app;app.get=()=>app;app.use=()=>app;return app;};
  fakeExpress.static=()=>(_req,_res,next)=>next?.();
  Module._load=function(request,parent,isMain){
    if(request==='express')return fakeExpress;
    if(request==='socket.io')return {Server:class extends FakeSocketServer{constructor(){super();global.__fofanaGoKartFakeIO=this;}}};
    return originalLoad.call(this,request,parent,isMain);
  };
  try{return require('../index');}finally{Module._load=originalLoad;}
}
const app=loadServerWithFakeTransport(), io=global.__fofanaGoKartFakeIO;
let socketCounter=0;
const connect=()=>io.connect(`gokart-socket-${++socketCounter}`);
const act=(socket,event,payload={})=>{let result;socket.clientEmit(event,payload,r=>{result=r});return result;};

test('Go-Kart online flow creates/join rooms, starts only for the host, and broadcasts state',()=>{
  const host=connect(), created=act(host,'gokart:create',{name:'Ada'});
  assert.equal(created.ok,true);assert.match(created.code,/^[A-Z0-9]{6}$/);assert.match(created.resumeToken,/^[a-f0-9]{64}$/);
  const guest=connect(), joined=act(guest,'gokart:join',{name:'Bora',code:created.code});
  assert.equal(joined.ok,true);assert.equal(joined.room.players.length,2);
  assert.equal(act(guest,'gokart:start').ok,false);
  const started=act(host,'gokart:start');assert.equal(started.ok,true);assert.equal(started.room.status,'racing');
  assert.ok(guest.clientEvents.some(event=>event.event==='gokart:started'));
  assert.ok(guest.clientEvents.some(event=>event.event==='gokart:state'&&event.args[0].status==='racing'));
  assert.equal(act(host,'room:create',{name:'other game'}).ok,false,'a socket must not occupy two game rooms');
});

test('Go-Kart online controls only accept intent; items and shared effects are server owned',()=>{
  const host=connect(), created=act(host,'gokart:create',{name:'Ada'}), guest=connect();
  act(guest,'gokart:join',{name:'Bora',code:created.code});act(host,'gokart:start');
  const room=app.gokartRooms.get(created.code), player=room.players[host.id];
  const oldX=player.x,oldZ=player.z;
  assert.equal(act(host,'gokart:input',{forward:true,x:999999,z:-999999}).ok,true);
  assert.equal(player.x,oldX);assert.equal(player.z,oldZ);assert.equal(Object.hasOwn(player,'clientX'),false);
  player.currentPowerup='banana';
  const used=act(host,'gokart:use-item');assert.equal(used.ok,true);assert.equal(used.kind,'banana');assert.equal(player.currentPowerup,null);assert.equal(room.bananas.length,1);
  assert.ok(guest.clientEvents.some(event=>event.event==='gokart:state'&&event.args[0].bananas.length===1));
  assert.equal(act(host,'gokart:use-item').ok,false);
});

test('Go-Kart disconnection pauses the race; rotated token resumes the same player slot',()=>{
  const host=connect(), created=act(host,'gokart:create',{name:'Ada'}), guest=connect();
  const joined=act(guest,'gokart:join',{name:'Bora',code:created.code});act(host,'gokart:start');
  const room=app.gokartRooms.get(created.code), savedX=room.players[guest.id].x, oldToken=joined.resumeToken;
  guest.disconnect();assert.equal(room.status,'paused');assert.equal(room.players[guest.id].connected,false);
  const reconnect=connect();assert.equal(act(reconnect,'gokart:resume',{code:created.code,resumeToken:'x'.repeat(64)}).ok,false);
  const restored=act(reconnect,'gokart:resume',{code:created.code,resumeToken:oldToken});
  assert.equal(restored.ok,true);assert.notEqual(restored.resumeToken,oldToken);assert.equal(restored.room.status,'racing');
  assert.equal(room.players[reconnect.id].slot,1);assert.equal(room.players[reconnect.id].x,savedX);assert.equal(room.players[guest.id],undefined);
  assert.equal(act(connect(),'gokart:resume',{code:created.code,resumeToken:oldToken}).ok,false,'rotated token is single use');
});

test('Go-Kart leave updates the other player and removes an empty room',()=>{
  const host=connect(), created=act(host,'gokart:create',{name:'Ada'}), guest=connect();
  act(guest,'gokart:join',{name:'Bora',code:created.code});
  assert.equal(act(host,'gokart:leave').ok,true);
  assert.equal(app.gokartRooms.get(created.code).hostId,guest.id);
  assert.ok(guest.clientEvents.some(event=>event.event==='gokart:notice'&&String(event.args[0]?.message||'').includes('odadan ayrıldı')));
  assert.equal(act(guest,'gokart:leave').ok,true);assert.equal(app.gokartRooms.has(created.code),false);
});

test('Go-Kart original host can reclaim host authority after reconnecting with a rotated resume token',()=>{
  const host=connect(),created=act(host,'gokart:create',{name:'Ada'}),guest=connect();
  const joined=act(guest,'gokart:join',{name:'Bora',code:created.code});
  assert.equal(act(host,'gokart:start').ok,true);
  const room=app.gokartRooms.get(created.code), oldHostId=host.id, oldToken=created.resumeToken;
  host.disconnect();
  assert.equal(room.status,'paused');
  assert.equal(room.originalHostId,oldHostId);
  assert.equal(room.hostId,guest.id,'guest temporarily hosts while the original owner is disconnected');
  const returned=connect(),resumed=act(returned,'gokart:resume',{code:created.code,resumeToken:oldToken});
  assert.equal(resumed.ok,true);
  assert.notEqual(resumed.resumeToken,oldToken);
  assert.equal(room.hostId,returned.id);
  assert.equal(room.originalHostId,returned.id);
  assert.equal(room.players[returned.id].slot,0);
  assert.equal(room.status,'racing');
  assert.equal(act(guest,'gokart:start').ok,false,'the guest must not keep host-only permissions after host recovery');
  assert.equal(act(returned,'gokart:start').ok,false,'a race already in progress cannot be started twice');
});

test('Go-Kart race finish is calculated by the server ticker and broadcast to every connected racer',async t=>{
  const host=connect(),created=act(host,'gokart:create',{name:'Ada'}),guest=connect();
  act(guest,'gokart:join',{name:'Bora',code:created.code});
  assert.equal(act(host,'gokart:start').ok,true);
  const room=app.gokartRooms.get(created.code);
  const now=Date.now();
  for(const player of Object.values(room.players)){
    player.x=-0.2;player.z=-200;player.yaw=Math.PI/2;player.speed=29;player.lap=2;player.checkpoint=4;
    player.controls={forward:true,reverse:false,left:false,right:false};player.lastInputAt=now;
  }
  room.lastTickAt=now-100;
  const deadline=Date.now()+1200;
  while(room.status!=='finished'&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(room.status,'finished','the server physics loop must finish the race without a client-reported finish');
  assert.equal(room.finishOrder.length,2);
  assert.ok(Object.values(room.players).every(player=>player.finished&&player.finishPosition));
  assert.ok(host.clientEvents.some(event=>event.event==='gokart:finished'&&event.args[0].status==='finished'));
  assert.ok(guest.clientEvents.some(event=>event.event==='gokart:finished'&&event.args[0].status==='finished'));
  assert.deepEqual(host.clientEvents.filter(event=>event.event==='gokart:finished').at(-1).args[0].finishOrder,guest.clientEvents.filter(event=>event.event==='gokart:finished').at(-1).args[0].finishOrder);
  for(const player of Object.values(room.players))if(player.resumeTimer)clearTimeout(player.resumeTimer);
  app.gokartRooms.delete(created.code);
});
