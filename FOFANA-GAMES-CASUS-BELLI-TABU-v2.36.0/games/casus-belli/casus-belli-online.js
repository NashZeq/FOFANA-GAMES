'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const status = $('cbOnlineStatus'), playersHost = $('cbOnlinePlayers'), gameHost = $('cbOnlineGame');
  const createButton = $('cbCreateRoom'), joinButton = $('cbJoinRoom'), readyButton = $('cbReadyButton'), leaveButton = $('cbLeaveRoom');
  if (!status || !createButton || !joinButton || !readyButton || !gameHost) return;
  let socket = null, currentRoom = null, playerId = null, resumeToken = null, isReady = false;
  const key = 'fofana-casus-belli-room-v3';
  function say(message) { status.textContent = message; }
  function name() { return String($('cbOnlineName').value || '').trim().slice(0,18); }
  function setBusy(busy) {
    createButton.disabled = busy; joinButton.disabled = busy;
    for (const b of document.querySelectorAll('[data-game-room]')) b.disabled = busy;
  }
  function renderRoomStatus(rooms) {
    for (const room of rooms || []) {
      const b = document.querySelector(`[data-game-room="${room.slot}"]`);
      if (!b) continue;
      b.disabled = !!room.full;
      b.textContent = `${room.slot}. Oda · ${room.players}/2${room.status === 'playing' ? ' · Maçta' : room.full ? ' · Dolu' : ''}`;
    }
  }
  function button(label, event, payload, disabled = false) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = disabled; b.addEventListener('click', () => action(event, payload)); return b; }
  function action(event, payload = {}) {
    if (!socket || !socket.connected) { say('Sunucu bağlantısı yok.'); return; }
    socket.emit(event, payload, result => { if (!result?.ok) { say(result?.error || 'İşlem tamamlanamadı.'); return; } if (result.room) renderRoom(result.room); });
  }
  function renderGame(room) {
    gameHost.replaceChildren(); const game = room.game;
    if (room.status === 'lobby') {
      if (room.canStart) gameHost.append(button('Maçı başlat', 'casus-belli:start'));
      return;
    }
    if (!game) return;
    const title = document.createElement('h3'); title.textContent = `Tur ${game.round} · ${({draw:'Kart çekme','queen-choice':'Kraliçe kart seçimi','priest-choice':'Rahip kart seçimi','support-target-choice':'Yetenek hedefi seçimi',play:'Kapalı hamle',revealed:'Hamleler açıldı',resolved:'Çatışma sonucu',finished:'Maç sona erdi'})[game.phase] || game.phase}`; gameHost.append(title);
    const note = document.createElement('p'); note.textContent = game.notice || ''; gameHost.append(note);
    if (game.phase === 'queen-choice') {
      const opponent = game.opponents[0];
      if (opponent && game.hand) {
        const isChooser = game.canChooseQueenSteal === true;
        // The server exposes only the opponent's hand count, never card identities.
        if (isChooser && game.ownSide) {
          const info = document.createElement('p'); info.textContent = `Rakibin elinde ${opponent.handCount} kapalı kart var. Bir yuva seç; kartın kimliği seçimden önce gösterilmez.`; gameHost.append(info);
          const slots = document.createElement('div'); slots.className = 'cb-online-actions';
          for (let i = 0; i < opponent.handCount; i++) slots.append(button(`Kapalı kart ${i + 1}`, 'casus-belli:queen-steal-select', { slotIndex: i }));
          gameHost.append(slots);
        } else { const wait = document.createElement('p'); wait.textContent = 'Rakibin Kraliçe etkisi için kapalı kart seçmesini bekliyorsun.'; gameHost.append(wait); }
      }
    } else if (game.phase === 'support-target-choice') {
      if (game.canChooseSupportTarget && game.supportTarget) {
        const target = game.supportTarget;
        const info = document.createElement('p');
        info.textContent = target.kind === 'priest-grave'
          ? 'Rahip: Rakibin hangi Çöp alanının en üstündeki kartını kendi destene alacağını seç.'
          : `Avcı: Rakibin oynadığı hangi ${target.kind === 'hunter-support' ? 'Destek' : 'Ordu'} kartını hedefleyeceğini seç.`;
        gameHost.append(info);
        const choices = document.createElement('div'); choices.className = 'cb-online-actions';
        for (const option of target.options || []) {
          let label, payload;
          if (target.kind === 'priest-grave') {
            label = `${option.name} · ${option.count} kart`;
            payload = { graveType: option.value };
          } else {
            label = `${option.name}${option.type === 'army' ? ` · ${option.points} puan` : ` · ${option.speed || 'Destek'}`}`;
            payload = { targetCardId: option.id };
          }
          choices.append(button(label, 'casus-belli:support-target', payload));
        }
        gameHost.append(choices);
      } else {
        const wait = document.createElement('p'); wait.textContent = 'Rakibin kart yeteneği için hedef seçmesini bekliyorsun.'; gameHost.append(wait);
      }
    } else if (game.phase === 'priest-choice') {
      if (game.canChoosePriestCards && game.priestOptions) {
        const options = game.priestOptions;
        const makeSelect = (labelText, key, cards, detail) => {
          const label = document.createElement('label'); label.className = 'cb-online-card';
          const text = document.createElement('span'); text.textContent = labelText; label.append(text);
          const select = document.createElement('select'); select.dataset.priestChoice = key;
          const skip = document.createElement('option'); skip.value = ''; skip.textContent = cards.length ? 'Kart seç' : 'Deste boş'; skip.disabled = cards.length > 0; skip.selected = true; select.append(skip);
          select.required = cards.length > 0;
          cards.forEach(card => { const option = document.createElement('option'); option.value = card.id; option.textContent = `${card.name}${detail(card)}`; select.append(option); });
          label.append(select); gameHost.append(label);
        };
        makeSelect('Ordu destesinin üstündeki iki karttan seç', 'armyCardId', options.army, c => ` · ${c.points ?? 0} puan`);
        makeSelect('Destek destesinin üstündeki iki karttan seç', 'supportCardId', options.support, c => ` · ${c.speed || ''}`);
        const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = 'Rahip seçimini onayla';
        confirm.addEventListener('click', () => {
          const choices = {};
          for (const select of gameHost.querySelectorAll('[data-priest-choice]')) choices[select.dataset.priestChoice] = select.value || null;
          action('casus-belli:priest-choice', choices);
        });
        gameHost.append(confirm);
      } else { const wait = document.createElement('p'); wait.textContent = 'Rakibin Rahip yeteneği için deste üstündeki kartlardan seçim yapmasını bekliyorsun.'; gameHost.append(wait); }
    } else if (game.phase === 'draw') {
      const info = document.createElement('p'); info.textContent = `Bu tur ${game.drawsRemaining} kart çekmen gerekiyor. Kalan desteler: Ordu ${game.armyDeckCount}, Destek ${game.supportDeckCount}.`; gameHost.append(info);
      const actions = document.createElement('div'); actions.className = 'cb-online-actions';
      actions.append(button('⚔ Ordu destesinden çek', 'casus-belli:draw', {type:'army'}, game.drawsRemaining < 1 || game.armyDeckCount < 1));
      actions.append(button('✧ Destek destesinden çek', 'casus-belli:draw', {type:'support'}, game.drawsRemaining < 1 || game.supportDeckCount < 1)); gameHost.append(actions);
      const other = game.opponents[0]; if (other) { const p = document.createElement('p'); p.textContent = `Rakip kart çekti: ${other.drew}/2`; gameHost.append(p); }
    } else if (game.phase === 'play') {
      if (game.hasSubmitted) { const p = document.createElement('p'); p.textContent = 'Hamlen kapalı olarak gönderildi. Rakibin hamlesini bekliyorsun.'; gameHost.append(p); }
      else {
        const hand = document.createElement('div'); hand.className = 'cb-online-hand';
        for (const card of game.hand) { const label = document.createElement('label'); label.className = 'cb-online-card'; const check = document.createElement('input'); check.type = 'checkbox'; check.value = card.id; check.name = 'cb-card-choice'; const text = document.createElement('span'); text.textContent = `${card.icon || '🃏'} ${card.name}`; const small = document.createElement('small'); small.textContent = card.type === 'army' ? `${card.points} temel puan · Ordu` : `Destek · ${card.speed || ''}`; text.append(small); label.append(check,text); hand.append(label);
          if (card.type === 'support' && Array.isArray(card.effects) && card.effects.length > 1) { const select = document.createElement('select'); select.className = 'cb-online-support-choice'; select.dataset.cardId = card.id; select.setAttribute('aria-label', `${card.name} yeteneği`); card.effects.forEach((effect, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `${i + 1}. ${effect}`; select.append(option); }); label.append(select);
            if (card.name === 'Hırsız') { const target = document.createElement('div'); target.className = 'cb-online-thief-target'; target.dataset.cardId = card.id; const deck = document.createElement('select'); deck.dataset.thiefDeck = card.id; deck.setAttribute('aria-label', 'Hırsız hedef destesi'); for (const [value, text] of [['army','Rakip Ordu destesi'],['support','Rakip Destek destesi']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; deck.append(option); } const edge = document.createElement('select'); edge.dataset.thiefEdge = card.id; edge.setAttribute('aria-label', 'Hırsız hedef konumu'); for (const [value, text] of [['top','Üstten'],['bottom','Alttan']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; edge.append(option); } target.append(deck, edge); label.append(target); }
          }
          else if (card.type === 'support' && Array.isArray(card.effects) && card.effects.length === 1) { const desc = document.createElement('small'); desc.textContent = card.effects[0]; label.append(desc); }
        }
        gameHost.append(hand); const playButton = document.createElement('button'); playButton.type = 'button'; playButton.textContent = 'Seçilen kartları kapalı oyna';
        const selectedCards = () => [...gameHost.querySelectorAll('input[name="cb-card-choice"]:checked')];
        const refreshPlayButton = () => { playButton.disabled = selectedCards().length === 0; };
        hand.addEventListener('change', refreshPlayButton);
        playButton.disabled = true;
        playButton.setAttribute('aria-label', 'Seçilen kartları kapalı oyna');
        playButton.addEventListener('click', () => { const cardIds=selectedCards().map(x=>x.value); if (!cardIds.length) { say('Kapalı oynamak için elinden en az bir kart seç.'); return; } const selectedIds=new Set(cardIds); const supportChoices={}, supportTargets={}; for (const select of gameHost.querySelectorAll('.cb-online-support-choice')) if (selectedIds.has(select.dataset.cardId)) supportChoices[select.dataset.cardId]=Number(select.value); for (const cardId of selectedIds) { const deck=gameHost.querySelector(`[data-thief-deck="${cardId}"]`), edge=gameHost.querySelector(`[data-thief-edge="${cardId}"]`); if (deck && edge) supportTargets[cardId]={deck:deck.value,edge:edge.value}; } action('casus-belli:play', {cardIds, supportChoices, supportTargets}); }); gameHost.append(playButton);
      }
      const other = game.opponents[0]; if (other) { const p = document.createElement('p'); p.textContent = `Rakibin hamlesi: ${other.submitted ? 'gönderildi' : 'bekleniyor'}. Kartları göremezsin.`; gameHost.append(p); }
    } else if (game.phase === 'revealed' || game.phase === 'resolved' || game.phase === 'finished') {
      const reveal = document.createElement('div'); reveal.className = 'cb-online-reveal';
      for (const side of game.revealed || []) { const section = document.createElement('section'); const h = document.createElement('h3'); h.textContent = `${side.color === 'green' ? 'Yeşil' : 'Kırmızı'} Krallık`; section.append(h); for (const card of side.cards) { const p = document.createElement('p'); p.textContent = `${card.icon || '🃏'} ${card.name}`; section.append(p); } reveal.append(section); }
      gameHost.append(reveal);
      if (game.result) {
        const result = document.createElement('section'); result.className = 'cb-online-result';
        if (game.result.matchOver) {
          const final = document.createElement('section'); final.className = 'cb-online-match-result';
          const finalHeading = document.createElement('h3');
          const matchWinner = room.players?.find(player => player.id === game.result.matchWinnerId);
          finalHeading.textContent = game.result.matchOutcome === 'draw' ? 'Maç berabere bitti' : `Maçı ${matchWinner?.name || 'rakip'} kazandı`;
          const finalReason = document.createElement('p'); finalReason.textContent = game.result.matchReason || 'Bir krallığın her iki destesi de tükendi.';
          final.append(finalHeading, finalReason); result.append(final);
        }
        const heading = document.createElement('h3'); heading.textContent = 'Çatışma puanları'; result.append(heading);
        for (const player of room.players || []) { const line = document.createElement('p'); const score = game.result.scores?.[player.id] ?? 0; line.textContent = `${player.name}: ${score} puan${game.result.winnerId === player.id ? ' · Bu çatışmayı kazandı' : ''}`; result.append(line); }
        for (const item of game.result.supportLog || []) { const line = document.createElement('p'); line.textContent = item; result.append(line); }
        for (const [id, cards] of Object.entries(game.result.scoreDetails || {})) { const detail = document.createElement('div'); const side = game.revealed?.find(x => x.playerId === id); const h = document.createElement('h4'); h.textContent = `${side?.color === 'green' ? 'Yeşil' : 'Kırmızı'} krallık · Ordu puanları`; detail.append(h); for (const card of cards) { const line = document.createElement('p'); line.textContent = `${card.name}: ${card.finalPoints} puan${card.modifiers?.length ? ' (' + card.modifiers.join(', ') + ')' : ''}`; detail.append(line); } result.append(detail); }
        gameHost.append(result);
      }
      if (game.phase === 'revealed' && room.hostId === playerId) gameHost.append(button('Çatışmayı çözümle', 'casus-belli:resolve'));
      if (game.phase === 'resolved' && room.hostId === playerId) gameHost.append(button('Sonraki tura geç', 'casus-belli:next-round'));
      if (game.phase === 'finished') {
        const votes = room.rematchVotes || [];
        const voteInfo = document.createElement('p');
        voteInfo.textContent = votes.includes(playerId)
          ? 'Rövanş isteğin kaydedildi. Diğer oyuncunun kararını bekliyorsun.'
          : `Rövanş için ${votes.length}/2 oyuncu onay verdi.`;
        gameHost.append(voteInfo);
        gameHost.append(button(votes.includes(playerId) ? 'Rövanş isteğini gönderdin' : 'Rövanş iste', 'casus-belli:rematch', {}, votes.includes(playerId)));
      }
    }
  }
  function renderRoom(room) {
    currentRoom = room; playersHost.replaceChildren();
    const me = (room.players || []).find(player => player.id === playerId);
    isReady = !!me?.ready;
    const spectators = $('cbSpectatorList'), green = $('cbGreenPlayers'), red = $('cbRedPlayers');
    for (const host of [spectators, green, red]) if (host) host.replaceChildren();
    const addPlayer = (host, player) => {
      if (!host) return;
      const chip = document.createElement('span'); chip.className = `cb-online-player${player.ready ? ' is-ready' : ''}`;
      chip.textContent = `${player.name}${player.connected ? '' : ' · Bağlantı koptu'}${player.ready ? ' · Hazır' : ' · Bekliyor'}`;
      host.appendChild(chip);
    };
    for (const player of room.players || []) {
      if (player.color === 'green') addPlayer(green, player);
      else if (player.color === 'red') addPlayer(red, player);
      else addPlayer(spectators, player);
      const legacy = document.createElement('span'); legacy.className = `cb-online-player${player.ready ? ' is-ready' : ''}`;
      legacy.textContent = `${player.name}${player.color === 'green' ? ' · Yeşil Krallık' : player.color === 'red' ? ' · Kırmızı Krallık' : ' · İzleyici'}${player.connected ? '' : ' · Bağlantı koptu'}${player.ready ? ' · Hazır' : ' · Bekliyor'}`;
      playersHost.appendChild(legacy);
    }
    for (const [host, emptyText] of [[spectators,'Henüz izleyici yok'],[green,'Oyuncu bekleniyor'],[red,'Oyuncu bekleniyor']]) {
      if (host && !host.children.length) { const empty = document.createElement('span'); empty.className = 'cb-lobby-empty'; empty.textContent = emptyText; host.appendChild(empty); }
    }
    const roomPicker = $('cbGameRooms'), kingdomChoices = $('cbKingdomChoices');
    if (roomPicker) roomPicker.hidden = !!playerId;
    if (leaveButton) leaveButton.hidden = !playerId;
    if (kingdomChoices) kingdomChoices.hidden = room.status !== 'lobby' || !playerId;
    for (const b of kingdomChoices?.querySelectorAll('[data-kingdom]') || []) {
      b.disabled = !!me?.ready || (room.players || []).some(p => p.id !== playerId && p.color === b.dataset.kingdom);
      b.classList.toggle('is-selected', me?.color === b.dataset.kingdom);
    }
    $('cbRoomCode').textContent = room.code || '';
    readyButton.disabled = room.status !== 'lobby' || !playerId || !me?.color;
    readyButton.textContent = isReady ? 'Hazır değilim' : 'Hazırım';
    say(`Oyun odası ${Number(String(room.code).slice(2))}: ${room.players.length}/2 oyuncu. ${room.status === 'lobby' ? 'İki oyuncu farklı krallıkları seçip hazır olduğunda maç başlayabilir.' : 'Maç sürüyor.'}`);
    renderGame(room);
  }
  function persist() { if (currentRoom && resumeToken) sessionStorage.setItem(key, JSON.stringify({ code: currentRoom.code, resumeToken, name: name() })); }
  function connect() {
    if (socket) return socket;
    if (typeof window.io !== 'function') { say('Socket.IO sunucusu bulunamadı. Siteyi çalışan FOFANA GAMES sunucusundan aç.'); return null; }
    socket = window.io({ reconnection: true, timeout: 8000 });
    socket.on('connect', () => { say('Sunucuya bağlandı.'); const saved = sessionStorage.getItem(key); if (saved && !currentRoom) { try { const session = JSON.parse(saved); socket.emit('casus-belli:resume', { code: session.code, resumeToken: session.resumeToken }, result => { if (result?.ok) { playerId = result.playerId; resumeToken = result.resumeToken; currentRoom = result.room; renderRoom(result.room); persist(); } else say('Sunucuya bağlandı. Eski oda oturumu kurtarılamadı; yeni oda kurabilir veya üç sabit odadan birine katılabilirsin.'); }); } catch { sessionStorage.removeItem(key); } } });
    socket.on('disconnect', () => { currentRoom = null; playerId = null; isReady = false; say('Sunucu bağlantısı kesildi. Yeniden bağlanmayı deniyorum.'); });
    socket.on('connect_error', () => say('Sunucuya ulaşılamadı. Siteyi çalışan FOFANA GAMES sunucusundan açtığını kontrol et.'));
    socket.on('casus-belli:room-state', room => { renderRoom(room); persist(); });
    socket.on('casus-belli:room-status', data => renderRoomStatus(data?.rooms));
    socket.emit('casus-belli:room-status', {}, result => { if (result?.ok) renderRoomStatus(result.rooms); });
    socket.on('casus-belli:started', () => say('Maç başladı. Kartlarını kendi ekranından çek ve seç.'));
    return socket;
  }
  function roomAction(event, payload) { const s = connect(); if (!s) return; setBusy(true); s.emit(event, payload, result => { setBusy(false); if (!result?.ok) { if (event === 'casus-belli:ready') isReady = !payload.ready; say(result?.error || 'İşlem tamamlanamadı.'); return; } playerId = result.playerId || playerId; resumeToken = result.resumeToken || resumeToken; if (result.room) renderRoom(result.room); persist(); }); }
  for (const roomButton of document.querySelectorAll('[data-game-room]')) roomButton.addEventListener('click', () => {
    if (!name()) { say('Önce komutan adını yaz.'); $('cbOnlineName').focus(); return; }
    roomAction('casus-belli:room-join', { slot: Number(roomButton.dataset.gameRoom), name: name() });
  });
  for (const kingdomButton of document.querySelectorAll('[data-kingdom]')) kingdomButton.addEventListener('click', () => {
    roomAction('casus-belli:kingdom', { color: kingdomButton.dataset.kingdom });
  });
  readyButton.addEventListener('click', () => { if (!currentRoom) return; isReady = !isReady; roomAction('casus-belli:ready', { ready: isReady }); });
  leaveButton?.addEventListener('click', () => {
    if (!socket || !socket.connected || !currentRoom) return;
    socket.emit('casus-belli:leave', {}, result => {
      if (!result?.ok) { say(result?.error || 'Odadan çıkılamadı.'); return; }
      sessionStorage.removeItem(key); currentRoom = null; playerId = null; resumeToken = null; isReady = false;
      playersHost.replaceChildren(); gameHost.replaceChildren();
      $('cbGameRooms').hidden = false; $('cbKingdomChoices').hidden = true;
      readyButton.disabled = true; leaveButton.hidden = true;
      say('Odadan ayrıldın. Üç sabit oyun odasından birine katılabilirsin.');
      socket.emit('casus-belli:room-status', {}, statusResult => { if (statusResult?.ok) renderRoomStatus(statusResult.rooms); });
    });
  });
  connect();
})();
