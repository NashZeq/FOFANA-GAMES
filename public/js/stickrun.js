const stickCanvas = document.getElementById('stickCanvas');
const stickCtx = stickCanvas ? stickCanvas.getContext('2d') : null;
let stickTrackData = { obstacles: [], boxes: [], finishLine: 6000 };

// Klavye Kontrolleri (W/Yukarı: Zıpla, S/Aşağı: Eğil, Space: Güç Kullan)
window.addEventListener('keydown', (e) => {
    if (document.getElementById('view-stickrun').style.display === 'none') return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        socket.emit('stickInput', { action: 'jump' });
    }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        e.preventDefault();
        socket.emit('stickInput', { action: 'duck', state: true });
    }
    if (e.code === 'Space') {
        e.preventDefault();
        socket.emit('stickInput', { action: 'item' });
    }
});

window.addEventListener('keyup', (e) => {
    if (document.getElementById('view-stickrun').style.display === 'none') return;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        e.preventDefault();
        socket.emit('stickInput', { action: 'duck', state: false });
    }
});

// Mobil Dokunmatik Kontroller
function bindStickTouch() {
    const btnJump = document.getElementById('btnStickJump');
    const btnDuck = document.getElementById('btnStickDuck');
    const btnItem = document.getElementById('btnStickItem');

    if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); socket.emit('stickInput', { action: 'jump' }); });
        btnJump.addEventListener('mousedown', () => socket.emit('stickInput', { action: 'jump' }));
    }
    if (btnDuck) {
        btnDuck.addEventListener('touchstart', (e) => { e.preventDefault(); socket.emit('stickInput', { action: 'duck', state: true }); });
        btnDuck.addEventListener('touchend', (e) => { e.preventDefault(); socket.emit('stickInput', { action: 'duck', state: false }); });
        btnDuck.addEventListener('mousedown', () => socket.emit('stickInput', { action: 'duck', state: true }));
        btnDuck.addEventListener('mouseup', () => socket.emit('stickInput', { action: 'duck', state: false }));
    }
    if (btnItem) {
        btnItem.addEventListener('touchstart', (e) => { e.preventDefault(); socket.emit('stickInput', { action: 'item' }); });
        btnItem.addEventListener('mousedown', () => socket.emit('stickInput', { action: 'item' }));
    }
}
bindStickTouch();

socket.on('stickStarted', (data) => {
    stickTrackData = data;
    document.getElementById('stickLobbyControls').style.display = 'none';
    document.getElementById('stickGameArea').style.display = 'flex';
    document.getElementById('stickWinnerBox').style.display = 'none';
});

