'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeSocket {
  constructor(id, io) { this.id=id; this.io=io; this.connected=true; this.data={}; this.rooms=new Set([id]); this.serverHandlers=new Map(); this.clientHandlers=new Map(); this.clientEvents=[]; }
  on(event,fn){const list=this.clientHandlers.get(event)||[];list.push(fn);this.clientHandlers.set(event,list);return this;}
  serverOn(event,fn){this.serverHandlers.set(event,fn);return this;}
  join(room){this.rooms.add(room);} leave(room){this.rooms.delete(room);}
  emit(event,...args){this.clientEvents.push({event,args});for(const fn of this.clientHandlers.get(event)||[])fn(...args);}
  clientEmit(event,payload={},ack=()=>{}){const fn=this.io.connectionHandlers.get(this.id)?.get(event);if(!fn)throw new Error(`No handler: ${event}`);fn(payload,ack);}
  disconnect(){if(!this.connected)return;this.connected=false;const fn=this.io.disconnectHandlers.get(this.id);if(fn)fn('transport close');this.io.sockets.delete(this.id);}
}
class FakeSocketServer {
  constructor(){this.handlers=new Map();this.sockets=new Map();this.connectionHandlers=new Map();this.disconnectHandlers=new Map();this.namespace={sockets:this.sockets};}
  on(event,fn){this.handlers.set(event,fn);return this;} of(){return this.namespace;}
  to(target){return{emit:(event,...args)=>{for(const socket of this.sockets.values())if(socket.connected&&(socket.id===target||socket.rooms.has(target)))socket.emit(event,...args);}};}
  connect(id){const socket=new FakeSocket(id,this);this.sockets.set(id,socket);this.handlers.get('connection')(socket);return socket;}
}
// Socket.IO normally stores listeners per connected socket; keep registration separate from client-visible listeners.
const realOn = FakeSocket.prototype.on;
FakeSocket.prototype.on = function(event,fn){
  if(event==='disconnect') this.io.disconnectHandlers.set(this.id,fn);
  else { const map=this.io.connectionHandlers.get(this.id)||new Map(); map.set(event,fn); this.io.connectionHandlers.set(this.id,map); }
  return this;
};
function loadServer(){
  const originalLoad=Module._load;
  const fakeExpress=()=>{const app=(_req,res)=>res.end('fake');app.disable=()=>app;app.get=()=>app;app.use=()=>app;return app;};
  fakeExpress.static=()=> (_req,_res,next)=>next?.();
  Module._load=function(request,parent,isMain){
    if(request==='express')return fakeExpress;
    if(request==='socket.io')return{Server:class extends FakeSocketServer{constructor(){super();global.__fofanaIskIO=this;}}};
    return originalLoad.call(this,request,parent,isMain);
  };
  try{return require('../index');}finally{Module._load=originalLoad;}
}
const app=loadServer(), io=global.__fofanaIskIO;
let counter=0;
const connect=()=>io.connect('isk-fake-'+(++counter));
const act=(socket,event,payload={})=>{let response;socket.clientEmit(event,payload,result=>{response=result;});return response;};
const create=(socket,name)=>act(socket,'isk:create',{name});
const join=(socket,code,name)=>act(socket,'isk:join',{code,name});

test('online Iskembeden creates per-player recovery tokens without leaking them in public room state',()=>{
  const host=connect(), created=create(host,'Ada'); assert.equal(created.ok,true); assert.match(created.resumeToken,/^[a-f0-9]{64}$/);
  const guest=connect(), joined=join(guest,created.code,'Bora'); assert.equal(joined.ok,true); assert.match(joined.resumeToken,/^[a-f0-9]{64}$/);
  const state=guest.clientEvents.filter(e=>e.event==='isk:state').at(-1)?.args[0];
  assert.ok(state); assert.equal(JSON.stringify(state).includes(created.resumeToken),false); assert.equal(JSON.stringify(state).includes(joined.resumeToken),false);
  act(host,'isk:leave'); act(guest,'isk:leave');
});

