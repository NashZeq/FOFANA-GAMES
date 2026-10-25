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
  to(room) { return this.io.to(room, this.id); }
  clientEmit(event, payload={}, ack=()=>{}) { const fn=this.serverHandlers.get(event); if(!fn) throw new Error(`No handler for ${event}`); fn(payload, ack); }
  disconnect() { if(!this.connected)return; this.connected=false; this.serverHandlers.get('disconnect')?.('transport close'); this.io.sockets.delete(this.id); }
}
class FakeSocketServer {
  constructor() { this.handlers=new Map(); this.sockets=new Map(); this.namespace={sockets:this.sockets}; }
  on(event, fn) { this.handlers.set(event,fn); return this; }
  of() { return this.namespace; }
  to(target, exceptId=null) { return {emit:(event,...args)=>{ for(const socket of this.sockets.values()) if(socket.connected&&socket.id!==exceptId&&(socket.id===target||socket.rooms.has(target))) socket.emit(event,...args); }}; }
  connect(id) { const socket=new FakeSocket(id,this); this.sockets.set(id,socket); this.handlers.get('connection')(socket); return socket; }
}
function loadServerWithFakeTransport() {
  const originalLoad=Module._load;
  const fakeExpress=()=>{const app=(_req,res)=>res.end('fake');app.disable=()=>app;app.get=()=>app;app.use=()=>app;return app;};
  fakeExpress.static=()=>((_req,_res,next)=>next?.());
  Module._load=function(request,parent,isMain){
    if(request==='express')return fakeExpress;
    if(request==='socket.io')return {Server:class extends FakeSocketServer{constructor(){super();global.__fofanaMonopolyFakeIO=this;}}};
    return originalLoad.call(this,request,parent,isMain);
  };
  try { delete require.cache[require.resolve('../index')]; return require('../index'); }
  finally { Module._load=originalLoad; }
}
const app=loadServerWithFakeTransport(), io=global.__fofanaMonopolyFakeIO;
const Monopoly=require('../monopoly-engine');
let sequence=0;
const connect=()=>io.connect(`monopoly-socket-${++sequence}`);
const act=(socket,event,payload={})=>{let result;socket.clientEmit(event,payload,r=>{result=r});return result;};
function cleanup(room) { if(!room)return; for(const player of Object.values(room.players||{})) if(player.resumeTimer)clearTimeout(player.resumeTimer); app.monopolyRooms.delete(room.code); }

test('Monopoly room creates tokens privately, joins, pauses and restores the same game identity', t=>{
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'});
  assert.equal(created.ok,true); assert.match(created.resumeToken,/^[a-f0-9]{64}$/);
  const guest=connect(),joined=act(guest,'monopoly:join',{name:'Ece',code:created.code});
  assert.equal(joined.ok,true); assert.match(joined.resumeToken,/^[a-f0-9]{64}$/);
  const room=app.monopolyRooms.get(created.code); t.after(()=>cleanup(room));
  assert.ok(room); assert.equal(act(host,'monopoly:start').ok,true);
  room.game.current=1; room.game.players[1].cash=888; room.game.players[1].properties=[1,3];
  room.game.pendingDebt={debtorId:guest.id,amount:50,creditorId:host.id,reason:'hapishane',effect:{type:'jail_bail_roll',playerId:guest.id,steps:6}};
  const oldId=guest.id, oldToken=joined.resumeToken;
  guest.disconnect();
  assert.equal(room.status,'paused'); assert.equal(room.players[oldId].connected,false);
  assert.equal(act(host,'monopoly:roll').ok,false);
  const returned=connect(),resumed=act(returned,'monopoly:resume',{code:created.code,resumeToken:oldToken});
  assert.equal(resumed.ok,true); assert.notEqual(resumed.resumeToken,oldToken);
  assert.equal(room.status,'playing'); assert.equal(room.players[oldId],undefined); assert.equal(room.players[returned.id].name,'Ece');
  assert.equal(room.game.players[1].id,returned.id); assert.equal(room.game.players[1].cash,888);
  assert.equal(room.game.pendingDebt.debtorId,returned.id); assert.equal(room.game.pendingDebt.creditorId,host.id); assert.equal(room.game.pendingDebt.effect.playerId,returned.id);
  const latestState=returned.clientEvents.filter(e=>e.event==='monopoly:state').at(-1);
  assert.ok(latestState); assert.equal(JSON.stringify(latestState.args).includes(oldToken),false);
  const replay=connect(); assert.equal(act(replay,'monopoly:resume',{code:created.code,resumeToken:oldToken}).ok,false);
});

