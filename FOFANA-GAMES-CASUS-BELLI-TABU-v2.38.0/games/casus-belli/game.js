/* Casus Belli - local hot-seat rules prototype.
   Card names/effects are transcribed from the user's card-sheet images.
   Where timing/edge cases are not explicit in the provided images, the engine logs the choice rather than inventing hidden rules. */
const $ = id => document.getElementById(id);
const DATA = window.CASUS_BELLI_DATA;
const ARMY_TEMPLATES = DATA.armyCards;
const SUPPORT_TEMPLATES = DATA.supportCards;
const SPEED = {"Çok hızlı":0,"Hızlı":1,"Yavaş":3,"Çok yavaş":5};
const state = {
  round:1, stage:"ready", activeColor:"green", selected:new Set(),
  players:{green:null,red:null}, played:{green:[],red:[]},
  pendingEffects:{green:[],red:[]}, log:[], winner:null,
  drawQueue:[], drawQueueIndex:0, statusSetThisRound:new Set(), lastCombat:null, combatHistory:[]
};
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeDeck(templates,type,color,count){
  const deck=[];
  for(let i=0;i<count;i++){
    const t=templates[i%templates.length];
    deck.push({...t,id:`${color}-${type}-${i}`,type,color,usedEffect:null,temporaryPoints:null});
  }
  return shuffle(deck);
}
function newPlayer(color){
  return {color,army:makeDeck(ARMY_TEMPLATES,"army",color,15),support:makeDeck(SUPPORT_TEMPLATES,"support",color,10),armyGrave:[],supportGrave:[],hand:[],status:{noSupportTurns:0,openDrawTurns:0,armyOnePointTurns:0,deckEffectsBlocked:0,returnSupports:false,returnSupportsNextTurn:false,queenStealNextTurn:false},nextDrawBonus:0};
}
function log(message){
  state.log.unshift(message);state.log=state.log.slice(0,5);
  const host=$("battleLog");host.textContent=state.log.join("  •  ");
  // A short visual pulse helps players notice ability and combat updates without
  // changing timing or interrupting the synchronous rules engine.
  host.classList.remove("battle-log-pulse");void host.offsetWidth;host.classList.add("battle-log-pulse");
}
function transferCard(card,newOwner){if(card)card.color=newOwner;return card;}
// A Support card must forget the previous selection/target after leaving the field,
// otherwise a later recovery can silently reuse an old ability without asking again.
function resetSupportForReuse(card){
  if(!card||card.type!=="support")return card;
  card.usedEffect=null;
  delete card.targetDeckType;
  delete card.targetDeckSide;
  delete card.targetGraveType;
  delete card.targetCardId;
  delete card.targetArmyCardId;
  delete card.targetSupportCardId;
  return card;
}
// Development invariant: every physical card ID must exist in exactly one game zone.
function auditCardConservation(){
  const locations=[];
  for(const color of ["green","red"]){
    const p=state.players[color];
    if(!p)continue;
    for(const zone of ["army","support","armyGrave","supportGrave","hand"]){
      for(const card of (p[zone]||[]))locations.push({id:card.id,zone:`${color}.${zone}`,owner:card.color,type:card.type});
    }
    for(const card of (state.played[color]||[]))locations.push({id:card.id,zone:`${color}.played`,owner:card.color,type:card.type});
  }
  const expected=new Map();
  for(const color of ["green","red"]){
    for(let i=0;i<15;i++)expected.set(`${color}-army-${i}`,{owner:color,type:"army"});
    for(let i=0;i<10;i++)expected.set(`${color}-support-${i}`,{owner:color,type:"support"});
  }
  const counts=new Map();
  for(const item of locations)counts.set(item.id,(counts.get(item.id)||0)+1);
  const missing=[...expected.keys()].filter(id=>!counts.has(id));
  const duplicates=[...counts].filter(([,count])=>count>1).map(([id])=>id);
  const unknown=locations.filter(item=>!expected.has(item.id)).map(item=>item.id);
  const ownerMismatches=locations.filter(item=>expected.has(item.id)&&item.owner!==item.zone.split(".")[0]).map(item=>({id:item.id,zone:item.zone,owner:item.owner}));
  // The physical card's type is immutable, regardless of whether it is in a deck,
  // graveyard, hand, or currently played. Checking only deck zones misses corruption
  // introduced while cards move through hand/field during long matches.
  const typeMismatches=locations.filter(item=>expected.has(item.id)&&item.type!==expected.get(item.id).type)
    .map(item=>({id:item.id,zone:item.zone,type:item.type,expectedType:expected.get(item.id).type}));
  return {ok:missing.length===0&&duplicates.length===0&&unknown.length===0&&ownerMismatches.length===0&&typeMismatches.length===0,total:locations.length,unique:counts.size,missing,duplicates,unknown,ownerMismatches,typeMismatches};
}
function setStatus(color,key,value){
  const status=state.players[color].status;
  status[key]=Math.max(status[key]||0,value);
  state.statusSetThisRound.add(`${color}:${key}`);
}
function decrementStatus(color,key){
  const marker=`${color}:${key}`;
  if(state.statusSetThisRound.has(marker))return;
  const status=state.players[color].status;
  if(status[key]>0)status[key]--;
}
function renderCardGuide(){
  const host=$("cardGuideList");
  if(!host)return;
  const query=($("cardGuideSearch")?.value||"").trim().toLocaleLowerCase("tr-TR");
  const filter=$("cardGuideFilter")?.value||"all";
  const cards=[...ARMY_TEMPLATES.map(card=>({...card,type:"army"})),...SUPPORT_TEMPLATES.map(card=>({...card,type:"support"}))]
    .filter(card=>filter==="all"||card.type===filter)
    .filter(card=>[card.name,card.effect,card.speed,card.points,...(card.effects||[])].filter(v=>v!==undefined&&v!==null).join(" ").toLocaleLowerCase("tr-TR").includes(query));
  $("cardGuideCount").textContent=`${cards.length} kart gösteriliyor`;
  host.replaceChildren();
  if(!cards.length){const empty=document.createElement("p");empty.className="card-guide-empty";empty.textContent="Bu aramayla eşleşen kart yok.";host.appendChild(empty);return;}
  for(const card of cards){
    const button=document.createElement("button");button.type="button";button.className="card-guide-item";
    button.setAttribute("aria-label",`${card.name} ayrıntılarını aç`);
    const img=document.createElement("img");img.src=card.art||"";img.alt="";img.loading="lazy";img.decoding="async";
    const content=document.createElement("span");
    const name=document.createElement("h3");name.textContent=card.name;
    const meta=document.createElement("span");meta.className="card-guide-meta";meta.textContent=card.type==="army"?`Ordu · ${card.points} güç`:`Destek · ${card.speed||"Hız belirtilmemiş"}`;
    content.append(name,meta);
    const effects=card.type==="support"?(card.effects||[]):[card.effect||"Özel bir gücü yok."];
    effects.forEach((effect,index)=>{const text=document.createElement("span");text.className="card-guide-effect";text.textContent=card.type==="support"?`${index+1}. ${effect}`:effect;content.appendChild(text);});
    button.append(img,content);button.addEventListener("click",()=>showCardDetails(card));host.appendChild(button);
  }
}
function openCardGuide(){
  renderCardGuide();
  const dialog=$("cardGuideDialog");
  if(dialog&&typeof dialog.showModal==="function")dialog.showModal();
  else if(dialog)dialog.setAttribute("open","");
}
function resetGame(){
  const gameOverDialog=$("gameOverDialog");if(gameOverDialog?.open)gameOverDialog.close();
  state.round=1;state.stage="ready";state.activeColor="green";state.selected.clear();state.winner=null;state.log=[];
  state.players.green=newPlayer("green");state.players.red=newPlayer("red");
  state.played={green:[],red:[]};state.pendingEffects={green:[],red:[]};
  state.statusSetThisRound.clear();state.lastCombat=null;state.combatHistory=[];
  $("roundLabel").textContent="1. TUR";$("phaseLabel").textContent="Kart çekme aşaması";
  $("drawButton").disabled=false;$("resolveButton").disabled=true;$("playButton").disabled=true;
  $("playButton").textContent="Seçilen kartları kapalı oyna";$("handHint").textContent="Önce iki kart çek";
  log("Savaş başladı. Her krallıkta 15 Ordu ve 10 Destek kartı var.");
  render();
}
function drawCard(p,type){
  const deck=p[type];
  const card=deck.shift()||null;
  // Visibility belongs to this draw event, not to the physical card forever.
  // A card revealed under Prenses' effect may return to a deck and be drawn later
  // after the effect expires; clear the stale flag on every subsequent draw.
  if(card){card.revealedOnDraw=p.status.openDrawTurns>0;card.justDrawn=true;}
  return card;
}
function startRound(){
  if(state.stage!=="ready"||state.winner)return;
  state.selected.clear();
  state.drawQueue=[];
  for(const color of ["green","red"]){
    const p=state.players[color];
    // Delayed support-return effects become active at the start of the promised next turn.
    if(p.status.returnSupportsNextTurn){p.status.returnSupports=true;p.status.returnSupportsNextTurn=false;}
    // Cards gained by Simyacı/Prenses during the previous resolution are kept for this turn.
    // Normal played cards are already removed from hand by playActiveCards().
    const n=2+(p.nextDrawBonus||0);p.nextDrawBonus=0;
    for(let i=0;i<n;i++)state.drawQueue.push({color,index:i+1,total:n});
  }
  state.drawQueueIndex=0;
  state.stage="drawing";
  $("drawButton").disabled=true;
  $("playButton").disabled=true;
  $("resolveButton").disabled=true;
  requestNextDraw();
}
function requestNextDraw(){
  if(state.drawQueueIndex>=state.drawQueue.length){
    const pendingSteals=["green","red"].filter(color=>state.players[color].status.queenStealNextTurn);
    if(pendingSteals.length){processPendingQueenSteals(pendingSteals,0);return;}
    enterChooseStage();
    return;
  }
  const item=state.drawQueue[state.drawQueueIndex];
  const p=state.players[item.color];
  const options=[];
  if(p.army.length)options.push({type:"army",label:"Ordu destesinden çek",count:p.army.length,icon:"⚔"});
  if(p.support.length)options.push({type:"support",label:"Destek destesinden çek",count:p.support.length,icon:"✧"});
  if(!options.length){
    state.drawQueueIndex++;
    requestNextDraw();
    return;
  }
  const dlg=getChoiceDialog();
  $("choiceTitle").textContent=`${colorName(item.color)} Krallık · Kart ${item.index}/${item.total}`;
  $("choiceDescription").textContent="Hangi desteden kart çekilecek?";
  const host=$("choiceOptions");host.innerHTML="";
  options.forEach(opt=>{
    const b=document.createElement("button");b.type="button";b.className="choice-option";
    b.innerHTML=`<span class="choice-icon">${opt.icon}</span><span><strong>${opt.label}</strong><small>${opt.count} kart kaldı</small></span><span class="choice-arrow">›</span>`;
    b.addEventListener("click",()=>{
      const card=drawCard(p,opt.type);
      if(card){
        p.hand.push(card);
        if(card.revealedOnDraw)log(`${colorName(item.color)} açık çekim: ${card.name} kartını ${opt.type==="army"?"Ordu":"Destek"} destesinden çekti.`);
      }
      state.drawQueueIndex++;
      dlg.close();
      requestNextDraw();
    });
    host.appendChild(b);
  });
  if(!dlg.open)dlg.showModal();
}
function enterChooseStage(){
  state.stage="choose";state.activeColor="green";
  log("İki krallık da kart çekti. Önce Yeşil Krallık en az bir kart seçsin.");
  $("phaseLabel").textContent="Yeşil oyuncunun seçimi";
  $("handHint").textContent="Yeşil oyuncu kartlarını seçsin.";
  $("playButton").disabled=true;
  render();
}
function processPendingQueenSteals(queue,index){
  if(index>=queue.length){enterChooseStage();return;}
  const color=queue[index],enemy=color==="green"?"red":"green";
  const player=state.players[color],opponent=state.players[enemy];
  player.status.queenStealNextTurn=false;
  if(!opponent.hand.length){
    log(`Kraliçe: ${colorName(enemy)} oyuncunun elinde alınabilecek kart yok.`);
    processPendingQueenSteals(queue,index+1);return;
  }
  const handover=showHandover(`${colorName(color)} Kraliçe etkisi`,`Kart seçmek için cihazı ${colorName(color)} oyuncuya ver. Rakibin elinden bir kart alacaksın.`);
  handover.addEventListener("close",()=>{
    const dlg=getChoiceDialog(),host=$("choiceOptions");
    $("choiceTitle").textContent=`${colorName(color)} Kraliçe · Kart seç`;
    $("choiceDescription").textContent=`${colorName(enemy)} oyuncunun elinden bir kart al.`;
    host.innerHTML="";
    opponent.hand.forEach((target,targetIndex)=>{
      const b=document.createElement("button");b.type="button";b.className="choice-option";
      const typeLabel=target.type==="army"?`Ordu · ${target.points} puan`:`Destek · ${target.speed||""}`;
      b.innerHTML=`<span class="choice-icon">${target.type==="army"?"⚔":"✧"}</span><span><strong>${target.name}</strong><small>${typeLabel}</small></span><span class="choice-arrow">›</span>`;
      b.addEventListener("click",()=>{
        const [taken]=opponent.hand.splice(targetIndex,1);
        if(taken){if(taken.type==="support")resetSupportForReuse(taken);player.hand.push(transferCard(taken,color));log(`Kraliçe: ${colorName(color)} oyuncu sonraki tur ${colorName(enemy)} oyuncunun elinden ${taken.name} kartını aldı.`);}
        dlg.close();processPendingQueenSteals(queue,index+1);
      });
      host.appendChild(b);
    });
    if(!dlg.open)dlg.showModal();
  },{once:true});
}
function getChoiceDialog(){
  let dlg=$("choiceDialog");
  if(dlg)return dlg;
  dlg=document.createElement("dialog");dlg.id="choiceDialog";dlg.className="rules-dialog choice-dialog";
  dlg.innerHTML='<p class="eyebrow">KART ÇEKME</p><h2 id="choiceTitle">Kart çek</h2><p id="choiceDescription" class="choice-description"></p><div id="choiceOptions" class="choice-options"></div>';
  document.body.appendChild(dlg);
  return dlg;
}
function currentPlayer(){return state.players[state.activeColor];}
function toggleCard(id){
  if(state.stage!=="choose")return;
  const player=currentPlayer();
  const card=player.hand.find(c=>c.id===id);
  // A Support ban means the card cannot be played, even if it entered the hand
  // through a steal/recovery effect rather than the normal draw flow.
  if(card&&card.type==="support"&&player.status.noSupportTurns>0){
    log(`${colorName(state.activeColor)} Krallık: Destek yasağı sürüyor; ${card.name} oynanamaz.`);
    return;
  }
  if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);
  renderHand();
}
function playActiveCards(){
  const color=state.activeColor,p=currentPlayer();
  const chosen=p.hand.filter(c=>state.selected.has(c.id)&&!(c.type==="support"&&p.status.noSupportTurns>0));
  if(!chosen.length)return;
  state.played[color]=chosen.map(c=>({...c,faceDown:true,justPlayed:true}));
  for(const c of p.hand.filter(c=>!chosen.some(played=>played.id===c.id)))p[c.type].push(c); // unused/blocked cards go to bottom
  p.hand=[];state.selected.clear();
  if(color==="green"){
    state.activeColor="red";
    log("Yeşil Krallık kartlarını kapalı oynadı. Ekranı Kırmızı Krallık'a verin.");
    $("phaseLabel").textContent="Kırmızı oyuncunun seçimi";
    $("handHint").textContent="Sıra Kırmızı Krallık'ta";
    render();
    // Hand-over privacy overlay before showing the next player's hand.
    showHandover("Kırmızı Krallık'ın sırası","Cihazı Kırmızı oyuncuya ver. Hazır olduğunda elini aç.");
  }else{
    state.stage="resolve";
    log("İki taraf da kartlarını kapalı oynadı. Kartları açıp çözümleyin.");
    $("phaseLabel").textContent="Kartları aç";$("resolveButton").disabled=false;$("playButton").disabled=true;
    render();
  }
}
function showHandover(title,body){
  let dlg=$("handoverDialog");
  if(!dlg){
    dlg=document.createElement("dialog");dlg.id="handoverDialog";dlg.className="rules-dialog";
    dlg.innerHTML='<p class="eyebrow">OYUNCU DEĞİŞİMİ</p><h2 id="handoverTitle"></h2><p id="handoverBody" style="color:#c2cbda;line-height:1.6"></p><form method="dialog"><button class="primary-button">Elimi göster</button></form>';
    document.body.appendChild(dlg);
  }
  $("handoverTitle").textContent=title;$("handoverBody").textContent=body;
  dlg.showModal();
  return dlg;
}
function resolveRound(){
  if(state.stage!=="resolve")return;
  const pending=[];
  for(const color of ["green","red"]){
    for(const card of state.played[color].filter(c=>c.type==="support"&&c.usedEffect===null)){
      if((card.effects||[]).length>1)pending.push(card);
      else card.usedEffect=0;
    }
  }
  if(pending.length){showSupportEffectChoice(pending,0);return;}
  startTargetChoices();
}
function showSupportEffectChoice(cards,index){
  if(index>=cards.length){startTargetChoices();return;}
  const card=cards[index];
  const dlg=getChoiceDialog();
  $("choiceTitle").textContent=`${colorName(card.color)} Krallık · ${card.name}`;
  $("choiceDescription").textContent="Bu Destek kartının hangi etkisini kullanacaksın?";
  const host=$("choiceOptions");host.innerHTML="";
  (card.effects||[]).forEach((effect,i)=>{
    const b=document.createElement("button");b.type="button";b.className="choice-option";
    b.innerHTML=`<span class="choice-icon">${i+1}</span><span><strong>${i===0?"Birinci etki":"İkinci etki"}</strong><small>${effect}</small></span><span class="choice-arrow">›</span>`;
    b.addEventListener("click",()=>{card.usedEffect=i;dlg.close();showSupportEffectChoice(cards,index+1);});
    host.appendChild(b);
  });
  if(!dlg.open)dlg.showModal();
}
function startTargetChoices(){
  const queue=[];
  for(const color of ["green","red"]){
    for(const card of state.played[color].filter(c=>c.type==="support")){
      // Do not ask for targets when the player's deck-manipulation abilities are blocked.
      // The resolution function will log the blocked effect; an unnecessary modal would
      // otherwise interrupt the round even though the chosen target cannot be used.
      if(card.name==="Avcı" && card.usedEffect===0) queue.push({card,kind:"hunter-support"});
      if(card.name==="Avcı" && card.usedEffect===1 && !deckEffectsBlockedFor(card.color)) queue.push({card,kind:"hunter-army"});
      if(card.name==="Hırsız" && card.usedEffect!==null && !deckEffectsBlockedFor(card.color)) {
        queue.push({card,kind:card.usedEffect===0?"thief-take-deck":"thief-reorder-deck"});
        queue.push({card,kind:card.usedEffect===0?"thief-take-side":"thief-reorder-side"});
      }
      if(card.name==="Rahip" && card.usedEffect===0) queue.push({card,kind:"priest-grave"});
      if(card.name==="Rahip" && card.usedEffect===1 && !deckEffectsBlockedFor(card.color)){
        queue.push({card,kind:"priest-deck-army"});
        queue.push({card,kind:"priest-deck-support"});
      }
    }
  }
  showTargetChoice(queue,0);
}
function showTargetChoice(queue,index){
  if(index>=queue.length){finishResolution();return;}
  const item=queue[index],card=item.card,color=card.color,enemy=color==="green"?"red":"green";
  const dlg=getChoiceDialog(),host=$("choiceOptions");
  host.innerHTML="";
  let title="",description="",options=[];
  if(item.kind==="hunter-support"||item.kind==="hunter-army"){
    const wantedType=item.kind==="hunter-support"?"support":"army";
    const candidates=state.played[enemy].filter(c=>c.type===wantedType);
    title=`${colorName(color)} Krallık · Avcı`;
    description=item.kind==="hunter-support"?"Rakibin oynadığı hangi Destek kartı Çöp'e gönderilsin?":"Rakibin oynadığı hangi Ordu kartı kendi destene alınsın?";
    options=candidates.map(target=>({value:target.id,label:target.name,icon:wantedType==="army"?"⚔":"✧",detail:wantedType==="army"?`${target.points} puan`:(target.speed||"Destek")}));
    if(!options.length){
      log(`Avcı: Rakibin oynadığı ${wantedType==="army"?"Ordu":"Destek"} kartı bulunamadı; hedef seçilemedi.`);
      showTargetChoice(queue,index+1);
      return;
    }
  }else if(item.kind==="thief-take-deck"||item.kind==="thief-reorder-deck"){
    title=`${colorName(color)} Krallık · Hırsız`;
    description=item.kind==="thief-take-deck"?"Rakibin hangi destesinden kart alınsın?":"Rakibin hangi destesindeki kartların sırası değişsin?";
    options=[{value:"army",label:"Ordu destesi",icon:"⚔",count:state.players[enemy].army.length},{value:"support",label:"Destek destesi",icon:"✧",count:state.players[enemy].support.length}].filter(o=>o.count>0);
    if(!options.length){
      card.targetDeckType=null;
      log("Hırsız: Rakibin iki destesi de boş; seçilecek hedef yok.");
      showTargetChoice(queue,index+1);
      return;
    }
  }else if(item.kind==="thief-take-side"||item.kind==="thief-reorder-side"){
    const type=card.targetDeckType||"army",deck=state.players[enemy][type];
    title=`${colorName(color)} Krallık · Hırsız`;
    description=item.kind==="thief-take-side"?"Kart destenin hangi ucundan alınsın?":"Hangi uçtaki en fazla 5 kartın sırası ters çevrilsin?";
    options=[{value:"top",label:"Destenin üstü",icon:"⬆",count:deck.length},{value:"bottom",label:"Destenin altı",icon:"⬇",count:deck.length}];
  }else if(item.kind==="priest-deck-army"||item.kind==="priest-deck-support"){
    const type=item.kind==="priest-deck-army"?"army":"support";
    const deck=state.players[color][type];
    title=`${colorName(color)} Krallık · Rahip`;
    description=`Kendi ${type==="army"?"Ordu":"Destek"} destenin üstteki iki kartından hangisini oynayacaksın?`;
    options=deck.slice(0,2).map(target=>({value:target.id,label:target.name,icon:type==="army"?"⚔":"✧",detail:type==="army"?`${target.points} puan`:(target.speed||"Destek")}));
    if(!options.length){
      log(`Rahip: ${type==="army"?"Ordu":"Destek"} destesi boş; bu türde kart oynanamadı.`);
      showTargetChoice(queue,index+1);
      return;
    }
  }else{
    const op=state.players[enemy];
    title=`${colorName(color)} Krallık · Rahip`;
    description="Rakibin hangi Çöp alanından bir kart geri alınsın?";
    options=[{value:"army",label:"Ordu Çöp'ü",icon:"⚔",count:op.armyGrave.length},{value:"support",label:"Destek Çöp'ü",icon:"✧",count:op.supportGrave.length}].filter(o=>o.count>0);
    if(!options.length)options=[{value:"none",label:"Rakibin Çöp alanları boş",icon:"∅",count:0}];
  }
  $("choiceTitle").textContent=title;
  $("choiceDescription").textContent=description;
  options.forEach(opt=>{
    const b=document.createElement("button");b.type="button";b.className="choice-option";
    b.innerHTML=`<span class="choice-icon">${opt.icon}</span><span><strong>${opt.label}</strong><small>${opt.detail||`${opt.count} kart`}</small></span><span class="choice-arrow">›</span>`;
    b.addEventListener("click",()=>{
      if(item.kind==="hunter-support"||item.kind==="hunter-army")card.targetCardId=opt.value;
      else if(item.kind==="thief-take-deck"||item.kind==="thief-reorder-deck")card.targetDeckType=opt.value;
      else if(item.kind==="thief-take-side"||item.kind==="thief-reorder-side")card.targetDeckSide=opt.value;
      else if(item.kind==="priest-deck-army")card.targetArmyCardId=opt.value;
      else if(item.kind==="priest-deck-support")card.targetSupportCardId=opt.value;
      else card.targetGraveType=opt.value;
      dlg.close();showTargetChoice(queue,index+1);
    });
    host.appendChild(b);
  });
  if(!dlg.open)dlg.showModal();
}
function finishResolution(){
  if(state.stage!=="resolve")return;
  const graveIdsBefore=new Set(["green","red"].flatMap(color=>[
    ...state.players[color].armyGrave,...state.players[color].supportGrave
  ]).map(card=>card.id));
  for(const c of ["green","red"])state.played[c].forEach(card=>card.faceDown=false);
  const supports=[];
  for(const color of ["green","red"]){
    for(const c of state.played[color].filter(c=>c.type==="support"))supports.push(c);
  }
  // Resolution order: Avcı first, then fast and slow Support, then Ordu low-to-high,
  // then very-slow Support. This follows the order shown in the supplied card guide.
  const earlySupports=supports.filter(c=>c.name==="Avcı"||c.speed==="Çok hızlı"||c.speed==="Hızlı"||c.speed==="Yavaş");
  const lateSupports=supports.filter(c=>c.speed==="Çok yavaş");
  earlySupports.sort((a,b)=>{
    const rank=c=>c.name==="Avcı"?-1:(SPEED[c.speed]??4);
    return rank(a)-rank(b);
  });
  for(const card of earlySupports){
    if(state.played[card.color].includes(card))applySupport(card);
  }
  // Keep one processed-ID set for the whole combat. Very-slow Support effects
  // (notably Demirci) may add an Army card after the normal Army phase; that
  // newly played card must resolve, but existing Army abilities must not fire twice.
  const processedArmyActions=new Set();
  resolveArmyActions(processedArmyActions);
  lateSupports.sort((a,b)=>(SPEED[a.speed]??5)-(SPEED[b.speed]??5));
  for(const card of lateSupports){
    if(state.played[card.color].includes(card))applySupport(card);
  }
  // Late Support effects can put Army cards back on the field. Resolve only the
  // newly added cards before scoring, then calculate passive bonuses once.
  resolveArmyActions(processedArmyActions);
  applyArmyPassiveEffects();
  const g=state.played.green.filter(c=>c.type==="army"),r=state.played.red.filter(c=>c.type==="army");
  const armies={green:state.played.green.filter(c=>c.type==="army"),red:state.played.red.filter(c=>c.type==="army")};
  // Capture each card's effective score before cards move to decks/graves and
  // temporary modifiers are cleared. This makes the result explainable later.
  const armyScoreDetails={green:[],red:[]};
  for(const color of ["green","red"]){
    armyScoreDetails[color]=armies[color].map(card=>({
      name:card.name,
      basePoints:card.points,
      finalPoints:effectivePoints(card,color,armies[color]),
      modifiers:explainPointModifiers(card,color,armies[color])
    }));
  }
  const points={
    green:armyScoreDetails.green.reduce((sum,card)=>sum+card.finalPoints,0),
    red:armyScoreDetails.red.reduce((sum,card)=>sum+card.finalPoints,0)
  };
  let winner=null;
  const armyLost={green:0,red:0};
  const armyLostNames={green:[],red:[]};
  if(points.green>points.red)winner="green";
  else if(points.red>points.green)winner="red";
  if(winner){
    const loser=winner==="green"?"red":"green";
    const loserMax=Math.max(0,...armies[loser].map(c=>effectivePoints(c,loser,armies[loser])));
    armyLost[loser]=armies[loser].length;
    armyLostNames[loser]=armies[loser].map(c=>c.name);
    const winningRemain=[];
    for(const c of armies[winner]){
      if(effectivePoints(c,winner,armies[winner])<=loserMax){state.players[winner].armyGrave.push(c);armyLost[winner]++;armyLostNames[winner].push(c.name);}
      else winningRemain.push(c);
    }
    state.players[loser].armyGrave.push(...armies[loser]);
    state.players[winner].army.push(...winningRemain);
    log(`${colorName(winner)} kazandı (${points[winner]} - ${points[loser]}). Kaybedenin Ordu kartları ve kazananın ${loserMax} puan veya altındaki Ordu kartları Çöp'e gitti.`);
  }else{
    for(const color of ["green","red"]){state.players[color].armyGrave.push(...armies[color]);armyLost[color]=armies[color].length;armyLostNames[color]=armies[color].map(c=>c.name);}
    log(`Ordu puanları eşit (${points.green} - ${points.red}); oynanan Ordu kartları Çöp'e gitti.`);
  }
  state.lastCombat={round:state.round,points:{...points},winner,armyLost:{...armyLost},armyLostNames:{green:[...armyLostNames.green],red:[...armyLostNames.red]},armyScoreDetails:{green:armyScoreDetails.green.map(c=>({...c})),red:armyScoreDetails.red.map(c=>({...c}))}};
  // Keep a compact match history so players can review how the battle evolved.
  // The current summary remains prominent; older rounds live in a collapsed list.
  if(!Array.isArray(state.combatHistory))state.combatHistory=[];
  state.combatHistory.push({...state.lastCombat,points:{...state.lastCombat.points},armyLost:{...state.lastCombat.armyLost},armyLostNames:{green:[...armyLostNames.green],red:[...armyLostNames.red]},armyScoreDetails:{green:armyScoreDetails.green.map(c=>({...c})),red:armyScoreDetails.red.map(c=>({...c}))}});
  if(state.combatHistory.length>30)state.combatHistory.shift();
  // Demirci's doubling applies only to this combat. Clear the temporary marker
  // after all scoring/elimination comparisons, without overwriting each card's
  // permanent effectType (e.g. Rahibe must remain able to play the top Army).
  for(const color of ["green","red"]){
    for(const card of armies[color]){
      delete card.temporaryDoublePoints;
      delete card.assassinDisabledThisCombat;
    }
  }
  for(const color of ["green","red"]){
    const p=state.players[color];
    for(const c of state.played[color].filter(c=>c.type==="support")){
      // Hırsız's first ability explicitly sends Hırsız to the graveyard, even if
      // a simultaneous Büyücü/Şaklaban effect would otherwise return Supports.
      const thiefMustBeDiscarded=c.name==="Hırsız"&&c.usedEffect===0;
      if(thiefMustBeDiscarded){resetSupportForReuse(c);p.supportGrave.push(c);}
      else if(p.status.returnSupports){resetSupportForReuse(c);p.support.push(c);}
      else {resetSupportForReuse(c);p.supportGrave.push(c);}
    }
    state.played[color]=[];
    p.status.returnSupports=false;
    decrementStatus(color,"noSupportTurns");
    decrementStatus(color,"openDrawTurns");
    decrementStatus(color,"armyOnePointTurns");
    decrementStatus(color,"deckEffectsBlocked");
  }
  state.statusSetThisRound.clear();
  if(typeof auditCardConservation==="function"){
    const ledger=auditCardConservation();
    if(!ledger.ok)log(`Kart kayıt uyarısı: ${ledger.missing.length} eksik, ${ledger.duplicates.length} mükerrer, ${ledger.unknown.length} tanımsız, ${ledger.ownerMismatches.length} sahiplik ve ${ledger.typeMismatches.length} tür hatası.`);
  }
  // Mark only cards that entered a graveyard during this combat so their
  // transition animates once, rather than replaying on every later render.
  for(const color of ["green","red"]){
    for(const card of [...state.players[color].armyGrave,...state.players[color].supportGrave]){
      if(!graveIdsBefore.has(card.id))card.justGraved=true;
    }
  }
  state.stage="ready";state.round++;
  $("roundLabel").textContent=`${state.round}. TUR`;
  $("phaseLabel").textContent="Tur tamamlandı";$("drawButton").disabled=false;$("resolveButton").disabled=true;$("playButton").disabled=true;
  checkWinner();render();
}
function resolveArmyActions(processed){
  if(!processed)processed=new Set();
  // Resolve every Army card currently on the field in ascending point order.
  // Effects such as Rahibe and late Support cards such as Demirci can add Army
  // cards during a combat. A caller may pass a shared set so a second pass only
  // resolves newly introduced cards and never repeats an earlier ability.
  while(true){
    const pending=["green","red"].flatMap(color=>state.played[color].filter(c=>c.type==="army"&&!processed.has(c.id)));
    if(!pending.length)break;
    pending.sort((a,b)=>(a.points??0)-(b.points??0));
    const card=pending[0];
    processed.add(card.id);
    if(state.played[card.color].includes(card))applyArmyAction(card);
  }
  return processed;
}
function colorName(c){return c==="green"?"Yeşil":"Kırmızı";}
function armyCards(color){return state.played[color].filter(c=>c.type==="army");}
function effectivePoints(card,color,ownArmy){
  let n=card.temporaryPoints??card.points;
  const p=state.players[color];
  // Barbar is immune to positive and negative card effects.
  if(card.effectType==="immune")return n;
  if(card.effectType==="army-neighbor-bonus"&&ownArmy.length>1)n=4;
  // Keşiş's card text says "başka bir kart" (another card), unlike Köylü's
  // explicit "another Army card". Count all friendly cards on the field, including
  // Support cards, so Keşiş only gains 6 points when it is truly alone.
  const fieldCards=state.played[color]||ownArmy;
  const hasOtherCard=fieldCards.some(c=>c!==card&&(!c.id||!card.id||c.id!==card.id));
  if(card.effectType==="isolated-bonus"&&!hasOtherCard)n=6;
  const princeActive=ownArmy.some(c=>c.effectType==="friendly-army-plus-three"&&!c.assassinDisabledThisCombat);
  if(princeActive&&card.name!=="Prens")n+=3;
  // Temporary doubling is a separate flag so Demirci cannot erase an Army
  // card's native ability and the multiplier never leaks into a later round.
  if(card.temporaryDoublePoints)n*=2;
  const enemy=color==="green"?"red":"green";
  const ninjaActive=state.played[enemy].some(c=>c.type==="army"&&c.effectType==="halve-even-opponent-army");
  if(ninjaActive&&card.points%2===0)n=2;
  // Kral's explicit "count every opposing Army as 1 point" restriction is
  // applied after ordinary bonuses and Ninja's modifier. Barbar returned above
  // and remains immune. A King restriction applied this same round starts next round.
  if(p.status.armyOnePointTurns>0&&!state.statusSetThisRound.has(`${color}:armyOnePointTurns`))n=1;
  return n;
}
function explainPointModifiers(card,color,ownArmy){
  const reasons=[];
  if(card.effectType==="immune")return ["Kart etkilerine bağışık"];
  if(card.effectType==="army-neighbor-bonus"&&ownArmy.length>1)reasons.push("Yanında dost Ordu var: 4 puan");
  const fieldCards=state.played[color]||ownArmy;
  const hasOtherCard=fieldCards.some(c=>c!==card&&(!c.id||!card.id||c.id!==card.id));
  if(card.effectType==="isolated-bonus"&&!hasOtherCard)reasons.push("Tek başına: 6 puan");
  const princeActive=ownArmy.some(c=>c.effectType==="friendly-army-plus-three"&&!c.assassinDisabledThisCombat);
  if(princeActive&&card.name!=="Prens")reasons.push("Prens: +3");
  if(card.temporaryDoublePoints)reasons.push("Demirci: ×2");
  const enemy=color==="green"?"red":"green";
  const ninjaActive=state.played[enemy].some(c=>c.type==="army"&&c.effectType==="halve-even-opponent-army");
  if(ninjaActive&&card.points%2===0)reasons.push("Ninja: çift puanlı kart 2 sayılır");
  if(state.players[color].status.armyOnePointTurns>0&&!state.statusSetThisRound.has(`${color}:armyOnePointTurns`))reasons.push("Kral: 1 puan");
  if(card.temporaryPoints!=null&&card.temporaryPoints!==card.points)reasons.push(`Geçici puan: ${card.temporaryPoints}`);
  return reasons;
}
function totalArmyPoints(color,cards){
  return cards.reduce((sum,card)=>sum+effectivePoints(card,color,cards),0);
}
function deckEffectsBlockedFor(color){
  return state.players[color].status.deckEffectsBlocked>0 && !state.statusSetThisRound.has(`${color}:deckEffectsBlocked`);
}
function applyArmyAction(card){
  const color=card.color,enemy=color==="green"?"red":"green",p=state.players[color],op=state.players[enemy];
  if(card.effectType==="play-top-army" && deckEffectsBlockedFor(color)){
    log(`${colorName(color)} ${card.name}: deste etkileri engellendi; Ordu destesinden kart oynanmadı.`);
  }else if(card.effectType==="play-top-army"){
    const extra=p.army.shift();
    if(extra){extra.faceDown=false;state.played[color].push(extra);log(`${colorName(color)} Rahibe etkisiyle ${extra.name} oynadı.`);}
    else log(`${colorName(color)} Rahibe: Ordu destesi boş.`);
  }
  if(card.effectType==="opponent-no-support-next-turn"){
    setStatus(enemy,"noSupportTurns",1);
    log(`${colorName(color)} Cellat: rakip sonraki tur Destek kartı oynayamayacak.`);
  }
  if(card.effectType==="return-opponent-very-slow-support"){
    if(deckEffectsBlockedFor(color)){
      log(`${colorName(color)} Kuzeyli: deste etkileri engellendi; Çok Yavaş Destek kartları geri döndürülmedi.`);
    }else{
      const returned=state.played[enemy].filter(c=>c.type==="support"&&c.speed==="Çok yavaş");
      if(returned.length){
        state.played[enemy]=state.played[enemy].filter(c=>!returned.includes(c));
        returned.forEach(c=>{resetSupportForReuse(c);op.support.push(c);});
        log(`${colorName(color)} Kuzeyli: ${returned.length} rakip Çok Yavaş Destek kartı kullanılmadan desteye döndü.`);
      }else{
        log(`${colorName(color)} Kuzeyli: döndürülecek Çok Yavaş Destek kartı yok.`);
      }
    }
  }
  if(card.name==="Suikastçı"){
    const prince=state.played[enemy].find(c=>c.name==="Prens"&&c.type==="army");
    if(prince){prince.assassinDisabledThisCombat=true;log(`${colorName(color)} Suikastçı: rakip Prens'in yeteneği bu çatışma için iptal edildi.`);}
    const king=state.played[enemy].find(c=>c.name==="Kral"&&c.type==="support");
    if(king){
      state.played[enemy]=state.played[enemy].filter(c=>c!==king);
      resetSupportForReuse(king);
      op.supportGrave.push(king);
      log(`${colorName(color)} Suikastçı: rakibin Kral Destek kartı doğrudan Çöp'e gitti.`);
    }
  }
}
function applyArmyPassiveEffects(){
  for(const color of ["green","red"]){
    const cards=armyCards(color);
    if(cards.some(c=>c.effectType==="friendly-army-plus-three"&&!c.assassinDisabledThisCombat))log(`${colorName(color)} Prens etkisi: diğer dost Ordu kartlarına +3.`);
    // Büyücü returns every friendly Support played THIS turn at the end of this
    // resolution. Unlike Şaklaban, its card text does not say "next turn".
    if(cards.some(c=>c.effectType==="return-own-supports")){
      if(deckEffectsBlockedFor(color)){
        log(`${colorName(color)} Büyücü: deste etkileri engellendi; Destek kartları tur sonunda desteye dönmeyecek.`);
      }else{
        state.players[color].status.returnSupports=true;
        log(`${colorName(color)} Büyücü: bu tur oynanan dost Destek kartları tur sonunda desteye dönecek.`);
      }
    }
  }
}
function applySupport(card){
  const color=card.color,enemy=color==="green"?"red":"green",p=state.players[color],op=state.players[enemy],effect=(card.effects||[])[card.usedEffect||0]||"";
  const is=(name)=>({ "avci":"Avcı","kralice":"Kraliçe","kral":"Kral","prenses":"Prenses","saklaban":"Şaklaban","hirsiz":"Hırsız","okcu":"Okçu","rahip":"Rahip","simyaci":"Simyacı","demirci":"Demirci" }[name]===card.name);
  // Okçu blocks abilities that directly manipulate a draw pile. Do not block
  // graveyard-to-hand or graveyard-to-field effects: Simyacı 1 and Demirci 1
  // (first listed ability, usedEffect 0) do not touch a deck. Simyacı 2 does.
  const deckTargeting = (is("avci") && card.usedEffect===1) || is("hirsiz") || (is("okcu") && card.usedEffect===0) || (is("rahip") && card.usedEffect===1) || (is("simyaci") && card.usedEffect===1) || (is("saklaban") && card.usedEffect===1);
  if(deckTargeting && deckEffectsBlockedFor(color)){
    log(`${colorName(color)} ${card.name}: deste etkileri engellendi; yetenek uygulanmadı.`);
    return;
  }
  if(is("avci")){
    if(card.usedEffect===0){
      const target=state.played[enemy].find(c=>c.type==="support"&&(!card.targetCardId||c.id===card.targetCardId));
      if(target){state.played[enemy]=state.played[enemy].filter(c=>c!==target);resetSupportForReuse(target);op.supportGrave.push(target);log(`${colorName(color)} Avcı ile rakibin ${target.name} Destek kartını Çöp'e gönderdi.`);}
      else log("Avcı: Rakibin oynadığı Destek kartı bulunamadı.");
    }else{
      const target=state.played[enemy].find(c=>c.type==="army"&&(!card.targetCardId||c.id===card.targetCardId));
      if(target){state.played[enemy]=state.played[enemy].filter(c=>c!==target);p.army.push(transferCard(target,color));log(`${colorName(color)} Avcı ile rakibin ${target.name} kartını destesine aldı.`);}
      else log("Avcı: Rakibin oynadığı Ordu kartı bulunamadı.");
    }
  }else if(is("kralice")){
    if(card.usedEffect===0){
      p.status.queenStealNextTurn=true;
      log(`Kraliçe: ${colorName(color)} oyuncu sonraki tur rakibin elinden bir kart seçecek.`);
    }else{setStatus(enemy,"noSupportTurns",3);log("Kraliçe: Rakip 3 tur Destek oynayamayacak.");}
  }else if(is("kral")){
    if(card.usedEffect===0){setStatus(enemy,"armyOnePointTurns",2);log("Kral: Rakibin Ordu kartları sonraki 2 tur 1 puan sayılacak.");}
    else{p.nextDrawBonus+=2;log("Kral: Bu krallık sonraki tur 2 ekstra kart çekecek.");}
  }else if(is("prenses")){
    if(card.usedEffect===0){setStatus(enemy,"openDrawTurns",2);log("Prenses: Rakip sonraki 2 tur kartlarını açık çekecek; çekilen kartların adı savaş günlüğünde gösterilecek.");}
    else{
      // The card reference says to invalidate Prince/King and take them into your hand next turn.
      // During resolution their hand is normally empty, so target cards must be taken from the field.
      const targets=state.played[enemy].filter(c=>c.name==="Prens"||c.name==="Kral");
      if(targets.length){
        state.played[enemy]=state.played[enemy].filter(c=>!targets.includes(c));
        targets.forEach(c=>{if(c.type==="support")resetSupportForReuse(c);p.hand.push(transferCard(c,color));});
        log(`Prenses: ${targets.map(c=>c.name).join(" ve ")} etkisizleştirildi; sonraki tur için ele alındı.`);
      }else log("Prenses: Rakibin oynadığı Prens/Kral yok; etkisi uygulanamadı.");
    }
  }else if(is("saklaban")){
    if(card.usedEffect===0){p.status.returnSupportsNextTurn=true;log("Şaklaban: Sonraki tur oynayacağın Destek kartları tur sonunda desteye dönecek.");}
    else{
      // This is a swap: both bottom cards must exist. Do not move only one card
      // when either deck is empty, because that would be a transfer, not an exchange.
      const a=op.support[op.support.length-1],b=p.army[p.army.length-1];
      if(a&&b){
        op.support.pop();p.army.pop();
        p.support.push(transferCard(a,color));
        op.army.push(transferCard(b,enemy));
        log("Şaklaban: Rakibin Destek destesinin alt kartı ile kendi Ordu destenin alt kartı değiştirildi.");
      }else{
        log("Şaklaban: Deste altındaki kartları değiştirmek için iki destede de en az bir kart olmalı; değişim yapılmadı.");
      }
    }
  }else if(is("hirsiz")){
    if(card.usedEffect===0){
      const type=card.targetDeckType||"army";
      const side=card.targetDeckSide||"top";
      const deck=op[type],target=deck.length?(side==="top"?deck.shift():deck.pop()):null;
      if(target){p[type].push(transferCard(target,color));log(`Hırsız: ${target.name} rakibin ${type==="army"?"Ordu":"Destek"} destesinden alındı.`);}
      else log("Hırsız: Seçilen deste artık boş; kart alınamadı.");
    }else{
      const type=card.targetDeckType||"army";
      const deck=op[type],side=card.targetDeckSide||"top";
      const segment=side==="top"?deck.splice(0,Math.min(5,deck.length)):deck.splice(Math.max(0,deck.length-5),5);
      const reversedCount=segment.length;
      segment.reverse();
      if(side==="top")deck.unshift(...segment);else deck.push(...segment);
      log(reversedCount?`Hırsız: Rakibin ${type==="army"?"Ordu":"Destek"} destesinin ${side==="top"?"üst":"alt"} ${reversedCount} kartının sırası ters çevrildi.`:"Hırsız: Seçilen deste boş; sıralama değişmedi.");
    }
  }else if(is("okcu")){
    if(card.usedEffect===0){
      // The reference card says to inspect only the top three cards, not search
      // the entire deck for any low-point cards. Keep the inspected order intact.
      const inspected=op.army.slice(0,3);
      const removed=inspected.filter(c=>c.points<=3);
      removed.forEach(c=>{op.army.splice(op.army.indexOf(c),1);op.armyGrave.push(c);});
      log(`Okçu: Rakibin Ordu destesinin üstteki 3 kartı incelendi; ${removed.length} kart (3 puan veya altı) Çöp'e gitti.`);
    }else{setStatus(enemy,"deckEffectsBlocked",3);log("Okçu: Rakibin deste hedefleyen yetenekleri sonraki 3 tur engellenecek.");}
  }else if(is("rahip")){
    if(card.usedEffect===0){
      const type=card.targetGraveType||"army";
      const grave=op[type==="army"?"armyGrave":"supportGrave"],target=grave.pop();
      if(target){p[type].push(transferCard(target,color));log(`Rahip: Rakibin Çöp'ünden ${target.name} alındı.`);}else log("Rahip: Seçilen Çöp alanı boş.");
    }else{
      const playedNames=[];
      for(const type of ["army","support"]){
        const targetId=type==="army"?card.targetArmyCardId:card.targetSupportCardId;
        const deck=p[type];
        const index=targetId?deck.findIndex(c=>c.id===targetId):0;
        if(index>=0&&index<deck.length){
          const [chosen]=deck.splice(index,1);
          state.played[color].push({...chosen,faceDown:false});
          playedNames.push(chosen.name);
        }
      }
      log(playedNames.length?`Rahip: Seçilen kartlar oynandı: ${playedNames.join(" ve ")}.`:"Rahip: Seçilen kartlar artık destede bulunmadığı için oynanamadı.");
      delete card.targetArmyCardId;delete card.targetSupportCardId;
    }
  }else if(is("simyaci")){
    if(card.usedEffect===0){
      const c=p.supportGrave.pop();if(c){p.hand.push(c);log(`Simyacı: ${c.name} sonraki tur için ele alındı.`);}else log("Simyacı: Kendi Destek Çöp'ü boş.");
    }else{
      const c=op.support[0];
      if(c&&(c.speed==="Yavaş"||c.speed==="Çok yavaş")){op.support.shift();resetSupportForReuse(c);op.supportGrave.push(c);log(`Simyacı: Rakibin ${c.name} kartı Çöp'e gitti.`);}else log("Simyacı: Rakibin en üst Destek kartı Yavaş/Çok Yavaş değil.");
    }
  }else if(is("demirci")){
    if(card.usedEffect===0){
      const c=p.armyGrave.pop();if(c){state.played[color].push({...c,faceDown:false});log(`Demirci: ${c.name} Çöp'ten yeniden oynandı.`);}else log("Demirci: Ordu Çöp'ü boş.");
    }else{
      state.played[color].forEach(c=>{if(c.type==="army")c.temporaryDoublePoints=true;});
      log("Demirci: Bu tur dost Ordu kartlarının puanları iki katına çıkarıldı.");
    }
  }
}
function checkWinner(){
  if(state.stage==="finished")return true;
  // A kingdom is exhausted only when BOTH draw piles are empty. Graveyards do not count as available cards.
  const exhausted=["green","red"].filter(color=>{
    const p=state.players[color];
    return p.army.length===0&&p.support.length===0;
  });
  if(!exhausted.length)return false;
  state.stage="finished";
  const title=$("gameOverTitle"),message=$("gameOverMessage"),reason=$("gameOverReason"),dialog=$("gameOverDialog");
  if(exhausted.length===2){
    state.winner=null;
    log("İki krallığın da Ordu ve Destek desteleri bitti. Oyun berabere sona erdi.");
    if(title)title.textContent="Berabere!";
    if(message)message.textContent="İki krallık da destelerini tüketti.";
    if(reason)reason.textContent=`Oyun ${state.round}. turun çözümlemesinden sonra sona erdi. Çöp alanındaki kartlar yeniden desteye dönmediği için bitiş koşulunu değiştirmedi.`;
  }else{
    const loser=exhausted[0];
    state.winner=loser==="green"?"red":"green";
    log(`${colorName(state.winner)} Krallık kazandı! ${colorName(loser)} Krallık'ın Ordu ve Destek desteleri bitti.`);
    if(title)title.textContent=`${colorName(state.winner)} Krallık kazandı!`;
    if(message)message.textContent=`${colorName(loser)} Krallık'ın hem Ordu hem Destek destesi tükendi.`;
    if(reason)reason.textContent=`Oyun ${state.round}. turun çözümlemesinden sonra sona erdi. Kazanan, iki destesi de tükenen krallığın rakibidir.`;
  }
  $("phaseLabel").textContent="Oyun sona erdi";
  $("handHint").textContent="Maç tamamlandı. Yeni maç için yeniden başlat.";
  $("drawButton").disabled=true;$("playButton").disabled=true;$("resolveButton").disabled=true;
  if(dialog&&!dialog.open&&typeof dialog.showModal==="function")dialog.showModal();
  return true;
}