test('Iskembeden reconnect preserves host, score, active guess and rotates recovery token',()=>{
  const host=connect(), created=create(host,'Ada'); const guest=connect(); join(guest,created.code,'Bora');
  const room=app.iskRooms.get(created.code);
  assert.equal(act(host,'isk:start',{category:'age',rounds:3}).ok,true);
  const answer=room.game.question.a;
  assert.equal(act(host,'isk:guess',{guess:answer}).ok,true);
  assert.equal(room.game.scores[host.id].score,100);
  const oldId=host.id, oldToken=created.resumeToken;
  host.disconnect();
  assert.equal(room.players[oldId].connected,false); assert.equal(room.hostId,guest.id);
  assert.equal(room.game.scores[oldId].score,100); assert.equal(room.game.submissions[oldId].guess,answer);
  const recovered=connect(); const resume=act(recovered,'isk:session-resume',{code:created.code,resumeToken:oldToken});
  assert.equal(resume.ok,true,resume.error); assert.notEqual(resume.resumeToken,oldToken);
  assert.equal(room.players[oldId],undefined); assert.equal(room.players[recovered.id].name,'Ada'); assert.equal(room.hostId,recovered.id);
  assert.equal(room.game.scores[recovered.id].score,100); assert.equal(room.game.submissions[recovered.id].guess,answer);
  assert.equal(act(connect(),'isk:session-resume',{code:created.code,resumeToken:oldToken}).ok,false,'rotated token cannot be replayed');
  const serialized=recovered.clientEvents.filter(e=>e.event==='isk:state').at(-1)?.args[0];
  assert.equal(JSON.stringify(serialized).includes(resume.resumeToken),false,'recovery token is not sent in room state');
  act(recovered,'isk:leave'); act(guest,'isk:leave');
});

test('Iskembeden rejects malformed room codes and explicit leave removes a player immediately',()=>{
  const host=connect(), created=create(host,'Ada'); const bad=connect();
  assert.equal(join(bad,'/%2f/','Intruder').ok,false);
  const guest=connect(); assert.equal(join(guest,created.code,'Bora').ok,true);
  const room=app.iskRooms.get(created.code); assert.ok(room.players[guest.id]);
  assert.equal(act(guest,'isk:leave').ok,true); assert.equal(room.players[guest.id],undefined); assert.equal(guest.data.iskRoomCode,undefined);
  act(host,'isk:leave');
});

test('disconnecting the temporary host does not erase the original host recovery claim',()=>{
  const host=connect(), created=create(host,'Ada'); const guest=connect(); join(guest,created.code,'Bora');
  const room=app.iskRooms.get(created.code); const originalId=host.id, token=created.resumeToken;
  host.disconnect(); assert.equal(room.disconnectedHostId,originalId); assert.equal(room.hostId,guest.id);
  guest.disconnect(); assert.equal(room.disconnectedHostId,originalId,'first disconnected owner remains the recovery claimant');
  const recovered=connect(); const resumed=act(recovered,'isk:session-resume',{code:created.code,resumeToken:token});
  assert.equal(resumed.ok,true,resumed.error); assert.equal(room.hostId,recovered.id); assert.equal(room.disconnectedHostId,null);
  act(recovered,'isk:leave');
});

