'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeSocket {
  constructor(id, io) {
    this.id=id; this.io=io; this.connected=true; this.data={}; this.rooms=new Set([id]);
    this.serverHandlers=new Map(); this.clientHandlers=new Map(); this.clientEvents=[];
  }
  on(event,fn){this.serverHandlers.set(event,fn);return this;}
  clientOn(event,fn){const list=this.clientHandlers.get(event)||[];list.push(fn);this.clientHandlers.set(event,list);}
  join(room){this.rooms.add(room);}
  leave(room){this.rooms.delete(room);}
  emit(event,...args){this.clientEvents.push({event,args});for(const fn of this.clientHandlers.get(event)||[])fn(...args);}
  clientEmit(event,payload={},ack=()=>{}){const fn=this.serverHandlers.get(event);if(!fn)throw new Error(`No handler: ${event}`);fn(payload,ack);}
  disconnect(){if(!this.connected)return;this.connected=false;const fn=this.serverHandlers.get('disconnect');if(fn)fn('transport close');this.io.sockets.delete(this.id);}
}
class FakeSocketServer {
  constructor(){this.handlers=new Map();this.sockets=new Map();this.namespace={sockets:this.sockets};}
  on(event,fn){this.handlers.set(event,fn);return this;}
  of(){return this.namespace;}
  to(target){return{emit:(event,...args)=>{for(const socket of this.sockets.values())if(socket.connected&&(socket.id===target||socket.rooms.has(target)))socket.emit(event,...args);}};}
  connect(id){const socket=new FakeSocket(id,this);this.sockets.set(id,socket);this.handlers.get('connection')(socket);return socket;}
}
function loadServerWithFakeTransport(){
  const originalLoad=Module._load;
  const fakeExpress=()=>{const app=(_req,res)=>res.end('fake');app.disable=()=>app;app.get=()=>app;app.use=()=>app;return app;};
  fakeExpress.static=()=>(_req,_res,next)=>next?.();
  Module._load=function(request,parent,isMain){
    if(request==='express')return fakeExpress;
    if(request==='socket.io')return{Server:class extends FakeSocketServer{constructor(){super();global.__fofanaTabuFakeIO=this;}}};
    return originalLoad.call(this,request,parent,isMain);
  };
  try{return require('../index');}finally{Module._load=originalLoad;}
}
const app=loadServerWithFakeTransport();
const io=global.__fofanaTabuFakeIO;
let counter=0;
const connect=()=>io.connect(`tabu-socket-${++counter}`);
const act=(socket,event,payload={})=>{let response;socket.clientEmit(event,payload,result=>{response=result;});return response;};
const create=(socket,name)=>act(socket,'tabu:create',{name});
const join=(socket,code,name,team='auto')=>act(socket,'tabu:join',{code,name,team});

test('Tabu online room forwards selected target score and privately sends the active card',()=>{
  const host=connect(), created=create(host,'Oda Sahibi');
  assert.equal(created.ok,true);assert.match(created.resumeToken,/^[a-f0-9]{64}$/);
  const guest=connect();assert.equal(join(guest,created.code,'Oyuncu B').ok,true);
  const room=app.tabuRooms.get(created.code);
  assert.equal(act(host,'tabu:start',{duration:30,targetScore:20,teamA:'Kuzey',teamB:'Güney'}).ok,true);
  assert.equal(room.game.targetScore,20,'server must honour target-score setting');
  let hostState=null, guestState=null;
  host.clientOn('tabu:state',state=>{hostState=state;});guest.clientOn('tabu:state',state=>{guestState=state;});
  assert.equal(act(host,'tabu:start-turn').ok,true);
  assert.ok(hostState.game.card?.word);
  assert.equal(guestState.game.card,null);
  assert.equal(JSON.stringify(guestState).includes(created.resumeToken),false);
  assert.equal(act(guest,'tabu:action',{kind:'correct'}).ok,false,'non-speaker cannot mutate score');
  assert.equal(room.game.score[0],0);
  act(host,'tabu:reset');
});

