'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, rollDice, useJailCard, buyProperty, endTurn, publicGame, BOARD, rent, mortgageProperty, manageBuilding, tradeProperties, respondTrade, bidAuction, passAuction, payDebt, declareBankruptcy, forfeitDisconnectedPlayer, liquidationProceeds } = require('../monopoly-engine');
function seq(...values){let i=0;return ()=>values[i++%values.length]}
function players(){return [{id:'a',name:'Ada'},{id:'b',name:'Bora'}]}
test('Monopoly starts with 2-4 players at 1500 and 40 spaces',()=>{
 const g=createGame(players());
 assert.equal(g.players.length,2);assert.equal(g.players[0].cash,1500);assert.equal(BOARD.length,40);
 assert.throws(()=>createGame([{id:'a',name:'Ada'}]),/2–4/);
 assert.throws(()=>createGame(Array.from({length:5},(_,i)=>({id:String(i),name:'P'+i}))),/2–4/);
});
test('only current player may roll and each roll is server-authoritative',()=>{
 const g=createGame(players(),()=>0);assert.throws(()=>rollDice(g,'b'),/Sıra sende değil/);g.players[0].pos=1;
 const state=rollDice(g,'a');assert.deepEqual(state.lastDice,[1,1]);assert.equal(g.players[0].pos,3);assert.equal(state.pendingBuy,3);
});
test('passing start grants 200 and landing on unowned property requires buy decision',()=>{
 const g=createGame(players(),seq(0,0.2));g.players[0].pos=38;
 const state=rollDice(g,'a');
 assert.equal(g.players[0].cash,1700);
 assert.equal(state.pendingBuy,1);
 assert.throws(()=>endTurn(g,'a'),/satın alma/);
 buyProperty(g,'a',false);assert.equal(g.pendingBuy,null);assert.equal(g.players[0].properties.length,0);
});
test('purchase debits cash and assigns property, and rejects unaffordable purchase',()=>{
 const g=createGame(players(),()=>0);g.players[0].pos=39;rollDice(g,'a');buyProperty(g,'a',true);
 assert.equal(g.players[0].properties[0],1);assert.equal(g.players[0].cash,1640);
 const g2=createGame(players(),()=>0);g2.players[0].pos=39;rollDice(g2,'a');g2.players[0].cash=10;
 assert.throws(()=>buyProperty(g2,'a',true),/paran yok/);
});
test('double roll preserves extra turn after buy or skip decision',()=>{
 const g=createGame(players(),()=>0.99); // six + six? random is sampled twice, 0.99 gives 6,6
 rollDice(g,'a');assert.equal(g.pendingBuy,12);assert.equal(g.mustRollAgain,true);
 buyProperty(g,'a',false);assert.equal(g.pendingAuction,null);assert.equal(g.players.some(p=>p.properties.includes(12)),false);assert.equal(g.rolled,false);assert.equal(g.mustRollAgain,true);
 assert.equal(publicGame(g).canRoll,true);
});
test('rent calculation doubles base rent for complete group and utility rent depends on owned count',()=>{
 const g=createGame(players());const owner=g.players[0];
 owner.properties=[1,3];assert.equal(rent(g,owner,1),4);
 owner.properties=[12];assert.equal(rent(g,owner,12,8),32);
 owner.properties=[12,28];assert.equal(rent(g,owner,12,8),80);
});
test('rent is paid to owner and current player advances after end turn',()=>{
 const g=createGame(players(),seq(0,0.2));g.players[1].properties=[3];g.players[0].pos=0;
 rollDice(g,'a');assert.equal(g.players[0].cash,1496);assert.equal(g.players[1].cash,1504);
 const state=endTurn(g,'a');assert.equal(state.current,1);assert.equal(state.currentPlayerId,'b');
});
test('cannot end turn before rolling; declining a property no longer opens an auction',()=>{
 const g=createGame(players(),seq(0,0.2));assert.throws(()=>endTurn(g,'a'),/Önce zar/);
 rollDice(g,'a');buyProperty(g,'a',false);assert.equal(g.pendingAuction,null);assert.equal(g.pendingBuy,null);
 assert.throws(()=>rollDice(g,'a'),/zaten zar/);
});
test('finished game exposes winner and rejects further rolls',()=>{
 const g=createGame(players(),()=>0);g.players[1].bankrupt=true;
 g.phase='finished';g.winnerId='a';
 assert.equal(publicGame(g).winnerId,'a');assert.throws(()=>rollDice(g,'a'),/aktif değil/);
});

