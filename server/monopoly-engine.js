'use strict';
const DATA = require('./monopoly-data.json');
const BOARD = DATA.monopolyBoard;
const TOKEN = ['🔴','🔵','🟢','🟡'];
function fail(message){throw new Error(message)}
function alive(game){return game.players.filter(p=>!p.bankrupt)}
function currentPlayer(game,id){if(game.phase!=='playing')fail('Oyun aktif değil.');if(game.players[game.current]?.id!==id)fail('Sıra sende değil.');const p=game.players[game.current];if(!p||p.bankrupt)fail('İflas eden oyuncu hamle yapamaz.');return p}
function owns(game,index){return game.players.find(p=>!p.bankrupt&&p.properties.includes(index))}
function rent(game,owner,index,dice=7){
 const s=BOARD[index],n=owner.buildings[index]||0;
 if(s.type==='utility'){const count=owner.properties.filter(i=>BOARD[i].type==='utility').length;return dice*(count>=2?10:4)}
 if(s.type==='pitch'){const count=owner.properties.filter(i=>BOARD[i].type==='pitch').length;return [25,50,100,200][Math.min(3,Math.max(0,count-1))]}
 if(s.type==='property'){
  const group=BOARD.filter(x=>x.group===s.group).map(x=>x.id);
  const complete=group.length>0&&group.every(i=>owner.properties.includes(i)&&!owner.mortgaged.includes(i));
  const base=s.baseRent||s.rent||2;
  return base*(n===0&&complete?2:[1,2,3,4,5,8][Math.min(5,n)]);
 }
 return 0;
}
function pushLog(game,message){game.log.unshift(message);game.log=game.log.slice(0,60);game.lastMessage=message}
function endIfWinner(game){
 const active=alive(game);
 if(active.length<=1){game.phase='finished';game.winnerId=active[0]?.id||null;game.pendingBuy=null;game.pendingDebt=null;game.pendingAuction=null;game.pendingTrade=null;game.rolled=false;game.mustRollAgain=false;pushLog(game,active.length?`${active[0].name} oyunu kazandı!`:'Oyun bitti.');return true}
 return false;
}
function advancePastBankrupt(game, playerIndex){
 if(game.phase!=='playing'||!game.players[playerIndex]?.bankrupt)return;
 let next=playerIndex;
 for(let tries=0;tries<game.players.length;tries++){next=(next+1)%game.players.length;if(!game.players[next].bankrupt)break}
 game.current=next;game.rolled=false;game.mustRollAgain=false;game.doublesCount=0;
 if(game.players[next]&&!game.players[next].bankrupt)pushLog(game,`Sıra: ${game.players[next].name}.`);
}
function buildingLiquidationValue(game, player) {
 let value = 0;
 for (const [rawIndex, rawLevel] of Object.entries(player.buildings || {})) {
  const index = Number(rawIndex), level = Number(rawLevel), s = BOARD[index];
  if (s && Number.isInteger(level) && level > 0) value += Math.floor(buildCost(index) / 2) * (level === 5 ? 5 : level);
 }
 return value;
}
function liquidationProceeds(game, player) {
 // Buildings must be sold before their colour group can be mortgaged, so compute
 // the total cash available after liquidating every building and then mortgaging
 // every currently un-mortgaged property. Already mortgaged property cash is in p.cash.
 const buildings = buildingLiquidationValue(game, player);
 const mortgages = player.properties.reduce((total, index) => total + (player.mortgaged.includes(index) ? 0 : Math.floor((BOARD[index]?.price || 0) / 2)), 0);
 return buildings + mortgages;
}
function applyDebtEffect(game, effect) {
 if (!effect) return;
 if (effect.type === 'pay_each_50') {
  for (const id of effect.recipientIds || []) {
   const recipient = game.players.find(p => p.id === id && !p.bankrupt);
   if (recipient) recipient.cash += 50;
  }
  return;
 }
 // If a player fails their third jail roll and needs to liquidate assets to pay bail,
 // their third roll is preserved. Paying later must still move them by that roll.
 if (effect.type === 'jail_bail_roll') {
  const p = game.players.find(candidate => candidate.id === effect.playerId && !candidate.bankrupt);
  if (!p || game.phase !== 'playing') return;
  p.inJail = false;
  p.jailTurns = 0;
  move(game, p, effect.steps);
  pushLog(game, `${p.name}, hapishane ücretini ödedi ve zarındaki ${effect.steps} kare ilerledi: ${BOARD[p.pos]?.name || 'tahta'}.`);
  land(game, p, effect.steps);
  game.mustRollAgain = false;
  game.rolled = true;
 }
}
function transferBankruptcy(game,p,creditor){
 const buildingValue = buildingLiquidationValue(game, p);
 p.bankrupt = true;
 for (const i of p.properties) {
  if (creditor && !creditor.bankrupt && !creditor.properties.includes(i)) {
   creditor.properties.push(i);
   if (p.mortgaged.includes(i) && !creditor.mortgaged.includes(i)) creditor.mortgaged.push(i);
  } else if (!creditor) {
   if (!game.bankProperties.includes(i)) game.bankProperties.push(i);
  }
 }
 if (creditor && !creditor.bankrupt) creditor.cash += Math.max(0,p.cash) + buildingValue;
 p.cash=0;p.properties=[];p.mortgaged=[];p.buildings={};p.inJail=false;
 pushLog(game,creditor?`${p.name} iflas etti; binaları bankaya satıldı, mülkleri ${creditor.name} oyuncusuna geçti.`:`${p.name} iflas etti; binaları ve mülkleri bankaya döndü.`);
 endIfWinner(game);
}
function charge(game,p,amount,creditor=null,reason='ödeme',effect=null){
 amount=Math.max(0,Math.floor(Number(amount)||0));
 if (p.bankrupt) return false;
 if (game.pendingDebt) fail('Önce mevcut borç çözülmeli.');
 if(p.cash>=amount){
  p.cash-=amount;
  if(creditor&&!creditor.bankrupt)creditor.cash+=amount;
  applyDebtEffect(game, effect);
  pushLog(game,`${p.name}, ${amount}₺ ödedi (${reason}).`);
  return true;
 }
 const storedEffect = effect ? { type: String(effect.type || '') } : null;
 if (storedEffect && Array.isArray(effect.recipientIds)) storedEffect.recipientIds = effect.recipientIds.filter(id => typeof id === 'string').slice(0, game.players.length);
 if (storedEffect && typeof effect.playerId === 'string') storedEffect.playerId = effect.playerId;
 if (storedEffect && Number.isInteger(effect.steps)) storedEffect.steps = Math.max(0, Math.min(BOARD.length - 1, effect.steps));
 game.pendingDebt={debtorId:p.id,amount,creditorId:creditor&&!creditor.bankrupt?creditor.id:null,reason:String(reason||'ödeme').slice(0,100),effect:storedEffect};
 pushLog(game,`${p.name}, ${amount}₺ borcunu şu an ödeyemiyor. Bina satabilir veya mülk ipotek edip borcu çözebilir.`);
 return false;
}
function payDebt(game,playerId){
 const debt=game.pendingDebt;
 if(!debt)fail('Ödenecek borç yok.');
 if(debt.debtorId!==playerId)fail('Bu borcu yalnızca borçlu oyuncu ödeyebilir.');
 const debtor=game.players.find(p=>p.id===debt.debtorId);
 if(!debtor||debtor.bankrupt)fail('Borçlu oyuncu artık oyunda değil.');
 if(debtor.cash<debt.amount)fail(`Borcu ödemek için ${Math.max(0,debt.amount-debtor.cash)}₺ daha gerekli.`);
 const creditor=debt.creditorId?game.players.find(p=>p.id===debt.creditorId&&!p.bankrupt):null;
 const effect = debt.effect;
 debtor.cash-=debt.amount;
 if(creditor)creditor.cash+=debt.amount;
 game.pendingDebt=null;
 pushLog(game,`${debtor.name}, ${debt.amount}₺ borcunu ödedi (${debt.reason}).`);
 applyDebtEffect(game,effect);
 return publicGame(game);
}
function declareBankruptcy(game,playerId){
 const debt=game.pendingDebt;
 if(!debt)fail('İflas kararı yalnızca bekleyen borç varken verilebilir.');
 if(debt.debtorId!==playerId)fail('İflas kararını yalnızca borçlu oyuncu verebilir.');
 const p=game.players.find(x=>x.id===playerId);
 if(!p||p.bankrupt)fail('Oyuncu artık oyunda değil.');
 if(p.cash>=debt.amount)fail('Bu borcu karşılayabilecek paran var; önce borcu öde.');
 if(p.cash + liquidationProceeds(game,p) >= debt.amount) fail('Önce ev/otel satıp mülklerini ipotek ederek borcu kapatmayı denemelisin.');
 const creditor=debt.creditorId?game.players.find(x=>x.id===debt.creditorId&&!x.bankrupt):null;
 game.pendingDebt=null;
 transferBankruptcy(game,p,creditor);
 if(game.phase==='playing')advancePastBankrupt(game,game.current);
 return publicGame(game);
}
function finishPurchaseDecision(game){
 if(game.mustRollAgain){game.rolled=false;game.mustRollAgain=true;}
 else{game.rolled=true;game.mustRollAgain=false;}
}
function startAuction(){ fail('Monopoly sürümünde açık artırma kaldırıldı.'); }
function bidAuction(){ fail('Monopoly sürümünde açık artırma kaldırıldı.'); }
function passAuction(){ fail('Monopoly sürümünde açık artırma kaldırıldı.'); }
function move(game,p,steps){
 const old=p.pos;p.pos=(p.pos+steps+BOARD.length)%BOARD.length;
 if(steps>=0&&old+steps>=BOARD.length){p.cash+=200;pushLog(game,`${p.name} Başlangıç'tan geçti: +200₺`)}
}
function land(game,p,diceTotal){
 const s=BOARD[p.pos]; if(!s)return;
 if(s.type==='go_to_jail'){p.pos=10;p.inJail=true;p.jailTurns=0;game.mustRollAgain=false;pushLog(game,`${p.name} hapishaneye gönderildi.`);return}
 if(['property','pitch','utility'].includes(s.type)){
  const owner=owns(game,p.pos);
  if(owner&&owner.id!==p.id&&!owner.mortgaged.includes(p.pos)){
   const amount=rent(game,owner,p.pos,diceTotal);
   charge(game,p,amount,owner,`${s.name} kirası`);
  } else if(!owner){game.pendingBuy=p.pos;pushLog(game,`${s.name} satılık: ${s.price}₺.`)}
  return;
 }
 if(s.type==='tax'){charge(game,p,s.amount||100,null,'vergi');return}
 if(s.type==='chance'||s.type==='chest'){
  const deck=s.type==='chance'?DATA.sansKartlari:DATA.kamuFonuKartlari;
  const random=game.random||Math.random;
  const card=deck[Math.floor(random()*deck.length)];
  pushLog(game,`${p.name}: ${card.text}`);
  const m=String(card.action||'').match(/^(gain|pay)_(\d+)$/);
  if(m){const n=Number(m[2]);if(m[1]==='gain')p.cash+=n;else charge(game,p,n,null,'kart');}
  else if(card.action==='pay_each_50'){const recipients=alive(game).filter(x=>x.id!==p.id);charge(game,p,recipients.length*50,null,'her oyuncuya 50₺ kartı',{type:'pay_each_50',recipientIds:recipients.map(x=>x.id)})}
  else if(card.action==='collect_each_10'){alive(game).filter(x=>x.id!==p.id).forEach(x=>{const n=Math.min(10,Math.max(0,x.cash));x.cash-=n;p.cash+=n})}
  else if(card.action==='get_jail_card')p.jailCard=true;
  else if(card.action==='go_to_jail'){p.pos=10;p.inJail=true;p.jailTurns=0;game.mustRollAgain=false}
  else if(card.action==='go_to_go'){p.pos=0;p.cash+=200}
  else if(card.action==='go_to_thanos'){const i=BOARD.findIndex(x=>x.name==="Thanos'un Evi");if(i>=0){if(i<p.pos)p.cash+=200;p.pos=i;land(game,p,diceTotal)}}
  else if(card.action==='forward_3'){move(game,p,3);land(game,p,diceTotal)}
  else if(card.action==='nearest_pitch'){let i=BOARD.findIndex((x,j)=>j>p.pos&&x.type==='pitch');if(i<0)i=BOARD.findIndex(x=>x.type==='pitch');if(i>=0){if(i<p.pos)p.cash+=200;p.pos=i;land(game,p,diceTotal)}}
  return;
 }
}
function createGame(players, random=Math.random){
 if(!Array.isArray(players)||players.length<2||players.length>4)fail('Monopoly 2–4 oyuncuyla oynanır.');
 const ps=players.map((p,i)=>({id:p.id,name:String(p.name||`Oyuncu ${i+1}`).trim().slice(0,24)||`Oyuncu ${i+1}`,token:TOKEN[i],cash:1500,pos:0,properties:[],mortgaged:[],buildings:{},bankrupt:false,inJail:false,jailTurns:0,jailCard:false}));
 return {phase:'playing',players:ps,current:0,rolled:false,pendingBuy:null,mustRollAgain:false,doublesCount:0,pendingDebt:null,pendingAuction:null,pendingTrade:null,bankProperties:[],winnerId:null,log:['Yeni Monopoly oyunu başladı. Her oyuncu 1500₺ ile başlıyor.'],lastMessage:'Sıra: '+ps[0].name+', zar at.',random};
}
function rollDice(game,playerId){
 const p=currentPlayer(game,playerId);
 if(game.phase!=='playing')fail('Oyun aktif değil.');
 if(game.pendingDebt)fail('Önce borcu çözmelisin.');
 if(game.pendingAuction)fail('Açık artırma bitmeden zar atamazsın.');
 if(game.pendingBuy!==null)fail('Önce satın alma kararını ver.');
 if(game.pendingTrade){pushLog(game,'Yanıtlanmayan takas teklifi yeni zar atışıyla iptal edildi.');game.pendingTrade=null;}
 if(game.rolled&&!game.mustRollAgain)fail('Bu turda zaten zar attın.');
 const random=game.random||Math.random,d1=1+Math.floor(random()*6),d2=1+Math.floor(random()*6),total=d1+d2,isDouble=d1===d2,wasInJail=p.inJail;
 game.lastDice=[d1,d2];game.lastDicePlayerId=p.id;game.rolled=true;game.mustRollAgain=isDouble&&!wasInJail;
 if(isDouble)game.doublesCount++;else game.doublesCount=0;
 if(game.doublesCount>=3){p.pos=10;p.inJail=true;p.jailTurns=0;game.mustRollAgain=false;game.doublesCount=0;pushLog(game,`${p.name} üst üste üç çift attı ve hapishaneye gönderildi.`);return publicGame(game)}
 if(p.inJail){
  if(isDouble){p.inJail=false;p.jailTurns=0;game.mustRollAgain=false;pushLog(game,`${p.name} çift zarla hapishaneden çıktı.`)}
  else{p.jailTurns++;if(p.jailTurns>=3){const paid=charge(game,p,50,null,'hapishaneden çıkış ücreti',{type:'jail_bail_roll',playerId:p.id,steps:total});if(paid){return publicGame(game)}p.inJail=true;game.mustRollAgain=false;return publicGame(game)}else{game.rolled=true;game.mustRollAgain=false;pushLog(game,`${p.name} hapiste kaldı (${p.jailTurns}/3).`);return publicGame(game)}}
 }
 if(game.phase!=='playing'||p.bankrupt)return publicGame(game);
 move(game,p,total);pushLog(game,`${p.name}, ${d1}+${d2}=${total} attı: ${BOARD[p.pos].name}.`);
 land(game,p,total);
 if(game.phase==='finished')return publicGame(game);
 if(game.pendingDebt)return publicGame(game);
 if(p.bankrupt){advancePastBankrupt(game,game.current);return publicGame(game)}
 if(game.pendingBuy!==null){return publicGame(game)}
 if(game.mustRollAgain&&!p.inJail){game.rolled=false;pushLog(game,`${p.name} çift zar attı, tekrar oynayabilir.`)}
 else game.mustRollAgain=false;
 return publicGame(game);
}
function useJailCard(game,playerId){
 const p=currentPlayer(game,playerId);
 if(game.pendingDebt||game.pendingAuction||game.pendingBuy!==null)fail('Önce bekleyen işlemi tamamlamalısın.');
 if(game.rolled)fail('Bu turda zar zaten atıldı.');
 if(!p.inJail)fail('Konferans kartı yalnızca blok dersteyken kullanılabilir.');
 if(!p.jailCard)fail('Konferans kartın yok.');
 p.jailCard=false;p.inJail=false;p.jailTurns=0;game.doublesCount=0;game.mustRollAgain=false;game.rolled=false;
 pushLog(game,`${p.name}, konferans kartını kullandı ve blok dersten çıktı. Şimdi zar atabilir.`);
 return publicGame(game);
}
function buyProperty(game,playerId,buy=true){
 const p=currentPlayer(game,playerId);
 if(game.pendingDebt)fail('Önce borcu çözmelisin.');
 if(game.pendingAuction)fail('Açık artırma devam ediyor.');
 if(game.phase!=='playing'||game.pendingBuy===null)fail('Satın alınabilecek mülk yok.');
 const i=game.pendingBuy,s=BOARD[i];
 if(buy){if(p.cash<s.price)fail('Bu mülkü alacak paran yok.');p.cash-=s.price;p.properties.push(i);game.bankProperties=game.bankProperties.filter(x=>x!==i);pushLog(game,`${p.name}, ${s.name} mülkünü ${s.price}₺ karşılığında satın aldı.`)}
 else{
  pushLog(game,`${p.name}, ${s.name} mülkünü satın almadı; mülk bankada kaldı. Açık artırma mekaniği kaldırıldı.`);
 }
 game.pendingBuy=null;
 finishPurchaseDecision(game);
 return publicGame(game);
}
function forfeitDisconnectedPlayer(game, playerId) {
 if (!game || game.phase !== 'playing') return publicGame(game);
 const p = game.players.find(candidate => candidate.id === playerId);
 if (!p || p.bankrupt) return publicGame(game);
 const playerIndex = game.players.indexOf(p);
 const pendingDebt = game.pendingDebt;
 let creditor = null;
 if (pendingDebt?.debtorId === playerId) {
  creditor = pendingDebt.creditorId ? game.players.find(candidate => candidate.id === pendingDebt.creditorId && !candidate.bankrupt) : null;
  game.pendingDebt = null;
  pushLog(game, `${p.name}, bağlantı süresi dolduğu için borcunu çözmeden iflas etti.`);
 } else if (pendingDebt?.creditorId === playerId) {
  // The creditor left; the outstanding amount is now owed to the bank.
  game.pendingDebt.creditorId = null;
 }
 if (game.pendingTrade && (game.pendingTrade.fromId === playerId || game.pendingTrade.toId === playerId)) {
  game.pendingTrade = null;
  pushLog(game, 'Bağlantısı zaman aşımına uğrayan oyuncunun bekleyen takası iptal edildi.');
 }
 if (game.pendingAuction) {
  const auction = game.pendingAuction;
  auction.participantIds = auction.participantIds.filter(id => id !== playerId);
  auction.passedIds = auction.passedIds.filter(id => id !== playerId);
  if (auction.highBidderId === playerId) { auction.highBidderId = null; auction.highBid = 0; }
  if (auction.currentBidderId === playerId) auction.currentBidderId = null;
 }
 if (game.pendingBuy !== null && playerIndex === game.current) game.pendingBuy = null;
 transferBankruptcy(game, p, creditor);
 if (game.phase !== 'playing') return publicGame(game);
 if (game.current === playerIndex) advancePastBankrupt(game, playerIndex);
 if (game.pendingAuction && (!game.pendingAuction.currentBidderId || game.pendingAuction.currentBidderId === playerId)) advanceAuction(game, playerId);
 endIfWinner(game);
 return publicGame(game);
}

