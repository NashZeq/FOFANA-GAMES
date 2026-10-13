function resetTabuViews() {
    document.getElementById('tabuLobbyPanel').style.display = 'block';
    document.getElementById('tabuIntermissionPanel').style.display = 'none';
    document.getElementById('tabuGamePanel').style.display = 'none';
    document.getElementById('tabuGameOverPanel').style.display = 'none';
}

function switchTeam(team) { socket.emit('switchTabuTeam', team); }
function startTabuGame() { socket.emit('startTabuGame', document.getElementById('tabuRoundSelect').value); }
function sendTabuAction(action) { socket.emit('tabuAction', action); }
function nextTabuTurn() { socket.emit('tabuNextTurn'); }

socket.on('updateTabuLobby', (data) => {
    const redList = document.getElementById('redTeamList');
    const blueList = document.getElementById('blueTeamList');
    if (!redList || !blueList) return;
    redList.innerHTML = ''; blueList.innerHTML = '';
    data.players.forEach(p => {
        const row = document.createElement('div');
        row.className = 'member-badge';
        row.innerHTML = `<span>${p.name}</span><span style="color:${p.ready ? '#2ecc71' : '#e74c3c'}">${p.ready ? '✓' : '✗'}</span>`;
        if (p.team === 'red') redList.appendChild(row);
        else blueList.appendChild(row);
    });
});

socket.on('tabuIntermissionStart', (data) => {
    document.getElementById('tabuLobbyPanel').style.display = 'none';
    document.getElementById('tabuGamePanel').style.display = 'none';
    document.getElementById('tabuGameOverPanel').style.display = 'none';
    document.getElementById('tabuIntermissionPanel').style.display = 'block';

    const isMe = socket.id === data.describerId;
    const teamName = data.team === 'red' ? '🔴 KIRMIZI TAKIM' : '🔵 MAVİ TAKIM';
    document.getElementById('intermissionTeamTitle').innerHTML = `Sıra: <span style="color:${data.team === 'red' ? '#ff6b6b' : '#4dabf7'};">${teamName}</span>`;
    document.getElementById('intermissionDescriberText').innerHTML = `Anlatacak Kişi: <strong>${data.describerName}</strong> ${isMe ? '<br><span style="color:#f39c12;">👉 SIRA SENDE!</span>' : ''}`;
    document.getElementById('intermissionCountdown').innerText = data.prepTime;
});

socket.on('tabuIntermissionTick', (time) => {
    document.getElementById('intermissionCountdown').innerText = time;
});

socket.on('tabuTurnStarted', (data) => {
    document.getElementById('tabuLobbyPanel').style.display = 'none';
    document.getElementById('tabuIntermissionPanel').style.display = 'none';
    document.getElementById('tabuGamePanel').style.display = 'block';
    document.getElementById('btnNextTurn').style.display = 'none';

    document.getElementById('tabuRoundDisplay').innerText = `Tur: ${data.currentRound} / ${data.maxRounds}`;
    document.getElementById('scoreRed').innerText = data.scores.red;
    document.getElementById('scoreBlue').innerText = data.scores.blue;

    document.getElementById('describerView').style.display = data.role === 'describer' ? 'block' : 'none';
    document.getElementById('guesserView').style.display = data.role === 'guesser' ? 'block' : 'none';
    document.getElementById('opponentView').style.display = data.role === 'opponent' ? 'block' : 'none';

    if (data.role === 'describer' && data.card) {
        document.getElementById('tMainWord').innerText = data.card.kelime;
        document.getElementById('tForbiddens').innerHTML = data.card.yasaklar.map(y => `<div class="tabu-forbidden">${y}</div>`).join('');
        document.getElementById('passCountDisplay').innerText = `Kalan Pas: ${data.passCount}`;
    }
});

socket.on('tabuNewCardForDescriber', (card) => {
    document.getElementById('tMainWord').innerText = card.kelime;
    document.getElementById('tForbiddens').innerHTML = card.yasaklar.map(y => `<div class="tabu-forbidden">${y}</div>`).join('');
});

socket.on('tabuScoreUpdated', (data) => {
    document.getElementById('scoreRed').innerText = data.scores.red;
    document.getElementById('scoreBlue').innerText = data.scores.blue;
    document.getElementById('passCountDisplay').innerText = `Kalan Pas: ${data.passCount}`;
});

socket.on('tabuTimer', (t) => {
    document.getElementById('tabuTimer').innerText = `${t}s`;
});

socket.on('tabuTurnEnded', (data) => {
    document.getElementById('describerView').style.display = 'none';
    document.getElementById('guesserView').style.display = 'none';
    document.getElementById('opponentView').style.display = 'none';
    document.getElementById('btnNextTurn').style.display = 'block';
    document.getElementById('tabuTurnMsg').innerHTML = `⏱️ Süre Bitti! Sıradaki tur: <strong>${data.nextTeam === 'red' ? 'Kırmızı' : 'Mavi'} Takım</strong>`;
});

socket.on('tabuMatchOver', (data) => {
    document.getElementById('tabuIntermissionPanel').style.display = 'none';
    document.getElementById('tabuGamePanel').style.display = 'none';
    document.getElementById('tabuGameOverPanel').style.display = 'block';
    document.getElementById('tabuWinnerTitle').innerText = `🏆 Kazanan: ${data.winner} Takım!`;
    document.getElementById('tabuFinalScoreMsg').innerText = `Kırmızı: ${data.scores.red} | Mavi: ${data.scores.blue}`;
});