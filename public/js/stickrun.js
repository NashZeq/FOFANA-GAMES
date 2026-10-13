const stickCanvas = document.getElementById('stickCanvas');
const stickCtx = stickCanvas ? stickCanvas.getContext('2d') : null;

let stickTrackData = { obstacles: [], platforms: [], pads: [], boxes: [], finishLine: 7500 };
let particles = [];
let shockwaves = [];
let activeLightnings = [];
let cameraShake = 0;

const cityBuildings = [];
for (let i = 0; i < 60; i++) {
    cityBuildings.push({ x: i * 180, w: 90 + (i * 37) % 80, h: 80 + (i * 73) % 160, windows: (i % 3) + 2 });
}

window.addEventListener('keydown', (e) => {
    const view = document.getElementById('view-stickrun');
    if (!view || view.style.display === 'none') return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { if (!e.repeat) { e.preventDefault(); socket.emit('stickInput', { action: 'jump' }); } }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { e.preventDefault(); socket.emit('stickInput', { action: 'duck', state: true }); }
    if (e.code === 'Space') { if (!e.repeat) { e.preventDefault(); socket.emit('stickInput', { action: 'item' }); } }
});

window.addEventListener('keyup', (e) => {
    const view = document.getElementById('view-stickrun');
    if (!view || view.style.display === 'none') return;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { e.preventDefault(); socket.emit('stickInput', { action: 'duck', state: false }); }
});

// BÜYÜK DOKUNMATİK JOYSTICK VE KONTROL SİSTEMİ
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

    // Canvas Üzerinde Sanal Joystick Kaydırma Algılama
    if (stickCanvas) {
        let touchStartX = 0;
        stickCanvas.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        });
        stickCanvas.addEventListener('touchmove', (e) => {
            let moveX = e.touches[0].clientX;
            if (moveX - touchStartX > 40) {
                // Sağa kaydırma -> Eğil veya Güç Kullan
                socket.emit('stickInput', { action: 'duck', state: true });
            } else if (touchStartX - moveX > 40) {
                socket.emit('stickInput', { action: 'duck', state: false });
            }
        });
        stickCanvas.addEventListener('touchend', () => {
            socket.emit('stickInput', { action: 'duck', state: false });
        });
    }
}
bindStickTouch();

function spawnParticles(x, y, color, count, speed = 4) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * speed + 1;
        particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 1.5, radius: Math.random() * 4 + 2, color, alpha: 1 });
    }
}

socket.on('stickStarted', (data) => {
    stickTrackData = data;
    particles = []; shockwaves = []; activeLightnings = []; cameraShake = 0;
    document.getElementById('stickLobbyControls').style.display = 'none';
    document.getElementById('stickGameArea').style.display = 'flex';
    document.getElementById('stickWinnerBox').style.display = 'none';
});

socket.on('stickEffect', (fx) => {
    if (fx.type === 'doubleJump') { shockwaves.push({ x: fx.x, y: fx.y, r: 5, alpha: 1, color: '#00cec9' }); spawnParticles(fx.x, fx.y, '#00cec9', 10, 3); } 
    else if (fx.type === 'bounce') { shockwaves.push({ x: fx.x, y: fx.y, r: 8, alpha: 1, color: '#e84393' }); spawnParticles(fx.x, fx.y, '#fd79a8', 15, 5); } 
    else if (fx.type === 'hit') { spawnParticles(fx.x, fx.y, '#ff4d4d', 22, 6); if (fx.id === socket.id) cameraShake = 12; } 
    else if (fx.type === 'lightning') { activeLightnings.push({ targets: fx.targets, timer: 15 }); cameraShake = 10; }
});

