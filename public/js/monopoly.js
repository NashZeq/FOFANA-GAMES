let latestMonoState = null;
let selectedTileForTrade = null;

function getTileGridStyle(id) {
    if (id >= 0 && id <= 10) return `grid-column: ${11 - id}; grid-row: 11;`;
    if (id > 10 && id <= 20) return `grid-column: 1; grid-row: ${11 - (id - 10)};`;
    if (id > 20 && id <= 30) return `grid-column: ${1 + (id - 20)}; grid-row: 1;`;
    if (id > 30 && id < 40) return `grid-column: 11; grid-row: ${1 + (id - 30)};`;
    return '';
}

socket.on('monopolyStateUpdated', (state) => {
    latestMonoState = state;
    document.getElementById('monoLobbyControls').style.display = 'none';
    document.getElementById('monoGameArea').style.display = 'flex';

    const hud = document.getElementById('monoPlayersHud');
    hud.innerHTML = state.players.map(p => `
        <div class="player-stat-card" style="border-left-color: ${p.color}; opacity: ${p.bankrupt ? '0.4' : '1'}">
            <strong>${p.name}</strong> ${p.bankrupt ? '(İFLAS)' : ''} ${p.inJail ? `🚨(BLOK DERS)` : ''}<br>
            💰 ${p.money}₺ | 📍 Kare: ${p.position} ${p.jailCardCount > 0 ? `<br>🎟️ ${p.jailCardCount}x Kart` : ''}
        </div>
    `).join('');

    const cp = state.players[state.turnIndex];
    const isMyTurn = socket.id === cp.id;
    document.getElementById('monoTurnInfo').innerHTML = `Sıra: <span style="color:${cp.color};">${cp.name}</span> ${isMyTurn ? '(SENDE!)' : ''}`;
    document.getElementById('diceDisplay').innerText = `🎲 ${state.dice[0]} - ${state.dice[1]}`;

    const canAct = isMyTurn && state.active && !cp.bankrupt && !state.waitingForDecision && !state.waitingForDoblo;
    document.getElementById('btnRollDice').style.display = canAct ? 'inline-block' : 'none';
    document.getElementById('btnPayBail').style.display = (canAct && cp.inJail && cp.money >= 100) ? 'inline-block' : 'none';
    document.getElementById('btnUseCard').style.display = (canAct && cp.inJail && cp.jailCardCount > 0) ? 'inline-block' : 'none';

    document.getElementById('monoLogBox').innerHTML = state.log.map(l => `<div>• ${l}</div>`).join('');
    syncMonoBoard(state);
});

function syncMonoBoard(state) {
    const boardGrid = document.getElementById('boardGrid');
    if (boardGrid.querySelectorAll('.mono-tile').length === 0) {
        state.board.forEach(tile => {
            const div = document.createElement('div');
            div.className = 'mono-tile';
            div.id = `tile-node-${tile.id}`;
            div.style = getTileGridStyle(tile.id);
            div.onclick = () => onTileClick(tile);

            let colorBar = '';
            if (tile.group) colorBar = `<div class="tile-color-bar c-${tile.group}"></div>`;
            else if (tile.type === 'doblo') colorBar = `<div class="tile-color-bar c-doblo"></div>`;
            else if (tile.type === 'pitch') colorBar = `<div class="tile-color-bar c-pitch"></div>`;
            else if (tile.type === 'utility') colorBar = `<div class="tile-color-bar c-utility"></div>`;

            div.innerHTML = `
                ${colorBar}
                <div style="font-weight:bold; margin: 1px 0;">${tile.name}</div>
                <div style="color:#aaa;">${tile.price ? tile.price + '₺' : ''}</div>
                <div class="tokens-holder" id="tokens-tile-${tile.id}"></div>
            `;
            boardGrid.appendChild(div);
        });
    }

    state.players.forEach(p => {
        if (p.bankrupt) return;
        let token = document.getElementById(`token-${p.id}`);
        if (!token) {
            token = document.createElement('div');
            token.id = `token-${p.id}`;
            token.className = 'player-token';
            token.style.background = p.color;
        }
        const holder = document.getElementById(`tokens-tile-${p.position}`);
        if (holder && token.parentElement !== holder) holder.appendChild(token);
    });
}

