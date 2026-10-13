let casusStateData = null;

socket.on('casusStarted', () => {
    document.getElementById('casusLobbyControls').style.display = 'none';
    document.getElementById('casusGameArea').style.display = 'flex';
    document.getElementById('casusWinnerBox').style.display = 'none';
});

socket.on('casusUpdate', (state) => {
    casusStateData = state;
    
    const oppId = Object.keys(state.players).find(id => id !== socket.id);
    const meInfo = state.players[socket.id];
    const oppInfo = state.players[oppId];

    if (oppInfo) {
        document.getElementById('casusOpponentName').innerText = oppInfo.name;
        document.getElementById('casusOppDeck').innerText = oppInfo.deckCount;
        document.getElementById('casusOppTrash').innerText = oppInfo.trashCount;
        document.getElementById('casusOppHand').innerText = oppInfo.handCount;
        
        const oppSlot = document.getElementById('casusOppSlot');
        if (state.phase === 'resolve' && oppInfo.playedCard) {
            oppSlot.innerHTML = renderCasusCard(oppInfo.playedCard);
        } else if (oppInfo.hasPlayed) {
            oppSlot.innerHTML = '<div class="card-facedown"></div>';
        } else {
            oppSlot.innerHTML = '';
        }
    }

    if (meInfo) {
        document.getElementById('casusMyDeck').innerText = meInfo.deckCount;
        document.getElementById('casusMyTrash').innerText = meInfo.trashCount;
        
        const handDiv = document.getElementById('casusMyHand');
        handDiv.innerHTML = state.myHand.map((card, idx) => `
            <div class="casus-card ${card.type}" onclick="playCasusCard(${idx})">
                <div class="power">${card.power || '⚡'}</div>
                <div class="type">${card.name}</div>
            </div>
        `).join('');

        const mySlot = document.getElementById('casusMySlot');
        if (state.phase === 'resolve' && meInfo.playedCard) {
            mySlot.innerHTML = renderCasusCard(meInfo.playedCard);
        } else if (meInfo.hasPlayed) {
            mySlot.innerHTML = '<div class="card-facedown"></div>';
        } else {
            mySlot.innerHTML = '';
        }
    }
    
    const statusEl = document.getElementById('casusStatusText');
    if (state.phase === 'play') {
        statusEl.innerText = meInfo && meInfo.hasPlayed ? 'Rakibin hamlesi bekleniyor...' : 'KARTINI SEÇ!';
        statusEl.style.color = '#00adb5';
    } else if (state.phase === 'resolve') {
        statusEl.innerHTML = state.resolveMessage || 'Savaş Sonucu!';
        statusEl.style.color = '#f39c12';
    }
});

function playCasusCard(index) {
    if (casusStateData && casusStateData.phase === 'play') {
        socket.emit('casusPlayCard', index);
    }
}

function renderCasusCard(card) {
    return `
        <div class="casus-card ${card.type}" style="width: 100%; height: 100%; box-sizing: border-box; cursor: default; margin: 0;">
            <div class="power" style="font-size: 32px;">${card.power || '⚡'}</div>
            <div class="type" style="font-size: 10px;">${card.name}</div>
        </div>
    `;
}

socket.on('casusFinished', (data) => {
    document.getElementById('casusWinnerBox').style.display = 'block';
    document.getElementById('casusWinnerTitle').innerText = `🏆 KAZANAN: ${data.winner}!`;
});