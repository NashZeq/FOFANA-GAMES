let latestMonoState = null;
let selectedTileForTrade = null;
const localPlayerPositions = {}; // Piyonların konum hafızası
const previousBalances = {};     // Uçuşan para efekti için bakiye hafızası
let lastDiceValues = [1, 1];     // Zar değişimini yakalamak için hafıza
const activeAnimations = {};

// Gerçek zar emojileriyle daha net görünüm
const diceFaces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function getTileGridStyle(id) {
    if (id >= 0 && id <= 10) return `grid-column: ${11 - id}; grid-row: 11;`;
    if (id > 10 && id <= 20) return `grid-column: 1; grid-row: ${11 - (id - 10)};`;
    if (id > 20 && id <= 30) return `grid-column: ${1 + (id - 20)}; grid-row: 1;`;
    if (id > 30 && id < 40) return `grid-column: 11; grid-row: ${1 + (id - 30)};`;
    return '';
}

function decideBuy(buy) {
    document.getElementById('buyPromptBox').style.display = 'none';
    socket.emit('monopolyBuyDecision', buy);
}

function decideBuyout(buyout) {
    document.getElementById('buyoutPromptBox').style.display = 'none';
    socket.emit('monopolyBuyoutDecision', buyout);
}

// Zar Çalkalama Efekti Fonksiyonu
function triggerDiceAnimation(d1, d2) {
    const diceEl = document.getElementById('diceDisplay');
    if (!diceEl) return;

    diceEl.classList.remove('dice-rolling');
    void diceEl.offsetWidth; // Reflow ile animasyonu sıfırla
    diceEl.classList.add('dice-rolling');

    // Çalkalanırken rastgele yüzler göster, sonunda gerçek zarı bas
    let ticks = 0;
    const rollInterval = setInterval(() => {
        ticks++;
        const r1 = Math.floor(Math.random() * 6) + 1;
        const r2 = Math.floor(Math.random() * 6) + 1;
        diceEl.innerHTML = `🎲 ${diceFaces[r1]} ${r1} - ${r2} ${diceFaces[r2]}`;
        if (ticks >= 5) {
            clearInterval(rollInterval);
            const isDouble = d1 === d2;
            diceEl.innerHTML = `🎲 ${diceFaces[d1]} <strong>${d1} - ${d2}</strong> ${diceFaces[d2]} ${isDouble ? '<span style="color:#f1c40f; font-size:14px;">(ÇİFT!)</span>' : ''}`;
        }
    }, 65);
}

socket.on('monopolyStateUpdated', (state) => {
    latestMonoState = state;
    document.getElementById('monoLobbyControls').style.display = 'none';
    document.getElementById('monoGameArea').style.display = 'flex';

    if (!state.waitingForDecision) {
        document.getElementById('buyPromptBox').style.display = 'none';
        document.getElementById('buyoutPromptBox').style.display = 'none';
    }
    if (!state.waitingForDoblo) {
        document.getElementById('dobloPromptBox').style.display = 'none';
    }

    // 1. Oyuncu Kartlarını ve Uçuşan Para (+ / -) Efektlerini Çiz
    const hud = document.getElementById('monoPlayersHud');
    hud.innerHTML = state.players.map((p, idx) => {
        const isTurn = idx === state.turnIndex && state.active;
        
        // Bakiye farkını hesapla
        let diffHtml = '';
        if (previousBalances[p.id] !== undefined && previousBalances[p.id] !== p.money) {
            const diff = p.money - previousBalances[p.id];
            const sign = diff > 0 ? '+' : '';
            const cls = diff > 0 ? 'money-plus' : 'money-minus';
            diffHtml = `<div class="money-diff-popup ${cls}">${sign}${diff}₺</div>`;
        }
        previousBalances[p.id] = p.money;

        return `
            <div class="player-stat-card ${isTurn ? 'active-turn-card' : ''}" 
                 style="position: relative; border-left-color: ${p.color}; opacity: ${p.bankrupt ? '0.4' : '1'}; box-shadow: ${isTurn ? '0 0 16px ' + p.color : 'none'}; transition: all 0.3s ease;">
                ${diffHtml}
                <strong>${p.name}</strong> ${p.bankrupt ? '💀(İFLAS)' : ''} ${p.inJail ? '🚨(BLOK DERS)' : ''}<br>
                💰 <strong style="color:#2ecc71;">${p.money}₺</strong> | 📍 Kare: ${p.position}
                ${p.jailCardCount > 0 ? `<br><span style="color:#f1c40f;">🎟️ ${p.jailCardCount}x Konferans Kartı</span>` : ''}
            </div>
        `;
    }).join('');

    // 2. Sıra Bilgisi ve Zar Animasyonu
    const cp = state.players[state.turnIndex];
    if (cp) {
        const isMyTurn = socket.id === cp.id;
        document.getElementById('monoTurnInfo').innerHTML = state.active 
            ? `Sıra: <span style="color:${cp.color}; text-shadow: 0 0 8px ${cp.color};">${cp.name}</span> ${isMyTurn ? '👉 (SENDE!)' : ''}`
            : `<span style="color:#f1c40f; font-size:18px;">🏆 OYUN SONA ERDİ!</span>`;
        
        // Zar değiştiyse veya yeni atıldıysa çalkala
        triggerDiceAnimation(state.dice[0], state.dice[1]);
        lastDiceValues = [...state.dice];

        const canAct = isMyTurn && state.active && !cp.bankrupt && !state.waitingForDecision && !state.waitingForDoblo;
        document.getElementById('btnRollDice').style.display = canAct ? 'inline-block' : 'none';
        document.getElementById('btnPayBail').style.display = (canAct && cp.inJail && cp.money >= 100) ? 'inline-block' : 'none';
        document.getElementById('btnUseCard').style.display = (canAct && cp.inJail && cp.jailCardCount > 0) ? 'inline-block' : 'none';
    }

    // 3. Olay Günlüğü (En son gelen olayı parlatarak kaydır)
    const logBox = document.getElementById('monoLogBox');
    logBox.innerHTML = state.log.map((l, index) => `
        <div class="${index === 0 ? 'log-entry-new' : ''}" style="margin-bottom:3px; color:${index === 0 ? '#fff' : '#aaa'};">
            ${index === 0 ? '⚡ ' : '• '}${l}
        </div>
    `).join('');

    syncMonoBoard(state);
});

