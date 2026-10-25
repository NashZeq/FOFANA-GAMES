'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
class FakeSocket {
  constructor(id, io) { this.id=id; this.io=io; this.connected=true; this.data={}; this.rooms=new Set([id]); this.serverHandlers=new Map(); this.clientHandlers=new Map(); this.clientEvents=[]; }
  on(event, fn) { this.serverHandlers.set(event,fn); return this; }
  join(room) { this.rooms.add(room); }
  leave(room) { this.rooms.delete(room); }
  emit(event,...args) { this.clientEvents.push({event,args}); for(const fn of this.clientHandlers.get(event)||[])fn(...args); }
  to(room) { return this.io.to(room,this.id); }
  clientEmit(event,payload={},ack=()=>{}) { const fn=this.serverHandlers.get(event); if(!fn)throw new Error(`No handler for ${event}`); fn(payload,ack); }
  disconnect() { if(!this.connected)return;this.connected=false;this.serverHandlers.get('disconnect')?.('transport close');this.io.sockets.delete(this.id); }
}
class FakeSocketServer {
  constructor(){this.handlers=new Map();this.sockets=new Map();this.namespace={sockets:this.sockets};}
  on(event,fn){this.handlers.set(event,fn);return this;}
  of(){return this.namespace;}
  to(target,exceptId=null){return{emit:(event,...args)=>{for(const socket of this.sockets.values())if(socket.connected&&socket.id!==exceptId&&(socket.id===target||socket.rooms.has(target)))socket.emit(event,...args);}};}
  connect(id){const socket=new FakeSocket(id,this);this.sockets.set(id,socket);this.handlers.get('connection')(socket);return socket;}
}
function loadServer(){const original=Module._load;const fakeExpress=()=>{const app=(_req,res)=>res.end('fake');app.disable=()=>app;app.get=()=>app;app.use=()=>app;return app;};fakeExpress.static=()=>((_req,_res,next)=>next?.());Module._load=function(request,parent,isMain){if(request==='express')return fakeExpress;if(request==='socket.io')return{Server:class extends FakeSocketServer{constructor(){super();global.__fofanaSkyFakeIO=this;}}};return original.call(this,request,parent,isMain);};try{delete require.cache[require.resolve('../index')];return require('../index');}finally{Module._load=original;}}
const app=loadServer(),io=global.__fofanaSkyFakeIO;let seq=0;const connect=()=>io.connect(`sky-${++seq}`);const act=(s,e,p={})=>{let out;s.clientEmit(e,p,r=>out=r);return out;};
function cleanup(code){if(code)app.skySprintRooms.delete(code);}
test('Sky Sprint creates and joins a private six-character room and starts only with two players',t=>{const host=connect(),created=act(host,'sky:create',{name:'Ali'});assert.equal(created.ok,true);assert.match(created.code,/^[A-Z0-9]{6}$/);const room=app.skySprintRooms.get(created.code);t.after(()=>cleanup(created.code));assert.equal(act(host,'sky:start').ok,false);const guest=connect();assert.equal(act(guest,'sky:join',{name:'Ece',code:created.code}).ok,true);assert.equal(act(guest,'sky:start').ok,false);assert.equal(act(host,'sky:start').ok,true);assert.equal(room.status,'racing');assert.ok(room.startedAt);});
test('Sky Sprint rejects malformed codes, duplicate names and progress before race start',t=>{const host=connect(),created=act(host,'sky:create',{name:'Ali'});t.after(()=>cleanup(created.code));const guest=connect();assert.equal(act(guest,'sky:join',{name:'Ece',code:'../../'}).ok,false);assert.equal(act(guest,'sky:join',{name:'ali',code:created.code}).ok,false);assert.equal(act(host,'sky:progress',{distance:100}).ok,false);});
test('Sky Sprint clamps progress to elapsed time and broadcasts race state and winner',t=>{const host=connect(),created=act(host,'sky:create',{name:'Ali'});t.after(()=>cleanup(created.code));const guest=connect();act(guest,'sky:join',{name:'Ece',code:created.code});const room=app.skySprintRooms.get(created.code);const startedAt=Date.now()-12000;room.startedAt=startedAt;room.status='racing';room.players[host.id].lastProgressAt=startedAt;assert.equal(act(host,'sky:progress',{distance:99999}).ok,true);assert.ok(room.players[host.id].distance<=4500);assert.ok(room.players[host.id].distance<99999);assert.equal(room.winnerId,null);assert.ok(host.clientEvents.some(e=>e.event==='sky:state'));});
test('Sky Sprint sanitizes names and caps room size',()=>{const Engine=require('../sky-sprint-engine');const room=Engine.createRoom({code:'ABC234',hostId:'h',name:'<b>Ali</b>'});assert.equal(room.players.h.name,'bAli/b');for(let i=1;i<6;i++)Engine.joinRoom(room,{playerId:`p${i}`,name:`P${i}`});assert.throws(()=>Engine.joinRoom(room,{playerId:'extra',name:'Extra'}),/dolu/);});