test('Monopoly validates room codes, refuses duplicate names, and restores original host after handoff',t=>{
  const invalid=connect(); assert.equal(act(invalid,'monopoly:join',{name:'Ece',code:'../xxx'}).ok,false);
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'}); assert.equal(created.ok,true);
  const duplicate=connect(); assert.equal(act(duplicate,'monopoly:join',{name:'Ali',code:created.code}).ok,false);
  const room=app.monopolyRooms.get(created.code); t.after(()=>cleanup(room));
  const oldHostId=host.id, oldToken=created.resumeToken;
  host.disconnect(); assert.equal(room.disconnectedHostId,oldHostId);
  const guest=connect(),joined=act(guest,'monopoly:join',{name:'Ece',code:created.code});
  assert.equal(joined.ok,true); assert.equal(room.hostId,guest.id);
  assert.equal(act(guest,'monopoly:start').ok,false,'offline original host must not be included as a ghost player');
  const restored=connect(),resume=act(restored,'monopoly:resume',{code:created.code,resumeToken:oldToken});
  assert.equal(resume.ok,true); assert.equal(resume.reclaimedOriginalHost,true); assert.equal(room.hostId,restored.id);
  assert.equal(act(restored,'monopoly:start').ok,true); assert.equal(room.status,'playing');
});


test('Monopoly room snapshots use the same monotonically increasing revision for all connected players', t=>{
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'}),guest=connect();
  assert.equal(created.ok,true);
  const joined=act(guest,'monopoly:join',{name:'Ece',code:created.code}); assert.equal(joined.ok,true);
  const room=app.monopolyRooms.get(created.code); t.after(()=>cleanup(room));
  const latest = socket => socket.clientEvents.filter(e=>e.event==='monopoly:state').at(-1)?.args?.[0];
  const afterJoinHost=latest(host), afterJoinGuest=latest(guest);
  assert.ok(Number.isSafeInteger(afterJoinHost.revision));
  assert.equal(afterJoinHost.revision,afterJoinGuest.revision);
  const firstRevision=afterJoinHost.revision;
  assert.equal(act(host,'monopoly:start').ok,true);
  const afterStartHost=latest(host),afterStartGuest=latest(guest);
  assert.equal(afterStartHost.revision,afterStartGuest.revision);
  assert.ok(afterStartHost.revision>firstRevision);
  assert.equal(afterStartHost.game.phase,'playing');
  const revisionBeforeRoll=afterStartHost.revision;
  assert.equal(act(host,'monopoly:roll').ok,true);
  const afterRollHost=latest(host),afterRollGuest=latest(guest);
  assert.equal(afterRollHost.revision,afterRollGuest.revision);
  assert.ok(afterRollHost.revision>revisionBeforeRoll);
  assert.deepEqual(afterRollHost.game.lastDice,afterRollGuest.game.lastDice);
});

test('Monopoly property purchase is broadcast to both players with owner and activity log',t=>{
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'}),guest=connect();
  assert.equal(created.ok,true); assert.equal(act(guest,'monopoly:join',{name:'Ece',code:created.code}).ok,true);
  const room=app.monopolyRooms.get(created.code); t.after(()=>cleanup(room));
  assert.equal(act(host,'monopoly:start').ok,true);
  room.game.random=()=>0; room.game.players[0].pos=39;
  assert.equal(act(host,'monopoly:roll').ok,true); assert.equal(room.game.pendingBuy,1);
  const latest=socket=>socket.clientEvents.filter(e=>e.event==='monopoly:state').at(-1)?.args?.[0];
  const before=latest(host).revision;
  assert.equal(act(host,'monopoly:buy',{buy:true}).ok,true);
  const afterHost=latest(host),afterGuest=latest(guest);
  assert.ok(afterHost.revision>before); assert.equal(afterHost.revision,afterGuest.revision);
  assert.deepEqual(afterHost.game.players[0].properties,[1]);
  assert.deepEqual(afterGuest.game.players[0].properties,[1]);
  assert.ok(!afterHost.game.bankProperties.includes(1));
  assert.ok(!afterGuest.game.bankProperties.includes(1));
  assert.match(afterHost.game.log[0],/Ali.*satın aldı|Ali.*mülkü aldı/i);
  assert.equal(afterGuest.game.log[0],afterHost.game.log[0]);
});

test('Monopoly online purchase refusal leaves property in bank and no auction starts',t=>{
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'}),guest=connect();
  act(guest,'monopoly:join',{name:'Ece',code:created.code});
  const room=app.monopolyRooms.get(created.code); t.after(()=>cleanup(room));
  assert.equal(act(host,'monopoly:start').ok,true);
  room.game.random=()=>0; room.game.players[0].pos=39;
  assert.equal(act(host,'monopoly:roll').ok,true); assert.equal(room.game.pendingBuy,1);
  const before=room.game.players[0].cash;
  assert.equal(act(host,'monopoly:buy',{buy:false}).ok,true);
  assert.equal(room.game.pendingAuction,null); assert.equal(room.game.pendingBuy,null);
  assert.equal(room.game.players[0].properties.includes(1),false);
  assert.equal(room.game.players[0].cash,before);
  assert.equal(act(host,'monopoly:auction-bid',{amount:40}).ok,false);
  assert.equal(act(guest,'monopoly:auction-pass').ok,false);
});