socket.on('stickUpdate', (data) => {
    if (!stickCtx) return;
    stickTrackData.boxes = data.boxes;
    const runners = data.runners;
    const me = runners[socket.id];
    const camX = me ? me.x - 180 : 0; // Kamera kendi çöp adamımızı takip eder

    // 1. Gökyüzü ve Zemin Çizimi
    stickCtx.fillStyle = '#141824';
    stickCtx.fillRect(0, 0, 1000, 420);

    // Zemin Çizgisi (Y: 340)
    stickCtx.fillStyle = '#262a3b';
    stickCtx.fillRect(0, 340, 1000, 80);
    stickCtx.strokeStyle = '#00adb5';
    stickCtx.lineWidth = 4;
    stickCtx.beginPath();
    stickCtx.moveTo(0, 340);
    stickCtx.lineTo(1000, 340);
    stickCtx.stroke();

    // Mesafe Tabelaları (Her 500m'de bir)
    stickCtx.fillStyle = 'rgba(255,255,255,0.15)';
    stickCtx.font = 'bold 20px sans-serif';
    for (let m = 500; m < stickTrackData.finishLine; m += 500) {
        const screenX = m - camX;
        if (screenX > -50 && screenX < 1050) {
            stickCtx.fillText(`${m}m`, screenX, 375);
        }
    }

    // 2. Engelleri Çiz (Kırmızı: Zıplanacak, Mor/Sarı: Altından Eğilinecek)
    stickTrackData.obstacles.forEach(obs => {
        const sx = obs.x - camX;
        if (sx < -100 || sx > 1100) return;

        if (obs.type === 'low') {
            // Yerdeki Dikenli Engel (Üstünden Zıpla!)
            stickCtx.fillStyle = '#e74c3c';
            stickCtx.fillRect(sx, 290, obs.w, 50);
            stickCtx.strokeStyle = '#ff7675';
            stickCtx.lineWidth = 2;
            stickCtx.strokeRect(sx, 290, obs.w, 50);
        } else {
            // Havadaki Testere Bloğu (Altından Eğil!)
            stickCtx.fillStyle = '#f39c12';
            stickCtx.fillRect(sx, 190, obs.w, 105);
            stickCtx.strokeStyle = '#ffeaa7';
            stickCtx.lineWidth = 2;
            stickCtx.strokeRect(sx, 190, obs.w, 105);
        }
    });

    // 3. Altın Soru İşareti Kutularını Çiz
    stickTrackData.boxes.forEach(box => {
        if (!box.active) return;
        const sx = box.x - camX;
        if (sx < -50 || sx > 1050) return;

        stickCtx.save();
        stickCtx.translate(sx, box.y);
        stickCtx.fillStyle = '#f1c40f';
        stickCtx.fillRect(-16, -16, 32, 32);
        stickCtx.strokeStyle = '#e67e22';
        stickCtx.lineWidth = 3;
        stickCtx.strokeRect(-16, -16, 32, 32);
        stickCtx.fillStyle = '#111';
        stickCtx.font = 'bold 20px sans-serif';
        stickCtx.textAlign = 'center';
        stickCtx.textBaseline = 'middle';
        stickCtx.fillText('?', 0, 1);
        stickCtx.restore();
    });

    // 4. Bitiş Çizgisini Çiz
    const finX = stickTrackData.finishLine - camX;
    if (finX > -50 && finX < 1050) {
        stickCtx.fillStyle = '#fff';
        stickCtx.fillRect(finX, 160, 16, 180);
        stickCtx.fillStyle = '#2ecc71';
        stickCtx.font = 'bold 18px sans-serif';
        stickCtx.fillText('🏁 BİTİŞ', finX - 20, 145);
    }

    // 5. Çöp Adamları Çiz
    for (let id in runners) {
        const r = runners[id];
        const rx = r.x - camX;
        if (rx < -100 || rx > 1100) continue;
        drawStickman(stickCtx, rx, r.y, r);
    }

    // 6. HUD Bilgilerini Güncelle
    if (me) {
        const pct = Math.min(100, Math.floor((me.x / stickTrackData.finishLine) * 100));
        document.getElementById('stickProgressHud').innerText = `İlerleme: %${pct}`;
        const itemSpan = document.querySelector('#stickItemHud span');
        if (me.heldItem === 'boost') itemSpan.innerHTML = '🚀 Turbo Hız (Space)';
        else if (me.heldItem === 'lightning') itemSpan.innerHTML = '⚡ Yıldırım (Space)';
        else if (me.heldItem === 'shield') itemSpan.innerHTML = '🛡️ Kalkan (Space)';
        else itemSpan.innerHTML = 'Yok';
    }
});

// Çöp Adam Çizim Fonksiyonu (Koşma, Eğilme, Kalkan ve Yıldırım Efektli)
function drawStickman(ctx, x, y, r) {
    ctx.save();
    const isDucking = r.ducking;
    const height = isDucking ? 32 : 60;
    const headY = y - height;

    // Kalkan varsa mavi koruma küresi çiz
    if (r.shieldTimer > 0) {
        ctx.beginPath();
        ctx.arc(x, y - height / 2, 38, 0, Math.PI * 2);
        ctx.strokeStyle = '#00cec9';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 206, 201, 0.15)';
        ctx.fill();
    }

    // Yıldırım çarptıysa sarı şok efekti
    ctx.strokeStyle = r.stunTimer > 0 ? '#f1c40f' : r.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Kafa
    ctx.beginPath();
    ctx.arc(x, headY, 10, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();

    // Gövde
    ctx.beginPath();
    ctx.moveTo(x, headY + 10);
    ctx.lineTo(x, y - 18);
    ctx.stroke();

    // Koşma Animasyonu (Bacaklar ve Kollar)
    const swing = Math.sin(r.x * 0.15) * 14;
    
    // Bacaklar
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x + swing, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x - swing, y);
    ctx.stroke();

    // Kollar
    ctx.beginPath();
    ctx.moveTo(x, headY + 18);
    ctx.lineTo(x - swing, headY + 32);
    ctx.moveTo(x, headY + 18);
    ctx.lineTo(x + swing, headY + 32);
    ctx.stroke();

    // Oyuncu İsmi ve Durum İkonu
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    let statusIcon = '';
    if (r.stunTimer > 0) statusIcon = '⚡ ';
    else if (r.boostTimer > 0) statusIcon = '🚀 ';
    ctx.fillText(statusIcon + r.name, x, headY - 16);

    ctx.restore();
}

socket.on('stickFinished', (data) => {
    const box = document.getElementById('stickWinnerBox');
    box.style.display = 'block';
    document.getElementById('stickWinnerTitle').innerHTML = `🏆 PARKUR ŞAMPİYONU: ${data.winner}!`;
});