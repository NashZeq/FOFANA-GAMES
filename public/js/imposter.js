socket.on('imposterRole', (data) => {
    document.getElementById('impLobbyControls').style.display = 'none';
    document.getElementById('impGameArea').style.display = 'block';
    document.getElementById('imp-result').innerText = '';
    document.getElementById('imp-voting').style.display = 'none';
    document.getElementById('imp-guess-box').style.display = 'none';
    const role = document.getElementById('imp-role');
    role.innerText = data.info;
    role.style.color = data.isImposter ? '#ff4d4d' : '#00adb5';
});

socket.on('imposterTimer', (t) => {
    document.getElementById('imp-timer').innerText = t > 0 ? `⏳ ${t}s` : '';
});

socket.on('imposterStartVoting', (players) => {
    document.getElementById('imp-voting').style.display = 'block';
    const c = document.getElementById('imp-vote-btns');
    c.innerHTML = '';
    players.forEach(p => {
        if (p.id !== socket.id) {
            const b = document.createElement('button');
            b.innerText = p.name;
            b.onclick = () => { socket.emit('imposterVote', p.id); c.innerHTML = '<p>Oyun verildi...</p>'; };
            c.appendChild(b);
        }
    });
});

socket.on('imposterLastChance', () => {
    document.getElementById('imp-voting').style.display = 'none';
    document.getElementById('imp-guess-box').style.display = 'block';
});

socket.on('imposterWaitGuess', (name) => {
    document.getElementById('imp-voting').style.display = 'none';
    document.getElementById('imp-result').innerText = `${name} son tahminini yapıyor...`;
});

function sendImpGuess() {
    socket.emit('imposterGuess', document.getElementById('impFinalGuess').value.trim());
    document.getElementById('imp-guess-box').style.display = 'none';
}

socket.on('imposterResult', (res) => {
    document.getElementById('imp-result').innerText = `${res.winner === 'IMPOSTER' ? '😈 İmposter Kazandı!' : '🎉 Masadakiler Kazandı!'} (${res.msg}) - Kelime: ${res.word}`;
});