function showCardDetails(card){
  setupCardDetailDialog();
  const dialog=$("cardDetailDialog");
  if(!dialog)return;
  const type=$("detailCardType");
  const name=$("detailCardName");
  const stats=$("detailCardStats");
  const abilities=$("detailCardAbilities");
  const safe=(value)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  type.textContent=card.type==="army"?"ORDU KARTI":"DESTEK KARTI";
  name.textContent=card.name;
  stats.textContent=card.type==="army"?`Güç: ${card.points}`:`Hız: ${card.speed||"Belirtilmemiş"}`;
  const effects=card.type==="support"?(card.effects||[]):[card.effect||card.description||"Özel bir gücü yok."];
  abilities.innerHTML=effects.map((effect,index)=>`<section class="detail-ability"><span class="detail-ability-number">${card.type==="support"?`YETENEK ${index+1}`:"YETENEK"}</span><p>${safe(effect)}</p></section>`).join("");
  if(typeof dialog.showModal==="function")dialog.showModal();
  else dialog.setAttribute("open","");
}
function closeCardDetails(){
  const dialog=$("cardDetailDialog");
  if(dialog&&typeof dialog.close==="function")dialog.close();
  else if(dialog)dialog.removeAttribute("open");
}

function setupCardDetailDialog(){
  const close=$("closeCardDetail");
  if(close&&!close.dataset.bound){close.dataset.bound="1";close.addEventListener("click",closeCardDetails);}
  const dialog=$("cardDetailDialog");
  if(dialog&&!dialog.dataset.bound){dialog.dataset.bound="1";dialog.addEventListener("click",(event)=>{if(event.target===dialog)closeCardDetails();});}
}

