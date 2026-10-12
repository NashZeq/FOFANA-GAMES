// TABU
socket.on('tabuTurnStarted', (data) => {
    document.getElementById('tabuLobbyPanel').style.display = 'none';
    document.getElementById('tabuGamePanel').style.display = 'block';
    document.getElementById('tMainWord').innerText = data.card.kelime;
    document.getElementById('tForbiddens').innerHTML = data.card.yasaklar.map(y => `<div class="tabu-forbidden">${y}</div>`).join('');
});

// İMPOSTER
socket.on('imposterRole', (data) => {
    const role = document.getElementById('imp-role');
    role.innerText = data.info;
    role.style.color = data.isImposter ? '#ff4d4d' : '#00adb5';
});