test('rent that cannot be paid opens a debt-resolution phase before bankruptcy',()=>{
 const g=createGame(players(),seq(0,0.2));
 g.players[1].properties=[3];
 g.players[0].cash=1;
 rollDice(g,'a');
 assert.equal(g.players[0].bankrupt,false);
 assert.equal(g.pendingDebt.debtorId,'a');
 assert.equal(g.pendingDebt.amount,4);
 assert.throws(()=>rollDice(g,'a'),/Önce borcu/);
 assert.throws(()=>payDebt(g,'b'),/yalnızca borçlu/);
 assert.equal(declareBankruptcy(g,'a').phase,'finished');
 assert.equal(g.players[0].bankrupt,true);
 assert.equal(g.winnerId,'b');
 assert.equal(g.players[1].cash,1501);
});


test('online mortgage pays half value and removing mortgage costs 55 percent',()=>{
 const g=createGame(players());g.players[0].properties=[1];const before=g.players[0].cash;
 mortgageProperty(g,'a',1);assert.equal(g.players[0].cash,before+30);assert.deepEqual(g.players[0].mortgaged,[1]);
 mortgageProperty(g,'a',1,true);assert.equal(g.players[0].cash,before-3);assert.deepEqual(g.players[0].mortgaged,[]);
});
test('online mortgage rejects property in a group with buildings',()=>{
 const g=createGame(players());g.players[0].properties=[1,3];g.players[0].buildings[1]=1;
 assert.throws(()=>mortgageProperty(g,'a',1),/bina varken/);
});
test('online house construction requires full group and builds evenly',()=>{
 const g=createGame(players());g.players[0].properties=[1,3];
 manageBuilding(g,'a',1);assert.equal(g.players[0].buildings[1],1);assert.equal(g.players[0].cash,1450);
 assert.throws(()=>manageBuilding(g,'a',1),/dengeli/);
 manageBuilding(g,'a',3);assert.equal(g.players[0].buildings[3],1);
});
test('online building sale refunds half cost and respects even-building rule',()=>{
 const g=createGame(players());g.players[0].properties=[1,3];g.players[0].buildings={1:1,3:1};
 manageBuilding(g,'a',1,true);assert.equal(g.players[0].cash,1525);assert.equal(g.players[0].buildings[1],undefined);
});
test('online trade requires recipient acceptance and transfers money and property',()=>{
 const g=createGame(players());g.players[0].properties=[1];g.players[1].properties=[3];
 tradeProperties(g,'a',{toId:'b',giveIndex:1,takeIndex:3,cashOut:20,cashIn:5});
 assert.deepEqual(g.players[0].properties,[1]);assert.equal(publicGame(g).pendingTrade.toId,'b');
 assert.throws(()=>respondTrade(g,'a','accept'),/alıcı/);
 respondTrade(g,'b','accept');assert.deepEqual(g.players[0].properties,[3]);assert.deepEqual(g.players[1].properties,[1]);assert.equal(g.players[0].cash,1485);assert.equal(g.players[1].cash,1515);assert.equal(publicGame(g).pendingTrade,null);
});
test('online trade may be rejected and building properties cannot be traded',()=>{
 const g=createGame(players());g.players[0].properties=[1];g.players[0].buildings[1]=1;
 assert.throws(()=>tradeProperties(g,'a',{toId:'b',giveIndex:1,cashOut:0,cashIn:0}),/bina bulunan/);
 g.players[0].buildings={};tradeProperties(g,'a',{toId:'b',giveIndex:1});respondTrade(g,'b','reject');assert.deepEqual(g.players[0].properties,[1]);assert.equal(publicGame(g).pendingTrade,null);
});


test('auction mechanics are removed and a declined property stays with the bank',()=>{
 const g=createGame(players());g.pendingBuy=1;g.rolled=true;
 const result=buyProperty(g,'a',false);
 assert.equal(g.pendingAuction,null);assert.equal(g.pendingBuy,null);
 assert.equal(g.players[0].properties.includes(1),false);
 assert.ok(result.log.some(line => line.toLocaleLowerCase('tr-TR').includes('açık artırma mekaniği kaldırıldı')));
 assert.throws(()=>bidAuction(g,'a',50),/açık artırma kaldırıldı/);
 assert.throws(()=>passAuction(g,'a'),/açık artırma kaldırıldı/);
});

test('debt can be paid after mortgaging property and creditor receives full amount',()=>{
 const g=createGame(players(),seq(0,0.2));g.players[1].properties=[3];g.players[0].properties=[1];g.players[0].cash=2;
 rollDice(g,'a');assert.equal(g.pendingDebt.amount,4);assert.equal(g.players[0].cash,2);
 mortgageProperty(g,'a',1);assert.equal(g.pendingDebt,null);assert.equal(g.players[0].cash,28);assert.equal(g.players[1].cash,1504);
 assert.equal(g.players[0].bankrupt,false);
});