test('Sky Sprint refuses duplicate or invalid player IDs without overwriting existing players',()=>{const Engine=require('../sky-sprint-engine');const room=Engine.createRoom({code:'ID1234',hostId:'host',name:'Ali',now:10});const before=JSON.stringify(room.players);assert.throws(()=>Engine.joinRoom(room,{playerId:'host',name:'Ece',now:20}),/kimliği odada zaten kayıtlı/);assert.throws(()=>Engine.joinRoom(room,{playerId:'',name:'Ece',now:20}),/kimliği geçersiz/);assert.throws(()=>Engine.joinRoom(room,{playerId:123,name:'Ece',now:20}),/kimliği geçersiz/);assert.equal(JSON.stringify(room.players),before);assert.equal(Object.keys(room.players).length,1);});

test('Sky Sprint removes a disconnected lobby player and transfers host authority',t=>{const host=connect(),created=act(host,'sky:create',{name:'Ali'});t.after(()=>cleanup(created.code));const guest=connect();act(guest,'sky:join',{name:'Ece',code:created.code});const room=app.skySprintRooms.get(created.code);host.disconnect();assert.equal(room.hostId,guest.id);assert.equal(room.players[host.id],undefined);assert.equal(act(guest,'sky:start').ok,false);const third=connect();assert.equal(act(third,'sky:join',{name:'Can',code:created.code}).ok,true);assert.equal(Object.keys(room.players).length,2);});

test('Sky Sprint reconnects a racing player with a private resume token and preserves progress',t=>{
  const host=connect(),created=act(host,'sky:create',{name:'Ali'});t.after(()=>cleanup(created.code));
  const guest=connect(),joined=act(guest,'sky:join',{name:'Ece',code:created.code});
  assert.equal(typeof joined.resumeToken,'string');assert.ok(joined.resumeToken.length>=32);
  act(host,'sky:start');
  const room=app.skySprintRooms.get(created.code);room.players[guest.id].world=1234;room.players[guest.id].distance=1234;
  guest.disconnect();assert.equal(room.players[guest.id].connected,false);
  const reconnected=connect(),resumed=act(reconnected,'sky:resume',{code:created.code,resumeToken:joined.resumeToken});
  assert.equal(resumed.ok,true);assert.notEqual(resumed.resumeToken,joined.resumeToken);assert.equal(resumed.room.players.find(p=>p.id===reconnected.id).distance,1234);
  assert.equal(room.players[guest.id],undefined);assert.equal(room.players[reconnected.id].connected,true);
  reconnected.disconnect();const replay=connect();assert.equal(act(replay,'sky:resume',{code:created.code,resumeToken:joined.resumeToken}).ok,false);
});

test('Sky Sprint refuses a wrong resume token without changing the room',t=>{
  const host=connect(),created=act(host,'sky:create',{name:'Ali'});t.after(()=>cleanup(created.code));
  const guest=connect(),joined=act(guest,'sky:join',{name:'Ece',code:created.code});act(host,'sky:start');guest.disconnect();
  const room=app.skySprintRooms.get(created.code),reconnected=connect();
  const result=act(reconnected,'sky:resume',{code:created.code,resumeToken:'not-the-secret-token'});
  assert.equal(result.ok,false);assert.ok(room.players[guest.id]);assert.equal(room.players[guest.id].connected,false);
});