function cardElement(card,selectable=true){
  const el=document.createElement("button");
  el.type="button";
  const cardOwner=card.color||state.activeColor;
  const supportBlocked=selectable&&card.type==="support"&&state.players[cardOwner]?.status?.noSupportTurns>0;
  const strength=card.type==="army"?(card.points>=7?"elite":card.points>=4?"veteran":"recruit"):"support";
  const speedClass=card.type==="support"?({"Çok hızlı":"speed-very-fast","Hızlı":"speed-fast","Yavaş":"speed-slow","Çok yavaş":"speed-very-slow"}[card.speed]||""):"";
  el.className=`card ${card.type} ${card.color||""} ${strength} ${speedClass}${supportBlocked?" support-blocked":""}`;
  if(supportBlocked){el.setAttribute("aria-disabled","true");el.title="Destek yasağı sürüyor; bu kart oynanamaz.";}
  const abilityTexts=card.type==="support"?(card.effects||[]):[card.effect||card.description||""];
  const readableAbility=abilityTexts.filter(Boolean).join(" ");
  el.setAttribute("aria-label",`${card.name}, ${card.type==="army"?"Ordu kartı, güç "+card.points:"Destek kartı, "+(card.speed||"")}. Yetenekler: ${readableAbility||"Özel yeteneği yok."}`);
  const label=card.type==="army"?"ORDU":`DESTEK · ${card.speed||""}`;
  const points=card.type==="army"?card.points:"✧";
  const art=card.icon||"✦";
  const escapeCardText=(value)=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const abilityMarkup=abilityTexts.filter(Boolean).length
    ? abilityTexts.filter(Boolean).map((text,i)=>`<span class="ability-line"><b>${card.type==="support"?`${i+1}.`:"✦"}</b> ${escapeCardText(text)}</span>`).join("")
    : `<span class="ability-empty">Özel yeteneği yok.</span>`;
  const artContent=card.art?`<img class="card-illustration" src="${escapeCardText(card.art)}" alt="" loading="lazy" decoding="async">`:`<span class="sigil sigil-${card.type}"><span class="sigil-orbit"></span><span class="art-symbol">${escapeCardText(art)}</span><span class="sigil-notch"></span></span>`;
  el.innerHTML=`<span class="card-corner card-corner-top">${card.type==="army"?(card.points||""):"✧"}</span><span class="card-ribbon">${escapeCardText(label)}</span><span class="card-art">${artContent}<span class="art-caption">${card.type==="army"?"SAVAŞ NİŞANI":"MÜHÜR ODASI"}</span></span><span class="card-name">${escapeCardText(card.name)}</span><span class="card-meta"><span>${card.type==="army"?"GÜÇ":"HIZ"}</span><strong class="card-points">${points}</strong></span><span class="card-description">${abilityMarkup}</span><span class="card-bottom-rule"><span></span><span>KRONİKLER · I</span><span></span></span>`;
  if(selectable)el.addEventListener("click",()=>toggleCard(card.id));
  el.addEventListener("contextmenu",(event)=>{event.preventDefault();showCardDetails(card);});
  const inspect=document.createElement("span");
  inspect.className="card-inspect";
  inspect.textContent="ⓘ";
  inspect.setAttribute("role","button");
  inspect.setAttribute("tabindex","0");
  inspect.setAttribute("aria-label",`${card.name} ayrıntılarını göster`);
  inspect.title="Kart ayrıntılarını göster";
  inspect.addEventListener("click",(event)=>{event.preventDefault();event.stopPropagation();showCardDetails(card);});
  inspect.addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();showCardDetails(card);}});
  el.appendChild(inspect);
  if(state.selected.has(card.id))el.classList.add("selected");
  return el;
}
function renderHand(){
  const host=$("greenHand"),p=currentPlayer();host.innerHTML="";
  const handTitle=$("handTitle");if(handTitle)handTitle.textContent=`${colorName(state.activeColor)} Krallık'ın eli`;
  $("handHint").textContent=state.stage==="choose"?`${colorName(state.activeColor)} Krallık · en az 1 kart seç`:"Tur başlayınca kartlar burada görünür";
  if(!p||!p.hand.length){host.innerHTML='<div class="hand-placeholder">Elde kart yok.</div>';return;}
  p.hand.forEach(c=>{const el=cardElement(c);if(c.justDrawn){el.classList.add("card-draw-in");delete c.justDrawn;}host.appendChild(el);});
  $("playButton").disabled=state.selected.size===0||state.stage!=="choose";
  $("playButton").textContent=`${colorName(state.activeColor)}: seçilen kartları kapalı oyna`;
}
function renderPlayed(color){
  const host=$(color+"Played");host.innerHTML="";
  if(!state.played[color].length){host.innerHTML='<span class="battle-empty">Oynanan kart yok</span>';return;}
  state.played[color].forEach(c=>{
    if(c.faceDown){const back=document.createElement("div");back.className=`deck-back ${color}-back${c.justPlayed?" battle-card-enter":""}`;delete c.justPlayed;back.innerHTML="<span>CB</span><small>KAPALI</small>";host.appendChild(back);}
    else host.appendChild(cardElement(c,false));
  });
}
function renderGrave(color){
  const host=$(color+"Grave"),p=state.players[color],all=[...p.armyGrave,...p.supportGrave];host.innerHTML="";
  host.setAttribute("role","button");host.setAttribute("tabindex","0");host.setAttribute("aria-label",`${colorName(color)} Krallık Çöp alanını incele (${all.length} kart)`);host.title="Kart adlarını ve yeteneklerini görmek için aç";
  if(!all.length){host.innerHTML='<span class="empty-grave">Henüz kayıp yok · incelemek için aç</span>';}
  else all.slice(-9).forEach(c=>{const el=document.createElement("span");el.className=`grave-card${c.justGraved?" grave-card-enter":""}`;delete c.justGraved;el.title=`${c.name}: ${c.effect||((c.effects||[]).join(" / "))||""}`;el.textContent=c.type==="army"?c.points:"✧";host.appendChild(el);});
  host.onclick=()=>openGraveyard(color);
  host.onkeydown=(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openGraveyard(color);}};
}
function openGraveyard(color){
  state.graveyardColor=color;
  const dialog=$("graveyardDialog");
  $("graveyardTitle").textContent=`${colorName(color)} Krallık · Çöp alanı`;
  $("graveyardDescription").textContent="Çöpe gitmiş kartların adlarını, güç/hız bilgilerini ve yetenek metinlerini incele.";
  $("graveyardFilter").value="all";
  renderGraveyardContents();
  if(dialog&&typeof dialog.showModal==="function")dialog.showModal();else if(dialog)dialog.setAttribute("open","");
}
function renderGraveyardContents(){
  const color=state.graveyardColor||"green",p=state.players[color],filter=$("graveyardFilter")?.value||"all",host=$("graveyardList");
  if(!host||!p)return;
  const cards=[...p.armyGrave,...p.supportGrave].filter(c=>filter==="all"||c.type===filter).slice().reverse();
  $("graveyardCount").textContent=`${cards.length} kart`;
  host.replaceChildren();
  if(!cards.length){const empty=document.createElement("p");empty.className="card-guide-empty";empty.textContent="Bu bölümde kart yok.";host.appendChild(empty);return;}
  cards.forEach(card=>{
    const item=document.createElement("article");item.className="graveyard-item";
    const img=document.createElement("img");img.src=card.art||"";img.alt="";img.loading="lazy";img.decoding="async";
    const body=document.createElement("div");
    const name=document.createElement("h3");name.textContent=card.name;
    const meta=document.createElement("p");meta.className="graveyard-item-meta";meta.textContent=card.type==="army"?`Ordu · ${card.points} güç`:`Destek · ${card.speed||"Hız belirtilmemiş"}`;
    body.append(name,meta);
    const effects=card.type==="support"?(card.effects||[]):[card.effect||"Özel bir gücü yok."];
    effects.forEach((effect,index)=>{const text=document.createElement("p");text.className="graveyard-item-effect";text.textContent=card.type==="support"?`${index+1}. ${effect}`:effect;body.appendChild(text);});
    item.append(img,body);host.appendChild(item);
  });
}