function syncMonoBoard(state) {
    const boardGrid = document.getElementById('boardGrid');
    
    // Tahta karelerini oluştur
    if (boardGrid.querySelectorAll('.mono-tile').length === 0) {
        state.board.forEach(tile => {
            const div = document.createElement('div');
            div.className = 'mono-tile';
            div.id = `tile-node-${tile.id}`;
            div.style = getTileGridStyle(tile.id);
            div.onclick = () => onTileClick(tile.id);

            let colorBar = '';
            if (tile.group) colorBar = `<div class="tile-color-bar c-${tile.group}"></div>`;
            else if (tile.type === 'doblo') colorBar = `<div class="tile-color-bar c-doblo"></div>`;
            else if (tile.type === 'pitch') colorBar = `<div class="tile-color-bar c-pitch"></div>`;
            else if (tile.type === 'utility') colorBar = `<div class="tile-color-bar c-utility"></div>`;

            div.innerHTML = `
                ${colorBar}
                <div style="font-weight:bold; margin: 1px 0; line-height:1.1;">${tile.name}</div>
                <div id="tile-owner-badge-${tile.id}" style="font-size:7px; font-weight:bold; padding:1px 3px; border-radius:3px; transition: all 0.3s ease;"></div>
                <div style="color:#aaa; margin-bottom:10px;">${tile.price ? tile.price + '₺' : ''}</div>
                <div class="tokens-holder" id="tokens-tile-${tile.id}"></div>
            `;
            boardGrid.appendChild(div);
        });
    }

    // Tapu sahiplerinin renklerini güncelle
    state.board.forEach(tile => {
        const tileEl = document.getElementById(`tile-node-${tile.id}`);
        const badgeEl = document.getElementById(`tile-owner-badge-${tile.id}`);
        if (!tileEl || !badgeEl) return;

        if (tile.owner) {
            const ownerPlayer = state.players.find(p => p.id === tile.owner);
            const ownerColor = ownerPlayer ? ownerPlayer.color : '#00adb5';
            tileEl.style.border = `2px solid ${ownerColor}`;
            badgeEl.style.background = ownerColor;
            badgeEl.style.color = '#fff';
            badgeEl.innerText = tile.ownerName ? tile.ownerName.substring(0, 8) : 'Tapulu';
        } else {
            tileEl.style.border = '1px solid #333';
            badgeEl.style.background = 'transparent';
            badgeEl.innerText = '';
        }
    });

    // Piyonları yürüt
    state.players.forEach(p => {
        let token = document.getElementById(`token-${p.id}`);
        if (p.bankrupt) {
            if (token) token.remove();
            return;
        }
        if (!token) {
            token = document.createElement('div');
            token.id = `token-${p.id}`;
            token.className = 'player-token';
            token.style.background = p.color;
            token.title = p.name;
            localPlayerPositions[p.id] = p.position;
            const holder = document.getElementById(`tokens-tile-${p.position}`);
            if (holder) holder.appendChild(token);
        } else {
            const currentLocalPos = localPlayerPositions[p.id];
            if (currentLocalPos !== p.position) {
                animateTokenStepByStep(p.id, currentLocalPos, p.position);
            }
        }
    });
}