socket.on('stickUpdate', (data) => {
    if (!stickCtx) return;
    stickTrackData.boxes = data.boxes;
    const runners = data.runners;
    const projectiles = data.projectiles || [];
    const me = runners[socket.id];

    let shakeX = 0, shakeY = 0;
    if (cameraShake > 0) {
        shakeX = (Math.random() - 0.5) * cameraShake; shakeY = (Math.random() - 0.5) * cameraShake;
        cameraShake *= 0.85; if (cameraShake < 0.5) cameraShake = 0;
    }

    const camX = (me ? me.x - 220 : 0) + shakeX;

    stickCtx.save();
    stickCtx.translate(0, shakeY);

    const skyGrad = stickCtx.createLinearGradient(0, 0, 0, 350);
    skyGrad.addColorStop(0, '#090b10'); skyGrad.addColorStop(1, '#181d2c');
    stickCtx.fillStyle = skyGrad; stickCtx.fillRect(0, 0, 1000, 420);

    cityBuildings.forEach(b => {
        const bx = b.x - (camX * 0.25);
        if (bx > -150 && bx < 1100) {
            stickCtx.fillStyle = '#111522'; stickCtx.fillRect(bx, 350 - b.h, b.w, b.h);
            stickCtx.fillStyle = 'rgba(0, 173, 181, 0.12)';
            for (let wy = 350 - b.h + 15; wy < 335; wy += 25) stickCtx.fillRect(bx + 12, wy, b.w - 24, 8);
        }
    });

    stickCtx.fillStyle = '#1e2230'; stickCtx.fillRect(0, 350, 1000, 70);
    stickCtx.strokeStyle = '#00adb5'; stickCtx.lineWidth = 4;
    stickCtx.beginPath(); stickCtx.moveTo(0, 350); stickCtx.lineTo(1000, 350); stickCtx.stroke();

    stickCtx.strokeStyle = 'rgba(0, 173, 181, 0.2)'; stickCtx.lineWidth = 2;
    const gridOffset = -(camX % 80);
    for (let gx = gridOffset; gx < 1000; gx += 80) {
        stickCtx.beginPath(); stickCtx.moveTo(gx, 350); stickCtx.lineTo(gx - 30, 420); stickCtx.stroke();
    }

    stickCtx.fillStyle = 'rgba(255,255,255,0.2)'; stickCtx.font = 'bold 18px sans-serif';
    for (let m = 500; m < stickTrackData.finishLine; m += 500) {
        const sx = m - camX; if (sx > -50 && sx < 1050) stickCtx.fillText(`${m}m`, sx, 385);
    }

    if (stickTrackData.platforms) {
        stickTrackData.platforms.forEach(plat => {
            const sx = plat.x - camX;
            if (sx + plat.w < -50 || sx > 1050) return;
            stickCtx.fillStyle = '#262c40'; stickCtx.fillRect(sx, plat.y, plat.w, 16);
            stickCtx.strokeStyle = '#00cec9'; stickCtx.lineWidth = 3; stickCtx.strokeRect(sx, plat.y, plat.w, 16);
        });
    }

    if (stickTrackData.pads) {
        stickTrackData.pads.forEach(pad => {
            const sx = pad.x - camX;
            if (sx < -80 || sx > 1080) return;
            if (pad.type === 'jump') {
                stickCtx.fillStyle = '#e84393'; stickCtx.fillRect(sx, 338, pad.w, 12);
                stickCtx.strokeStyle = '#fff'; stickCtx.lineWidth = 2; stickCtx.strokeRect(sx, 338, pad.w, 12);
            } else if (pad.type === 'speed') {
                stickCtx.fillStyle = '#2ecc71'; stickCtx.fillRect(sx, 344, pad.w, 8);
                stickCtx.fillStyle = '#fff'; stickCtx.font = 'bold 14px sans-serif'; stickCtx.fillText('>>>', sx + 12, 344);
            }
        });
    }

    const timeAngle = Date.now() * 0.01;
    stickTrackData.obstacles.forEach(obs => {
        const sx = obs.x - camX;
        if (sx < -100 || sx > 1100) return;

        if (obs.type === 'saw') {
            stickCtx.save(); stickCtx.translate(sx + 22, 325); stickCtx.rotate(timeAngle);
            stickCtx.fillStyle = '#dfe6e9'; stickCtx.strokeStyle = '#e74c3c'; stickCtx.lineWidth = 3;
            stickCtx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i * Math.PI) / 4;
                stickCtx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); stickCtx.lineTo(Math.cos(a + 0.4) * 14, Math.sin(a + 0.4) * 14);
            }
            stickCtx.closePath(); stickCtx.fill(); stickCtx.stroke();
            stickCtx.beginPath(); stickCtx.arc(0, 0, 6, 0, Math.PI * 2); stickCtx.fillStyle = '#e74c3c'; stickCtx.fill();
            stickCtx.restore();
        } else if (obs.type === 'low') {
            stickCtx.fillStyle = '#8B4513';
            stickCtx.fillRect(sx, 290, obs.w, 60);
            stickCtx.strokeStyle = '#5c2a0b';
            stickCtx.lineWidth = 3;
            stickCtx.strokeRect(sx, 290, obs.w, 60);
            stickCtx.beginPath();
            stickCtx.moveTo(sx, 290); stickCtx.lineTo(sx + obs.w, 350);
            stickCtx.moveTo(sx + obs.w, 290); stickCtx.lineTo(sx, 350);
            stickCtx.stroke();
        } else if (obs.type === 'high') {
            stickCtx.fillStyle = '#2d3436'; stickCtx.fillRect(sx, 175, obs.w, 125);
            stickCtx.strokeStyle = '#f39c12'; stickCtx.lineWidth = 3; stickCtx.strokeRect(sx, 175, obs.w, 125);
            stickCtx.fillStyle = '#f1c40f'; stickCtx.fillRect(sx, 290, obs.w, 10);
        }
    });

    const floatY = Math.sin(Date.now() * 0.006) * 5;
    stickTrackData.boxes.forEach(box => {
        if (!box.active) return;
        const sx = box.x - camX;
        if (sx < -50 || sx > 1050) return;
        stickCtx.save(); stickCtx.translate(sx, box.y + floatY);
        stickCtx.fillStyle = '#f1c40f'; stickCtx.shadowColor = '#f39c12'; stickCtx.shadowBlur = 12; stickCtx.fillRect(-16, -16, 32, 32);
        stickCtx.shadowBlur = 0; stickCtx.strokeStyle = '#fff'; stickCtx.lineWidth = 2; stickCtx.strokeRect(-16, -16, 32, 32);
        stickCtx.fillStyle = '#111'; stickCtx.font = 'bold 20px sans-serif'; stickCtx.textAlign = 'center'; stickCtx.textBaseline = 'middle'; stickCtx.fillText('?', 0, 1);
        stickCtx.restore();
    });

    projectiles.forEach(proj => {
        const sx = proj.x - camX;
        if (sx < -50 || sx > 1050) return;
        if (proj.type === 'trap') {
            stickCtx.fillStyle = '#e74c3c'; stickCtx.beginPath(); stickCtx.arc(sx, 346, 12, Math.PI, 0); stickCtx.fill();
            stickCtx.fillStyle = (Math.floor(Date.now() / 150) % 2 === 0) ? '#fff' : '#ff0000';
            stickCtx.beginPath(); stickCtx.arc(sx, 336, 4, 0, Math.PI * 2); stickCtx.fill();
        } else if (proj.type === 'rocket') {
            spawnParticles(sx - 12, proj.y, '#f39c12', 1, 2);
            stickCtx.fillStyle = '#e74c3c'; stickCtx.fillRect(sx - 14, proj.y - 6, 28, 12);
            stickCtx.fillStyle = '#f1c40f'; stickCtx.beginPath(); stickCtx.moveTo(sx + 14, proj.y - 6); stickCtx.lineTo(sx + 24, proj.y); stickCtx.lineTo(sx + 14, proj.y + 6); stickCtx.fill();
        }
    });

    const finX = stickTrackData.finishLine - camX;
    if (finX > -100 && finX < 1100) {
        for (let row = 0; row < 12; row++) {
            stickCtx.fillStyle = row % 2 === 0 ? '#fff' : '#111'; stickCtx.fillRect(finX, 150 + row * 16, 12, 16);
            stickCtx.fillStyle = row % 2 === 0 ? '#111' : '#fff'; stickCtx.fillRect(finX + 12, 150 + row * 16, 12, 16);
        }
        stickCtx.fillStyle = '#f1c40f'; stickCtx.font = 'bold 20px sans-serif'; stickCtx.fillText('🏁 BİTİŞ', finX - 20, 135);
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        stickCtx.strokeStyle = sw.color; stickCtx.globalAlpha = sw.alpha; stickCtx.lineWidth = 3;
        stickCtx.beginPath(); stickCtx.arc(sw.x - camX, sw.y, sw.r, 0, Math.PI * 2); stickCtx.stroke();
        sw.r += 3.5; sw.alpha -= 0.08; if (sw.alpha <= 0) shockwaves.splice(i, 1);
    }
    stickCtx.globalAlpha = 1;

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        stickCtx.fillStyle = p.color; stickCtx.globalAlpha = p.alpha;
        stickCtx.beginPath(); stickCtx.arc(p.x - camX, p.y, p.radius, 0, Math.PI * 2); stickCtx.fill();
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.04; if (p.alpha <= 0) particles.splice(i, 1);
    }
    stickCtx.globalAlpha = 1;

    for (let id in runners) {
        const r = runners[id];
        const rx = r.x - camX;
        if (rx < -100 || rx > 1100) continue;
        if (r.boostTimer > 0) spawnParticles(r.x - 10, r.y - 25, '#f39c12', 1, 2);
        drawProStickman(stickCtx, rx, r.y, r);
    }

    for (let i = activeLightnings.length - 1; i >= 0; i--) {
        const lt = activeLightnings[i];
        lt.targets.forEach(tx => {
            const sx = tx - camX;
            stickCtx.strokeStyle = '#f1c40f'; stickCtx.lineWidth = 4;
            stickCtx.beginPath(); stickCtx.moveTo(sx, 0); stickCtx.lineTo(sx - 15, 120); stickCtx.lineTo(sx + 15, 220); stickCtx.lineTo(sx, 340); stickCtx.stroke();
        });
        lt.timer--; if (lt.timer <= 0) activeLightnings.splice(i, 1);
    }

    stickCtx.restore();
    drawMinimapBar(stickCtx, runners);

    if (me) {
        const runnerArray = Object.values(runners).sort((a, b) => b.x - a.x);
        const myRank = runnerArray.findIndex(x => x.id === socket.id) + 1;
        const pct = Math.min(100, Math.floor((me.x / stickTrackData.finishLine) * 100));
        document.getElementById('stickProgressHud').innerText = `Sıra: ${myRank}/${runnerArray.length} | İlerleme: %${pct}`;

        const itemSpan = document.querySelector('#stickItemHud span');
        const itemNames = { boost: '🔥 Nitro Hız', lightning: '⚡ Yıldırım', shield: '🛡️ Kalkan', trap: '💣 Mayın', rocket: '🚀 Füze' };
        itemSpan.innerHTML = itemNames[me.heldItem] || 'Yok';
    }
});

