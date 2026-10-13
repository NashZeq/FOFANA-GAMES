const wormsCanvas = document.getElementById('wormsCanvas');
const wormsCtx = wormsCanvas ? wormsCanvas.getContext('2d') : null;

const terrainCanvas = document.createElement('canvas');
terrainCanvas.width = 1000; terrainCanvas.height = 600;
const terrainCtx = terrainCanvas.getContext('2d', { willReadFrequently: true });

let wormsStateData = null; let wParticles = []; let wExplosions = []; let localProjectiles = [];
let wInputs = { left: false, right: false, up: false, down: false, space: false };
let powerCharge = 0; let isCharging = false;

window.addEventListener('keydown', (e) => {
    const view = document.getElementById('view-worms'); if (!view || view.style.display === 'none') return;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') wInputs.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') wInputs.right = true;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') wInputs.up = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') wInputs.down = true;
    
    if (e.code === 'Space' && !e.repeat) {
        const myWorm = wormsStateData?.worms[socket.id];
        if (myWorm && wormsStateData.turnId === socket.id && !wormsStateData.projectileFired) { isCharging = true; powerCharge = 0; }
    }
});

window.addEventListener('keyup', (e) => {
    const view = document.getElementById('view-worms'); if (!view || view.style.display === 'none') return;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') wInputs.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') wInputs.right = false;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') wInputs.up = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') wInputs.down = false;

    if (e.code === 'Space') { if (isCharging) { isCharging = false; socket.emit('wormsFire', { power: powerCharge }); powerCharge = 0; } }
});

// YENİ DOKUNMATİK GAMEPAD SİSTEMİ
function bindWormsTouch() {
    const btnL = document.getElementById('btnWormLeft'); const btnR = document.getElementById('btnWormRight');
    const btnU = document.getElementById('btnWormUp'); const btnD = document.getElementById('btnWormDown');
    const btnF = document.getElementById('btnWormFire');

    const bindBtn = (el, key) => {
        if (!el) return;
        el.addEventListener('touchstart', (e) => { e.preventDefault(); wInputs[key] = true; });
        el.addEventListener('touchend', (e) => { e.preventDefault(); wInputs[key] = false; });
        el.addEventListener('mousedown', () => { wInputs[key] = true; });
        el.addEventListener('mouseup', () => { wInputs[key] = false; });
        el.addEventListener('mouseleave', () => { wInputs[key] = false; });
    };

    bindBtn(btnL, 'left'); bindBtn(btnR, 'right'); bindBtn(btnU, 'up'); bindBtn(btnD, 'down');

    if(btnF) {
        btnF.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            if (wormsStateData && wormsStateData.turnId === socket.id && !wormsStateData.projectileFired) { isCharging = true; powerCharge = 0; }
        });
        btnF.addEventListener('touchend', (e) => { 
            e.preventDefault(); 
            if (isCharging) { isCharging = false; socket.emit('wormsFire', { power: powerCharge }); powerCharge = 0; }
        });
        btnF.addEventListener('mousedown', () => { 
            if (wormsStateData && wormsStateData.turnId === socket.id && !wormsStateData.projectileFired) { isCharging = true; powerCharge = 0; }
        });
        btnF.addEventListener('mouseup', () => { 
            if (isCharging) { isCharging = false; socket.emit('wormsFire', { power: powerCharge }); powerCharge = 0; }
        });
    }
}
bindWormsTouch();

function spawnWormsExplosion(x, y, radius) {
    wExplosions.push({ x, y, r: 2, maxR: radius, alpha: 1 });
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2; const spd = Math.random() * 6 + 2;
        wParticles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 2, life: 1, color: Math.random() < 0.5 ? '#e67e22' : '#d35400' });
    }
}

socket.on('wormsStarted', (data) => {
    wormsStateData = data; wParticles = []; wExplosions = []; localProjectiles = [];
    document.getElementById('wormsLobbyControls').style.display = 'none'; document.getElementById('wormsGameArea').style.display = 'flex'; document.getElementById('wormsWinnerBox').style.display = 'none';

    terrainCtx.clearRect(0, 0, 1000, 600); terrainCtx.fillStyle = '#27ae60'; terrainCtx.beginPath(); terrainCtx.moveTo(0, 600);
    for (let x = 0; x < 1000; x++) { terrainCtx.lineTo(x, data.terrainHeights[x]); }
    terrainCtx.lineTo(1000, 600); terrainCtx.closePath(); terrainCtx.fill();
    
    terrainCtx.globalCompositeOperation = 'source-atop'; terrainCtx.fillStyle = '#8e44ad'; terrainCtx.fillRect(0, 0, 1000, 600); terrainCtx.globalCompositeOperation = 'source-over';
});

