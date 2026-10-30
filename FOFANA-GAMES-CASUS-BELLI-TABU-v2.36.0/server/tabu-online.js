'use strict';
const { randomBytes } = require('node:crypto');
const Engine = require('./tabu-engine');

function attachTabu(io) {
  const rooms = new Map();
  const timers = new Map();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function makeCode() {
    let code;
    do { code = Array.from({length: 6}, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join(''); }
    while (rooms.has(code));
    return code;
  }
  function emitRoom(room) {
    for (const id of Object.keys(room.players)) io.to(id).emit('tabu:state', Engine.publicRoom(room, id));
  }
  function stopTimer(code) { const timer = timers.get(code); if (timer) clearInterval(timer); timers.delete(code); }
  function beginTimer(room) {
    stopTimer(room.code);
    const timer = setInterval(() => {
      if (!room.game || room.game.turnPhase !== 'active') { stopTimer(room.code); return; }
      if (Date.now() >= room.game.turnEndsAt) {
        Engine.finishTurn(room);
        stopTimer(room.code);
        emitRoom(room);
        io.to(room.code).emit('tabu:notice', {message: 'Süre bitti. Sıra diğer takıma geçti.'});
      } else emitRoom(room);
    }, 1000);
    timer.unref?.();
    timers.set(room.code, timer);
  }
  function currentRoom(socket) {
    const code = socket.data.tabuRoomCode, room = code && rooms.get(code);
    if (!room || !room.players[socket.id]) throw new Error('Önce bir Tabu odasına katılmalısın.');
    return room;
  }
  function ackError(ack, error) { ack({ok:false,error:error.message || String(error)}); }
  io.on('connection', socket => {
    socket.on('tabu:create', (payload={}, ack=()=>{}) => {
      try {
        if (socket.data.tabuRoomCode) throw new Error('Önce mevcut Tabu odandan ayrıl.');
        const name = Engine.cleanName(payload.name);
        if (!name) throw new Error('Oyuncu adı gerekli.');
        const code = makeCode();
        const room = Engine.createRoom({code,hostId:socket.id,name});
        rooms.set(code,room);
        socket.join(code); socket.data.tabuRoomCode=code;
        const player=room.players[socket.id];
        ack({ok:true,code,playerId:socket.id,resumeToken:player.resumeToken,room:Engine.publicRoom(room,socket.id)});
        emitRoom(room);
      } catch(e) { ackError(ack,e); }
    });
    socket.on('tabu:join', (payload={}, ack=()=>{}) => {
      try {
        if (socket.data.tabuRoomCode) throw new Error('Önce mevcut Tabu odandan ayrıl.');
        const code=String(payload.code||'').trim().toUpperCase(), room=rooms.get(code);
        if (!room) throw new Error('Bu Tabu oda kodu bulunamadı.');
        const name=Engine.cleanName(payload.name);
        if (!name) throw new Error('Oyuncu adı gerekli.');
        if (Object.values(room.players).some(p=>p.name.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'))) throw new Error('Bu isim odada kullanılıyor.');
        Engine.joinRoom(room,{playerId:socket.id,name});
        socket.join(code); socket.data.tabuRoomCode=code;
        const player=room.players[socket.id];
        ack({ok:true,code,playerId:socket.id,resumeToken:player.resumeToken,room:Engine.publicRoom(room,socket.id)});
        emitRoom(room);
      } catch(e) { ackError(ack,e); }
    });
    socket.on('tabu:set-team',(payload={},ack=()=>{})=>{
      try { const room=currentRoom(socket); Engine.setTeam(room,socket.id,payload.team); emitRoom(room); ack({ok:true}); }
      catch(e){ackError(ack,e);}
    });
    socket.on('tabu:ready',(payload={},ack=()=>{})=>{
      try { const room=currentRoom(socket); Engine.setReady(room,socket.id,payload.ready!==false); emitRoom(room); ack({ok:true}); }
      catch(e){ackError(ack,e);}
    });
    socket.on('tabu:start',(payload={},ack=()=>{})=>{
      try { const room=currentRoom(socket); Engine.startGame(room,socket.id,payload); emitRoom(room); io.to(room.code).emit('tabu:notice',{message:'Oyun başladı. Sırası gelen anlatıcı turu başlatabilir.'}); ack({ok:true}); }
      catch(e){ackError(ack,e);}
    });
    socket.on('tabu:start-turn',(_payload,ack=()=>{})=>{
      try { const room=currentRoom(socket); Engine.startTurn(room,socket.id); beginTimer(room); emitRoom(room); ack({ok:true}); }
      catch(e){ackError(ack,e);}
    });
    socket.on('tabu:action',(payload={},ack=()=>{})=>{
      try {
        const room=currentRoom(socket); Engine.applyAction(room,socket.id,String(payload.kind||''));
        if(room.status==='finished') { stopTimer(room.code); io.to(room.code).emit('tabu:notice',{message:`${room.game.winner} takımı kazandı!`}); }
        emitRoom(room); ack({ok:true});
      } catch(e){ackError(ack,e);}
    });
    socket.on('tabu:back-to-lobby',(_payload,ack=()=>{})=>{
      try { const room=currentRoom(socket); Engine.returnToLobby(room,socket.id); stopTimer(room.code); emitRoom(room); ack({ok:true}); }
      catch(e){ackError(ack,e);}
    });
    socket.on('tabu:leave',(_payload,ack=()=>{})=>{
      try {
        const room=currentRoom(socket), code=room.code;
        socket.leave(code); socket.data.tabuRoomCode=null;
        stopTimer(code);
        const deleted=Engine.leaveRoom(room,socket.id);
        if(deleted) rooms.delete(code); else { emitRoom(room); io.to(code).emit('tabu:notice',{message:'Bir oyuncu odadan ayrıldı. Lobi sıfırlandı.'}); }
        ack({ok:true});
      } catch(e){ackError(ack,e);}
    });
    socket.on('disconnect',()=>{
      const code=socket.data.tabuRoomCode, room=code&&rooms.get(code);
      if(!room||!room.players[socket.id]) return;
      const deleted=Engine.leaveRoom(room,socket.id);
      if(deleted){stopTimer(code);rooms.delete(code);}
      else { if(room.status==='playing') stopTimer(code); emitRoom(room); }
    });
  });
  return rooms;
}
module.exports={attachTabu};