function drawProStickman(ctx, x, y, r) {
    ctx.save();
    const isDucking = r.ducking && r.onGround;
    const bodyHeight = isDucking ? 26 : 52;

    if (r.shieldTimer > 0) {
        ctx.beginPath(); ctx.arc(x, y - bodyHeight / 2, 40, 0, Math.PI * 2);
        ctx.strokeStyle = '#00cec9'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'rgba(0, 206, 201, 0.18)'; ctx.fill();
    }

    if (r.jumpsLeft === 0 && !r.onGround) {
        ctx.translate(x, y - 28); ctx.rotate((Date.now() * 0.02) % (Math.PI * 2)); ctx.translate(-x, -(y - 28));
    }

    const mainColor = r.stunTimer > 0 ? '#f1c40f' : r.color;
    ctx.strokeStyle = mainColor; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const headY = y - bodyHeight; const lean = isDucking ? 12 : 6; 

    const wave = Math.sin(Date.now() * 0.02 + r.x) * 6;
    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + lean - 6, headY); ctx.lineTo(x - 18, headY - 4 + wave); ctx.lineTo(x - 28, headY + 2 - wave); ctx.stroke();

    ctx.fillStyle = mainColor; ctx.beginPath(); ctx.arc(x + lean, headY, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x + lean + 2, headY - 3, 7, 4);
    ctx.strokeStyle = mainColor; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x + lean, headY + 10); ctx.lineTo(x, y - 20); ctx.stroke();

    if (isDucking) {
        ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x + 22, y - 3); ctx.moveTo(x, y - 15); ctx.lineTo(x - 16, y - 2); ctx.stroke();
    } else {
        const cycle = r.x * 0.14; const leg1 = Math.sin(cycle) * 16; const leg2 = Math.sin(cycle + Math.PI) * 16;
        ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + leg1 * 0.6 + 4, y - 10); ctx.lineTo(x + leg1, y);
        ctx.moveTo(x, y - 20); ctx.lineTo(x + leg2 * 0.6 + 4, y - 10); ctx.lineTo(x + leg2, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + lean * 0.7, headY + 16); ctx.lineTo(x - leg1, headY + 30);
        ctx.moveTo(x + lean * 0.7, headY + 16); ctx.lineTo(x - leg2, headY + 30); ctx.stroke();
    }
    ctx.restore();

    ctx.save(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    let badge = ''; if (r.stunTimer > 0) badge = '⚡ '; else if (r.boostTimer > 0) badge = '🔥 ';
    ctx.fillText(badge + r.name, x, y - bodyHeight - 18); ctx.restore();
}

function drawMinimapBar(ctx, runners) {
    ctx.save(); const barX = 150, barY = 18, barW = 700, barH = 10;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'; ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = '#3d435e'; ctx.strokeRect(barX, barY, barW, barH);

    for (let id in runners) {
        const r = runners[id]; const ratio = Math.min(1, Math.max(0, r.x / stickTrackData.finishLine)); const dotX = barX + ratio * barW;
        ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(dotX, barY + 5, id === socket.id ? 8 : 5, 0, Math.PI * 2); ctx.fill();
        if (id === socket.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.restore();
}

socket.on('stickFinished', (data) => {
    const box = document.getElementById('stickWinnerBox'); box.style.display = 'block';
    document.getElementById('stickWinnerTitle').innerHTML = `🏆 PARKUR ŞAMPİYONU: ${data.winner}!`;
});