socket.on('wormsExplosionSync', (data) => {
    spawnWormsExplosion(data.x, data.y, data.radius);
    terrainCtx.globalCompositeOperation = 'destination-out'; terrainCtx.beginPath(); terrainCtx.arc(data.x, data.y, data.radius, 0, Math.PI * 2); terrainCtx.fill(); terrainCtx.globalCompositeOperation = 'source-over';
});

socket.on('wormsUpdate', (state) => {
    if (!wormsCtx) return; wormsStateData = state;
    const me = state.worms[socket.id];
    if (me && state.turnId === socket.id && !state.projectileFired) {
        socket.emit('wormsInput', wInputs);
        if (isCharging) { powerCharge += 0.8; if (powerCharge > 40) powerCharge = 40; }
    }

    const skyGrad = wormsCtx.createLinearGradient(0, 0, 0, 600); skyGrad.addColorStop(0, '#0f111a'); skyGrad.addColorStop(1, '#2c3e50');
    wormsCtx.fillStyle = skyGrad; wormsCtx.fillRect(0, 0, 1000, 600);

    wormsCtx.fillStyle = 'rgba(255,255,255,0.3)';
    for(let i=0; i<50; i++) { wormsCtx.fillRect((Math.sin(i*7)*500)+500, (Math.cos(i*13)*300)+300, 2, 2); }

    wormsCtx.drawImage(terrainCanvas, 0, 0);

    if (state.activeProjectile) {
        const p = state.activeProjectile;
        wormsCtx.fillStyle = '#f1c40f'; wormsCtx.beginPath(); wormsCtx.arc(p.x, p.y, 4, 0, Math.PI * 2); wormsCtx.fill();
        wParticles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 1, color: '#e74c3c' });
    }

    for (let id in state.worms) {
        const w = state.worms[id]; if (w.hp <= 0) continue;
        wormsCtx.save(); wormsCtx.translate(w.x, w.y);
        wormsCtx.fillStyle = '#e74c3c'; wormsCtx.fillRect(-15, -25, 30, 4); wormsCtx.fillStyle = '#2ecc71'; wormsCtx.fillRect(-15, -25, (w.hp / 100) * 30, 4);
        wormsCtx.fillStyle = state.turnId === id ? '#f1c40f' : '#fff'; wormsCtx.font = 'bold 12px sans-serif'; wormsCtx.textAlign = 'center'; wormsCtx.fillText(state.turnId === id ? `▶ ${w.name} ◀` : w.name, 0, -32);
        wormsCtx.fillStyle = w.color; wormsCtx.fillRect(-10, -8, 20, 12); wormsCtx.fillStyle = '#333'; wormsCtx.fillRect(-12, 4, 24, 6);
        wormsCtx.rotate(w.aimAngle); wormsCtx.fillStyle = '#bdc3c7'; wormsCtx.fillRect(0, -3, 20, 6);
        wormsCtx.restore();
    }

    for (let i = wExplosions.length - 1; i >= 0; i--) {
        const ex = wExplosions[i];
        wormsCtx.beginPath(); wormsCtx.arc(ex.x, ex.y, ex.r, 0, Math.PI*2); wormsCtx.fillStyle = `rgba(231, 76, 60, ${ex.alpha})`; wormsCtx.fill();
        ex.r += 6; ex.alpha -= 0.05; if (ex.alpha <= 0) wExplosions.splice(i, 1);
    }

    for (let i = wParticles.length - 1; i >= 0; i--) {
        const p = wParticles[i];
        wormsCtx.fillStyle = p.color; wormsCtx.globalAlpha = p.life; wormsCtx.beginPath(); wormsCtx.arc(p.x, p.y, 3, 0, Math.PI*2); wormsCtx.fill();
        p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= 0.03; if (p.life <= 0) wParticles.splice(i, 1);
    }
    wormsCtx.globalAlpha = 1;

    document.getElementById('wormsWindHud').innerText = `🌬️ Rüzgar: ${state.wind}`;
    if (me && state.turnId === socket.id) { document.getElementById('wormsPowerHud').innerText = `💥 Güç: %${Math.floor((powerCharge / 40) * 100)}`; } 
    else { document.getElementById('wormsPowerHud').innerText = `Sıra Bekleniyor...`; }
});

socket.on('wormsFinished', (data) => {
    document.getElementById('wormsWinnerBox').style.display = 'block';
    document.getElementById('wormsWinnerTitle').innerText = `🏆 KAZANAN: ${data.winner}!`;
});