function onTileClick(tile) {
    if (!tile.owner || tile.owner === socket.id) return;
    selectedTileForTrade = tile;
    document.getElementById('tradeTargetInfo').innerText = `Mülk: ${tile.name} (Sahibi: ${tile.ownerName})`;
    document.getElementById('tradeOfferInput').value = Math.floor(tile.price * 1.2);
    document.getElementById('tradeOfferModal').style.display = 'flex';
}

function sendTradeOffer() {
    const amount = document.getElementById('tradeOfferInput').value;
    if (!amount || !selectedTileForTrade) return;
    socket.emit('initiateTradeOffer', { tileId: selectedTileForTrade.id, offerAmount: amount });
    closeTradeModal();
}

function closeTradeModal() {
    document.getElementById('tradeOfferModal').style.display = 'none';
    selectedTileForTrade = null;
}

socket.on('incomingTradeOffer', (trade) => {
    document.getElementById('incomingTradeMsg').innerHTML = `
        <strong>${trade.buyerName}</strong>, sana ait <u>${trade.tileName}</u> tapusu için 
        <strong style="color:#2ecc71;">${trade.offerAmount}₺</strong> teklif ediyor!
    `;
    document.getElementById('incomingTradeModal').style.display = 'flex';
});

function respondTrade(accept) {
    socket.emit('respondTradeOffer', accept);
    document.getElementById('incomingTradeModal').style.display = 'none';
}

socket.on('tradePendingNotice', (msg) => alert(msg));

socket.on('monopolyDobloPrompt', (data) => {
    const box = document.getElementById('dobloPromptBox');
    const sel = document.getElementById('dobloTargetSelect');
    sel.innerHTML = '';
    data.board.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.innerText = `${t.id}: ${t.name}`;
        sel.appendChild(opt);
    });
    box.style.display = 'block';
});

function submitDobloDrive() {
    const targetId = document.getElementById('dobloTargetSelect').value;
    socket.emit('monopolyDobloDrive', targetId);
    document.getElementById('dobloPromptBox').style.display = 'none';
}

socket.on('monopolyBuyPrompt', (data) => {
    document.getElementById('buyPromptBox').style.display = 'block';
    document.getElementById('buyPromptMsg').innerText = `🏛️ ${data.tile.name} sahipsiz! Fiyat: ${data.tile.price}₺. Satın alacak mısın?`;
});

socket.on('monopolyBuyoutPrompt', (data) => {
    document.getElementById('buyoutPromptBox').style.display = 'block';
    document.getElementById('buyoutPromptMsg').innerText = `💥 ${data.ownerName}'in ${data.tile.name} tapusunu 1.5 katına (${data.buyoutPrice}₺) satın alacak mısın?`;
});

function openAssetsModal() {
    if (!latestMonoState) return;
    const list = document.getElementById('assetsList');
    list.innerHTML = '';
    const me = latestMonoState.players.find(p => p.id === socket.id);
    document.getElementById('jailCardDisplay').innerText = me && me.jailCardCount > 0 ? `🎟️ Konferans Kartı: ${me.jailCardCount} Adet` : '';

    const myAssets = latestMonoState.board.filter(t => t.owner === socket.id);
    if (myAssets.length === 0) {
        list.innerHTML = '<p style="color:#aaa;">Henüz tapun yok.</p>';
    } else {
        myAssets.forEach(a => {
            const div = document.createElement('div');
            div.style.cssText = 'background:#262a3b; padding:8px; border-radius:6px; margin:6px 0; display:flex; justify-content:space-between;';
            div.innerHTML = `<span><strong>${a.name}</strong></span><span style="color:#2ecc71;">${a.price}₺</span>`;
            list.appendChild(div);
        });
    }
    document.getElementById('assetsModal').style.display = 'flex';
}

function closeAssetsModal() {
    document.getElementById('assetsModal').style.display = 'none';
}