function renderStatusBadges(color){
  const host=$(`${color}Status`);
  if(!host)return;
  const p=state.players[color],s=p.status,badges=[];
  if(s.noSupportTurns>0)badges.push({kind:"restriction",title:"Destek yasağı",text:`Destek oynayamaz · ${s.noSupportTurns} tur`,detail:"Bu oyuncu Destek kartı çekebilir; ancak kısıtlama sürerken çektiği veya başka bir etkiyle eline geçen Destek kartını oynayamaz."});
  if(s.armyOnePointTurns>0)badges.push({kind:"restriction",title:"Ordu zayıflatıldı",text:`Ordu 1 puan · ${s.armyOnePointTurns} tur`,detail:"Bu oyuncunun Ordu kartları etkili puan hesabında 1 puan sayılır. Barbar kartı tüm olumlu ve olumsuz kart etkilerine bağışık olduğu için bu kısıtlamadan etkilenmez."});
  if(s.openDrawTurns>0)badges.push({kind:"restriction",title:"Açık çekim",text:`Açık çekim · ${s.openDrawTurns} tur`,detail:"Bu oyuncunun çektiği kartların adı savaş günlüğünde herkese gösterilir."});
  if(s.deckEffectsBlocked>0)badges.push({kind:"restriction",title:"Deste etkisi engeli",text:`Deste etkileri kapalı · ${s.deckEffectsBlocked} tur`,detail:"Deste üzerinde doğrudan işlem yapan yetenekler bu süre boyunca uygulanmaz. Çöp alanından karta el veya sahaya geri alma gibi deste üzerinde işlem yapmayan etkiler engellenmez."});
  if(s.returnSupports)badges.push({kind:"buff",title:"Destekleri geri döndür",text:"Destek kartları tur sonunda döner",detail:"Bu tur oynanan Destek kartları tur sonunda desteye geri döner."});
  if(s.returnSupportsNextTurn)badges.push({kind:"buff",title:"Gelecek tur Destek iadesi",text:"Sonraki tur Destek iadesi",detail:"Bir sonraki tur oynanan Destek kartları, turun sonunda kendi Destek destesine geri döner."});
  if(s.queenStealNextTurn)badges.push({kind:"buff",title:"Kraliçe kart seçimi",text:"Sonraki tur kart çal",detail:"Sonraki tur iki oyuncu da kart çektikten sonra rakibin elinden bir kart seçilir."});
  if(p.nextDrawBonus>0)badges.push({kind:"buff",title:"Ek kart çekimi",text:`Sonraki tur +${p.nextDrawBonus} kart`,detail:"Sonraki tur normal çekime ek kart çekme hakkı."});
  if(!badges.length){host.innerHTML='<span class="status-empty">Aktif kısıtlama yok</span>';return;}
  host.innerHTML=badges.map(b=>`<button type="button" class="status-badge ${b.kind}" title="${b.title}" aria-label="${b.title}: ${b.detail.replace(/"/g,"&quot;")}"><strong>${b.text}</strong><span class="status-info">ⓘ</span></button>`).join("");
  host.querySelectorAll(".status-badge").forEach((el,i)=>{
    el.addEventListener("click",()=>{
      const b=badges[i];
      const dialog=$("statusDetailDialog");
      if(!dialog)return;
      $("statusDetailTitle").textContent=b.title;
      $("statusDetailText").textContent=b.detail;
      $("statusDetailDuration").textContent=b.text;
      if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
    });
  });
}

