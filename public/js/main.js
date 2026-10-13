const socket = io();
let myId = '';
let isReady = false;
let eventBannerTimeout = null;
let readyCooldown = false; 

socket.on('connect', () => { myId = socket.id; });

socket.on('disconnect', () => {
    alert("Sunucu güncellendi veya bağlantı koptu. Sisteme tekrar bağlanılıyor...");
    window.location.reload();
});

function showView(viewId) {
    ['view-login', 'view-lobby', 'view-guess', 'view-monopoly', 'view-race', 'view-tabu', 'view-imposter', 'view-stickrun'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === viewId ? 'block' : 'none';
    });
}

function join() {
    const val = document.getElementById('username').value.trim();
    if (!val) return alert('İsim yazmalısın!');
    socket.emit('joinLobby', val);
    showView('view-lobby');
}

function selectGame(game) { 
    socket.emit('selectGame', game); 
}

function backToLobby() { socket.emit('backToLobby'); }

socket.on('updateLobby', (data) => {
    document.getElementById('lobbyPlayers').innerText = data.players.map(p => p.name).join(', ');
});

// YENİ: Sadece menü tuşuna basan kişinin KENDİ ekranı değişecek
socket.on('gameSelected', (game) => {
    if (game === 'guess') {
        showView('view-guess');
        if (typeof resetGuessLobby === 'function') resetGuessLobby();
    } else if (game === 'monopoly') {
        showView('view-monopoly');
        document.getElementById('monoLobbyControls').style.display = 'block';
        document.getElementById('monoGameArea').style.display = 'none';
    } else if (game === 'race') {
        showView('view-race');
        document.getElementById('raceLobbyControls').style.display = 'block';
        document.getElementById('raceGameArea').style.display = 'none';
    } else if (game === 'tabu') {
        showView('view-tabu');
        if (typeof resetTabuViews === 'function') resetTabuViews();
    } else if (game === 'imposter') {
        showView('view-imposter');
        document.getElementById('impLobbyControls').style.display = 'block';
        document.getElementById('impGameArea').style.display = 'none';
    } else if (game === 'stickrun') {
        showView('view-stickrun');
        document.getElementById('stickLobbyControls').style.display = 'block';
        document.getElementById('stickGameArea').style.display = 'none';
    } else {
        showView('view-lobby');
    }
});

function toggleGeneralReady() { 
    if (readyCooldown) return; 
    socket.emit('toggleGeneralReady'); 
    readyCooldown = true;
    setTimeout(() => { readyCooldown = false; }, 500);
}

// YENİ: Sadece aynı lobide (aynı oyunda) olanların hazır durumu görünecek
socket.on('updateLobbyStatuses', (data) => {
    const pList = data.players;
    const myP = pList.find(x => x.id === socket.id);
    const myLobby = myP ? myP.lobby : 'main';

    if (myP) {
        isReady = myP.ready;
        const text = isReady ? 'Hazır Vazgeç ❌' : 'Hazır Ol ✓';
        const bg = isReady ? '#e74c3c' : '#2ecc71';

        ['btnGuessReady', 'btnMonoReady', 'btnRaceReady', 'btnTabuReady', 'btnImpReady', 'btnStickReady'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) { btn.innerText = text; btn.style.background = bg; }
        });
    }

    const lobbyPlayers = pList.filter(p => p.lobby === myLobby);

    const renderBadges = (elementId) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = lobbyPlayers.map(p => `
            <span class="ready-badge ${p.ready ? 'is-ready' : 'not-ready'}">
                ${p.name}: ${p.ready ? '✓ HAZIR' : '⏳ BEKLİYOR'}
            </span>
        `).join('');
    };

    renderBadges('guessReadyList');
    renderBadges('monoReadyList');
    renderBadges('raceReadyList');
    renderBadges('impReadyList');
    renderBadges('stickReadyList');
});

socket.on('monoGlobalAlert', (msg) => {
    const banner = document.getElementById('mainEventBanner');
    const textSpan = document.getElementById('bannerTextContent');
    textSpan.innerHTML = `📢 ${msg}`;
    banner.style.display = 'block';

    if (eventBannerTimeout) clearTimeout(eventBannerTimeout);
    eventBannerTimeout = setTimeout(() => { banner.style.display = 'none'; }, 5000);
});

function closeMainEventBanner() {
    document.getElementById('mainEventBanner').style.display = 'none';
    if (eventBannerTimeout) clearTimeout(eventBannerTimeout);
}

socket.on('errorMsg', (msg) => alert(msg));