test('Tabu speaker reconnect preserves turn, remaining time, team, card and host with rotated token',()=>{
  const host=connect(), created=create(host,'Oda Sahibi');
  const guest=connect();join(guest,created.code,'Oyuncu B');
  const room=app.tabuRooms.get(created.code);
  act(host,'tabu:start',{duration:45,targetScore:10,teamA:'A',teamB:'B'});
  assert.equal(act(host,'tabu:start-turn').ok,true);
  const oldCardIndex=room.game.cardIndex;
  room.game.timeLeft=31;
  host.disconnect();
  assert.equal(room.players[host.id].connected,false);
  assert.equal(room.game.phase,'paused');
  assert.equal(room.game.timeLeft,31);
  assert.equal(room.hostId,guest.id,'host control is temporarily transferred');
  const recovered=connect();
  let privateState=null;recovered.clientOn('tabu:state',state=>{privateState=state;});
  const result=act(recovered,'tabu:session-resume',{code:created.code,resumeToken:created.resumeToken});
  assert.equal(result.ok,true,result.error);
  assert.notEqual(result.resumeToken,created.resumeToken);
  assert.equal(room.players[host.id],undefined);
  assert.equal(room.players[recovered.id].name,'Oda Sahibi');
  assert.equal(room.players[recovered.id].team,0);
  assert.equal(room.hostId,recovered.id,'original host regains control during recovery window');
  assert.equal(room.game.speakerId,recovered.id);
  assert.equal(room.game.phase,'playing');
  assert.equal(room.game.active,true);
  assert.equal(room.game.timeLeft,31);
  assert.equal(room.game.cardIndex,oldCardIndex);
  assert.ok(privateState.game.card?.word,'speaker receives the same active card after reconnect');
  assert.equal(act(connect(),'tabu:session-resume',{code:created.code,resumeToken:created.resumeToken}).ok,false,'old rotated token cannot be replayed');
  act(recovered,'tabu:leave');
  act(guest,'tabu:leave');
});

test('Tabu non-speaker disconnect does not interrupt the active turn; explicit leave cleans up immediately',()=>{
  const host=connect(), created=create(host,'Anlatıcı');
  const guest=connect(), guestJoin=join(guest,created.code,'Oyuncu B');
  const room=app.tabuRooms.get(created.code);
  act(host,'tabu:start',{duration:45,targetScore:10});act(host,'tabu:start-turn');
  guest.disconnect();
  assert.equal(room.game.active,true);
  assert.equal(room.game.speakerId,host.id);
  const third=connect();assert.equal(join(third,created.code,'Oyuncu C').ok,false,'players may not join mid-match');
  assert.equal(act(host,'tabu:leave').ok,true);
  assert.equal(room.status,'lobby','room returns to lobby rather than leaving one team absent');
  assert.equal(room.game,null);
  const guestRecovered=connect();
  assert.equal(act(guestRecovered,'tabu:session-resume',{code:created.code,resumeToken:'f'.repeat(64)}).ok,false,'unknown token is rejected');
  assert.equal(act(guestRecovered,'tabu:session-resume',{code:created.code,resumeToken:guestJoin.resumeToken}).ok,true,'valid disconnected guest can recover during the grace window');
  act(guestRecovered,'tabu:leave');
  act(third,'tabu:leave');
});

test('Tabu removes an expired disconnected speaker and leaves a valid lobby for the connected host',()=>{
  const host=connect(), created=create(host,'Anlatıcı');
  const guest=connect();join(guest,created.code,'Takım B',1);
  const room=app.tabuRooms.get(created.code);
  assert.equal(act(host,'tabu:start',{duration:30,targetScore:10}).ok,true);
  assert.equal(act(host,'tabu:start-turn').ok,true);
  host.disconnect();
  const timer=room.players[host.id].resumeTimer;
  assert.equal(room.game.phase,'paused');
  assert.equal(typeof timer?._onTimeout,'function');
  timer._onTimeout(); // Trigger the real 90-second expiry callback without waiting 90 seconds.
  assert.equal(room.players[host.id],undefined);
  assert.equal(room.disconnectedHostId,null);
  assert.equal(room.hostId,guest.id,'the assigned live host must not be displaced when old host expires');
  assert.equal(room.status,'lobby');
  assert.equal(room.game,null,'a match cannot continue with only one team represented');
  assert.equal(room.timer,null);
  act(guest,'tabu:leave');
});