function endTurn(game,playerId){
 const p=currentPlayer(game,playerId);
 if(game.phase!=='playing')fail('Oyun aktif değil.');
 if(game.pendingDebt)fail('Önce borcu çözmelisin.');
 if(game.pendingAuction)fail('Açık artırma bitmeden turunu bitiremezsin.');
 if(game.pendingBuy!==null)fail('Önce satın alma kararını ver.');
 if(!game.rolled)fail('Önce zar atmalısın.');
 if(game.mustRollAgain)fail('Çift zar nedeniyle tekrar oynamalısın.');
 if(game.pendingTrade){pushLog(game,`Yanıtlanmayan takas teklifi tur sonuyla iptal edildi.`);game.pendingTrade=null;}
 game.doublesCount=0;game.rolled=false;
 let next=game.current;
 for(let tries=0;tries<game.players.length;tries++){next=(next+1)%game.players.length;if(!game.players[next].bankrupt)break}
 game.current=next;
 pushLog(game,`Sıra: ${game.players[next].name}.`);
 return publicGame(game);
}

function parseBoardIndex(value, label='Mülk') {
 if (typeof value === 'string' && !/^(0|[1-9]\d*)$/.test(value)) fail(`${label} numarası geçersiz.`);
 if (typeof value !== 'string' && typeof value !== 'number') fail(`${label} numarası geçersiz.`);
 const index = typeof value === 'string' ? Number(value) : value;
 if (!Number.isSafeInteger(index) || index < 0 || index >= BOARD.length) fail(`${label} numarası geçersiz.`);
 return index;
}
function groupMembers(index){const group=BOARD[index]?.group;return group?BOARD.filter(x=>x.group===group).map(x=>x.id):[]}
function buildCost(index){const price=BOARD[index]?.price||0;return price<=120?50:price<=200?100:price<=280?150:200}
function ownsGroup(p,index){const members=groupMembers(index);return members.length>0&&members.every(i=>p.properties.includes(i)&&!p.mortgaged.includes(i))}
function mortgageProperty(game,playerId,index,remove=false){
 const p=currentPlayer(game,playerId);if(game.pendingAuction)fail('Açık artırma bitmeden mülk yönetemezsin.');if(game.pendingDebt&&(game.pendingDebt.debtorId!==playerId||remove))fail('Borç aşamasında yalnızca borçlu oyuncu mülk ipotek edebilir.');index=parseBoardIndex(index);const s=BOARD[index];
 if(!s||!p.properties.includes(index))fail('Bu mülk sana ait değil.');
 const mortgaged=p.mortgaged.includes(index);
 if(remove){if(!mortgaged)fail('Bu mülk ipotekli değil.');const cost=Math.ceil((s.price||0)*0.55);if(p.cash<cost)fail('İpoteği kaldıracak paran yok.');p.cash-=cost;p.mortgaged=p.mortgaged.filter(i=>i!==index);pushLog(game,`${p.name}, ${s.name} ipoteğini ${cost}₺ ödeyerek kaldırdı.`)}
 else{if(mortgaged)fail('Bu mülk zaten ipotekli.');const group=groupMembers(index);if(group.some(i=>(p.buildings[i]||0)>0))fail('Bu renk grubunda bina varken ipotek edemezsin.');const amount=Math.floor((s.price||0)/2);p.cash+=amount;p.mortgaged.push(index);pushLog(game,`${p.name}, ${s.name} mülkünü ipotek etti ve ${amount}₺ aldı.`)}
 if(game.pendingDebt?.debtorId===playerId&&p.cash>=game.pendingDebt.amount)payDebt(game,playerId);
 return publicGame(game)
}
function manageBuilding(game,playerId,index,sell=false){
 const p=currentPlayer(game,playerId);if(game.pendingAuction)fail('Açık artırma bitmeden bina yönetemezsin.');if(game.pendingDebt&&(game.pendingDebt.debtorId!==playerId||!sell))fail('Borç aşamasında yalnızca borçlu oyuncu bina satabilir.');index=parseBoardIndex(index);const s=BOARD[index];
 if(!s?.group||!p.properties.includes(index))fail('Ev/otel yalnızca sahip olduğun renkli mülke kurulabilir.');
 const members=groupMembers(index),level=p.buildings[index]||0,cost=buildCost(index);
 if(sell){if(level<=0)fail('Bu mülkte satılacak bina yok.');const highest=Math.max(...members.map(i=>p.buildings[i]||0));if(level!==highest)fail('Evleri dengeli satmalısın; önce en yüksek seviyedeki mülkten sat.');delete p.buildings[index] ;if(level>1)p.buildings[index]=level-1;p.cash+=Math.floor(cost/2);pushLog(game,`${p.name}, ${s.name} üzerindeki bir binayı ${Math.floor(cost/2)}₺ karşılığında sattı.`)}
 else{if(!ownsGroup(p,index))fail('Ev/otel için renk grubunun tamamı ipoteksiz olarak sende olmalı.');if(members.some(i=>p.mortgaged.includes(i)))fail('İpotekli renk grubuna bina kurulamaz.');if(level>=5)fail('Bu mülkte zaten otel var.');const lowest=Math.min(...members.map(i=>p.buildings[i]||0));if(level>lowest)fail('Evleri dengeli kurmalısın; önce gruptaki en az binası olan mülke ev kur.');if(p.cash<cost)fail('Bina için yeterli paran yok.');p.cash-=cost;p.buildings[index]=level+1;pushLog(game,`${p.name}, ${s.name} üzerine ${level===4?'otel':'ev'} inşa etti (${cost}₺).`)}
 if(sell&&game.pendingDebt?.debtorId===playerId&&p.cash>=game.pendingDebt.amount)payDebt(game,playerId);
 return publicGame(game)
}
function tradeProperties(game,playerId,offer={}){
 const from=currentPlayer(game,playerId);if(game.phase!=='playing')fail('Oyun aktif değil.');if(game.pendingDebt||game.pendingAuction)fail('Borç veya açık artırma çözülmeden takas yapılamaz.');if(game.pendingTrade)fail('Önce mevcut takas teklifini sonuçlandırın.');
 const to=game.players.find(p=>p.id===offer.toId);if(!to||to===from||to.bankrupt)fail('Takas yapılacak oyuncu geçersiz.');
 const parseTradeIndex=(value,label)=>{
  if(value===null||value===undefined||value==='')return null;
  // Accept numeric form values, but never coerce booleans, arrays, objects, or decimal strings.
  if(typeof value==='string'&&!/^(0|[1-9]\d*)$/.test(value))fail(`${label} geçerli bir mülk numarası olmalı.`);
  if(typeof value!=='string'&&typeof value!=='number')fail(`${label} geçerli bir mülk numarası olmalı.`);
  const index=typeof value==='string'?Number(value):value;
  if(!Number.isSafeInteger(index)||index<0||index>=BOARD.length)fail(`${label} geçerli bir mülk numarası olmalı.`);
  return index;
 };
 const give=parseTradeIndex(offer.giveIndex,'Verilecek mülk');
 const take=parseTradeIndex(offer.takeIndex,'Alınacak mülk');
 const cashOut=offer.cashOut===undefined||offer.cashOut===null||offer.cashOut===''?0:offer.cashOut;
 const cashIn=offer.cashIn===undefined||offer.cashIn===null||offer.cashIn===''?0:offer.cashIn;
 if(!Number.isSafeInteger(cashOut)||!Number.isSafeInteger(cashIn)||cashOut<0||cashIn<0)fail('Nakit tutarları negatif olmayan güvenli tam sayılar olmalı.');
 if((give===null?false:!from.properties.includes(give)||(from.buildings[give]||0)>0)||(take===null?false:!to.properties.includes(take)||(to.buildings[take]||0)>0))fail('Takas edilen mülkler uygun değil; bina bulunan mülk takas edilemez.');
 if(give===null&&take===null&&cashOut===0&&cashIn===0)fail('Takas için en az bir mülk veya nakit belirt.');
 if(from.cash<cashOut||to.cash<cashIn)fail('Takas için yeterli nakit yok.');
 game.pendingTrade={fromId:from.id,toId:to.id,giveIndex:give,takeIndex:take,cashOut,cashIn};
 pushLog(game,`${from.name}, ${to.name} oyuncusuna takas teklifi gönderdi.`);
 return publicGame(game)
}
function respondTrade(game,playerId,decision){
 if(game.pendingDebt||game.pendingAuction)fail('Borç veya açık artırma çözülmeden takas yanıtlanamaz.');
 const t=game.pendingTrade;if(!t)fail('Bekleyen takas teklifi yok.');
 if(playerId!==t.toId&&!(playerId===t.fromId&&decision==='cancel'))fail('Bu takas teklifini yalnızca alıcı kabul/red edebilir; teklifi gönderen iptal edebilir.');
 const from=game.players.find(p=>p.id===t.fromId),to=game.players.find(p=>p.id===t.toId);
 if(decision!=='accept') {game.pendingTrade=null;pushLog(game,decision==='cancel'?`${from?.name||'Oyuncu'} takas teklifini iptal etti.`:`${to?.name||'Oyuncu'} takas teklifini reddetti.`);return publicGame(game)}
 if(!from||!to||from.bankrupt||to.bankrupt||!from.properties.includes(t.giveIndex)&&t.giveIndex!==null||!to.properties.includes(t.takeIndex)&&t.takeIndex!==null||(t.giveIndex!==null&&(from.buildings[t.giveIndex]||0)>0)||(t.takeIndex!==null&&(to.buildings[t.takeIndex]||0)>0)||from.cash<t.cashOut||to.cash<t.cashIn)fail('Takasın koşulları artık geçerli değil.');
 from.cash=from.cash-t.cashOut+t.cashIn;to.cash=to.cash-t.cashIn+t.cashOut;
 const transfer=(owner,recipient,index)=>{if(index===null)return;owner.properties=owner.properties.filter(i=>i!==index);recipient.properties.push(index);if(owner.mortgaged.includes(index)){owner.mortgaged=owner.mortgaged.filter(i=>i!==index);recipient.mortgaged.push(index)}};
 transfer(from,to,t.giveIndex);transfer(to,from,t.takeIndex);game.pendingTrade=null;
 pushLog(game,`${from.name} ve ${to.name} takası kabul etti: ${t.giveIndex===null?'mülk yok':BOARD[t.giveIndex].name}${t.takeIndex===null?'':' karşılığında '+BOARD[t.takeIndex].name}; nakit farkı ${t.cashIn-t.cashOut}₺.`);
 return publicGame(game)
}