test('debt resolution can sell buildings but blocks purchases and turn-end until paid',()=>{
 const g=createGame(players(),seq(0,0.2));g.players[1].properties=[5];g.players[0].properties=[1,3];g.players[0].buildings={1:1,3:1};g.players[0].cash=1;g.players[0].pos=2;
 // A landing rent at 5 creates a debt while the player owns buildings to liquidate.
 rollDice(g,'a');assert.ok(g.pendingDebt);
 assert.throws(()=>endTurn(g,'a'),/borcu çöz/);
 manageBuilding(g,'a',1,true);assert.equal(g.players[0].cash,1,'the 25₺ sale proceeds immediately pay the 25₺ rent debt');
 assert.equal(g.pendingDebt,null,'selling a building should settle the debt automatically once there is enough cash');
});


test('bankruptcy is blocked until all sale and mortgage proceeds are insufficient', () => {
 const g=createGame(players());
 const debtor=g.players[0]; debtor.properties=[1]; debtor.buildings={1:1}; debtor.cash=1;
 g.pendingDebt={debtorId:'a',amount:56,creditorId:'b',reason:'kira',effect:null};
 assert.equal(liquidationProceeds(g,debtor),55);
 assert.equal(publicGame(g).pendingDebt.canCoverAfterLiquidation,true);
 assert.throws(()=>declareBankruptcy(g,'a'),/Önce ev\/otel satıp mülklerini ipotek/);
 manageBuilding(g,'a',1,true);
 assert.equal(debtor.cash,26);
 mortgageProperty(g,'a',1);
 assert.equal(debtor.cash,0);
 assert.equal(g.pendingDebt,null,'mortgage proceeds should automatically clear the remaining debt');
 assert.equal(debtor.bankrupt,false);
});

test('third failed jail roll allows asset liquidation and then completes that same roll after bail is paid', () => {
 const g=createGame([{id:'a',name:'Ada'},{id:'b',name:'Bora'},{id:'c',name:'Cem'}],seq(0,0.2));
 const p=g.players[0]; p.pos=10; p.inJail=true; p.jailTurns=2; p.cash=30; p.properties=[1]; g.current=0;
 const state=rollDice(g,'a');
 assert.equal(state.pendingDebt.amount,50); assert.equal(state.pendingDebt.reason,'hapishaneden çıkış ücreti');
 assert.equal(p.inJail,true); assert.equal(p.jailTurns,3); assert.equal(p.pos,10);
 assert.equal(state.pendingDebt.canCoverAfterLiquidation,true);
 assert.throws(()=>declareBankruptcy(g,'a'),/Önce ev\/otel satıp mülklerini ipotek/);
 mortgageProperty(g,'a',1);
 assert.equal(p.cash,10);
 assert.equal(g.pendingDebt,null); assert.equal(p.inJail,false); assert.equal(p.jailTurns,0);
 assert.equal(p.pos,13); assert.equal(g.pendingBuy,13); assert.equal(g.current,0);
});

test('third failed jail roll declares bankruptcy only when bail cannot be covered after liquidation and advances turn', () => {
 const g=createGame([{id:'a',name:'Ada'},{id:'b',name:'Bora'},{id:'c',name:'Cem'}],seq(0,0.2));
 const p=g.players[0]; p.pos=10; p.inJail=true; p.jailTurns=2; p.cash=0; p.properties=[]; g.current=0;
 const state=rollDice(g,'a');
 assert.equal(p.bankrupt,false); assert.ok(g.pendingDebt); assert.equal(g.pendingDebt.amount,50);
 assert.equal(state.phase,'playing');
 assert.equal(state.pendingDebt.canCoverAfterLiquidation,false);
 const bankruptState=declareBankruptcy(g,'a');
 assert.equal(p.bankrupt,true); assert.equal(bankruptState.phase,'playing'); assert.equal(g.current,1);
 assert.equal(g.players[1].bankrupt,false); assert.equal(g.players[2].bankrupt,false);
});

test('a disconnected debtor is bankrupted, their debt is resolved and active game continues', () => {
 const g=createGame([{id:'a',name:'Ada'},{id:'b',name:'Bora'},{id:'c',name:'Cem'}]);
 g.players[0].properties=[1]; g.players[0].cash=20; g.current=0;
 g.pendingDebt={debtorId:'a',amount:500,creditorId:'b',reason:'kira',effect:null};
 const state=forfeitDisconnectedPlayer(g,'a');
 assert.equal(g.players[0].bankrupt,true); assert.equal(g.pendingDebt,null);
 assert.deepEqual(g.players[1].properties,[1]); assert.equal(g.players[1].cash,1520);
 assert.equal(g.current,1); assert.equal(state.phase,'playing');
});