test('Iskembeden full online match hides answers until all players guess, finishes, and returns to lobby', () => {
  const host = connect(), created = create(host, 'Ada');
  const guest = connect(), joined = join(guest, created.code, 'Bora');
  let room = null;
  try {
    assert.equal(created.ok, true); assert.equal(joined.ok, true);
    room = app.iskRooms.get(created.code);
    assert.equal(act(host, 'isk:start', { category: 'age', rounds: 3 }).ok, true);
    assert.equal(room.game.maxRounds, 3);
    assert.ok(room.timer, 'authoritative timer starts at match begin');

    for (let round = 1; round <= 3; round++) {
      const answer = room.game.question.a;
      assert.equal(act(host, 'isk:guess', { guess: answer }).ok, true);
      const beforeAllGuesses = guest.clientEvents.filter(e => e.event === 'isk:state').at(-1).args[0].game;
      assert.equal(beforeAllGuesses.answer, null, 'answer remains hidden while the guest has not submitted');
      assert.equal(beforeAllGuesses.allSubmitted, false);
      assert.equal(beforeAllGuesses.players.find(p => p.id === host.id).score, (round - 1) * 100, 'the current round score is hidden while previous rounds remain visible');

      assert.equal(act(guest, 'isk:guess', { guess: answer }).ok, true);
      const revealed = host.clientEvents.filter(e => e.event === 'isk:state').at(-1).args[0].game;
      assert.equal(revealed.answer, answer);
      assert.equal(revealed.allSubmitted, true);
      assert.equal(revealed.results.length, 2);
      assert.equal(room.timer, null, 'timer is cleared after all players submit');

      if (round < 3) {
        assert.equal(act(guest, 'isk:next').ok, false, 'only the host can advance');
        assert.equal(room.game.round, round);
        assert.equal(act(host, 'isk:next').ok, true);
        assert.equal(room.game.round, round + 1);
        assert.ok(room.timer, 'timer restarts for the next question');
      }
    }

    assert.equal(room.game.phase, 'finished');
    assert.equal(room.status, 'finished');
    assert.deepEqual(room.game.winnerIds.slice().sort(), [host.id, guest.id].sort(), 'equal points produce a tie');
    assert.equal(act(host, 'isk:next').ok, false, 'a finished match cannot advance beyond the round limit');
    assert.equal(act(host, 'isk:back-to-lobby').ok, true);
    assert.equal(room.status, 'lobby');
    assert.equal(room.game, null);
    assert.equal(room.timer, null);
    assert.equal(act(host, 'isk:start', { category: 'market', rounds: 3 }).ok, true, 'host can begin a fresh match in the same room');
    assert.equal(room.game.category, 'market');
  } finally {
    for (const socket of [host, guest]) {
      if (socket.data.iskRoomCode) { try { act(socket, 'isk:leave'); } catch {} }
    }
    if (room?.timer) clearInterval(room.timer);
    app.iskRooms.delete(created.code);
  }
});

test('Iskembeden rejects host-only actions from guests and isolates state between rooms', () => {
  const hostA = connect(), createdA = create(hostA, 'Ada');
  const guestA = connect(), joinedA = join(guestA, createdA.code, 'Bora');
  const hostB = connect(), createdB = create(hostB, 'Cem');
  const guestB = connect(), joinedB = join(guestB, createdB.code, 'Deniz');
  const roomA = app.iskRooms.get(createdA.code), roomB = app.iskRooms.get(createdB.code);
  try {
    assert.equal(createdA.ok && joinedA.ok && createdB.ok && joinedB.ok, true);
    assert.notEqual(createdA.code, createdB.code);
    assert.equal(act(guestA, 'isk:start', { category: 'age', rounds: 3 }).ok, false, 'guest cannot start a match');
    assert.equal(act(guestA, 'isk:back-to-lobby').ok, false, 'guest cannot reset room state');
    assert.equal(roomA.game, null);
    assert.equal(roomB.game, null);
    const guestBStatesBefore = guestB.clientEvents.filter(e => e.event === 'isk:state').length;
    assert.equal(act(hostA, 'isk:start', { category: 'age', rounds: 3 }).ok, true);
    assert.equal(roomA.status, 'playing');
    assert.equal(roomB.status, 'lobby');
    assert.equal(guestB.clientEvents.filter(e => e.event === 'isk:state').length, guestBStatesBefore, 'room B receives no room A state');
    assert.equal(act(guestA, 'isk:next').ok, false, 'guest cannot advance a question');
    assert.equal(act(guestA, 'isk:leave').ok, true);
    assert.equal(roomA.players[guestA.id], undefined);
  } finally {
    for (const socket of [hostA, guestA, hostB, guestB]) {
      if (socket.data.iskRoomCode) { try { act(socket, 'isk:leave'); } catch {} }
    }
    for (const room of [roomA, roomB]) if (room?.timer) clearInterval(room.timer);
    app.iskRooms.delete(createdA.code); app.iskRooms.delete(createdB.code);
  }
});

test('category vote starts Iskembeden only after every connected player is ready', () => {
  const host = connect(), created = create(host, 'OyuncuA');
  const guest = connect(); join(guest, created.code, 'OyuncuB');
  const room = app.iskRooms.get(created.code);
  const first = act(host, 'isk:ready', { category: 'market', ready: true });
  assert.equal(first.ok, true);
  assert.equal(room.status, 'lobby', 'one ready player cannot start the match');
  const second = act(guest, 'isk:ready', { category: 'car', ready: true });
  assert.equal(second.ok, true);
  assert.equal(room.status, 'playing');
  assert.ok(['market', 'car'].includes(room.game.category), 'majority/tie-break result must be a submitted category');
  assert.equal(room.game.maxRounds, 5);
  act(host, 'isk:leave'); act(guest, 'isk:leave');
});