function publicGame(game){
 const debt=game.pendingDebt?{
  debtorId:game.pendingDebt.debtorId,
  debtorName:game.players.find(p=>p.id===game.pendingDebt.debtorId)?.name||'Oyuncu',
  amount:game.pendingDebt.amount,
  missingAmount:Math.max(0,game.pendingDebt.amount-(game.players.find(p=>p.id===game.pendingDebt.debtorId)?.cash||0)),
  creditorId:game.pendingDebt.creditorId,
  creditorName:game.players.find(p=>p.id===game.pendingDebt.creditorId)?.name||null,
  reason:game.pendingDebt.reason,
  liquidationProceeds:liquidationProceeds(game,game.players.find(p=>p.id===game.pendingDebt.debtorId)||{properties:[],mortgaged:[],buildings:{}}),
  canCoverAfterLiquidation:(()=>{const debtor=game.players.find(p=>p.id===game.pendingDebt.debtorId);return !!debtor&&debtor.cash+liquidationProceeds(game,debtor)>=game.pendingDebt.amount})()
 }:null;
 const auction=null; /* Auctions were removed in v2.19. */
 return {
  phase:game.phase,
  players:game.players.map(p=>({id:p.id,name:p.name,token:p.token,cash:p.cash,pos:p.pos,properties:[...p.properties],mortgaged:[...p.mortgaged],buildings:{...p.buildings},bankrupt:p.bankrupt,inJail:p.inJail,jailTurns:p.jailTurns,jailCard:p.jailCard})),
  current:game.current,currentPlayerId:game.players[game.current]?.id||null,
  rolled:game.rolled,lastDicePlayerId:game.lastDicePlayerId||null,pendingBuy:game.pendingBuy,pendingBuySpace:game.pendingBuy===null?null:BOARD[game.pendingBuy],
  pendingDebt:debt,pendingAuction:auction,mustRollAgain:game.mustRollAgain,lastDice:game.lastDice||null,winnerId:game.winnerId,
  pendingTrade:game.pendingTrade?{...game.pendingTrade,fromName:game.players.find(p=>p.id===game.pendingTrade.fromId)?.name,toName:game.players.find(p=>p.id===game.pendingTrade.toId)?.name}:null,
  board:BOARD,bankProperties:[...game.bankProperties],log:[...game.log],lastMessage:game.lastMessage,
  canRoll:game.phase==='playing'&&!game.pendingDebt&&!game.pendingAuction&&game.pendingBuy===null&&(!game.rolled||game.mustRollAgain),
  canEndTurn:game.phase==='playing'&&!game.pendingDebt&&!game.pendingAuction&&game.rolled&&!game.mustRollAgain&&game.pendingBuy===null
 };
}
module.exports={BOARD,createGame,rollDice,useJailCard,buyProperty,endTurn,publicGame,rent,mortgageProperty,manageBuilding,tradeProperties,respondTrade,buildCost,startAuction,bidAuction,passAuction,payDebt,declareBankruptcy,forfeitDisconnectedPlayer,liquidationProceeds};
