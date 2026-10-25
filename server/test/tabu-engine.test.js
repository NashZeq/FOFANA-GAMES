'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../tabu-engine');
const players = [{id:'a',team:0},{id:'b',team:1},{id:'c',team:0}];
const rng = () => 0.01;
function game(){ return E.makeTabuGame(players,{duration:20,teamA:'Kuzey',teamB:'Güney'},rng); }
test('private online Tabu deck is separate from the public offline deck',()=>{
 const offline = require('../../games/tabu/cards');
 const publicWords = new Set(offline.flatMap(card => card).map(value => String(value).trim().toLocaleLowerCase('tr-TR')));
 assert.ok(E.CARDS.length >= 30);
 assert.equal(new Set(E.CARDS.map(c=>c[0].toLocaleLowerCase('tr-TR'))).size,E.CARDS.length);
 assert.ok(E.CARDS.every(c=>typeof c[0]==='string' && c[1].length===5));
 assert.ok(E.CARDS.every(card => !publicWords.has(card[0].trim().toLocaleLowerCase('tr-TR'))), 'online answer words must not appear in the public offline deck');
 assert.notEqual(E.CARDS, offline);
 for (const [word, forbidden] of E.CARDS) {
  const normalized = forbidden.map(value => value.trim().toLocaleLowerCase('tr-TR'));
  assert.ok(word.trim());
  assert.ok(forbidden.every(value => typeof value === 'string' && value.trim().length > 0));
  assert.equal(new Set(normalized).size, 5, `${word} has duplicate forbidden terms`);
  assert.ok(!normalized.includes(word.trim().toLocaleLowerCase('tr-TR')), `${word} must not be one of its forbidden terms`);
 }
});
test('game requires players on both teams and clamps duration',()=>{
 assert.throws(()=>E.makeTabuGame([{id:'a',team:0},{id:'b',team:0}],{}),/takımda/);
 const g=E.makeTabuGame([{id:'a',team:0},{id:'b',team:1}],{duration:999}); assert.equal(g.duration,180);
});
test('turn starts with card and only active team can score',()=>{
 const g=game(); E.startTurn(g,0,rng); assert.equal(g.active,true); assert.ok(E.publicTabuGame(g).card.word);
 assert.throws(()=>E.action(g,1,'correct',rng),/sırası gelen/); E.action(g,0,'correct',rng); assert.equal(g.score[0],1);
});
test('taboo penalty cannot make score negative and skip advances card',()=>{
 const g=game(); E.startTurn(g,0,rng); E.action(g,0,'taboo',rng); assert.equal(g.score[0],0); assert.ok(g.cardIndex>=0);
 assert.throws(()=>E.action(g,0,'bad',rng),/Geçersiz/);
});
test('pause, resume and timer expiry switch teams',()=>{
 const g=game(); E.startTurn(g,0,rng); E.pauseTurn(g,0); assert.equal(g.paused,true); E.resumeTurn(g,0); assert.equal(g.active,true);
 for(let i=0;i<20;i++) E.tick(g); assert.equal(g.team,1); assert.equal(g.phase,'ready'); assert.equal(g.timeLeft,20);
});
test('reset clears scores, used cards and current turn',()=>{
 const g=game(); E.startTurn(g,0,rng); E.action(g,0,'correct',rng); E.resetGame(g); assert.deepEqual(g.score,[0,0]); assert.equal(g.team,0); assert.equal(g.cardIndex,-1); assert.equal(g.active,false);
});

test('a finished game cannot accidentally start another turn without reset',()=>{
 const g=game(); g.phase='finished'; g.active=false; g.paused=false;
 assert.throws(()=>E.startTurn(g,0,rng),/başlatılamıyor/);
});


test('Tabu match ends at the selected target score and reset clears the winner',()=>{
 const g=E.makeTabuGame(players,{duration:20,targetScore:10},rng);
 assert.equal(g.targetScore,10);
 E.startTurn(g,0,rng);
 for(let i=0;i<9;i++) E.action(g,0,'correct',rng);
 assert.equal(g.phase,'playing');
 E.action(g,0,'correct',rng);
 assert.equal(g.score[0],10);
 assert.equal(g.phase,'finished');
 assert.equal(g.active,false);
 assert.equal(g.winner,0);
 assert.throws(()=>E.startTurn(g,0,rng),/başlatılamıyor/);
 E.resetGame(g);
 assert.equal(g.phase,'ready');
 assert.equal(g.winner,null);
 assert.equal(g.score[0],0);
});

test('unsupported target scores fall back to 15',()=>{
 assert.equal(E.makeTabuGame(players,{targetScore:11},rng).targetScore,15);
});


test('game rejects duplicate player IDs and invalid team assignments before creating state',()=>{
 assert.throws(()=>E.makeTabuGame([{id:'same',team:0},{id:'same',team:1}],{}),/benzersiz/);
 assert.throws(()=>E.makeTabuGame([{id:'a',team:0},{id:'b',team:1},{id:'c',team:2}],{}),/geçerli kimliği/);
 assert.throws(()=>E.makeTabuGame([{id:'',team:0},{id:'b',team:1}],{}),/geçerli kimliği/);
 assert.throws(()=>E.makeTabuGame(null,{}),/2 ile 12/);
});