test('a disconnected creditor converts a pending rent debt into bank debt', () => {
 const g=createGame([{id:'a',name:'Ada'},{id:'b',name:'Bora'},{id:'c',name:'Cem'}]);
 g.players[0].properties=[3]; g.players[1].cash=200; g.pendingDebt={debtorId:'c',amount:90,creditorId:'b',reason:'kira',effect:null};
 forfeitDisconnectedPlayer(g,'b');
 assert.equal(g.pendingDebt.creditorId,null); assert.equal(g.players[1].bankrupt,true); assert.equal(g.phase,'playing');
});

test('conference card is a deliberate action available only while in jail',()=>{
 const g=createGame(players(),()=>0);const p=g.players[0];p.inJail=true;p.jailCard=true;p.jailTurns=2;
 const state=useJailCard(g,'a');assert.equal(p.inJail,false);assert.equal(p.jailCard,false);assert.equal(p.jailTurns,0);assert.equal(state.canRoll,true);
 assert.match(state.log[0],/konferans kartını kullandı/);
 assert.throws(()=>useJailCard(g,'a'),/yalnızca blok dersteyken/);
 const g2=createGame(players());g2.players[0].inJail=true;assert.throws(()=>useJailCard(g2,'a'),/kartın yok/);
});
test('trying a double while jailed does not silently consume the conference card and dice result keeps its owner',()=>{
 const g=createGame(players(),()=>0);const p=g.players[0];p.inJail=true;p.jailCard=true;
 const state=rollDice(g,'a');assert.equal(p.inJail,false);assert.equal(p.jailCard,true);assert.equal(state.lastDicePlayerId,'a');
 endTurn(g,'a');assert.equal(publicGame(g).lastDicePlayerId,'a');
});


test('Monopoly rejects fractional or string cash in trades instead of silently truncating it',()=>{
 const g=createGame(players());g.players[0].properties=[1];
 assert.throws(()=>tradeProperties(g,'a',{toId:'b',giveIndex:1,cashOut:10.5}),/güvenli tam sayılar/);
 assert.throws(()=>tradeProperties(g,'a',{toId:'b',giveIndex:1,cashOut:'10'}),/güvenli tam sayılar/);
 assert.equal(g.pendingTrade,null);assert.deepEqual(g.players[0].properties,[1]);
});

test('Monopoly auction bidding rejects all requests because auctions are disabled',()=>{
 assert.throws(()=>bidAuction(createGame(players()),'a','10'),/açık artırma kaldırıldı/);
});


test('Monopoly trade rejects coerced or out-of-range property indexes without opening a trade',()=>{
 const g=createGame(players());g.players[0].properties=[1];g.players[1].properties=[3];
 for(const badIndex of [true, false, [], {}, '1.0', '-1', '01', 40, -1, 1.5]){
  assert.throws(()=>tradeProperties(g,'a',{toId:'b',giveIndex:badIndex}),/mülk numarası/);
  assert.equal(g.pendingTrade,null);
 }
 assert.deepEqual(g.players[0].properties,[1]);
});


test('mortgage and building management reject coerced or malformed board indexes without mutating state',()=>{
 const badIndexes=[true,false,null,[],{},'1.0','1.5','-1',' 1','1x',1.5,-1,BOARD.length];
 for(const index of badIndexes){
  const g=createGame(players());
  g.players[0].properties=[1,3];
  g.players[0].cash=1000;
  const before={cash:g.players[0].cash,mortgaged:[...g.players[0].mortgaged],buildings:{...g.players[0].buildings}};
  assert.throws(()=>mortgageProperty(g,'a',index),/numarası geçersiz/);
  assert.deepEqual({cash:g.players[0].cash,mortgaged:[...g.players[0].mortgaged],buildings:{...g.players[0].buildings}},before);
  assert.throws(()=>manageBuilding(g,'a',index),/numarası geçersiz/);
  assert.deepEqual({cash:g.players[0].cash,mortgaged:[...g.players[0].mortgaged],buildings:{...g.players[0].buildings}},before);
 }
});

test('mortgage and building management accept canonical integer indexes and numeric form strings',()=>{
 const g=createGame(players());
 g.players[0].properties=[1,3];
 assert.equal(mortgageProperty(g,'a','1').players[0].mortgaged.includes(1),true);
 const h=createGame(players());
 h.players[0].properties=[1,3];
 assert.equal(manageBuilding(h,'a','1').players[0].buildings[1],1);
});
