let casusStateData = null;
let selectedCasusIds = new Set();
let casusAbilityChoices = {};

socket.on('casusStarted', () => {
    selectedCasusIds.clear();
    casusAbilityChoices = {};
    document.getElementById('casusLobbyControls').style.display = 'none';
    document.getElementById('casusGameArea').style.display = 'flex';
    document.getElementById('casusWinnerBox').style.display = 'none';
});

function escapeCasusText(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function drawCasusCard(deckType) {
    if (!casusStateData || casusStateData.phase !== 'draw') return;
    socket.emit('casusDrawCard', deckType);
}

function toggleCasusCard(id) {
    if (!casusStateData || casusStateData.phase !== 'play') return;
    if (selectedCasusIds.has(id)) selectedCasusIds.delete(id);
    else selectedCasusIds.add(id);
    renderCasusHand(casusStateData.myHand || [], casusStateData.phase);
}

function chooseCasusAbility(evt, id, index) {
    if (evt) evt.stopPropagation();
    casusAbilityChoices[id] = index;
    renderCasusHand(casusStateData?.myHand || [], casusStateData?.phase);
}

function submitCasusCards() {
    if (!casusStateData || casusStateData.phase !== 'play') return;
    const hand = casusStateData.myHand || [];
    const indices = hand.map((card, i) => selectedCasusIds.has(card.id) ? i : -1).filter(i => i >= 0);
    if (!indices.length) return;
    socket.emit('casusSubmitCards', { indices, abilityChoices: casusAbilityChoices });
    selectedCasusIds.clear();
}

function renderCasusCard(card, opts = {}) {
    const { index = -1, selectable = false, selected = false, hidden = false } = opts;
    if (hidden) return '<div class="casus-card-back"><span>CB</span><small>GİZLİ HAMLE</small></div>';
    const typeLabel = card.type === 'support' ? 'DESTEK' : 'ORDU';
    const power = card.type === 'army' ? `<span class="casus-card-power">${escapeCasusText(card.power)}</span>` : '<span class="casus-card-power casus-support-symbol">✦</span>';
    const image = card.image ? `<img class="casus-card-art" src="${escapeCasusText(card.image)}" alt="${escapeCasusText(card.name)}" loading="lazy">` : '';
    let abilities = '';
    if (selectable && card.type === 'support' && Array.isArray(card.abilities)) {
        const choice = casusAbilityChoices[card.id] ?? 0;
        abilities = `<div class="casus-ability-picker">${card.abilities.map((a, i) => `<button type="button" class="casus-ability ${choice === i ? 'is-chosen' : ''}" onclick="chooseCasusAbility(event, '${escapeCasusText(card.id)}',${i})"><b>${i + 1}. ${escapeCasusText(a.label)}</b><small>${escapeCasusText(a.text)}</small></button>`).join('')}</div>`;
    }
    if (selectable) {
        return `<article role="button" tabindex="0" aria-pressed="${selected}" class="casus-card ${card.type} ${selected ? 'is-selected' : ''}" onclick="toggleCasusCard('${escapeCasusText(card.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCasusCard('${escapeCasusText(card.id)}')}">${power}${image}<div class="casus-card-copy"><small>${typeLabel}</small><strong>${escapeCasusText(card.name)}</strong>${card.type === 'army' ? `<span class="casus-card-description">${card.trait === 'peasant' ? 'Özel: +3 güç' : 'Cephe birimi'}</span>` : '<span class="casus-card-description">Bir yetenek seç</span>'}</div>${abilities}<span class="casus-card-select">${selected ? '✓ SEÇİLDİ' : 'SEÇ'}</span></article>`;
    }
    return `<article class="casus-card ${card.type} casus-card-reveal">${power}${image}<div class="casus-card-copy"><small>${typeLabel}</small><strong>${escapeCasusText(card.name)}</strong></div></article>`;
}

function renderCasusHand(hand, phase) {
    const handDiv = document.getElementById('casusMyHand');
    handDiv.innerHTML = hand.map((card, idx) => renderCasusCard(card, { index: idx, selectable: phase === 'play', selected: selectedCasusIds.has(card.id) })).join('');
    const selectedCount = selectedCasusIds.size;
    document.getElementById('casusSubmitButton').disabled = phase !== 'play' || selectedCount === 0;
    document.getElementById('casusSubmitButton').style.display = phase === 'play' ? 'flex' : 'none';
    document.getElementById('casusSelectionHint').textContent = phase === 'play' ? `${selectedCount} kart seçildi · En az bir kart oyna` : 'İki kart çektikten sonra cepheye süreceğin kartları seç.';
}

function renderPlayedCards(containerId, cards, hidden) {
    const container = document.getElementById(containerId);
    if (hidden) {
        container.innerHTML = '<div class="casus-card-back"><span>CB</span><small>GİZLİ HAMLE</small></div>';
    } else if (!cards || !cards.length) {
        container.innerHTML = '<div class="casus-slot-placeholder"><span>⚔</span><small>HENÜZ KART YOK</small></div>';
    } else {
        container.innerHTML = cards.map(card => renderCasusCard(card)).join('');
    }
}

socket.on('casusUpdate', (state) => {
    casusStateData = state;
    const ids = Object.keys(state.players || {});
    const oppId = ids.find(id => id !== socket.id);
    const meInfo = state.players[socket.id];
    const oppInfo = state.players[oppId];
    if (!meInfo) return;

    document.getElementById('casusRoundLabel').textContent = `TUR ${state.round || 1} · KLASİK MOD`;
    if (oppInfo) {
        document.getElementById('casusOpponentName').textContent = oppInfo.name;
        document.getElementById('casusOppArmyDeck').textContent = oppInfo.armyDeckCount;
        document.getElementById('casusOppSupportDeck').textContent = oppInfo.supportDeckCount;
        document.getElementById('casusOppTrash').textContent = oppInfo.armyTrashCount + oppInfo.supportTrashCount;
        renderPlayedCards('casusOppPlayedCards', oppInfo.playedCards, state.phase !== 'resolve' && oppInfo.hasSubmitted);
    }
    document.getElementById('casusMyArmyDeck').textContent = state.myDecks?.army ?? 0;
    document.getElementById('casusMySupportDeck').textContent = state.myDecks?.support ?? 0;
    document.getElementById('casusMyTrash').textContent = (state.myTrash?.army ?? 0) + (state.myTrash?.support ?? 0);
    document.getElementById('casusDrawCount').textContent = state.drawCount ?? 0;
    document.getElementById('casusArmyDrawCount').textContent = state.myDecks?.army ?? 0;
    document.getElementById('casusSupportDrawCount').textContent = state.myDecks?.support ?? 0;

    const drawControls = document.getElementById('casusDrawControls');
    drawControls.style.display = state.phase === 'draw' ? 'flex' : 'none';
    const canDraw = state.phase === 'draw' && !meInfo.hasSubmitted && (state.drawCount ?? 0) < 2;
    drawControls.querySelectorAll('button').forEach((btn, i) => {
        const count = i === 0 ? (state.myDecks?.army ?? 0) : (state.myDecks?.support ?? 0);
        btn.disabled = !canDraw || count < 1;
    });
    document.getElementById('casusHandTitle').textContent = state.phase === 'draw' ? 'Destelerinden kart çek' : state.phase === 'play' ? 'Cepheye süreceğin kartları seç' : 'Hamleler çözülüyor';

    if (state.phase !== 'play') selectedCasusIds.clear();
    renderCasusHand(state.myHand || [], state.phase);
    renderPlayedCards('casusMyPlayedCards', meInfo.playedCards, state.phase !== 'resolve' && meInfo.hasSubmitted);

    const statusEl = document.getElementById('casusStatusText');
    if (state.phase === 'draw') {
        statusEl.textContent = (state.drawCount ?? 0) >= 2 ? 'İki kartını çektin. Rakibin de hazırlığını tamamlamasını bekle.' : `Tur ${state.round || 1}: ${2 - (state.drawCount ?? 0)} kart daha çek.`;
        statusEl.style.color = '#d8bb80';
    } else if (state.phase === 'play') {
        statusEl.textContent = meInfo.hasSubmitted ? 'Hamlen gizlendi. Rakibin karar vermesini bekliyorsun…' : 'En az bir kart seç. Seçmediğin kartlar destelerinin altına döner.';
        statusEl.style.color = '#d8bb80';
    } else if (state.phase === 'resolve') {
        statusEl.textContent = state.resolveMessage || 'Kart yetenekleri uygulanıyor…';
        statusEl.style.color = '#f0d39a';
    }
});

socket.on('casusFinished', (data) => {
    document.getElementById('casusWinnerBox').style.display = 'block';
    document.getElementById('casusWinnerTitle').innerText = data.winner === 'BERABERE' ? 'BERABERE!' : `🏆 KAZANAN: ${data.winner}!`;
    document.getElementById('casusStatusText').textContent = 'Maç sona erdi.';
});
