function getTileGridStyle(id) {
    if (id >= 0 && id <= 10) return `grid-column: ${11 - id}; grid-row: 11;`;
    if (id > 10 && id <= 20) return `grid-column: 1; grid-row: ${11 - (id - 10)};`;
    if (id > 20 && id <= 30) return `grid-column: ${1 + (id - 20)}; grid-row: 1;`;
    if (id > 30 && id < 40) return `grid-column: 11; grid-row: ${1 + (id - 30)};`;
    return '';
}

socket.on('monopolyStateUpdated', (state) => {
    document.getElementById('monoLobbyControls').style.display = 'none';
    document.getElementById('monoGameArea').style.display = 'flex';

    const hud = document.getElementById('monoPlayersHud');
    hud.innerHTML = state.players.map(p => `
        <div class="player-stat-card" style="border-left-color: ${p.color}; opacity: ${p.bankrupt ? '0.4' : '1'}">
            <strong>${p.name}</strong> ${p.bankrupt ? '(İFLAS)' : ''} ${p.inJail ? `🚨(BLOK DERS)` : ''}<br>
            💰 ${p.money}₺ | 📍 Kare: ${p.position}
        </div>
    `).join('');

    const cp = state.players[state.turnIndex];
    const isMyTurn = socket.id === cp.id;
    document.getElementById('monoTurnInfo').innerHTML = `Sıra: <span style="color:${cp.color};">${cp.name}</span> ${isMyTurn ? '(SENDE!)' : ''}`;
    document.getElementById('diceDisplay').innerText = `🎲 ${state.dice[0]} - ${state.dice[1]}`;

    document.getElementById('btnRollDice').style.display = (isMyTurn && state.active && !cp.bankrupt && !state.waitingForDecision && !state.waitingForDoblo) ? 'inline-block' : 'none';
    document.getElementById('btnPayBail').style.display = (isMyTurn && cp.inJail && cp.money >= 100) ? 'inline-block' : 'none';
    document.getElementById('btnUseCard').style.display = (isMyTurn && cp.inJail && cp.jailCardCount > 0) ? 'inline-block' : 'none';

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

            let colorBar = '';
            if (tile.group) colorBar = `<div class="tile-color-bar c-${tile.group}"></div>`;
            else if (tile.type === 'doblo') colorBar = `<div class="tile-color-bar c-doblo"></div>`;

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