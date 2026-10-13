function resetGuessLobby() {
    document.getElementById('guessLobbyPanel').style.display = 'block';
    document.getElementById('guessArenaPanel').style.display = 'none';
    document.getElementById('guessRevealPanel').style.display = 'none';
    document.getElementById('guessGameOverPanel').style.display = 'none';
}

function startGuessGame() {
    const mode = document.getElementById('guessSubModeSelect').value;
    const rounds = document.getElementById('guessRoundsSelect').value;
    socket.emit('startGuessGame', { mode: mode, rounds: rounds });
}

async function loadSmartImage(imgElement, question) {
    const cleanTitle = encodeURIComponent(question.title);
    const fallbackBanner = `https://placehold.co/600x400/151824/00adb5?text=${cleanTitle}`;
    imgElement.referrerPolicy = "no-referrer";
    imgElement.onerror = () => { imgElement.onerror = null; imgElement.src = fallbackBanner; };
    if (question.wiki) {
        const lang = question.wikiLang || 'tr';
        try {
            const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question.wiki)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.originalimage && data.originalimage.source) { imgElement.src = data.originalimage.source; return; }
                if (data.thumbnail && data.thumbnail.source) { imgElement.src = data.thumbnail.source; return; }
            }
        } catch (err) {}
    }
    imgElement.src = question.img || fallbackBanner;
}

socket.on('guessRoundStarted', (data) => {
    document.getElementById('guessLobbyPanel').style.display = 'none';
    document.getElementById('guessRevealPanel').style.display = 'none';
    document.getElementById('guessArenaPanel').style.display = 'block';

    document.getElementById('guessRoundIndicator').innerText = `Soru ${data.questionIndex} / ${data.maxQuestions}`;
    document.getElementById('guessTimerText').innerText = `${data.timeLeft}s`;
    document.getElementById('guessTimerFill').style.width = '100%';

    const imgEl = document.getElementById('guessImage');
    loadSmartImage(imgEl, data.question);

    document.getElementById('guessTitle').innerText = data.question.title;
    document.getElementById('guessHint').innerText = data.question.hint;

    document.getElementById('guessInputBox').style.display = 'block';
    document.getElementById('guessSubmittedNotice').style.display = 'none';
    
    const inp = document.getElementById('userGuessInput');
    inp.value = ''; inp.disabled = false; inp.focus();
});

socket.on('guessTimerTick', (timeLeft) => {
    document.getElementById('guessTimerText').innerText = `${timeLeft}s`;
    const pct = (timeLeft / 15) * 100;
    document.getElementById('guessTimerFill').style.width = `${pct}%`;
});

function submitGuess() {
    const inp = document.getElementById('userGuessInput');
    const val = inp.value.trim();
    if (!val) return alert('Bir tahmin yazmalısın!');
    socket.emit('submitGuess', val);
    inp.disabled = true;
    document.getElementById('guessInputBox').style.display = 'none';
    document.getElementById('guessSubmittedNotice').style.display = 'block';
}

socket.on('guessLockedNotice', () => {
    document.getElementById('guessInputBox').style.display = 'none';
    document.getElementById('guessSubmittedNotice').style.display = 'block';
});

socket.on('guessRoundEnded', (data) => {
    document.getElementById('guessLobbyPanel').style.display = 'none'; 
    document.getElementById('guessArenaPanel').style.display = 'none';
    document.getElementById('guessRevealPanel').style.display = 'block';

    document.getElementById('guessActualValue').innerText = `${data.actual.toLocaleString('tr-TR')} ${data.unit}`;

    const listEl = document.getElementById('guessRoundScoresList');
    listEl.innerHTML = data.results.map(r => `
        <div class="result-row">
            <span><strong>${r.name}:</strong> Tahmin: ${typeof r.guess === 'number' ? r.guess.toLocaleString('tr-TR') : r.guess}</span>
            <span style="color:#2ecc71;">+${r.scoreGained} Puan (Toplam: ${r.totalScore})</span>
        </div>
    `).join('');

    // Butonun kilitlenmesini engelliyoruz, her tur sonu sıfırlanır
    const btn = document.getElementById('btnNextRoundReady');
    btn.innerText = data.isLastQuestion ? 'Final Podyumuna Hazırım 🏆' : 'Sıradaki Soruya Hazırım ⏳';
    btn.style.background = '#f39c12';
    btn.disabled = false; 
    
    renderNextRoundBadges(data.readyStatus);
});

// AÇ/KAPA (Toggle) MANTIĞI DÜZELTİLDİ
function toggleNextRoundReady() {
    socket.emit('guessNextRoundReadyToggle');
}

socket.on('guessNextRoundReadyUpdate', (readyList) => {
    renderNextRoundBadges(readyList);
    
    const myStatus = readyList.find(p => p.id === socket.id);
    const btn = document.getElementById('btnNextRoundReady');
    
    if (myStatus && myStatus.ready) {
        btn.innerText = 'Hazırsın (İptal Et) ❌';
        btn.style.background = '#e74c3c';
    } else {
        btn.innerText = 'Sıradaki Soruya Hazırım ⏳';
        btn.style.background = '#f39c12';
    }
});

function renderNextRoundBadges(readyList) {
    const el = document.getElementById('nextRoundReadyBadges');
    if (!el || !readyList) return;
    el.innerHTML = readyList.map(p => `
        <span class="ready-badge ${p.ready ? 'is-ready' : 'not-ready'}">
            ${p.name}: ${p.ready ? '✓ HAZIR' : '⏳ BEKLİYOR'}
        </span>
    `).join('');
}

socket.on('guessGameOver', (data) => {
    document.getElementById('guessLobbyPanel').style.display = 'none';
    document.getElementById('guessRevealPanel').style.display = 'none';
    document.getElementById('guessGameOverPanel').style.display = 'block';

    const listEl = document.getElementById('guessFinalPodium');
    listEl.innerHTML = data.finalLeaderboard.map((r, idx) => `
        <div class="result-row" style="font-size: 16px; border-left: 4px solid ${idx === 0 ? '#f1c40f' : '#3d435e'}">
            <span>${idx + 1}. <strong>${r.name}</strong></span>
            <span style="color:#f1c40f; font-weight:bold;">${r.totalScore} Puan</span>
        </div>
    `).join('');
});