test('Tabu host can return to the lobby only after a winner is declared',()=>{
  const host=connect(), created=create(host,'Kurucu');
  const guest=connect();join(guest,created.code,'Rakip');
  const room=app.tabuRooms.get(created.code);
  assert.equal(act(host,'tabu:start',{duration:30,targetScore:10}).ok,true);
  assert.equal(act(host,'tabu:back-to-lobby').ok,false,'cannot abandon an active match');
  assert.equal(act(host,'tabu:start-turn').ok,true);
  for(let i=0;i<10;i++) assert.equal(act(host,'tabu:action',{kind:'correct'}).ok,true);
  assert.equal(room.game.phase,'finished');
  assert.equal(act(guest,'tabu:back-to-lobby').ok,false,'only host can return to lobby');
  assert.equal(act(host,'tabu:back-to-lobby').ok,true);
  assert.equal(room.status,'lobby');assert.equal(room.game,null);
  assert.equal(act(host,'tabu:start',{duration:45,targetScore:30}).ok,true,'host can start a new match with different settings');
  assert.equal(room.game.targetScore,30);
  act(host,'tabu:reset');act(host,'tabu:leave');act(guest,'tabu:leave');
});

test('Tabu grants a temporary host when the only host disconnects in the lobby, and old host reclaims it',()=>{
  const host=connect(), created=create(host,'Kurucu');
  host.disconnect();
  const guest=connect(), guestJoin=join(guest,created.code,'İlk Misafir');
  assert.equal(guestJoin.ok,true);
  const room=app.tabuRooms.get(created.code);
  assert.equal(room.hostId,guest.id,'first connected guest must be able to start the room');
  const recovered=connect();
  let notice='';recovered.clientOn('tabu:notice',data=>{notice=data.message;});
  const result=act(recovered,'tabu:session-resume',{code:created.code,resumeToken:created.resumeToken});
  assert.equal(result.ok,true);
  assert.equal(room.hostId,recovered.id,'original host reclaims ownership');
  assert.match(notice,/oda sahipliğini geri aldı/);
  act(recovered,'tabu:leave');act(guest,'tabu:leave');
});

test('Tabu removes disconnected lobby reservations before starting a match',()=>{
  const host=connect(), created=create(host,'Kurucu');
  const guestA=connect();const a=join(guestA,created.code,'Takım B',1);
  const guestB=connect();join(guestB,created.code,'Takım A',0);
  const guestC=connect();join(guestC,created.code,'İkinci B',1);
  guestA.disconnect();
  const room=app.tabuRooms.get(created.code);
  assert.equal(act(host,'tabu:start',{duration:30,targetScore:10}).ok,true);
  assert.equal(room.players[guestA.id],undefined,'disconnected lobby player must not become a ghost in match');
  assert.equal(room.game.phase,'ready');
  act(host,'tabu:reset');act(host,'tabu:leave');act(guestB,'tabu:leave');act(guestC,'tabu:leave');
});