test('Sky Sprint retains a race when everyone disconnects and restores host ownership to a returning player',t=>{
  const host=connect(),created=act(host,'sky:create',{name:'Ali'});t.after(()=>cleanup(created.code));
  const guest=connect(),joined=act(guest,'sky:join',{name:'Ece',code:created.code});act(host,'sky:start');
  host.disconnect();guest.disconnect();const room=app.skySprintRooms.get(created.code);assert.ok(room);assert.equal(Object.values(room.players).filter(p=>p.connected).length,0);
  const restored=connect(),result=act(restored,'sky:resume',{code:created.code,resumeToken:created.resumeToken});
  assert.equal(result.ok,true);assert.equal(room.hostId,restored.id);assert.equal(room.players[restored.id].connected,true);
});

test('Sky Sprint validates and broadcasts jump intents to every player',t=>{const host=connect(),created=act(host,'sky:create',{name:'Ali'});t.after(()=>cleanup(created.code));const guest=connect();act(guest,'sky:join',{name:'Ece',code:created.code});act(host,'sky:start');const result=act(host,'sky:jump',{});assert.equal(result.ok,true);assert.ok(host.clientEvents.some(e=>e.event==='sky:jumpAccepted'));assert.ok(guest.clientEvents.some(e=>e.event==='sky:jumpAccepted'));});

test('Sky Sprint server simulates jump height and exposes it to remote racers',()=>{
  const Engine=require('../sky-sprint-engine');
  const base=Date.now();
  const room=Engine.createRoom({code:'JMP234',hostId:'h',name:'Ali',now:base});
  Engine.joinRoom(room,{playerId:'g',name:'Ece',now:base});
  Engine.startRace(room,'h',base);
  const first=Engine.registerJump(room,'h',base);
  assert.equal(first.jumpCount,1);
  Engine.advanceJumpPhysics(room.players.h,base+150);
  assert.ok(room.players.h.jumpHeight>0,'server should calculate vertical jump position');
  assert.ok(Engine.publicRoom(room).players.find(p=>p.id==='h').airborne);
  const second=Engine.registerJump(room,'h',base+250);
  assert.equal(second.jumpCount,2);
  assert.throws(()=>Engine.registerJump(room,'h',base+500),/iki kez/);
});

test('Sky Sprint resets server jump count after landing',()=>{
  const Engine=require('../sky-sprint-engine');
  const base=Date.now();
  const room=Engine.createRoom({code:'JMP235',hostId:'h',name:'Ali',now:base});
  Engine.joinRoom(room,{playerId:'g',name:'Ece',now:base});
  Engine.startRace(room,'h',base);
  Engine.registerJump(room,'h',base);
  Engine.advanceJumpPhysics(room.players.h,base+1400);
  assert.equal(room.players.h.jumpHeight,0);
  assert.equal(room.players.h.jumpCount,0);
  assert.equal(Engine.registerJump(room,'h',base+1600).jumpCount,1);
});

test('Sky Sprint publishes the same server-generated track when the race starts and when a player resumes', t => {
  const host = connect(), created = act(host, 'sky:create', { name: 'Ali' });
  t.after(() => cleanup(created.code));
  const guest = connect(), joined = act(guest, 'sky:join', { name: 'Ece', code: created.code });
  act(host, 'sky:start');
  const started = host.clientEvents.find(e => e.event === 'sky:started');
  assert.ok(Array.isArray(started.args[0].room.track));
  assert.deepEqual(started.args[0].room.track, app.skySprintRooms.get(created.code).track);
  assert.ok(started.args[0].room.track.some(e => e.type === 'gap'));
  guest.disconnect();
  const resumed = connect();
  const result = act(resumed, 'sky:resume', { code: created.code, resumeToken: joined.resumeToken });
  assert.equal(result.ok, true);
  assert.deepEqual(result.room.track, app.skySprintRooms.get(created.code).track);
});

test('Sky Sprint server physics ticker advances the race without client progress heartbeats', async t => {
  const host = connect(), created = act(host, 'sky:create', { name: 'Ali' });
  t.after(() => cleanup(created.code));
  const guest = connect();
  act(guest, 'sky:join', { name: 'Ece', code: created.code });
  act(host, 'sky:start');
  const room = app.skySprintRooms.get(created.code);
  const startDistance = room.players[host.id].distance;
  await new Promise(resolve => setTimeout(resolve, 240));
  assert.ok(room.players[host.id].distance > startDistance, 'server tick must advance positions even without progress events');
  assert.ok(host.clientEvents.some(e => e.event === 'sky:state'), 'server tick should broadcast current room state');
});