test('Monopoly cannot use bankruptcy to dodge a debt when liquidation can pay, and new game only follows a finish',t=>{
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'}),guest=connect();
  act(guest,'monopoly:join',{name:'Ece',code:created.code});
  const room=app.monopolyRooms.get(created.code); t.after(()=>cleanup(room));
  assert.equal(act(host,'monopoly:start').ok,true);
  room.game.players[0].properties=[1]; room.game.players[0].cash=30;
  room.game.pendingDebt={debtorId:host.id,amount:50,creditorId:guest.id,reason:'kira',effect:null};
  assert.equal(act(host,'monopoly:debt-bankrupt').ok,false);
  assert.equal(act(host,'monopoly:new-game').ok,false);
  room.game.phase='finished'; room.game.winnerId=guest.id; room.status='finished';
  assert.equal(act(guest,'monopoly:new-game').ok,false);
  assert.equal(act(host,'monopoly:new-game').ok,true); assert.equal(room.status,'lobby'); assert.equal(room.game,null);
});

test('Monopoly conference card action broadcasts jail exit to every player',t=>{
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'}),guest=connect();
  act(guest,'monopoly:join',{name:'Ece',code:created.code});
  const room=app.monopolyRooms.get(created.code);t.after(()=>cleanup(room));
  assert.equal(act(host,'monopoly:start').ok,true);
  const player=room.game.players[0];player.inJail=true;player.jailCard=true;player.rolled=false;room.game.rolled=false;
  const before=guest.clientEvents.filter(e=>e.event==='monopoly:state').length;
  assert.equal(act(host,'monopoly:use-jail-card').ok,true);
  assert.equal(player.inJail,false);assert.equal(player.jailCard,false);
  const snapshots=guest.clientEvents.filter(e=>e.event==='monopoly:state').slice(before);
  assert.ok(snapshots.some(e=>e.args[0].game.log[0].includes('konferans kartını kullandı')));
});

test('Monopoly trade offers and acceptance are shared in both players snapshots and public activity log',t=>{
  const host=connect(),created=act(host,'monopoly:create',{name:'Ali'}),guest=connect();
  assert.equal(created.ok,true);
  assert.equal(act(guest,'monopoly:join',{name:'Ece',code:created.code}).ok,true);
  const room=app.monopolyRooms.get(created.code);t.after(()=>cleanup(room));
  assert.equal(act(host,'monopoly:start').ok,true);
  room.game.players[0].properties=[1];
  room.game.players[1].properties=[3];
  const latest=socket=>socket.clientEvents.filter(e=>e.event==='monopoly:state').at(-1)?.args?.[0];
  const before=latest(host).revision;
  assert.equal(act(host,'monopoly:trade',{toId:guest.id,giveIndex:1,takeIndex:3,cashOut:25,cashIn:0}).ok,true);
  const offerHost=latest(host),offerGuest=latest(guest);
  assert.equal(offerHost.revision,offerGuest.revision);
  assert.ok(offerHost.revision>before);
  assert.equal(offerHost.game.pendingTrade.fromName,'Ali');
  assert.equal(offerGuest.game.pendingTrade.toName,'Ece');
  assert.match(offerGuest.game.log[0],/Ali, Ece oyuncusuna takas teklifi gönderdi/);
  const eventCountHost=host.clientEvents.filter(e=>e.event==='monopoly:state').length;
  const eventCountGuest=guest.clientEvents.filter(e=>e.event==='monopoly:state').length;
  assert.equal(act(guest,'monopoly:trade-response',{decision:'accept'}).ok,true);
  const acceptedHost=latest(host),acceptedGuest=latest(guest);
  assert.equal(acceptedHost.revision,acceptedGuest.revision);
  assert.ok(host.clientEvents.filter(e=>e.event==='monopoly:state').length>eventCountHost);
  assert.ok(guest.clientEvents.filter(e=>e.event==='monopoly:state').length>eventCountGuest);
  assert.equal(acceptedHost.game.pendingTrade,null);
  assert.ok(acceptedHost.game.players[0].properties.includes(3));
  assert.ok(acceptedHost.game.players[1].properties.includes(1));
  assert.match(acceptedHost.game.log[0],/Ali ve Ece takası kabul etti/);
  assert.equal(acceptedGuest.game.log[0],acceptedHost.game.log[0]);
});