test('Tabu rejects invalid recovery tokens, rotates valid tokens and never leaks tokens',()=>{
  const host=connect(), created=create(host,'Sahip');
  const guest=connect();join(guest,created.code,'Misafir');
  const room=app.tabuRooms.get(created.code);
  host.disconnect();
  const attacker=connect();
  assert.equal(act(attacker,'tabu:session-resume',{code:created.code,resumeToken:'x'.repeat(64)}).ok,false);
  const state=room.players[guest.id];
  assert.equal(state.connected,true);
  for(const socket of [...io.sockets.values()]) if(socket.id===attacker.id) act(socket,'tabu:leave');
  const resumed=connect();
  assert.equal(act(resumed,'tabu:session-resume',{code:created.code,resumeToken:created.resumeToken}).ok,true,'reconnect failed');
  const serialized=resumed.clientEvents.filter(e=>e.event==='tabu:state').at(-1)?.args[0];
  assert.equal(JSON.stringify(serialized).includes(created.resumeToken),false);
  act(resumed,'tabu:leave');act(guest,'tabu:leave');
});

test("Tabu keeps the original room owner's recovery claim through successive temporary-host disconnects",()=>{
  const host=connect(), created=create(host,'Asıl Sahip');
  const interim=connect();join(interim,created.code,'Geçici Sahip');
  const guest=connect();join(guest,created.code,'Diğer Oyuncu');
  const room=app.tabuRooms.get(created.code);
  host.disconnect();
  assert.equal(room.hostId,interim.id);
  assert.equal(room.disconnectedHostId,host.id);
  interim.disconnect();
  assert.equal(room.hostId,guest.id);
  assert.equal(room.disconnectedHostId,host.id,'temporary host disconnect must not overwrite the original owner recovery claim');
  const recovered=connect();
  const result=act(recovered,'tabu:session-resume',{code:created.code,resumeToken:created.resumeToken});
  assert.equal(result.ok,true,result.error);
  assert.equal(room.hostId,recovered.id);
  assert.equal(room.disconnectedHostId,null);
  assert.equal(room.players[interim.id].connected,false);
  act(recovered,'tabu:leave');
  act(guest,'tabu:leave');
  const expiry=room.players[interim.id]?.resumeTimer;
  if(expiry?._onTimeout) expiry._onTimeout();
});

test('Tabu rejects malformed room codes before room lookup or recovery token processing',()=>{
  const socket=connect();
  const joined=act(socket,'tabu:join',{code:'../../server/tabu-cards.js',name:'Test'});
  assert.equal(joined.ok,false);
  assert.match(joined.error,/Oda kodu/);
  const resumed=act(socket,'tabu:session-resume',{code:'%2f%2f',resumeToken:'a'.repeat(64)});
  assert.equal(resumed.ok,false);
  assert.match(resumed.error,/Oda kodu/);
});

test('Tabu players can change teams in the lobby without leaving a connected team empty, but not during a match',()=>{
  const host=connect(), created=create(host,'Kurucu');
  const teamB1=connect();assert.equal(join(teamB1,created.code,'B Oyuncu 1',1).ok,true);
  const teamA2=connect();assert.equal(join(teamA2,created.code,'A Oyuncu 2',0).ok,true);
  const teamB2=connect();assert.equal(join(teamB2,created.code,'B Oyuncu 2',1).ok,true);
  const room=app.tabuRooms.get(created.code);
  assert.equal(act(teamB1,'tabu:set-team',{team:7}).ok,false,'unsupported team values are rejected');
  assert.equal(act(teamB1,'tabu:set-team',{team:0}).ok,true,'a player can rebalance their own team in the lobby');
  assert.equal(room.players[teamB1.id].team,0);
  const emptyTeam=act(teamB2,'tabu:set-team',{team:0});
  assert.equal(emptyTeam.ok,false,'last connected player may not leave a team empty');
  assert.match(emptyTeam.error,/Her iki takımda/);
  assert.equal(room.players[teamB2.id].team,1);
  assert.equal(act(host,'tabu:start',{duration:30,targetScore:10}).ok,true);
  const duringGame=act(teamB2,'tabu:set-team',{team:0});
  assert.equal(duringGame.ok,false,'teams are locked once the match begins');
  assert.match(duringGame.error,/yalnızca lobide/);
  act(host,'tabu:leave');act(teamB1,'tabu:leave');act(teamA2,'tabu:leave');act(teamB2,'tabu:leave');
});