function downloadCombatReport(){
  const combats=Array.isArray(state.combatHistory)?state.combatHistory:[];
  if(!combats.length)return;
  const wins={green:0,red:0,draw:0};
  const totals={points:{green:0,red:0},armyLost:{green:0,red:0}};
  for(const item of combats){
    if(item.winner==="green"||item.winner==="red")wins[item.winner]++;else wins.draw++;
    for(const color of ["green","red"]){totals.points[color]+=Number(item.points?.[color])||0;totals.armyLost[color]+=Number(item.armyLost?.[color])||0;}
  }
  const lines=["CASUS BELLI · MAÇ RAPORU","",`Toplam çatışma: ${combats.length}`,`Çatışma sonuçları: Yeşil ${wins.green} galibiyet · Kırmızı ${wins.red} galibiyet · ${wins.draw} beraberlik`,`Toplam çatışma puanı: Yeşil ${totals.points.green} · Kırmızı ${totals.points.red}`,`Toplam Ordu kaybı: Yeşil ${totals.armyLost.green} · Kırmızı ${totals.armyLost.red}`,""];
  for(const item of combats){
    lines.push(`Tur ${item.round}: ${item.winner?colorName(item.winner)+" kazandı":"Berabere"}`,`Puan: Yeşil ${item.points.green} - ${item.points.red} Kırmızı`,`Ordu kaybı: Yeşil ${item.armyLost.green} - ${item.armyLost.red} Kırmızı`);
    const names=item.armyLostNames||{green:[],red:[]};
    lines.push(`Yeşil kayıplar: ${(names.green||[]).join(", ")||"Yok"}`,`Kırmızı kayıplar: ${(names.red||[]).join(", ")||"Yok"}`);
    const scores=item.armyScoreDetails||{green:[],red:[]};
    for(const color of ["green","red"]){
      lines.push(`${colorName(color)} Ordu puan dökümü:`);
      const cards=scores[color]||[];
      if(!cards.length)lines.push("  Ordu kartı oynanmadı");
      for(const card of cards){
        const modifiers=Array.isArray(card.modifiers)?card.modifiers:[];
        lines.push(`  ${card.name}: temel ${card.basePoints}, sonuç ${card.finalPoints} puan${modifiers.length?"; etkiler: "+modifiers.join("; "):""}`);
      }
    }
    lines.push("");
  }
  const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="casus-belli-mac-raporu.txt";link.hidden=true;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function downloadCombatCSV(){
  const combats=Array.isArray(state.combatHistory)?state.combatHistory:[];
  if(!combats.length)return;
  const quote=(value)=>'"'+String(value??"").replace(/"/g,'""')+'"';
  const rows=[["Tur","Kazanan","Yesil puan","Kirmizi puan","Yesil Ordu kaybi","Kirmizi Ordu kaybi","Yesil kayip kartlari","Kirmizi kayip kartlari","Krallik","Kart","Temel puan","Son puan","Puan etkileri"]];
  for(const item of combats){
    const names=item.armyLostNames||{green:[],red:[]};
    const common=[item.round,item.winner?colorName(item.winner):"Berabere",item.points?.green??0,item.points?.red??0,item.armyLost?.green??0,item.armyLost?.red??0,(names.green||[]).join(", "),(names.red||[]).join(", ")];
    let wrote=false;
    for(const color of ["green","red"]){
      for(const card of item.armyScoreDetails?.[color]||[]){
        rows.push([...common,colorName(color),card.name,card.basePoints,card.finalPoints,(card.modifiers||[]).join("; ")]);wrote=true;
      }
    }
    if(!wrote)rows.push([...common,"","","","",""]);
  }
  const csv="\uFEFF"+rows.map(row=>row.map(quote).join(";")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="casus-belli-mac-raporu.csv";link.hidden=true;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renderCombatSummary(){
  const host=$("battleSummary");
  if(!host)return;
  if(!state.lastCombat){host.hidden=true;host.innerHTML="";return;}
  const result=state.lastCombat;
  const score=`Yeşil ${result.points.green} · ${result.points.red} Kırmızı`;
  const outcome=result.winner?`${colorName(result.winner)} Krallık bu çatışmayı kazandı`:"Çatışma berabere bitti";
  const losses=`Ordu kaybı: Yeşil ${result.armyLost.green} · Kırmızı ${result.armyLost.red}`;
  const names=(result.armyLostNames||{green:[],red:[]});
  const escapeName=(value)=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const nameList=(color)=>names[color]?.length?names[color].map(escapeName).join(", "):"Yok";
  const details="<div class=\"battle-summary-cardloss\"><span>Yeşil kayıplar</span><strong>"+nameList("green")+"</strong></div><div class=\"battle-summary-cardloss\"><span>Kırmızı kayıplar</span><strong>"+nameList("red")+"</strong></div>";
  const scoreDetails=result.armyScoreDetails||{green:[],red:[]};
  const scoreList=(color)=>{
    const cards=scoreDetails[color]||[];
    return cards.length?cards.map(card=>{const base=Number(card.basePoints)||0;const final=Number(card.finalPoints)||0;const modifiers=Array.isArray(card.modifiers)?card.modifiers:[];const changed=base!==final||modifiers.length>0;const explanation=modifiers.length?`<small class="score-reasons">${modifiers.map(escapeName).join(" · ")}</small>`:"";return `<li class="${changed?"score-modified":""}"><span>${escapeName(card.name)}${changed?`<small class="score-transition">Temel ${base} → ${final}</small>`:""}${explanation}</span><strong>${final} puan</strong></li>`;}).join(""):'<li><span>Ordu kartı oynanmadı</span><strong>0 puan</strong></li>';
  };
  const scoreMarkup=`<details class=\"battle-score-details\"><summary aria-label=\"Çatışmadaki Ordu kartlarının puan dökümünü göster\">Puan dökümünü göster</summary><div class=\"battle-score-columns\"><section><h4>Yeşil Ordu</h4><ul>${scoreList("green")}</ul></section><section><h4>Kırmızı Ordu</h4><ul>${scoreList("red")}</ul></section></div></details>`;
  host.hidden=false;
  host.className=`battle-summary${result.winner?` winner-${result.winner}`:" draw"}`;
  const history=[...(state.combatHistory||[])].slice(0,-1).reverse();
  const historyMarkup=history.length?`<details class="battle-history"><summary>Önceki çatışmalar (${history.length})</summary><ol>${history.map(item=>{const oldOutcome=item.winner?`${colorName(item.winner)} kazandı`:"Berabere";const oldNames=item.armyLostNames||{green:[],red:[]};const oldNameList=(color)=>oldNames[color]?.length?oldNames[color].map(escapeName).join(", "):"Yok";const oldScores=item.armyScoreDetails||{green:[],red:[]};const oldScoreList=(color)=>(oldScores[color]||[]).map(card=>{const mods=Array.isArray(card.modifiers)?card.modifiers:[];const base=Number(card.basePoints)||0;const final=Number(card.finalPoints)||0;const changed=base!==final||mods.length>0;return `<li class="${changed?"score-modified":""}"><span>${escapeName(card.name)}${changed?`<small class="score-transition">Temel ${base} → ${final}</small>`:""}${mods.length?`<small class="score-reasons">${mods.map(escapeName).join(" · ")}</small>`:""}</span><strong>${final} puan</strong></li>`;}).join("")||'<li><span>Ordu kartı oynanmadı</span><strong>0 puan</strong></li>';const oldScoreMarkup=item.armyScoreDetails?`<details class="battle-history-scores"><summary>Puan dökümü</summary><div class="battle-score-columns"><section><h4>Yeşil Ordu</h4><ul>${oldScoreList("green")}</ul></section><section><h4>Kırmızı Ordu</h4><ul>${oldScoreList("red")}</ul></section></div></details>`:"";return `<li><span><strong>${item.round}. tur</strong><small>${oldOutcome} · ${item.points.green}–${item.points.red}</small><small>Yeşil kayıplar: ${oldNameList("green")}</small><small>Kırmızı kayıplar: ${oldNameList("red")}</small>${oldScoreMarkup}</span><span class="battle-history-losses">Kayıp: ${item.armyLost.green}–${item.armyLost.red}</span></li>`;}).join("")}</ol></details>`:"";
  host.innerHTML=`<div class="battle-summary-top"><span>SON ÇATIŞMA · ${result.round}. TUR</span><strong>${outcome}</strong></div><div class="battle-summary-score" aria-label="Çatışma puanı">${score}</div><div class="battle-summary-losses">${losses}</div><div class="battle-summary-cardlosses">${details}</div>${scoreMarkup}${historyMarkup}`;
  const exportButton=document.createElement("button");exportButton.type="button";exportButton.className="battle-report-export";exportButton.textContent="Maç raporunu indir (.txt)";exportButton.addEventListener("click",downloadCombatReport);host.appendChild(exportButton);const csvButton=document.createElement("button");csvButton.type="button";csvButton.className="battle-report-export battle-report-export-csv";csvButton.textContent="Maç raporunu indir (.csv)";csvButton.addEventListener("click",downloadCombatCSV);host.appendChild(csvButton);
}
function render(){
  for(const color of ["green","red"]){
    const p=state.players[color];
    $(`${color}ArmyCount`).textContent=p.army.length;
    $(`${color}SupportCount`).textContent=p.support.length;
    $(`${color}GraveCount`).textContent=p.armyGrave.length+p.supportGrave.length;
    renderGrave(color);renderPlayed(color);renderStatusBadges(color);
  }
  renderCombatSummary();
  if(state.stage==="choose"){renderHand();$("playButton").onclick=playActiveCards;}
  else if(state.stage!=="redchoose"){ $("playButton").disabled=true; }
}
$("drawButton").addEventListener("click",startRound);
$("resolveButton").addEventListener("click",resolveRound);
$("resetButton").addEventListener("click",resetGame);
$("gameOverRestart")?.addEventListener("click",resetGame);
$("rulesButton").addEventListener("click",()=>$("rulesDialog").showModal());
const cardGuideButton=$("cardGuideButton");if(cardGuideButton)cardGuideButton.addEventListener("click",openCardGuide);
const cardGuideSearch=$("cardGuideSearch");if(cardGuideSearch)cardGuideSearch.addEventListener("input",renderCardGuide);
const cardGuideFilter=$("cardGuideFilter");if(cardGuideFilter)cardGuideFilter.addEventListener("change",renderCardGuide);
const graveyardFilter=$("graveyardFilter");if(graveyardFilter)graveyardFilter.addEventListener("change",renderGraveyardContents);
const closeGraveyard=$("closeGraveyard");if(closeGraveyard)closeGraveyard.addEventListener("click",()=>$("graveyardDialog")?.close());
const closeCardGuide=$("closeCardGuide");if(closeCardGuide)closeCardGuide.addEventListener("click",()=>$("cardGuideDialog")?.close());
const closeStatusDetail=$("closeStatusDetail");if(closeStatusDetail)closeStatusDetail.addEventListener("click",()=> $("statusDetailDialog").close());
resetGame();