// Piyon Kare Kare Yürür ve Hedefe Varınca O Kareyi Parlatır
function animateTokenStepByStep(playerId, startPos, targetPos) {
    if (activeAnimations[playerId]) clearInterval(activeAnimations[playerId]);
    let curr = startPos;

    activeAnimations[playerId] = setInterval(() => {
        if (curr === targetPos) {
            clearInterval(activeAnimations[playerId]);
            delete activeAnimations[playerId];

            // Hedef kareye varıldığında spot ışığı efekti yak!
            const targetTileEl = document.getElementById(`tile-node-${targetPos}`);
            if (targetTileEl) {
                targetTileEl.classList.remove('tile-landing-glow');
                void targetTileEl.offsetWidth;
                targetTileEl.classList.add('tile-landing-glow');
            }
            return;
        }

        curr = (curr + 1) % 40;
        localPlayerPositions[playerId] = curr;
        const token = document.getElementById(`token-${playerId}`);
        const holder = document.getElementById(`tokens-tile-${curr}`);
        if (token && holder) {
            holder.appendChild(token);
            token.classList.remove('token-hop');
            void token.offsetWidth;
            token.classList.add('token-hop');
        }
    }, 125); // Her kare arası 125ms tatlı zıplama süresi
}

// Pazarlık ve diğer modallar
function onTileClick(tileId) {
    if (!latestMonoState || !latestMonoState.active) return;
    const tile = latestMonoState.board.find(t => t.id === tileId);
    if (!tile || !tile.owner || tile.owner === socket.id) return;

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

socket.on('tradePendingNotice', (msg) => {
    const banner = document.getElementById('mainEventBanner');
    const textSpan = document.getElementById('bannerTextContent');
    if (banner && textSpan) {
        textSpan.innerHTML = `🤝 ${msg}`;
        banner.style.display = 'block';
    }
});

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
    document.getElementById('dobloPromptBox').style.display = 'none';
    socket.emit('monopolyDobloDrive', targetId);
}

socket.on('monopolyBuyPrompt', (data) => {
    document.getElementById('buyPromptBox').style.display = 'block';
    document.getElementById('buyPromptMsg').innerText = `🏛️ ${data.tile.name} sahipsiz! Fiyat: ${data.tile.price}₺. Satın alacak mısın?`;
});

socket.on('monopolyBuyoutPrompt', (data) => {
    document.getElementById('buyoutPromptBox').style.display = 'block';
    document.getElementById('buyoutPromptMsg').innerText = `💥 ${data.ownerName}'in ${data.tile.name} tapusunu 1.5 katına (${data.buyoutPrice}₺) zorla satın alacak mısın?`;
});

function openAssetsModal() {
    if (!latestMonoState) return;
    const list = document.getElementById('assetsList');
    list.innerHTML = '';
    const me = latestMonoState.players.find(p => p.id === socket.id);
    document.getElementById('jailCardDisplay').innerText = me && me.jailCardCount > 0 ? `🎟️ Konferans Kartı: ${me.jailCardCount} Adet` : '';

    const myAssets = latestMonoState.board.filter(t => t.owner === socket.id);
    if (myAssets.length === 0) {
        list.innerHTML = '<p style="color:#aaa;">Henüz satın aldığın bir tapu yok.</p>';
    } else {
        myAssets.forEach(a => {
            let rentText = '';
            if (a.type === 'property') {
                const groupTiles = latestMonoState.board.filter(t => t.type === 'property' && t.group === a.group);
                const isMono = groupTiles.every(t => t.owner === socket.id);
                const currentRent = isMono ? a.baseRent * 2 : a.baseRent;
                rentText = `Kira: ${currentRent}₺ ${isMono ? '🔥(TEKEL x2)' : ''}`;
            } else if (a.type === 'pitch') {
                const count = myAssets.filter(t => t.type === 'pitch').length;
                const pitchRents = { 1: 25, 2: 50, 3: 100, 4: 200 };
                rentText = `Kira: ${pitchRents[count] || 25}₺ (${count}/4 Halısaha)`;
            } else if (a.type === 'utility') {
                const count = myAssets.filter(t => t.type === 'utility').length;
                rentText = `Kira: Zar x ${count === 2 ? 10 : 4}`;
            }

            const div = document.createElement('div');
            div.style.cssText = 'background:#262a3b; padding:10px; border-radius:6px; margin:6px 0; display:flex; justify-content:space-between; align-items:center; border-left: 4px solid #00adb5;';
            div.innerHTML = `
                <div>
                    <strong>${a.name}</strong><br>
                    <span style="font-size:12px; color:#f1c40f;">${rentText}</span>
                </div>
                <span style="color:#2ecc71; font-weight:bold;">Değer: ${a.price}₺</span>
            `;
            list.appendChild(div);
        });
    }
    document.getElementById('assetsModal').style.display = 'flex';
}

function closeAssetsModal() {
    document.getElementById('assetsModal').style.display = 'none';
}